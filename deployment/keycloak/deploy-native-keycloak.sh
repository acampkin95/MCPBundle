#!/bin/bash
# ============================================================================
# MCP Ecosystem - Native Keycloak Deployment
# ============================================================================
# Purpose: Deploy production-ready native Keycloak (non-Docker) on VMI03
# Features:
#   - Migration from Docker Keycloak if present
#   - OpenJDK 17 installation
#   - Keycloak 23.x standalone deployment
#   - PostgreSQL integration (local or VMI01)
#   - SSL/TLS with Let's Encrypt or self-signed
#   - Systemd service management
#   - Multi-realm configuration (mcp-agents, SSO integrations)
#   - Automated admin password generation
#   - Health monitoring
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/mcp/keycloak-deployment-$(date +%Y%m%d_%H%M%S).log"
KEYCLOAK_VERSION="23.0.6"
KEYCLOAK_HOME="/opt/keycloak"
KEYCLOAK_DATA="/var/lib/keycloak"
KEYCLOAK_USER="keycloak"
KEYCLOAK_GROUP="keycloak"

# Server Configuration
VMI03_HOST="154.26.158.31"
VMI01_HOST="46.250.243.123"
KEYCLOAK_HTTP_PORT="8080"
KEYCLOAK_HTTPS_PORT="8443"

# Database Configuration (default to VMI01 PostgreSQL)
DB_HOST="${DB_HOST:-$VMI01_HOST}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="keycloak"
DB_USER="keycloak"
DB_PASSWORD=$(openssl rand -base64 32)

# Admin Configuration
KEYCLOAK_ADMIN="admin"
KEYCLOAK_ADMIN_PASSWORD=$(openssl rand -base64 32)

# SSL Configuration
USE_LETSENCRYPT="${USE_LETSENCRYPT:-false}"
DOMAIN_NAME="${DOMAIN_NAME:-keycloak.mcp.local}"

# Backup and Migration
DOCKER_BACKUP_DIR="/tmp/keycloak_docker_backup_$(date +%Y%m%d_%H%M%S)"
DOCKER_COMPOSE_DIR="/opt/keycloak"

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $*" | tee -a "$LOG_FILE"
}

log_step() {
    echo -e "${CYAN}▶${NC} $*" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${MAGENTA}ℹ${NC} $*" | tee -a "$LOG_FILE"
}

# ============================================================================
# Error Handling and Cleanup
# ============================================================================

cleanup_on_error() {
    log_error "Deployment failed. Initiating rollback..."

    # Stop Keycloak service if it was created
    if systemctl list-unit-files | grep -q keycloak.service; then
        systemctl stop keycloak.service 2>/dev/null || true
        systemctl disable keycloak.service 2>/dev/null || true
    fi

    # Restore Docker Keycloak if backup exists
    if [ -d "$DOCKER_BACKUP_DIR" ]; then
        log_warning "Restoring Docker Keycloak from backup..."
        if [ -d "$DOCKER_COMPOSE_DIR.backup" ]; then
            rm -rf "$DOCKER_COMPOSE_DIR"
            mv "$DOCKER_COMPOSE_DIR.backup" "$DOCKER_COMPOSE_DIR"
        fi

        if command -v docker &>/dev/null; then
            cd "$DOCKER_COMPOSE_DIR" && docker compose up -d 2>/dev/null || true
        fi
    fi

    log_error "Rollback complete. Check log: $LOG_FILE"
    exit 1
}

trap cleanup_on_error ERR

# ============================================================================
# Pre-flight Checks
# ============================================================================

