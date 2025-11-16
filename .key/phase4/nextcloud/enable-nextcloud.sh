#!/bin/bash
#
# Enable NextCloud Service
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Enabling NextCloud Service${NC}"
echo "==============================="
echo ""

# Check if .env exists
if [[ ! -f "$SCRIPT_DIR/.env" ]]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please copy .env.template to .env and configure it first"
    exit 1
fi

# Verify database connection
source "$SCRIPT_DIR/.env"

echo "Testing database connection..."
if command -v psql &> /dev/null; then
    if PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1;" &> /dev/null; then
        echo -e "${GREEN}Database connection successful${NC}"
    else
        echo -e "${RED}Failed to connect to database${NC}"
        echo "Please verify your database credentials and that VMI01 PostgreSQL is accessible"
        exit 1
    fi
else
    echo -e "${YELLOW}psql not installed, skipping database connection test${NC}"
fi

# Generate self-signed certificate if not exists
if [[ ! -d "$SCRIPT_DIR/ssl" ]]; then
    echo "Generating self-signed SSL certificate..."
    mkdir -p "$SCRIPT_DIR/ssl"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SCRIPT_DIR/ssl/key.pem" \
        -out "$SCRIPT_DIR/ssl/cert.pem" \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=${NEXTCLOUD_DOMAIN}"
    chmod 600 "$SCRIPT_DIR/ssl/key.pem"
    echo -e "${GREEN}SSL certificate generated${NC}"
    echo -e "${YELLOW}Note: For production, replace with a real certificate (Let's Encrypt)${NC}"
fi

# Start NextCloud
echo "Starting NextCloud containers..."
cd "$SCRIPT_DIR"
docker-compose up -d

if [[ $? -eq 0 ]]; then
    echo ""
    echo -e "${GREEN}NextCloud started successfully!${NC}"
    echo ""
    echo "Service URLs:"
    echo "  HTTPS: https://46.250.241.70"
    echo "  HTTP: http://46.250.241.70 (redirects to HTTPS)"
    echo ""
    echo "Admin Credentials:"
    echo "  Username: $NEXTCLOUD_ADMIN_USER"
    echo "  Password: [configured in .env]"
    echo ""
    echo -e "${YELLOW}First-time setup:${NC}"
    echo "  1. Access NextCloud at https://46.250.241.70"
    echo "  2. Wait for initial setup (may take 2-3 minutes)"
    echo "  3. Login with admin credentials"
    echo "  4. Configure external storage (Wasabi S3) if needed"
    echo ""
    echo "Container status:"
    docker-compose ps
else
    echo -e "${RED}Failed to start NextCloud${NC}"
    exit 1
fi
