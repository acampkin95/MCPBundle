#!/bin/bash
# Wasabi S3 Configuration Script
# Configure rclone for encrypted S3 backups with Wasabi

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Server credentials
VMI01_HOST="46.250.243.123"
VMI02D_HOST="46.250.241.70"
ROOT_PASS="C0nnaught"

echo -e "${GREEN}=== Configuring Wasabi S3 with rclone ===${NC}"

# Function to configure rclone on a server
configure_rclone() {
    local host=$1
    local server_name=$2

    echo -e "${YELLOW}Configuring rclone on $server_name...${NC}"

    sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=no root@$host << 'EOF'
# Create rclone configuration directory
mkdir -p /root/.config/rclone
chmod 700 /root/.config/rclone

# Create rclone configuration for Wasabi
cat > /root/.config/rclone/rclone.conf << 'EOC'
[wasabi]
type = s3
provider = Wasabi
access_key_id = YOUR_WASABI_ACCESS_KEY
secret_access_key = YOUR_WASABI_SECRET_KEY
region = us-east-1
endpoint = s3.wasabisys.com
acl = private

[wasabi-crypt]
type = crypt
remote = wasabi:mcp-bundle-backups
password = rclone_crypt_password_2024
password2 = rclone_salt_password_2024
filename_encryption = standard
directory_name_encryption = true
EOC

# Create backup encryption key
openssl rand -base64 32 > /backup/config/backup-encryption.key
chmod 600 /backup/config/backup-encryption.key

# Create S3 sync script with GFS rotation
cat > /backup/scripts/s3-sync.sh << 'EOSCRIPT'
#!/bin/bash
# S3 Sync Script with GFS Rotation Policy

set -e

# Configuration
BACKUP_DIR="/backup/local"
S3_BUCKET="wasabi-crypt:"
LOG_FILE="/backup/logs/s3-sync-$(date +%Y%m%d).log"
MANIFEST_FILE="/backup/logs/backup-manifest.json"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Create backup manifest
create_manifest() {
    local backup_type=$1
    local backup_file=$2
    local size=$(stat -c%s "$backup_file" 2>/dev/null || echo 0)
    local checksum=$(sha256sum "$backup_file" | cut -d' ' -f1)

    cat >> "$MANIFEST_FILE" << EOJ
{
  "timestamp": "$(date -Iseconds)",
  "type": "$backup_type",
  "file": "$backup_file",
  "size": $size,
  "checksum": "$checksum",
  "s3_path": "$S3_BUCKET$(basename $backup_file)"
}
EOJ
}

# GFS Rotation Policy
apply_gfs_rotation() {
    log "Applying GFS rotation policy..."

    # Daily backups - keep 7 days
    rclone delete "$S3_BUCKET/daily" --min-age 7d

    # Weekly backups - keep 4 weeks
    rclone delete "$S3_BUCKET/weekly" --min-age 28d

    # Monthly backups - keep 12 months
    rclone delete "$S3_BUCKET/monthly" --min-age 365d

    # Yearly backups - keep 7 years
    rclone delete "$S3_BUCKET/yearly" --min-age 2555d
}

# Determine backup type based on date
get_backup_type() {
    local day_of_week=$(date +%u)
    local day_of_month=$(date +%d)
    local month=$(date +%m)

    if [ "$day_of_month" = "01" ] && [ "$month" = "01" ]; then
        echo "yearly"
    elif [ "$day_of_month" = "01" ]; then
        echo "monthly"
    elif [ "$day_of_week" = "7" ]; then
        echo "weekly"
    else
        echo "daily"
    fi
}

# Main sync function
main() {
    log "Starting S3 sync to Wasabi..."

    # Get backup type
    BACKUP_TYPE=$(get_backup_type)
    log "Backup type: $BACKUP_TYPE"

    # Sync database backups
    if [ -d "$BACKUP_DIR/postgres" ]; then
        log "Syncing PostgreSQL backups..."
        rclone sync "$BACKUP_DIR/postgres" "$S3_BUCKET/$BACKUP_TYPE/postgres" \
            --transfers 4 \
            --checkers 8 \
            --contimeout 60s \
            --timeout 300s \
            --retries 3 \
            --low-level-retries 10 \
            --stats 1s \
            --stats-log-level NOTICE \
            --log-file "$LOG_FILE"
    fi

    # Sync system backups
    if [ -d "$BACKUP_DIR/system" ]; then
        log "Syncing system backups..."
        rclone sync "$BACKUP_DIR/system" "$S3_BUCKET/$BACKUP_TYPE/system" \
            --transfers 4 \
            --checkers 8 \
            --contimeout 60s \
            --timeout 300s \
            --retries 3 \
            --low-level-retries 10 \
            --stats 1s \
            --stats-log-level NOTICE \
            --log-file "$LOG_FILE"
    fi

    # Sync config backups
    if [ -d "$BACKUP_DIR/config" ]; then
        log "Syncing configuration backups..."
        rclone sync "$BACKUP_DIR/config" "$S3_BUCKET/$BACKUP_TYPE/config" \
            --transfers 4 \
            --checkers 8 \
            --contimeout 60s \
            --timeout 300s \
            --retries 3 \
            --low-level-retries 10 \
            --stats 1s \
            --stats-log-level NOTICE \
            --log-file "$LOG_FILE"
    fi

    # Apply GFS rotation
    apply_gfs_rotation

    # Check S3 storage usage
    log "S3 Storage Usage:"
    rclone size "$S3_BUCKET" --json | jq -r '"Total: \(.bytes) bytes, Files: \(.count)"' | tee -a "$LOG_FILE"

    log "S3 sync completed successfully"
}

# Run main function
main
EOSCRIPT

chmod +x /backup/scripts/s3-sync.sh

# Create S3 verification script
cat > /backup/scripts/verify-s3-backups.sh << 'EOSCRIPT'
#!/bin/bash
# S3 Backup Verification Script

set -e

# Configuration
S3_BUCKET="wasabi-crypt:"
LOG_FILE="/backup/logs/s3-verify-$(date +%Y%m%d).log"
ALERT_EMAIL="admin@example.com"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Send alert
send_alert() {
    local subject=$1
    local message=$2

    # You can implement email alerting here
    echo "ALERT: $subject - $message" >> "$LOG_FILE"
}

# Verify backup integrity
verify_backups() {
    log "Starting S3 backup verification..."

    # List all backup types
    for backup_type in daily weekly monthly yearly; do
        log "Verifying $backup_type backups..."

        # Check if backups exist
        file_count=$(rclone ls "$S3_BUCKET/$backup_type" 2>/dev/null | wc -l || echo 0)

        if [ "$file_count" -eq 0 ]; then
            send_alert "Missing Backups" "No $backup_type backups found in S3"
            continue
        fi

        log "Found $file_count files in $backup_type backups"

        # Verify random file integrity
        random_file=$(rclone ls "$S3_BUCKET/$backup_type" | shuf -n 1 | awk '{print $2}')
        if [ -n "$random_file" ]; then
            log "Checking integrity of $random_file..."
            if rclone check "$S3_BUCKET/$backup_type/$random_file" /dev/null; then
                log "✓ File integrity verified: $random_file"
            else
                send_alert "Backup Corruption" "Failed to verify $backup_type/$random_file"
            fi
        fi
    done

    # Check backup age
    latest_backup=$(rclone lsl "$S3_BUCKET/daily" 2>/dev/null | tail -1 | awk '{print $2, $3}')
    if [ -n "$latest_backup" ]; then
        backup_age=$(( ($(date +%s) - $(date -d "$latest_backup" +%s)) / 3600 ))
        if [ "$backup_age" -gt 48 ]; then
            send_alert "Stale Backups" "Latest backup is $backup_age hours old"
        fi
    fi

    log "S3 backup verification completed"
}

# Main
verify_backups
EOSCRIPT

chmod +x /backup/scripts/verify-s3-backups.sh

echo "rclone configured for Wasabi S3"
EOF

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ rclone configured on $server_name${NC}"
    else
        echo -e "${RED}✗ Failed to configure rclone on $server_name${NC}"
        return 1
    fi
}

# Configure on both servers
configure_rclone "$VMI01_HOST" "VMI01"
configure_rclone "$VMI02D_HOST" "VMI02D"

echo -e "${GREEN}=== Wasabi S3 Configuration Complete ===${NC}"
echo -e "${YELLOW}NOTE: Update the following in rclone.conf:${NC}"
echo "  - YOUR_WASABI_ACCESS_KEY"
echo "  - YOUR_WASABI_SECRET_KEY"