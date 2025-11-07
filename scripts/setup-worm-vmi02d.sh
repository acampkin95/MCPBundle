#!/bin/bash
#
# WORM Area Setup Script for VMI02D
# Sets up AccessService user with SFTP-only chroot jail and automated archival
#
# Usage: Run as root on VMI02D
#   chmod +x setup-worm-vmi02d.sh
#   ./setup-worm-vmi02d.sh
#

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root"
    exit 1
fi

log_info "Starting WORM Area Setup for VMI02D..."

# Configuration
USERNAME="AccessService"
PASSWORD="Jeremylikestosuckbigdicks8==>"
UPLOAD_DIR="/home/${USERNAME}/upload"
ARCHIVE_DIR="/mnt/secure-archive"

# Step 1: Create the AccessService user
log_info "Step 1: Creating user ${USERNAME}..."

if id "$USERNAME" &>/dev/null; then
    log_warn "User ${USERNAME} already exists, skipping user creation"
else
    # Create user with no shell access (will be SFTP-only)
    useradd -m -d /home/${USERNAME} -s /usr/sbin/nologin ${USERNAME}

    # Set password
    echo "${USERNAME}:${PASSWORD}" | chpasswd
    log_info "User ${USERNAME} created successfully"
fi

# Step 2: Create directory structure
log_info "Step 2: Creating directory structure..."

# Create user home directory with proper ownership
mkdir -p /home/${USERNAME}
chown root:root /home/${USERNAME}
chmod 755 /home/${USERNAME}

# Create upload directory
mkdir -p ${UPLOAD_DIR}
chown ${USERNAME}:${USERNAME} ${UPLOAD_DIR}
chmod 770 ${UPLOAD_DIR}

# Create secure archive directory
mkdir -p ${ARCHIVE_DIR}
chown root:root ${ARCHIVE_DIR}
chmod 750 ${ARCHIVE_DIR}

log_info "Directory structure created"

# Step 3: Configure SSH for SFTP-only chroot jail
log_info "Step 3: Configuring SSH/SFTP..."

SSHD_CONFIG="/etc/ssh/sshd_config"
BACKUP_CONFIG="${SSHD_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

# Backup SSH config
cp ${SSHD_CONFIG} ${BACKUP_CONFIG}
log_info "SSH config backed up to ${BACKUP_CONFIG}"

# Check if SFTP subsystem is configured
if ! grep -q "^Subsystem.*sftp" ${SSHD_CONFIG}; then
    echo "Subsystem sftp internal-sftp" >> ${SSHD_CONFIG}
fi

# Add or update Match User block for AccessService
if grep -q "^Match User ${USERNAME}" ${SSHD_CONFIG}; then
    log_warn "Match User ${USERNAME} block already exists, please verify configuration manually"
else
    cat >> ${SSHD_CONFIG} <<EOF

# WORM Area Configuration for ${USERNAME}
Match User ${USERNAME}
    ChrootDirectory /home/${USERNAME}
    ForceCommand internal-sftp
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
EOF
    log_info "SSH/SFTP configuration added"
fi

# Test SSH configuration
if sshd -t; then
    log_info "SSH configuration is valid"
    systemctl restart sshd
    log_info "SSH service restarted"
else
    log_error "SSH configuration is invalid! Restoring backup..."
    cp ${BACKUP_CONFIG} ${SSHD_CONFIG}
    exit 1
fi

# Step 4: Create the file archival mechanism
log_info "Step 4: Setting up automated file archival..."

# Create the archival script
cat > /usr/local/bin/worm-archive.sh <<'ARCHIVE_SCRIPT'
#!/bin/bash
#
# WORM Archive Script
# Monitors upload directory and moves files to secure archive
#

UPLOAD_DIR="/home/AccessService/upload"
ARCHIVE_DIR="/mnt/secure-archive"
LOG_FILE="/var/log/worm-archive.log"

log_message() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> ${LOG_FILE}
}

