#!/bin/bash

# Duplicati Backup System Deployment
# Deploys enterprise backup solution with Web GUI to VMI02D
# Target: VMI02D (46.250.241.70) - data.acdev.host

set -euo pipefail

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Wasabi S3 Configuration
WASABI_ACCESS_KEY="WCZLQETBK6VXN55WECMQ"
WASABI_SECRET_KEY="fb2ENlzKfXLTK66BHaUAgv6WJsByg05ZLj0OCpSD"
WASABI_BUCKET="vmibackups"
WASABI_REGION="ap-southeast-2"
WASABI_ENDPOINT="s3.ap-southeast-2.wasabisys.com"

# Backup Configuration
BACKUP_CACHE_DIR="/backup/cache"
BACKUP_CONFIG_DIR="/backup/config"
BACKUP_LOG_DIR="/backup/logs"
DUPLICATI_PORT=8200

# Generate strong encryption passphrase
ENCRYPTION_PASSPHRASE=$(openssl rand -base64 32)

log_info "=========================================="
log_info "Duplicati Backup System Deployment"
log_info "=========================================="

# Check if running on VMI02D
HOSTNAME=$(hostname)
if [[ "$HOSTNAME" != "acdev-vmi02d" ]]; then
    log_warning "Not running on VMI02D (current: $HOSTNAME)"
    log_warning "This script should be run on VMI02D (46.250.241.70)"
fi

log_info "Step 1: Creating backup directories..."
mkdir -p "$BACKUP_CACHE_DIR"
mkdir -p "$BACKUP_CONFIG_DIR"
mkdir -p "$BACKUP_LOG_DIR"
log_success "Directories created"

log_info "Step 2: Installing dependencies..."
apt-get update -qq
apt-get install -y \
    mono-complete \
    ca-certificates-mono \
    libmono-system-net-http-webrequest4.0-cil \
    wget \
    curl \
    jq \
    sshpass \
    awscli \
    sqlite3 \
    2>&1 | tail -10
log_success "Dependencies installed"

log_info "Step 3: Downloading Duplicati..."
DUPLICATI_VERSION="2.0.7.1"
DUPLICATI_DEB="duplicati_${DUPLICATI_VERSION}_all.deb"
DUPLICATI_URL="https://github.com/duplicati/duplicati/releases/download/v${DUPLICATI_VERSION}/${DUPLICATI_DEB}"

if [[ ! -f "/tmp/${DUPLICATI_DEB}" ]]; then
    wget -q "$DUPLICATI_URL" -O "/tmp/${DUPLICATI_DEB}"
    log_success "Duplicati downloaded"
else
    log_info "Duplicati package already downloaded"
fi

log_info "Step 4: Installing Duplicati..."
dpkg -i "/tmp/${DUPLICATI_DEB}" || apt-get install -f -y
log_success "Duplicati installed"

log_info "Step 5: Configuring Duplicati service..."
cat > /etc/systemd/system/duplicati.service << 'EOF'
[Unit]
Description=Duplicati Backup Service
After=network.target

[Service]
Type=simple
User=root
Group=root
ExecStart=/usr/bin/duplicati-server --webservice-port=8200 --webservice-interface=any
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable duplicati
log_success "Duplicati service configured"

log_info "Step 6: Configuring AWS CLI for Wasabi..."
mkdir -p /root/.aws
cat > /root/.aws/credentials << EOF
[wasabi]
aws_access_key_id = ${WASABI_ACCESS_KEY}
aws_secret_access_key = ${WASABI_SECRET_KEY}
EOF

cat > /root/.aws/config << EOF
[profile wasabi]
region = ${WASABI_REGION}
output = json
s3 =
    endpoint_url = https://${WASABI_ENDPOINT}
    signature_version = s3v4
EOF

chmod 600 /root/.aws/credentials
chmod 600 /root/.aws/config
log_success "AWS CLI configured for Wasabi"

log_info "Step 7: Testing Wasabi S3 connectivity..."
if aws s3 ls s3://${WASABI_BUCKET}/ --endpoint-url=https://${WASABI_ENDPOINT} --profile wasabi >/dev/null 2>&1; then
    log_success "Wasabi S3 connection successful"
else
    log_error "Failed to connect to Wasabi S3"
    log_error "Please check credentials and network connectivity"
fi

log_info "Step 8: Setting up SSH keys for remote backups..."
if [[ ! -f /root/.ssh/id_rsa ]]; then
    ssh-keygen -t rsa -b 4096 -f /root/.ssh/id_rsa -N "" -C "duplicati-backup@vmi02d"
    log_success "SSH key generated"