preflight_checks() {
    log_step "Running pre-flight checks..."

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        exit 1
    fi

    # Check system resources
    local mem_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$mem_gb" -lt 4 ]; then
        log_warning "System has less than 4GB RAM. Keycloak may perform poorly."
    else
        log_success "Memory check: ${mem_gb}GB available"
    fi

    # Check disk space
    local disk_avail=$(df -BG "$KEYCLOAK_HOME" 2>/dev/null | tail -1 | awk '{print $4}' | sed 's/G//' || echo "100")
    if [ "${disk_avail}" -lt 5 ]; then
        log_error "Insufficient disk space. Need at least 5GB free."
        exit 1
    else
        log_success "Disk space check: ${disk_avail}GB available"
    fi

    # Check database connectivity
    if ! nc -z -w5 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
        log_warning "Cannot reach PostgreSQL at $DB_HOST:$DB_PORT"
        log_info "Will attempt to configure local PostgreSQL"
        USE_LOCAL_DB=true
    else
        log_success "PostgreSQL connectivity check: $DB_HOST:$DB_PORT reachable"
        USE_LOCAL_DB=false
    fi

    # Check for existing Keycloak installations
    if [ -d "$KEYCLOAK_HOME" ] && [ -f "$KEYCLOAK_HOME/bin/kc.sh" ]; then
        log_warning "Native Keycloak installation detected at $KEYCLOAK_HOME"
        read -rp "Remove existing installation and proceed? (yes/no): " confirm
        if [ "$confirm" != "yes" ]; then
            log "Deployment cancelled by user"
            exit 0
        fi
    fi

    log_success "Pre-flight checks completed"
}

# ============================================================================
# Export Docker Keycloak Data
# ============================================================================

export_docker_keycloak() {
    log_step "Checking for existing Docker Keycloak installation..."

    if ! command -v docker &>/dev/null; then
        log_info "Docker not found, skipping Docker export"
        return 0
    fi

    # Check if Keycloak container exists
    if docker ps -a --format '{{.Names}}' | grep -q '^keycloak$'; then
        log_warning "Docker Keycloak container found. Exporting data..."

        mkdir -p "$DOCKER_BACKUP_DIR"

        # Ensure container is running
        if ! docker ps --format '{{.Names}}' | grep -q '^keycloak$'; then
            log_info "Starting Docker Keycloak for export..."
            cd "$DOCKER_COMPOSE_DIR" && docker compose up -d keycloak
            sleep 30
        fi

        # Wait for Keycloak to be ready
        log "Waiting for Docker Keycloak to be ready..."
        local max_attempts=30
        local attempt=0
        while [ $attempt -lt $max_attempts ]; do
            if docker exec keycloak /opt/keycloak/bin/kc.sh show-config &>/dev/null; then
                log_success "Docker Keycloak is ready"
                break
            fi
            sleep 2
            ((attempt++))
        done

        # Export realms
        log "Exporting realm configurations..."

        # Get list of realms
        local realms=$(docker exec keycloak /opt/keycloak/bin/kcadm.sh get realms \
            --server http://localhost:8080 \
            --realm master \
            --user admin \
            --password "${KEYCLOAK_ADMIN_PASSWORD:-admin}" 2>/dev/null | grep '"realm"' | cut -d'"' -f4 || echo "")

        if [ -n "$realms" ]; then
            for realm in $realms; do
                log "Exporting realm: $realm"
                docker exec keycloak /opt/keycloak/bin/kc.sh export \
                    --dir /tmp/export \
                    --realm "$realm" 2>/dev/null || log_warning "Failed to export realm: $realm"

                # Copy export to backup directory
                docker cp keycloak:/tmp/export "$DOCKER_BACKUP_DIR/" 2>/dev/null || true
            done
            log_success "Realm data exported to $DOCKER_BACKUP_DIR"
        else
            log_info "No realms found to export"
        fi

        # Backup Docker Compose directory
        if [ -d "$DOCKER_COMPOSE_DIR" ]; then
            log "Backing up Docker Compose configuration..."
            cp -r "$DOCKER_COMPOSE_DIR" "$DOCKER_COMPOSE_DIR.backup"
            log_success "Docker configuration backed up"
        fi

        # Stop Docker Keycloak
        log "Stopping Docker Keycloak..."
        cd "$DOCKER_COMPOSE_DIR" && docker compose down
        log_success "Docker Keycloak stopped"

    else
        log_info "No Docker Keycloak installation found"
    fi
}

