#!/bin/bash
# pgBackRest Configuration Script
# Configure PostgreSQL backup with local and S3 repositories

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Server credentials
VMI01_HOST="46.250.243.123"
VMI02D_HOST="46.250.241.70"
ROOT_PASS="${ROOT_PASS:-${MCP_ROOT_PASSWORD:-}}"

if [[ -z "${ROOT_PASS:-}" ]]; then
    echo "Set ROOT_PASS or MCP_ROOT_PASSWORD from Vault before running." >&2
    exit 1
fi

echo -e "${GREEN}=== Configuring pgBackRest ===${NC}"

# Create pgBackRest configuration on VMI01
echo -e "${YELLOW}Configuring pgBackRest on VMI01...${NC}"

SSHPASS="$ROOT_PASS" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01_HOST << 'EOF'
# Create pgBackRest configuration
cat > /etc/pgbackrest/pgbackrest.conf << 'EOC'
[global]
# General options
process-max=4
log-level-console=info
log-level-file=detail
start-fast=y
stop-auto=y
compress-type=lz4
compress-level=3

# Repository encryption
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=

# Local repository on VMI02D
repo1-type=posix
repo1-path=/backup/pgbackrest
repo1-retention-full=7
repo1-retention-diff=4
repo1-retention-archive=7

# S3 repository (Wasabi)
repo2-type=s3
repo2-path=/pgbackrest
repo2-s3-bucket=mcp-bundle-backups
repo2-s3-endpoint=s3.wasabisys.com
repo2-s3-region=us-east-1
repo2-s3-key=YOUR_WASABI_ACCESS_KEY
repo2-s3-key-secret=YOUR_WASABI_SECRET_KEY
repo2-retention-full=4
repo2-retention-diff=12
repo2-retention-archive=30

# Stanza configuration
[main]
pg1-path=/var/lib/postgresql/16/main
pg1-port=5432
pg1-database=mcp_system

# Archive settings
archive-async=y
archive-push-queue-max=4GiB

# Backup settings
backup-standby=n
delta=y
resume=n

# Restore settings
recovery-option=recovery_target_timeline=latest
EOC

# Create pgBackRest directories
mkdir -p /var/spool/pgbackrest
chown -R postgres:postgres /var/spool/pgbackrest
chmod 750 /var/spool/pgbackrest

# Configure PostgreSQL for WAL archiving
cat >> /etc/postgresql/16/main/postgresql.conf << 'EOC'

# pgBackRest Archive Settings
archive_mode = on
archive_command = 'pgbackrest --stanza=main archive-push %p'
archive_timeout = 60
max_wal_senders = 3
wal_level = replica
wal_log_hints = on

# Checkpoint settings for backup performance
checkpoint_timeout = 30min
checkpoint_completion_target = 0.9
max_wal_size = 2GB
min_wal_size = 1GB
EOC

# Restart PostgreSQL to apply changes
systemctl restart postgresql

# Wait for PostgreSQL to be ready
sleep 5

# Initialize the stanza
sudo -u postgres pgbackrest --stanza=main stanza-create

echo "pgBackRest configured on VMI01"
EOF

# Configure backup repository on VMI02D
echo -e "${YELLOW}Setting up backup repository on VMI02D...${NC}"

SSHPASS="$ROOT_PASS" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI02D_HOST << 'EOF'
# Create backup repository structure
mkdir -p /backup/pgbackrest
mkdir -p /backup/system
mkdir -p /backup/config
mkdir -p /backup/snapshots

# Set up NFS export for pgBackRest repository
cat >> /etc/exports << 'EOC'
/backup/pgbackrest 46.250.243.123(rw,sync,no_subtree_check,no_root_squash)
EOC

# Apply NFS exports
exportfs -ra

# Create backup user
useradd -r -s /bin/bash -d /backup backup || true
chown -R backup:backup /backup
chmod 755 /backup

echo "Backup repository configured on VMI02D"
EOF

# Mount NFS on VMI01
echo -e "${YELLOW}Mounting NFS backup repository on VMI01...${NC}"

SSHPASS="$ROOT_PASS" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01_HOST << 'EOF'
# Install NFS client
apt-get install -y nfs-common

# Create mount point
mkdir -p /backup/pgbackrest

# Add to fstab
echo "46.250.241.70:/backup/pgbackrest /backup/pgbackrest nfs defaults,_netdev 0 0" >> /etc/fstab

# Mount the NFS share
mount -a

# Verify mount
df -h /backup/pgbackrest

echo "NFS backup repository mounted on VMI01"
EOF

echo -e "${GREEN}=== pgBackRest Configuration Complete ===${NC}"
