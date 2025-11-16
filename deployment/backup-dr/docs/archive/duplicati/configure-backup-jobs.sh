#!/bin/bash

# Configure Duplicati Backup Jobs for All Nodes
# Creates GFS backup jobs (6-hourly, daily, weekly, monthly) for VMI01, VMI02D, VMI03

set -euo pipefail

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Load configuration
if [[ ! -f /backup/config/encryption-passphrase.txt ]]; then
    log_error "Encryption passphrase file not found"
    log_error "Run deploy-duplicati-backup.sh first"
    exit 1
fi

source /backup/config/encryption-passphrase.txt

# Wasabi configuration
WASABI_ACCESS_KEY="WCZLQETBK6VXN55WECMQ"
WASABI_SECRET_KEY="fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD"
WASABI_BUCKET="vmibackups"
WASABI_ENDPOINT="s3.ap-southeast-2.wasabisys.com"
WASABI_REGION="ap-southeast-2"

# Duplicati CLI
DUPLICATI_CLI="/usr/bin/duplicati-cli"
DUPLICATI_SERVER_URL="http://localhost:8200"

log_info "=========================================="
log_info "Configuring Duplicati Backup Jobs"
log_info "=========================================="

# Function to create backup job
create_backup_job() {
    local NODE=$1
    local NODE_IP=$2
    local SCHEDULE=$3
    local RETENTION=$4
    local PATHS=$5
    local TIME=$6
    local CRON=$7

    local JOB_NAME="${NODE}-${SCHEDULE}"
    local S3_PATH="s3://${WASABI_BUCKET}/${NODE}/${SCHEDULE}/"

    log_info "Creating backup job: $JOB_NAME"

    # Create job configuration file
    cat > "/backup/config/${JOB_NAME}.json" << JOBEOF
{
  "Name": "${JOB_NAME}",
  "Description": "${NODE} ${SCHEDULE} backup",
  "Tags": ["${NODE}", "${SCHEDULE}", "gfs"],
  "Sources": ${PATHS},
  "Destination": {
    "TargetURL": "${S3_PATH}",
    "AuthUsername": "${WASABI_ACCESS_KEY}",
    "AuthPassword": "${WASABI_SECRET_KEY}",
    "ServerName": "${WASABI_ENDPOINT}",
    "LocationConstraint": "${WASABI_REGION}"
  },
  "Settings": {
    "encryption-module": "aes",
    "passphrase": "${PASSPHRASE}",
    "compression-module": "lz4",
    "dblock-size": "100mb",
    "keep-versions": "${RETENTION}",
    "upload-verification-file": "true",
    "backup-test-samples": "1",
    "backup-name": "${JOB_NAME}",
    "use-ssl": "true",
    "no-encryption": "false"
  },
  "Filters": [
    "-*.tmp",
    "-*.cache",
    "-*/cache/*",
    "-*/tmp/*",
    "-*.log"
  ],
  "Schedule": {
    "Enabled": true,
    "Cron": "${CRON}",
    "Description": "Runs at ${TIME}"
  }
}
JOBEOF

    log_success "Configuration created: /backup/config/${JOB_NAME}.json"
}

log_info "Step 1: Verifying SSH connectivity to all nodes..."

# Test SSH to VMI01
if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@46.250.243.123 "echo 'VMI01 OK'" >/dev/null 2>&1; then
    log_success "VMI01 (46.250.243.123) - SSH OK"
else
    log_warning "VMI01 (46.250.243.123) - SSH failed. Copy SSH key first:"
    echo "  ssh-copy-id root@46.250.243.123"
fi

# Test SSH to VMI03
if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@154.26.158.31 "echo 'VMI03 OK'" >/dev/null 2>&1; then
    log_success "VMI03 (154.26.158.31) - SSH OK"
else
    log_warning "VMI03 (154.26.158.31) - SSH failed. Copy SSH key first:"
    echo "  ssh-copy-id root@154.26.158.31"
fi

log_info "Step 2: Creating VMI01 backup jobs..."

# VMI01 - 6-Hourly
create_backup_job \
    "vmi01" \
    "46.250.243.123" \
    "6hourly" \
    "4" \
    '["ssh://root@46.250.243.123/opt/mcp/", "ssh://root@46.250.243.123/etc/", "ssh://root@46.250.243.123/root/"]' \
    "00:00, 06:00, 12:00, 18:00 UTC" \
    "0 */6 * * *"

# VMI01 - Daily
create_backup_job \
    "vmi01" \
    "46.250.243.123" \
    "daily" \
    "7" \
    '["ssh://root@46.250.243.123/opt/mcp/", "ssh://root@46.250.243.123/var/lib/postgresql/", "ssh://root@46.250.243.123/etc/", "ssh://root@46.250.243.123/root/"]' \
    "02:00 UTC daily" \
    "0 2 * * *"