# ============================================================================
# Install Dependencies
# ============================================================================

install_dependencies() {
    log_step "Installing dependencies..."

    # Update package list
    apt-get update -qq

    # Install OpenJDK 17
    if ! command -v java &>/dev/null || ! java -version 2>&1 | grep -q "17\."; then
        log "Installing OpenJDK 17..."
        apt-get install -y openjdk-17-jdk openjdk-17-jre
        log_success "OpenJDK 17 installed"
    else
        log_info "OpenJDK 17 already installed"
    fi

    # Verify Java installation
    java -version 2>&1 | head -1
    log_success "Java version: $(java -version 2>&1 | head -1)"

    # Install other dependencies
    log "Installing additional dependencies..."
    apt-get install -y \
        curl \
        wget \
        unzip \
        netcat \
        postgresql-client \
        certbot \
        jq

    log_success "Dependencies installed"
}

# ============================================================================
# Setup PostgreSQL Database
# ============================================================================

setup_database() {
    log_step "Setting up PostgreSQL database for Keycloak..."

    if [ "$USE_LOCAL_DB" = true ]; then
        log "Installing local PostgreSQL..."
        apt-get install -y postgresql postgresql-contrib
        systemctl enable postgresql
        systemctl start postgresql

        DB_HOST="localhost"
        log_success "Local PostgreSQL installed"
    fi

    # Create Keycloak database and user
    log "Creating Keycloak database and user..."

    if [ "$DB_HOST" = "localhost" ]; then
        # Local database
        sudo -u postgres psql <<EOF
-- Create user
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE $DB_NAME WITH OWNER $DB_USER ENCODING 'UTF8';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Connect to keycloak database and grant schema privileges
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
EOF
    else
        # Remote database (VMI01)
        log_info "Creating database on remote host: $DB_HOST"
        PGPASSWORD="" psql -h "$DB_HOST" -U mcp_admin -d postgres <<EOF
-- Create user
CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE $DB_NAME WITH OWNER $DB_USER ENCODING 'UTF8';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

        # Grant schema privileges
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" <<EOF
GRANT ALL ON SCHEMA public TO $DB_USER;
EOF
    fi

    # Test database connection
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &>/dev/null; then
        log_success "Database created and connection verified"
    else
        log_error "Failed to connect to database"
        exit 1
    fi
}

# ============================================================================
# Download and Install Keycloak
# ============================================================================

