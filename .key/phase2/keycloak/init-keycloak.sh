#!/bin/bash
# Keycloak Initialization Script
# This script prepares and deploys Keycloak on VMI03

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Keycloak Deployment for VMI03${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   exit 1
fi

# Install Docker and Docker Compose if not present
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Create Keycloak directory
KEYCLOAK_DIR="/opt/keycloak"
mkdir -p "$KEYCLOAK_DIR"/{certs,data}
cd "$KEYCLOAK_DIR"

# Generate environment file if it doesn't exist
if [[ ! -f .env ]]; then
    echo -e "${YELLOW}Creating .env file...${NC}"
    cat > .env <<EOF
# Keycloak Database Password (PostgreSQL on VMI01)
KEYCLOAK_DB_PASSWORD=$(openssl rand -base64 32)

# Keycloak Admin Password
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 32)
EOF
    chmod 600 .env
    echo -e "${GREEN}.env file created with random passwords${NC}"
    echo -e "${YELLOW}Please review and update if needed: $KEYCLOAK_DIR/.env${NC}"
fi

# Generate self-signed certificate for HTTPS
if [[ ! -f certs/keycloak.crt ]]; then
    echo -e "${YELLOW}Generating self-signed SSL certificate...${NC}"
    openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
        -keyout certs/keycloak.key \
        -out certs/keycloak.crt \
        -subj "/C=US/ST=State/L=City/O=ACDev/CN=auth.acdev.host" \
        -addext "subjectAltName=DNS:auth.acdev.host,DNS:154.26.158.31,IP:154.26.158.31"
    chmod 600 certs/keycloak.key
    echo -e "${GREEN}Self-signed certificate generated${NC}"
    echo -e "${YELLOW}For production, replace with Let's Encrypt certificate${NC}"
fi

# Create PostgreSQL database on VMI01
echo -e "${YELLOW}Creating Keycloak database on VMI01...${NC}"

# Load database password
source .env

# SSH to VMI01 and create database
ssh root@46.250.243.123 <<REMOTE_EOF
su - postgres -c "psql -c \"CREATE DATABASE keycloak;\""
su - postgres -c "psql -c \"CREATE USER keycloak WITH ENCRYPTED PASSWORD '$KEYCLOAK_DB_PASSWORD';\""
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak;\""
su - postgres -c "psql -d keycloak -c \"GRANT ALL ON SCHEMA public TO keycloak;\""
echo "Keycloak database created successfully"
REMOTE_EOF

echo -e "${GREEN}Database created on VMI01${NC}"

# Copy configuration files
echo -e "${YELLOW}Copying configuration files...${NC}"
cp docker-compose.yml "$KEYCLOAK_DIR/"
cp realm-config.json "$KEYCLOAK_DIR/"

# Update realm configuration with actual passwords
echo -e "${YELLOW}Updating realm configuration...${NC}"
DEV_ADMIN_PASS=$(openssl rand -base64 24)
DATA_ADMIN_PASS=$(openssl rand -base64 24)
SEC_ADMIN_PASS=$(openssl rand -base64 24)

sed -i "s|CHANGE_ME_DEV_ADMIN_PASSWORD|$DEV_ADMIN_PASS|g" "$KEYCLOAK_DIR/realm-config.json"
sed -i "s|CHANGE_ME_DATA_ADMIN_PASSWORD|$DATA_ADMIN_PASS|g" "$KEYCLOAK_DIR/realm-config.json"
sed -i "s|CHANGE_ME_SEC_ADMIN_PASSWORD|$SEC_ADMIN_PASS|g" "$KEYCLOAK_DIR/realm-config.json"

# Save service account passwords
cat > "$KEYCLOAK_DIR/service-accounts.txt" <<EOF
Service Account Credentials (SECURE THIS FILE)
Generated: $(date)

dev-admin: $DEV_ADMIN_PASS
data-admin: $DATA_ADMIN_PASS
sec-admin: $SEC_ADMIN_PASS
EOF
chmod 600 "$KEYCLOAK_DIR/service-accounts.txt"

# Start Keycloak
echo -e "${GREEN}Starting Keycloak...${NC}"
docker-compose up -d

# Wait for Keycloak to be ready
echo -e "${YELLOW}Waiting for Keycloak to start (this may take 60-90 seconds)...${NC}"
timeout 120 bash -c 'until docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials --server http://localhost:8080 --realm master --user $KEYCLOAK_ADMIN --password $KEYCLOAK_ADMIN_PASSWORD 2>/dev/null; do sleep 5; done' || {
    echo -e "${RED}Keycloak failed to start within timeout${NC}"
    docker-compose logs keycloak
    exit 1
}

echo -e "${GREEN}Keycloak started successfully!${NC}"

# Configure MFA for admin user
echo -e "${YELLOW}Configuring MFA requirement for admin user...${NC}"
docker exec keycloak /opt/keycloak/bin/kcadm.sh update users/$(docker exec keycloak /opt/keycloak/bin/kcadm.sh get users -r master -q username=alex.campkin --fields id --format csv --noquotes) \
    -r master \
    -s 'requiredActions=["CONFIGURE_TOTP"]' || echo -e "${YELLOW}MFA configuration will be required on first login${NC}"

# Display completion information
echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Keycloak Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo -e "${YELLOW}Access Information:${NC}"
echo "  URL: http://154.26.158.31:8080"
echo "  Admin Console: http://154.26.158.31:8080/admin"
echo "  Admin User: alex.campkin"
source .env
echo "  Admin Password: $KEYCLOAK_ADMIN_PASSWORD"
echo
echo -e "${YELLOW}Service Account Credentials:${NC}"
echo "  Location: $KEYCLOAK_DIR/service-accounts.txt"
echo
echo -e "${YELLOW}Database Connection:${NC}"
echo "  Host: 46.250.243.123:5432"
echo "  Database: keycloak"
echo "  User: keycloak"
echo
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Login to admin console and configure MFA (TOTP)"
echo "2. Review and customize realm settings"
echo "3. Configure SMTP for email notifications"
echo "4. Set up OAuth2 clients for services"
echo "5. For Let's Encrypt SSL: certbot certonly --standalone -d auth.acdev.host"
echo "6. Update docker-compose.yml to use Let's Encrypt certificates"
echo
echo -e "${YELLOW}View logs:${NC} docker-compose -f $KEYCLOAK_DIR/docker-compose.yml logs -f"
echo