# VMI01 - Weekly
create_backup_job \
    "vmi01" \
    "46.250.243.123" \
    "weekly" \
    "4" \
    '["ssh://root@46.250.243.123/opt/", "ssh://root@46.250.243.123/etc/", "ssh://root@46.250.243.123/root/", "ssh://root@46.250.243.123/var/log/"]' \
    "03:00 UTC Sunday" \
    "0 3 * * 0"

# VMI01 - Monthly
create_backup_job \
    "vmi01" \
    "46.250.243.123" \
    "monthly" \
    "3" \
    '["ssh://root@46.250.243.123/opt/", "ssh://root@46.250.243.123/etc/", "ssh://root@46.250.243.123/root/", "ssh://root@46.250.243.123/var/", "ssh://root@46.250.243.123/home/"]' \
    "04:00 UTC 1st of month" \
    "0 4 1 * *"

log_info "Step 3: Creating VMI02D backup jobs..."

# VMI02D - Daily (no 6-hourly to avoid backup recursion)
create_backup_job \
    "vmi02d" \
    "localhost" \
    "daily" \
    "7" \
    '["/opt/", "/etc/", "/root/", "/backup/config/"]' \
    "02:30 UTC daily" \
    "30 2 * * *"

# VMI02D - Weekly
create_backup_job \
    "vmi02d" \
    "localhost" \
    "weekly" \
    "4" \
    '["/opt/", "/etc/", "/root/", "/var/log/", "/backup/"]' \
    "03:30 UTC Sunday" \
    "30 3 * * 0"

# VMI02D - Monthly
create_backup_job \
    "vmi02d" \
    "localhost" \
    "monthly" \
    "3" \
    '["/opt/", "/etc/", "/root/", "/var/", "/home/", "/backup/"]' \
    "04:30 UTC 1st of month" \
    "30 4 1 * *"

log_info "Step 4: Creating VMI03 backup jobs..."

# VMI03 - 6-Hourly
create_backup_job \
    "vmi03" \
    "154.26.158.31" \
    "6hourly" \
    "4" \
    '["ssh://root@154.26.158.31/opt/mcp/", "ssh://root@154.26.158.31/opt/thehive/", "ssh://root@154.26.158.31/etc/", "ssh://root@154.26.158.31/root/"]' \
    "00:30, 06:30, 12:30, 18:30 UTC" \
    "30 */6 * * *"

# VMI03 - Daily (includes Docker volumes)
create_backup_job \
    "vmi03" \
    "154.26.158.31" \
    "daily" \
    "7" \
    '["ssh://root@154.26.158.31/opt/", "ssh://root@154.26.158.31/var/lib/docker/volumes/", "ssh://root@154.26.158.31/etc/", "ssh://root@154.26.158.31/root/"]' \
    "02:15 UTC daily" \
    "15 2 * * *"

# VMI03 - Weekly
create_backup_job \
    "vmi03" \
    "154.26.158.31" \
    "weekly" \
    "4" \
    '["ssh://root@154.26.158.31/opt/", "ssh://root@154.26.158.31/var/lib/docker/", "ssh://root@154.26.158.31/etc/", "ssh://root@154.26.158.31/root/", "ssh://root@154.26.158.31/var/log/"]' \
    "03:15 UTC Sunday" \
    "15 3 * * 0"

# VMI03 - Monthly
create_backup_job \
    "vmi03" \
    "154.26.158.31" \
    "monthly" \
    "3" \
    '["ssh://root@154.26.158.31/opt/", "ssh://root@154.26.158.31/var/lib/docker/", "ssh://root@154.26.158.31/etc/", "ssh://root@154.26.158.31/root/", "ssh://root@154.26.158.31/var/", "ssh://root@154.26.158.31/home/"]' \
    "04:15 UTC 1st of month" \
    "15 4 1 * *"

log_info "Step 5: Creating backup schedule summary..."
cat > /backup/config/BACKUP_SCHEDULE.txt << 'SCHEDULE'
========================================
Duplicati Backup Schedule Summary
========================================

VMI01 (46.250.243.123) - Primary Server
---------------------------------------
6-Hourly: 00:00, 06:00, 12:00, 18:00 UTC (Keep 4)
  Paths: /opt/mcp/, /etc/, /root/

Daily: 02:00 UTC (Keep 7)
  Paths: /opt/mcp/, /var/lib/postgresql/, /etc/, /root/

Weekly: Sunday 03:00 UTC (Keep 4)
  Paths: /opt/, /etc/, /root/, /var/log/

Monthly: 1st 04:00 UTC (Keep 3)
  Paths: /opt/, /etc/, /root/, /var/, /home/

VMI02D (localhost) - Backup Server
-----------------------------------
Daily: 02:30 UTC (Keep 7)
  Paths: /opt/, /etc/, /root/, /backup/config/