install_keycloak() {
    log_step "Downloading and installing Keycloak $KEYCLOAK_VERSION..."

    # Create system user
    if ! id "$KEYCLOAK_USER" &>/dev/null; then
        log "Creating system user: $KEYCLOAK_USER"
        useradd -r -s /bin/bash -d "$KEYCLOAK_HOME" -m "$KEYCLOAK_USER"
        log_success "User created: $KEYCLOAK_USER"
    else
        log_info "User already exists: $KEYCLOAK_USER"
    fi

    # Create directories
    mkdir -p "$KEYCLOAK_HOME"
    mkdir -p "$KEYCLOAK_DATA"/{data,log,tmp}

    # Download Keycloak
    local download_url="https://github.com/keycloak/keycloak/releases/download/$KEYCLOAK_VERSION/keycloak-$KEYCLOAK_VERSION.tar.gz"
    local download_file="/tmp/keycloak-$KEYCLOAK_VERSION.tar.gz"

    if [ ! -f "$download_file" ]; then
        log "Downloading Keycloak from $download_url..."
        wget -q --show-progress -O "$download_file" "$download_url"
        log_success "Keycloak downloaded"
    else
        log_info "Using cached download: $download_file"
    fi

    # Extract
    log "Extracting Keycloak..."
    tar -xzf "$download_file" -C /tmp/

    # Move to installation directory
    if [ -d "/tmp/keycloak-$KEYCLOAK_VERSION" ]; then
        cp -r "/tmp/keycloak-$KEYCLOAK_VERSION"/* "$KEYCLOAK_HOME/"
        rm -rf "/tmp/keycloak-$KEYCLOAK_VERSION"
        log_success "Keycloak extracted to $KEYCLOAK_HOME"
    else
        log_error "Extraction failed"
        exit 1
    fi

    # Set ownership
    chown -R "$KEYCLOAK_USER:$KEYCLOAK_GROUP" "$KEYCLOAK_HOME"
    chown -R "$KEYCLOAK_USER:$KEYCLOAK_GROUP" "$KEYCLOAK_DATA"

    log_success "Keycloak installation complete"
}

# ============================================================================
# Configure SSL/TLS
# ============================================================================

configure_ssl() {
    log_step "Configuring SSL/TLS certificates..."

    local cert_dir="$KEYCLOAK_HOME/conf/certs"
    mkdir -p "$cert_dir"

    if [ "$USE_LETSENCRYPT" = "true" ] && [ "$DOMAIN_NAME" != "keycloak.mcp.local" ]; then
        log "Obtaining Let's Encrypt certificate for $DOMAIN_NAME..."

        # Stop any service using port 80
        systemctl stop keycloak.service 2>/dev/null || true

        # Obtain certificate
        certbot certonly --standalone \
            -d "$DOMAIN_NAME" \
            --non-interactive \
            --agree-tos \
            --email "admin@${DOMAIN_NAME}" \
            --http-01-port 80

        if [ $? -eq 0 ]; then
            # Convert to PKCS12 format for Keycloak
            openssl pkcs12 -export \
                -in "/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem" \
                -inkey "/etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem" \
                -out "$cert_dir/keycloak.p12" \
                -name keycloak \
                -passout pass:changeit

            log_success "Let's Encrypt certificate obtained"
            CERT_TYPE="letsencrypt"
        else
            log_warning "Let's Encrypt failed, falling back to self-signed"
            USE_LETSENCRYPT=false
        fi
    fi

    if [ "$USE_LETSENCRYPT" != "true" ]; then
        log "Generating self-signed certificate..."

        # Generate self-signed certificate
        openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
            -keyout "$cert_dir/keycloak.key" \
            -out "$cert_dir/keycloak.crt" \
            -subj "/C=US/ST=State/L=City/O=MCP Ecosystem/CN=$DOMAIN_NAME"

        # Convert to PKCS12
        openssl pkcs12 -export \
            -in "$cert_dir/keycloak.crt" \
            -inkey "$cert_dir/keycloak.key" \
            -out "$cert_dir/keycloak.p12" \
            -name keycloak \
            -passout pass:changeit

        log_success "Self-signed certificate generated"
        CERT_TYPE="self-signed"
    fi

    # Set permissions
    chown -R "$KEYCLOAK_USER:$KEYCLOAK_GROUP" "$cert_dir"
    chmod 600 "$cert_dir"/*.p12 2>/dev/null || true

    log_success "SSL/TLS configuration complete (type: $CERT_TYPE)"
}

# ============================================================================
# Configure Keycloak
# ============================================================================

configure_keycloak() {
    log_step "Configuring Keycloak..."

    # Create Keycloak configuration file
    cat > "$KEYCLOAK_HOME/conf/keycloak.conf" <<EOF
# ============================================================================
# Keycloak Configuration
# ============================================================================
# Generated: $(date)
# ============================================================================

# Database Configuration
db=postgres
db-url-host=$DB_HOST
db-url-port=$DB_PORT
db-url-database=$DB_NAME
db-username=$DB_USER
db-password=$DB_PASSWORD
db-pool-initial-size=5
db-pool-min-size=5
db-pool-max-size=50

# Hostname Configuration
hostname=$DOMAIN_NAME
hostname-strict=false
hostname-strict-https=false

# HTTP/HTTPS Configuration
http-enabled=true
http-port=$KEYCLOAK_HTTP_PORT
https-port=$KEYCLOAK_HTTPS_PORT
https-certificate-file=/opt/keycloak/conf/certs/keycloak.crt
https-certificate-key-file=/opt/keycloak/conf/certs/keycloak.key

# Proxy Configuration (for HAProxy)
proxy=edge

# Performance and Security
http-relative-path=/
health-enabled=true
metrics-enabled=true

# Logging
log=console,file
log-console-output=default
log-console-format=%d{yyyy-MM-dd HH:mm:ss,SSS} %-5p [%c] (%t) %s%e%n
log-file=/var/lib/keycloak/log/keycloak.log
log-file-format=%d{yyyy-MM-dd HH:mm:ss,SSS} %-5p [%c] (%t) %s%e%n
log-level=INFO

# Features
features=token-exchange,admin-fine-grained-authz,declarative-user-profile

# Cache
cache=ispn
cache-stack=tcp

# Clustering (for future expansion)
# cache-config-file=cache-ispn.xml
EOF

    # Set ownership
    chown "$KEYCLOAK_USER:$KEYCLOAK_GROUP" "$KEYCLOAK_HOME/conf/keycloak.conf"
    chmod 600 "$KEYCLOAK_HOME/conf/keycloak.conf"

    log_success "Keycloak configuration created"
}

# ============================================================================
# Build Keycloak
# ============================================================================

build_keycloak() {
    log_step "Building Keycloak optimized runtime..."

    # Export admin credentials for initial build
    export KEYCLOAK_ADMIN="$KEYCLOAK_ADMIN"
    export KEYCLOAK_ADMIN_PASSWORD="$KEYCLOAK_ADMIN_PASSWORD"

    # Build optimized version
    log "Running Keycloak build (this may take a few minutes)..."
    su - "$KEYCLOAK_USER" -c "cd $KEYCLOAK_HOME && bin/kc.sh build" 2>&1 | tee -a "$LOG_FILE"

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        log_success "Keycloak build completed"
    else
        log_error "Keycloak build failed"
        exit 1
    fi
}

# ============================================================================
# Create Systemd Service
# ============================================================================

create_systemd_service() {
    log_step "Creating systemd service..."

    cat > /etc/systemd/system/keycloak.service <<EOF
[Unit]
Description=Keycloak Authentication Server
After=network.target postgresql.service
Wants=network.target

[Service]
Type=simple
User=$KEYCLOAK_USER
Group=$KEYCLOAK_GROUP
Environment="KEYCLOAK_ADMIN=$KEYCLOAK_ADMIN"
Environment="KEYCLOAK_ADMIN_PASSWORD=$KEYCLOAK_ADMIN_PASSWORD"
Environment="JAVA_OPTS=-Xms512m -Xmx2048m -XX:MetaspaceSize=96M -XX:MaxMetaspaceSize=256m"
WorkingDirectory=$KEYCLOAK_HOME
ExecStart=$KEYCLOAK_HOME/bin/kc.sh start
ExecStop=$KEYCLOAK_HOME/bin/kc.sh stop
StandardOutput=journal
StandardError=journal
SyslogIdentifier=keycloak
Restart=on-failure
RestartSec=10s

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$KEYCLOAK_DATA

# Resource Limits
LimitNOFILE=65536
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    log_success "Systemd service created"
}

# ============================================================================
# Start Keycloak
# ============================================================================

start_keycloak() {
    log_step "Starting Keycloak service..."

    # Enable service
    systemctl enable keycloak.service

    # Start service
    systemctl start keycloak.service

    # Wait for Keycloak to start
    log "Waiting for Keycloak to start (this may take 1-2 minutes)..."
    local max_attempts=60
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if systemctl is-active --quiet keycloak.service; then
            if curl -sk "https://localhost:$KEYCLOAK_HTTPS_PORT/health/ready" &>/dev/null; then
                log_success "Keycloak is running and healthy"
                return 0
            fi
        fi
        sleep 3
        ((attempt++))
        echo -n "."
    done

    echo ""
    log_error "Keycloak failed to start within timeout"
    log "Checking service status..."
    systemctl status keycloak.service --no-pager
    log "Checking logs..."
    journalctl -u keycloak.service -n 50 --no-pager
    exit 1
}

# ============================================================================
# Import Realm Data
# ============================================================================

import_realm_data() {
    log_step "Checking for realm data to import..."

    if [ -d "$DOCKER_BACKUP_DIR/export" ]; then
        log "Importing realm data from Docker backup..."

        for realm_file in "$DOCKER_BACKUP_DIR/export"/*.json; do
            if [ -f "$realm_file" ]; then
                local realm_name=$(basename "$realm_file" .json)
                log "Importing realm: $realm_name"

                su - "$KEYCLOAK_USER" -c "$KEYCLOAK_HOME/bin/kc.sh import \
                    --file $realm_file \
                    --override true" 2>&1 | tee -a "$LOG_FILE" || log_warning "Failed to import $realm_name"
            fi
        done

        log_success "Realm import completed"
    else
        log_info "No realm data to import"
    fi
}

# ============================================================================
# Configure MCP Realms and Clients
# ============================================================================

configure_mcp_realms() {
    log_step "Configuring MCP realms and clients..."

    # Wait for Keycloak to be fully ready
    sleep 10

    # Login to Keycloak admin CLI
    log "Authenticating to Keycloak admin..."
    su - "$KEYCLOAK_USER" -c "$KEYCLOAK_HOME/bin/kcadm.sh config credentials \
        --server https://localhost:$KEYCLOAK_HTTPS_PORT \
        --realm master \
        --user $KEYCLOAK_ADMIN \
        --password $KEYCLOAK_ADMIN_PASSWORD" 2>&1 | tee -a "$LOG_FILE"

    # Create mcp-agents realm
    log "Creating mcp-agents realm..."
    su - "$KEYCLOAK_USER" -c "$KEYCLOAK_HOME/bin/kcadm.sh create realms \
        -s realm=mcp-agents \
        -s enabled=true \
        -s displayName='MCP Agents Realm' \
        -s registrationAllowed=false \
        -s resetPasswordAllowed=true \
        -s rememberMe=true \
        -s loginWithEmailAllowed=true" 2>&1 | tee -a "$LOG_FILE" || log_info "Realm may already exist"

    # Create clients
    local clients=(
        "server-mcp-agent:Server MCP Agent"
        "nextcloud-sso:NextCloud SSO Integration"
        "web-hosting-platform:Web Hosting Platform"
        "vpn-invite-system:VPN Invitation System"
        "grafana-sso:Grafana SSO Integration"
    )

    for client_def in "${clients[@]}"; do
        local client_id="${client_def%%:*}"
        local client_name="${client_def#*:}"
        local client_secret=$(openssl rand -hex 32)

        log "Creating client: $client_id"

        su - "$KEYCLOAK_USER" -c "$KEYCLOAK_HOME/bin/kcadm.sh create clients \
            -r mcp-agents \
            -s clientId=$client_id \
            -s name='$client_name' \
            -s enabled=true \
            -s protocol=openid-connect \
            -s publicClient=false \
            -s serviceAccountsEnabled=true \
            -s authorizationServicesEnabled=true \
            -s directAccessGrantsEnabled=true \
            -s standardFlowEnabled=true \
            -s implicitFlowEnabled=false \
            -s secret='$client_secret' \
            -s 'redirectUris=[\"*\"]' \
            -s 'webOrigins=[\"*\"]'" 2>&1 | tee -a "$LOG_FILE" || log_warning "Client $client_id may already exist"

        # Save client secret
        echo "$client_id:$client_secret" >> "$KEYCLOAK_HOME/conf/client-secrets.txt"
    done

    # Set permissions on secrets file
    chown "$KEYCLOAK_USER:$KEYCLOAK_GROUP" "$KEYCLOAK_HOME/conf/client-secrets.txt"
    chmod 600 "$KEYCLOAK_HOME/conf/client-secrets.txt"

    log_success "MCP realms and clients configured"
}

# ============================================================================
# Create Health Check Script
# ============================================================================

create_health_check() {
    log_step "Creating health check script..."

    cat > /usr/local/bin/keycloak-health-check.sh <<'EOF'
#!/bin/bash
# Keycloak Health Check Script

KEYCLOAK_URL="https://localhost:8443"

# Check if service is running
if ! systemctl is-active --quiet keycloak.service; then
    echo "ERROR: Keycloak service is not running"
    exit 1
fi

# Check health endpoint
if curl -sf "$KEYCLOAK_URL/health/ready" >/dev/null 2>&1; then
    echo "OK: Keycloak is healthy"
    exit 0
else
    echo "WARNING: Keycloak health check failed"
    exit 1
fi
EOF

    chmod +x /usr/local/bin/keycloak-health-check.sh

    # Create cron job for health monitoring
    echo "*/5 * * * * root /usr/local/bin/keycloak-health-check.sh >> /var/log/mcp/keycloak-health.log 2>&1" \
        > /etc/cron.d/keycloak-health

    log_success "Health check script created"
}

