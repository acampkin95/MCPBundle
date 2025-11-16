#!/bin/bash
# Complete Keycloak setup script for VMI03

set -e

echo "Starting Keycloak deployment on VMI03..."

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    apt-get update
    apt-get install -y docker.io docker-compose
    systemctl enable docker
    systemctl start docker
    echo "Docker installed successfully"
else
    echo "Docker already installed"
fi

# Create Keycloak directory
mkdir -p /opt/keycloak/{certs,data}
cd /opt/keycloak

# Generate self-signed certificate
echo "Generating self-signed certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout certs/tls.key -out certs/tls.crt \
    -subj "/C=US/ST=State/L=City/O=MCP/CN=keycloak.mcp.local"

# Generate secure passwords
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 32)
DB_PASSWORD=$(openssl rand -base64 32)

# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  keycloak:
    image: quay.io/keycloak/keycloak:23.0
    container_name: keycloak
    restart: unless-stopped
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://154.26.158.29:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: ${DB_PASSWORD}
      KC_HOSTNAME: 154.26.158.31
      KC_HOSTNAME_STRICT: false
      KC_HTTPS_CERTIFICATE_FILE: /opt/keycloak/certs/tls.crt
      KC_HTTPS_CERTIFICATE_KEY_FILE: /opt/keycloak/certs/tls.key
      KC_HTTP_ENABLED: true
      KC_HEALTH_ENABLED: true
      KC_METRICS_ENABLED: true
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: ${KEYCLOAK_ADMIN_PASSWORD}
      KC_PROXY: edge
      KC_FEATURES: token-exchange,admin-fine-grained-authz
    volumes:
      - ./certs:/opt/keycloak/certs:ro
      - ./data:/opt/keycloak/data
    ports:
      - "8443:8443"
      - "8080:8080"
    command: start --optimized
    networks:
      - keycloak-network

networks:
  keycloak-network:
    driver: bridge
EOF

# Create .env file
cat > .env << EOF
DB_PASSWORD=${DB_PASSWORD}
KEYCLOAK_ADMIN_PASSWORD=${KEYCLOAK_ADMIN_PASSWORD}
EOF

# Save credentials
cat > credentials.txt << EOF
Keycloak Admin Credentials
==========================
URL: https://154.26.158.31:8443
Admin Username: admin
Admin Password: ${KEYCLOAK_ADMIN_PASSWORD}
Database Password: ${DB_PASSWORD}

Generated: $(date)
EOF

echo "Configuration files created"
echo "Admin Password: ${KEYCLOAK_ADMIN_PASSWORD}"
echo "DB Password: ${DB_PASSWORD}"