else
    log_info "SSH key already exists"
fi

log_info "Step 9: Creating Wasabi bucket structure..."
for node in vmi01 vmi02d vmi03; do
    for schedule in 6hourly daily weekly monthly; do
        aws s3api put-object \
            --bucket ${WASABI_BUCKET} \
            --key ${node}/${schedule}/ \
            --endpoint-url https://${WASABI_ENDPOINT} \
            --profile wasabi 2>&1 | grep -v "InsecureRequestWarning" || true
    done
done
log_success "Bucket structure created"

log_info "Step 10: Saving encryption passphrase..."
cat > "$BACKUP_CONFIG_DIR/encryption-passphrase.txt" << EOF
# Duplicati Encryption Passphrase
# Generated: $(date)
# KEEP THIS SECURE - Required for restore operations

PASSPHRASE="${ENCRYPTION_PASSPHRASE}"
EOF

chmod 600 "$BACKUP_CONFIG_DIR/encryption-passphrase.txt"
log_success "Encryption passphrase saved to $BACKUP_CONFIG_DIR/encryption-passphrase.txt"

log_info "Step 11: Creating backup job configuration template..."
cat > "$BACKUP_CONFIG_DIR/backup-job-template.json" << 'TEMPLATE'
{
  "Backup": {
    "Name": "JOBNAME",
    "Description": "DESCRIPTION",
    "Tags": [],
    "TargetURL": "s3://BUCKET/PATH/?auth-username=ACCESS_KEY&auth-password=SECRET_KEY&s3-server-name=ENDPOINT&s3-location-constraint=REGION",
    "Sources": [
      "SOURCE_PATHS"
    ],
    "Settings": [
      {"Name": "encryption-module", "Value": "aes"},
      {"Name": "passphrase", "Value": "PASSPHRASE"},
      {"Name": "compression-module", "Value": "lz4"},
      {"Name": "dblock-size", "Value": "100mb"},
      {"Name": "keep-versions", "Value": "RETENTION"},
      {"Name": "upload-verification-file", "Value": "true"},
      {"Name": "backup-test-samples", "Value": "1"}
    ],
    "Filters": [
      {"-*.tmp"},
      {"-*.cache"},
      {"-*.log"}
    ],
    "Schedule": {
      "Repeat": "SCHEDULE",
      "Time": "TIME"
    }
  }
}
TEMPLATE
log_success "Job template created"

log_info "Step 12: Creating firewall rules..."
if command -v ufw >/dev/null 2>&1; then
    ufw allow from 46.250.243.123 to any port 8200 proto tcp comment "Duplicati Web GUI from VMI01"
    ufw allow from 154.26.158.31 to any port 8200 proto tcp comment "Duplicati Web GUI from VMI03"
    ufw allow from 127.0.0.1 to any port 8200 proto tcp comment "Duplicati Web GUI localhost"
    log_success "Firewall rules added"
else
    log_warning "UFW not installed, skipping firewall configuration"
fi

log_info "Step 13: Creating monitoring script..."
cat > /usr/local/bin/check-duplicati-backups.sh << 'MONITOR'
#!/bin/bash

# Check Duplicati backup status
# Returns 0 if all recent backups successful, 1 if failures

LOG_DIR="/backup/logs"
ALERT_EMAIL="admin@acdev.host"

# Check last 24 hours of backups
FAILURES=$(find "$LOG_DIR" -name "*.log" -mtime -1 -exec grep -l "Failed" {} \; | wc -l)

if [[ $FAILURES -gt 0 ]]; then
    echo "WARNING: $FAILURES backup failures in last 24 hours"
    # Send email alert
    echo "Duplicati backup failures detected on $(hostname)" | \
        mail -s "Backup Alert: $FAILURES failures" "$ALERT_EMAIL" || true
    exit 1
else
    echo "OK: All backups successful in last 24 hours"
    exit 0
fi
MONITOR

chmod +x /usr/local/bin/check-duplicati-backups.sh
log_success "Monitoring script created"

log_info "Step 14: Adding monitoring cron job..."
(crontab -l 2>/dev/null || true; echo "0 8 * * * /usr/local/bin/check-duplicati-backups.sh >> /backup/logs/monitoring.log 2>&1") | crontab -
log_success "Monitoring cron job added"

log_info "Step 15: Starting Duplicati service..."
systemctl start duplicati
sleep 5

if systemctl is-active --quiet duplicati; then
    log_success "Duplicati service started successfully"
else
    log_error "Duplicati service failed to start"
    systemctl status duplicati --no-pager
    exit 1