# ============================================================================
# Save Credentials
# ============================================================================

save_credentials() {
    log_step "Saving credentials..."

    cat > "$KEYCLOAK_HOME/credentials.txt" <<EOF
=========================================================
KEYCLOAK NATIVE DEPLOYMENT CREDENTIALS
=========================================================
Deployment Date: $(date)
Server: VMI03 ($VMI03_HOST)
Keycloak Version: $KEYCLOAK_VERSION
=========================================================

ADMIN CONSOLE ACCESS
--------------------
URL:               https://$DOMAIN_NAME:$KEYCLOAK_HTTPS_PORT
Alternate URL:     https://$VMI03_HOST:$KEYCLOAK_HTTPS_PORT
Admin Username:    $KEYCLOAK_ADMIN
Admin Password:    $KEYCLOAK_ADMIN_PASSWORD

DATABASE CONFIGURATION
----------------------
Database Host:     $DB_HOST
Database Port:     $DB_PORT
Database Name:     $DB_NAME
Database User:     $DB_USER
Database Password: $DB_PASSWORD

SSL/TLS CERTIFICATE
-------------------
Certificate Type:  $CERT_TYPE
Certificate Path:  $KEYCLOAK_HOME/conf/certs/
PKCS12 Password:   changeit

REALMS
------
- master (default admin realm)
- mcp-agents (MCP ecosystem realm)

CLIENTS (in mcp-agents realm)
------------------------------
$(cat "$KEYCLOAK_HOME/conf/client-secrets.txt" 2>/dev/null || echo "None configured yet")

SYSTEMD SERVICE
---------------
Service Name:      keycloak.service
Status:            systemctl status keycloak
Logs:              journalctl -u keycloak -f
Restart:           systemctl restart keycloak

HEALTH ENDPOINTS
----------------
Ready:             https://$VMI03_HOST:$KEYCLOAK_HTTPS_PORT/health/ready
Live:              https://$VMI03_HOST:$KEYCLOAK_HTTPS_PORT/health/live
Metrics:           https://$VMI03_HOST:$KEYCLOAK_HTTPS_PORT/metrics

CONFIGURATION FILES
-------------------
Main Config:       $KEYCLOAK_HOME/conf/keycloak.conf
Service File:      /etc/systemd/system/keycloak.service
Data Directory:    $KEYCLOAK_DATA
Log File:          $KEYCLOAK_DATA/log/keycloak.log

MIGRATION INFO
--------------
Docker Backup:     $DOCKER_BACKUP_DIR
Docker Compose:    $DOCKER_COMPOSE_DIR.backup

=========================================================
⚠️  SECURITY NOTICE
=========================================================
- Store this file securely and restrict access
- Change the default admin password immediately
- Configure firewall rules to restrict access
- Enable audit logging in production
- Regularly backup the database
- Keep Keycloak updated for security patches
=========================================================
EOF

    chown "$KEYCLOAK_USER:$KEYCLOAK_GROUP" "$KEYCLOAK_HOME/credentials.txt"
    chmod 600 "$KEYCLOAK_HOME/credentials.txt"

    # Create symlink for easy access
    ln -sf "$KEYCLOAK_HOME/credentials.txt" /root/keycloak-credentials.txt

    log_success "Credentials saved to $KEYCLOAK_HOME/credentials.txt"
}