# Process any existing files
process_files() {
    find ${UPLOAD_DIR} -type f -mmin +0.5 | while read -r file; do
        if [ -f "$file" ]; then
            filename=$(basename "$file")
            timestamp=$(date '+%Y%m%d_%H%M%S')
            archive_name="${timestamp}_${filename}"

            # Move file to archive
            mv "$file" "${ARCHIVE_DIR}/${archive_name}"

            # Make file immutable (WORM)
            chattr +i "${ARCHIVE_DIR}/${archive_name}"
            chmod 440 "${ARCHIVE_DIR}/${archive_name}"

            log_message "Archived: ${filename} -> ${archive_name}"
        fi
    done
}

log_message "WORM Archive Service Started"

# Initial processing
process_files

# Monitor directory with inotify
inotifywait -m -e close_write,moved_to ${UPLOAD_DIR} --format '%w%f' | while read file; do
    if [ -f "$file" ]; then
        # Small delay to ensure file write is complete
        sleep 1

        filename=$(basename "$file")
        timestamp=$(date '+%Y%m%d_%H%M%S')
        archive_name="${timestamp}_${filename}"

        # Move file to archive
        mv "$file" "${ARCHIVE_DIR}/${archive_name}"

        # Make file immutable (WORM)
        chattr +i "${ARCHIVE_DIR}/${archive_name}"
        chmod 440 "${ARCHIVE_DIR}/${archive_name}"

        log_message "Archived: ${filename} -> ${archive_name}"
    fi
done
ARCHIVE_SCRIPT

chmod +x /usr/local/bin/worm-archive.sh

# Install inotify-tools if not present
log_info "Installing dependencies..."
if command -v apt-get &> /dev/null; then
    apt-get update -qq
    apt-get install -y inotify-tools
elif command -v yum &> /dev/null; then
    yum install -y inotify-tools
else
    log_warn "Could not detect package manager. Please install 'inotify-tools' manually"
fi

# Create systemd service
cat > /etc/systemd/system/worm-archive.service <<'SERVICE'
[Unit]
Description=WORM Archive Service for AccessService
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/worm-archive.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

# Enable and start the service
systemctl daemon-reload
systemctl enable worm-archive.service
systemctl start worm-archive.service

log_info "WORM archive service installed and started"

# Step 5: Create log rotation
log_info "Step 5: Setting up log rotation..."

cat > /etc/logrotate.d/worm-archive <<'LOGROTATE'
/var/log/worm-archive.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
LOGROTATE

# Step 6: Summary and verification
log_info "========================================="
log_info "WORM Area Setup Complete!"
log_info "========================================="
echo ""
log_info "Configuration Summary:"
echo "  User: ${USERNAME}"
echo "  Upload Directory: ${UPLOAD_DIR} (SFTP chroot)"
echo "  Archive Directory: ${ARCHIVE_DIR} (admin only)"
echo "  Service Status: $(systemctl is-active worm-archive.service)"
echo ""
log_info "Testing SFTP Access:"
echo "  sftp ${USERNAME}@$(hostname -I | awk '{print $1}')"
echo "  Password: ${PASSWORD}"
echo ""
log_info "Monitoring Logs:"
echo "  journalctl -u worm-archive.service -f"
echo "  tail -f /var/log/worm-archive.log"
echo ""
log_warn "Security Note: Files in ${ARCHIVE_DIR} are immutable."
log_warn "To remove immutable flag: chattr -i /path/to/file"
echo ""

# Run basic verification
log_info "Running verification checks..."

echo -n "  - User exists: "
if id ${USERNAME} &>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo -n "  - Upload directory exists: "
if [ -d ${UPLOAD_DIR} ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo -n "  - Archive directory exists: "
if [ -d ${ARCHIVE_DIR} ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo -n "  - WORM service running: "
if systemctl is-active --quiet worm-archive.service; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo -n "  - SSH configuration valid: "
if sshd -t 2>/dev/null; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

echo ""
log_info "Setup complete! Please test SFTP access."