fi

log_info "Step 16: Checking Duplicati Web GUI..."
sleep 10
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8200 | grep -q "200"; then
    log_success "Duplicati Web GUI is accessible"
else
    log_warning "Duplicati Web GUI may not be ready yet (check in 1-2 minutes)"
fi

log_info "Step 17: Creating Quick Start Guide..."
cat > "$BACKUP_CONFIG_DIR/QUICK_START.txt" << QUICKSTART
========================================
Duplicati Backup System - Quick Start
========================================

Installation Date: $(date)
Server: $(hostname)

WEB GUI ACCESS
--------------
URL: http://46.250.241.70:8200
     http://localhost:8200 (from VMI02D)

WASABI S3 CONFIGURATION
-----------------------
Access Key: ${WASABI_ACCESS_KEY}
Secret Key: ${WASABI_SECRET_KEY}
Bucket: ${WASABI_BUCKET}
Region: ${WASABI_REGION}
Endpoint: ${WASABI_ENDPOINT}

ENCRYPTION PASSPHRASE
---------------------
Location: $BACKUP_CONFIG_DIR/encryption-passphrase.txt
Command: cat $BACKUP_CONFIG_DIR/encryption-passphrase.txt

IMPORTANT: Keep this passphrase secure! Required for restores.

NEXT STEPS
----------
1. Access Web GUI: http://46.250.241.70:8200
2. Create first backup job:
   - Click "Add Backup"
   - Configure source paths
   - Set S3 destination
   - Configure schedule
   - Test backup

3. Copy SSH key to remote nodes:
   ssh-copy-id root@46.250.243.123  # VMI01
   ssh-copy-id root@154.26.158.31   # VMI03

4. Create backup jobs for each node:
   - VMI01: 6-hourly, daily, weekly, monthly
   - VMI02D: daily, weekly, monthly
   - VMI03: 6-hourly, daily, weekly, monthly

USEFUL COMMANDS
---------------
# Service management
systemctl status duplicati
systemctl restart duplicati
journalctl -u duplicati -f

# Check backups
/usr/local/bin/check-duplicati-backups.sh

# List Wasabi backups
aws s3 ls s3://${WASABI_BUCKET}/ --recursive --endpoint-url https://${WASABI_ENDPOINT} --profile wasabi

# Test Wasabi connection
aws s3 ls s3://${WASABI_BUCKET}/ --endpoint-url https://${WASABI_ENDPOINT} --profile wasabi

BACKUP DIRECTORIES
------------------
Cache: $BACKUP_CACHE_DIR
Config: $BACKUP_CONFIG_DIR
Logs: $BACKUP_LOG_DIR

SSH KEY (for remote backups)
-----------------------------
Public key: /root/.ssh/id_rsa.pub
$(cat /root/.ssh/id_rsa.pub)

Copy this to authorized_keys on VMI01 and VMI03:
echo "$(cat /root/.ssh/id_rsa.pub)" >> /root/.ssh/authorized_keys

MONITORING
----------
Daily check at 08:00: /usr/local/bin/check-duplicati-backups.sh
Logs: /backup/logs/monitoring.log

SUPPORT
-------
Duplicati docs: https://docs.duplicati.com/
Backup architecture: /backup/config/BACKUP_ARCHITECTURE.md

========================================
QUICKSTART

chmod 600 "$BACKUP_CONFIG_DIR/QUICK_START.txt"
log_success "Quick Start guide created"

log_success "=========================================="
log_success "Duplicati Backup System Deployment Complete!"
log_success "=========================================="
echo ""
log_info "IMPORTANT INFORMATION:"
echo ""
echo "  Web GUI URL:  http://46.250.241.70:8200"
echo "                http://localhost:8200"
echo ""
echo "  Encryption Passphrase Location:"
echo "  $BACKUP_CONFIG_DIR/encryption-passphrase.txt"
echo ""
echo "  Quick Start Guide:"
echo "  $BACKUP_CONFIG_DIR/QUICK_START.txt"
echo ""
log_warning "CRITICAL: Save the encryption passphrase securely!"
log_warning "Without it, backup restoration is impossible!"
echo ""
log_info "SSH Public Key (copy to VMI01 and VMI03):"
cat /root/.ssh/id_rsa.pub
echo ""
log_info "Next Steps:"
echo "  1. Access Web GUI and set up password"
echo "  2. Copy SSH key to remote nodes"
echo "  3. Create backup jobs via GUI"
echo "  4. Test first backup"
echo ""
log_success "Installation complete! System ready for backup configuration."