# ============================================================================
# Generate Summary Report
# ============================================================================

generate_summary() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       NATIVE KEYCLOAK DEPLOYMENT COMPLETED                     ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log_success "Keycloak Version: $KEYCLOAK_VERSION"
    log_success "Installation Path: $KEYCLOAK_HOME"
    log_success "Data Directory: $KEYCLOAK_DATA"
    echo ""

    log "Access Information:"
    log "  Admin Console: https://$DOMAIN_NAME:$KEYCLOAK_HTTPS_PORT"
    log "  IP Access:     https://$VMI03_HOST:$KEYCLOAK_HTTPS_PORT"
    log "  Username:      $KEYCLOAK_ADMIN"
    log "  Password:      $KEYCLOAK_ADMIN_PASSWORD"
    echo ""

    log "Database:"
    log "  Host:          $DB_HOST:$DB_PORT"
    log "  Database:      $DB_NAME"
    log "  User:          $DB_USER"
    echo ""

    log "Service Management:"
    log "  Start:         systemctl start keycloak"
    log "  Stop:          systemctl stop keycloak"
    log "  Restart:       systemctl restart keycloak"
    log "  Status:        systemctl status keycloak"
    log "  Logs:          journalctl -u keycloak -f"
    echo ""

    log "Health Check:"
    log "  Manual:        /usr/local/bin/keycloak-health-check.sh"
    log "  Endpoint:      https://$VMI03_HOST:$KEYCLOAK_HTTPS_PORT/health/ready"
    echo ""

    log "Realms Configured:"
    log "  - master (admin realm)"
    log "  - mcp-agents (MCP ecosystem)"
    echo ""

    log "Clients in mcp-agents realm:"
    log "  - server-mcp-agent"
    log "  - nextcloud-sso"
    log "  - web-hosting-platform"
    log "  - vpn-invite-system"
    log "  - grafana-sso"
    echo ""

    log_warning "IMPORTANT: Next Steps"
    log "  1. Access admin console and verify configuration"
    log "  2. Change admin password if needed"
    log "  3. Configure firewall rules (UFW)"
    log "  4. Set up SSL certificate renewal (if using Let's Encrypt)"
    log "  5. Configure applications to use Keycloak SSO"
    log "  6. Set up regular database backups"
    log "  7. Review and adjust Java heap settings if needed"
    echo ""

    log_info "Credentials saved to: $KEYCLOAK_HOME/credentials.txt"
    log_info "Deployment log: $LOG_FILE"
    echo ""
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       MCP Ecosystem - Native Keycloak Deployment               ║"
    echo "║                  VMI03 (154.26.158.31)                         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"

    log "Deployment started at $(date)"
    echo ""

    # Pre-flight checks
    preflight_checks
    echo ""

    # Confirmation
    log_warning "This will deploy native Keycloak with the following configuration:"
    log "  - Keycloak Version: $KEYCLOAK_VERSION"
    log "  - Installation Path: $KEYCLOAK_HOME"
    log "  - Database: PostgreSQL on $DB_HOST"
    log "  - HTTPS Port: $KEYCLOAK_HTTPS_PORT"
    log "  - Domain: $DOMAIN_NAME"
    echo ""

    read -rp "Proceed with deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Deployment cancelled by user"
        exit 0
    fi
    echo ""

    # Execute deployment steps
    export_docker_keycloak
    echo ""

    install_dependencies
    echo ""

    setup_database
    echo ""

    install_keycloak
    echo ""

    configure_ssl
    echo ""

    configure_keycloak
    echo ""

    build_keycloak
    echo ""

    create_systemd_service
    echo ""

    start_keycloak
    echo ""

    import_realm_data
    echo ""

    configure_mcp_realms
    echo ""

    create_health_check
    echo ""

    save_credentials
    echo ""

    # Generate summary
    generate_summary

    log_success "Native Keycloak deployment completed successfully!"
}

# Run main function
main "$@"