Weekly: Sunday 03:30 UTC (Keep 4)
  Paths: /opt/, /etc/, /root/, /var/log/, /backup/

Monthly: 1st 04:30 UTC (Keep 3)
  Paths: /opt/, /etc/, /root/, /var/, /home/, /backup/

VMI03 (154.26.158.31) - SOC Hub
--------------------------------
6-Hourly: 00:30, 06:30, 12:30, 18:30 UTC (Keep 4)
  Paths: /opt/mcp/, /opt/thehive/, /etc/, /root/

Daily: 02:15 UTC (Keep 7)
  Paths: /opt/, /var/lib/docker/volumes/, /etc/, /root/

Weekly: Sunday 03:15 UTC (Keep 4)
  Paths: /opt/, /var/lib/docker/, /etc/, /root/, /var/log/

Monthly: 1st 04:15 UTC (Keep 3)
  Paths: /opt/, /var/lib/docker/, /etc/, /root/, /var/, /home/

TOTAL BACKUP JOBS: 11
  VMI01: 4 jobs (6h, daily, weekly, monthly)
  VMI02D: 3 jobs (daily, weekly, monthly)
  VMI03: 4 jobs (6h, daily, weekly, monthly)

STORAGE ESTIMATE
----------------
Per Node: ~285GB with deduplication
Total: ~855GB across all nodes
Cost: ~$5/month on Wasabi S3

ENCRYPTION
----------
All backups encrypted with AES-256
Passphrase: /backup/config/encryption-passphrase.txt

CONFIGURATION FILES
-------------------
All job configs: /backup/config/*.json

NEXT STEPS
----------
1. Import jobs into Duplicati Web GUI
2. Run test backup for each job
3. Verify backups in Wasabi S3
4. Set up monitoring and alerts

========================================
SCHEDULE

log_success "Backup schedule summary created"

log_info "Step 6: Creating import script for Web GUI..."
cat > /backup/config/import-jobs-to-gui.sh << 'IMPORT'
#!/bin/bash

# Import backup jobs into Duplicati Web GUI
# Note: This script prepares the configurations
# Actual import must be done via Web GUI

echo "=========================================="
echo "Importing Backup Jobs to Duplicati"
echo "=========================================="
echo ""
echo "Job configurations created in:"
echo "  /backup/config/*.json"
echo ""
echo "To import via Web GUI:"
echo "  1. Open http://46.250.241.70:8200"
echo "  2. Click 'Add Backup'"
echo "  3. Click 'Import from configuration'"
echo "  4. Select job file from /backup/config/"
echo "  5. Verify settings and save"
echo "  6. Repeat for all 11 job files"
echo ""
echo "Or use Duplicati CLI to import:"
for jobfile in /backup/config/vmi*.json; do
    jobname=$(basename "$jobfile" .json)
    echo "  duplicati-cli import \"$jobfile\" --import-metadata"
done
echo ""
echo "=========================================="
IMPORT

chmod +x /backup/config/import-jobs-to-gui.sh
log_success "Import script created"

log_info "Step 7: Testing Wasabi S3 access for all paths..."
for node in vmi01 vmi02d vmi03; do
    for schedule in 6hourly daily weekly monthly; do
        if aws s3 ls "s3://${WASABI_BUCKET}/${node}/${schedule}/" \
            --endpoint-url "https://${WASABI_ENDPOINT}" \
            --profile wasabi >/dev/null 2>&1; then
            log_success "Wasabi path OK: ${node}/${schedule}/"
        else
            log_warning "Wasabi path missing: ${node}/${schedule}/"
        fi
    done
done

log_success "=========================================="
log_success "Backup Job Configuration Complete!"
log_success "=========================================="
echo ""
log_info "SUMMARY:"
echo "  - 11 backup jobs configured"
echo "  - VMI01: 4 jobs (6h, daily, weekly, monthly)"
echo "  - VMI02D: 3 jobs (daily, weekly, monthly)"
echo "  - VMI03: 4 jobs (6h, daily, weekly, monthly)"
echo ""
log_info "JOB CONFIGURATIONS:"
echo "  Location: /backup/config/*.json"
echo "  Count: $(ls -1 /backup/config/vmi*.json 2>/dev/null | wc -l)"
echo ""
log_info "SCHEDULE SUMMARY:"
echo "  File: /backup/config/BACKUP_SCHEDULE.txt"
echo "  View: cat /backup/config/BACKUP_SCHEDULE.txt"
echo ""
log_warning "NEXT STEPS:"
echo "  1. Import jobs via Web GUI: http://46.250.241.70:8200"
echo "  2. Run test backup for each job"
echo "  3. Verify backups appear in Wasabi S3"
echo "  4. Monitor first 24 hours of backups"
echo ""
log_info "QUICK IMPORT:"
echo "  bash /backup/config/import-jobs-to-gui.sh"
echo ""
log_success "Configuration complete! Ready to import jobs."
