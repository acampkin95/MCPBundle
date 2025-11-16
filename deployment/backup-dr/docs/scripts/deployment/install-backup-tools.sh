#!/bin/bash
# Backup Tools Installation Script
# Install backup tools on VMI01 and VMI02D

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

echo -e "${GREEN}=== Installing Backup Tools on VMI01 and VMI02D ===${NC}"

# Function to install tools on a server
install_tools() {
    local host=$1
    local server_name=$2

    echo -e "${YELLOW}Installing backup tools on $server_name ($host)...${NC}"

    SSHPASS="$ROOT_PASS" sshpass -e ssh -o StrictHostKeyChecking=no root@$host << 'EOF'
# Update package list
apt-get update -qq

# Install PostgreSQL backup tools
apt-get install -y postgresql-client pgbackrest

# Install rclone for S3 sync
curl -s https://rclone.org/install.sh | bash

# Install rsync and compression tools
apt-get install -y rsync gzip bzip2 xz-utils pigz pbzip2 lz4

# Install LVM tools for snapshots
apt-get install -y lvm2 thin-provisioning-tools

# Install monitoring tools
apt-get install -y moreutils jq bc

# Install encryption tools
apt-get install -y gnupg2 openssl

# Create backup directories
mkdir -p /backup/{local,logs,scripts,config}
mkdir -p /var/log/pgbackrest
mkdir -p /etc/pgbackrest

# Set proper permissions
chown -R postgres:postgres /var/log/pgbackrest 2>/dev/null || true
chmod 750 /backup/{local,logs,scripts,config}

echo "Backup tools installation completed!"
EOF

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ Tools installed successfully on $server_name${NC}"
    else
        echo -e "${RED}✗ Failed to install tools on $server_name${NC}"
        return 1
    fi
}

# Install on both servers
install_tools "$VMI01_HOST" "VMI01 (Database)"
install_tools "$VMI02D_HOST" "VMI02D (Storage)"

echo -e "${GREEN}=== Backup Tools Installation Complete ===${NC}"
