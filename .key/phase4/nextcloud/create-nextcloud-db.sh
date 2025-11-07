#!/bin/bash
#
# Create NextCloud Database on VMI01
# Run this script on VMI01 PostgreSQL server
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}NextCloud Database Setup on VMI01${NC}"
echo "=========================================="
echo ""

# Check if running on correct server
read -p "Are you running this on VMI01 PostgreSQL server? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Please run this script on VMI01${NC}"
    exit 1
fi

# Get database password
echo -e "${YELLOW}Enter password for NextCloud database user:${NC}"
read -s NEXTCLOUD_DB_PASSWORD
echo

if [[ -z "$NEXTCLOUD_DB_PASSWORD" ]]; then
    echo -e "${RED}Password cannot be empty${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating NextCloud database and user...${NC}"

# Create database and user
sudo -u postgres psql <<EOF
-- Create nextcloud user
CREATE USER nextcloud WITH PASSWORD '$NEXTCLOUD_DB_PASSWORD';

-- Create nextcloud database
CREATE DATABASE nextcloud WITH OWNER nextcloud ENCODING 'UTF8' LC_COLLATE='en_US.UTF-8' LC_CTYPE='en_US.UTF-8' TEMPLATE=template0;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE nextcloud TO nextcloud;

-- Connect to nextcloud database and set default privileges
\c nextcloud

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO nextcloud;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nextcloud;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nextcloud;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO nextcloud;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO nextcloud;

EOF

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}NextCloud database created successfully!${NC}"
    echo ""
    echo "Database Details:"
    echo "  Database: nextcloud"
    echo "  User: nextcloud"
    echo "  Password: [hidden]"
    echo ""
    echo -e "${YELLOW}Configure PostgreSQL to allow remote connections:${NC}"
    echo "1. Edit /etc/postgresql/*/main/postgresql.conf"
    echo "   Set: listen_addresses = '*'"
    echo ""
    echo "2. Edit /etc/postgresql/*/main/pg_hba.conf"
    echo "   Add: host    nextcloud    nextcloud    46.250.241.70/32    scram-sha-256"
    echo ""
    echo "3. Restart PostgreSQL:"
    echo "   sudo systemctl restart postgresql"
    echo ""
    echo -e "${GREEN}Update your VMI02D .env file with these credentials${NC}"
else
    echo -e "${RED}Failed to create database${NC}"
    exit 1
fi
