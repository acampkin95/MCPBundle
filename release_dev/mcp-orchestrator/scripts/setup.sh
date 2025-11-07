#!/bin/bash
set -euo pipefail

# ============================================
# SERVER-MCP Initial Setup Script
# ============================================
# This script performs initial setup for SERVER-MCP on Ubuntu Server
#
# Usage:
#   sudo ./scripts/setup.sh
#
# What it does:
#   1. Creates service user (mcp-agent)
#   2. Sets up directory structure
#   3. Installs Node.js dependencies
#   4. Configures sudoers
#   5. Sets file permissions
#   6. Creates systemd service or PM2 configuration
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SERVICE_USER="mcp-agent"
INSTALL_DIR="/opt/server-mcp"
CONFIG_DIR="/etc/server-mcp"
DATA_DIR="/var/lib/server-mcp"
LOG_DIR="/var/log/server-mcp"
BACKUP_DIR="/var/backups/server-mcp"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_ubuntu() {
    if [[ ! -f /etc/os-release ]] || ! grep -q "Ubuntu" /etc/os-release; then
        log_warn "This script is designed for Ubuntu. Proceeding anyway..."
    fi
}

install_nodejs() {
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $NODE_VERSION -ge 18 ]]; then
            log_info "Node.js $NODE_VERSION detected (>= 18.18 required) "
            return 0
        fi
    fi

    log_info "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    log_info "Node.js installed: $(node -v)"
}

create_service_user() {
    if id "$SERVICE_USER" &>/dev/null; then
        log_info "Service user '$SERVICE_USER' already exists "
    else
        log_info "Creating service user '$SERVICE_USER'..."
        useradd -r -s /bin/false -d "$INSTALL_DIR" -c "SERVER-MCP Agent" "$SERVICE_USER"
        log_info "Service user created "
    fi
}

create_directories() {
    log_info "Creating directory structure..."

    # Application directory
    mkdir -p "$INSTALL_DIR"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    chmod 750 "$INSTALL_DIR"

    # Configuration directory
    mkdir -p "$CONFIG_DIR"
    chown root:"$SERVICE_USER" "$CONFIG_DIR"
    chmod 750 "$CONFIG_DIR"

    # Data directory (SQLite databases)
    mkdir -p "$DATA_DIR"
    chown "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
    chmod 700 "$DATA_DIR"

    # Log directory
    mkdir -p "$LOG_DIR"
    chown "$SERVICE_USER:$SERVICE_USER" "$LOG_DIR"
    chmod 750 "$LOG_DIR"

    # Backup directory
    mkdir -p "$BACKUP_DIR"
    chown "$SERVICE_USER:$SERVICE_USER" "$BACKUP_DIR"
    chmod 750 "$BACKUP_DIR"

    # Credential store directory
    mkdir -p /etc/credstore
    chmod 700 /etc/credstore

    log_info "Directories created "
}

install_dependencies() {
    log_info "Installing Node.js dependencies..."
    cd "$INSTALL_DIR"

    if [[ -f package.json ]]; then
        sudo -u "$SERVICE_USER" npm install --production
        log_info "Dependencies installed "
    else
        log_warn "No package.json found, skipping dependency installation"
    fi
}

build_typescript() {
    log_info "Building TypeScript..."
    cd "$INSTALL_DIR"

    if [[ -f tsconfig.json ]]; then
        sudo -u "$SERVICE_USER" npm run build
        log_info "TypeScript compiled "
    else
        log_warn "No tsconfig.json found, skipping build"
    fi
}

configure_sudoers() {
    log_info "Configuring sudoers..."

    SUDOERS_FILE="/etc/sudoers.d/server-mcp"
    cat > "$SUDOERS_FILE" <<'EOF'
# SERVER-MCP sudoers configuration
# Service management
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl status *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart postgresql
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart redis
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx

# Database backups
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/pg_dump *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/pg_dumpall *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/redis-cli BGSAVE

# Docker operations
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker ps *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker inspect *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker logs *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker restart *

# NGINX configuration
mcp-agent ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t
mcp-agent ALL=(ALL) NOPASSWD: /usr/sbin/nginx -T

# System metrics
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/journalctl *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/netstat *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/ss *
EOF

    chmod 440 "$SUDOERS_FILE"
    visudo -c -f "$SUDOERS_FILE"
    log_info "Sudoers configured "
}

create_env_file() {
    log_info "Creating environment configuration..."

    ENV_FILE="$CONFIG_DIR/server-mcp.env"
    if [[ -f "$ENV_FILE" ]]; then
        log_warn "Environment file already exists, skipping"
    else
        cp "$INSTALL_DIR/.env.example" "$ENV_FILE"
        chown root:"$SERVICE_USER" "$ENV_FILE"
        chmod 640 "$ENV_FILE"
        log_warn "Environment file created at $ENV_FILE - PLEASE EDIT WITH YOUR CREDENTIALS"
    fi
}

install_systemd_service() {
    log_info "Installing systemd service..."

    if [[ -f "$INSTALL_DIR/systemd/server-mcp.service" ]]; then
        # Update paths in service file
        sed -i "s|/opt/server-mcp|$INSTALL_DIR|g" "$INSTALL_DIR/systemd/server-mcp.service"
        sed -i "s|/etc/server-mcp/server-mcp.env|$CONFIG_DIR/server-mcp.env|g" "$INSTALL_DIR/systemd/server-mcp.service"

        cp "$INSTALL_DIR/systemd/server-mcp.service" /etc/systemd/system/
        systemctl daemon-reload
        log_info "Systemd service installed "
        log_info "Enable with: sudo systemctl enable server-mcp"
        log_info "Start with: sudo systemctl start server-mcp"
    else
        log_warn "Systemd service file not found, skipping"
    fi
}

configure_firewall() {
    log_info "Configuring firewall (UFW)..."

    if command -v ufw >/dev/null 2>&1; then
        # Allow SSH
        ufw allow 22/tcp

        # PostgreSQL and Redis are bound to localhost - no external access needed

        # Enable if not already active
        if ! ufw status | grep -q "Status: active"; then
            log_warn "UFW is not active. Enable with: sudo ufw enable"
        else
            log_info "Firewall configured "
        fi
    else
        log_warn "UFW not installed, skipping firewall configuration"
    fi
}

display_next_steps() {
    cat <<EOF

${GREEN}========================================
SERVER-MCP Setup Complete!
========================================${NC}

${YELLOW}Next Steps:${NC}

1. ${GREEN}Edit configuration:${NC}
   sudo nano $CONFIG_DIR/server-mcp.env

   Required settings:
   - POSTGRES_PASSWORD
   - REDIS_PASSWORD (if applicable)
   - KEYCLOAK_CLIENT_SECRET

2. ${GREEN}Update SQLite paths to use data directory:${NC}
   SERVER_MCP_SQLITE_PATH=$DATA_DIR/mcp_cache.db
   SERVER_MCP_QUEUE_PATH=$DATA_DIR/mcp_command_queue.db

3. ${GREEN}Enable and start service:${NC}
   sudo systemctl enable server-mcp
   sudo systemctl start server-mcp

4. ${GREEN}Verify status:${NC}
   sudo systemctl status server-mcp
   sudo journalctl -u server-mcp -f

5. ${GREEN}Security hardening:${NC}
   Review: $INSTALL_DIR/docs/SECURITY.md

${YELLOW}Directory Structure:${NC}
  Application:   $INSTALL_DIR
  Configuration: $CONFIG_DIR
  Data (SQLite): $DATA_DIR
  Logs:          $LOG_DIR
  Backups:       $BACKUP_DIR

${GREEN}Setup complete!${NC}

EOF
}

# Main execution
main() {
    log_info "Starting SERVER-MCP setup..."

    check_root
    check_ubuntu
    install_nodejs
    create_service_user
    create_directories
    install_dependencies
    build_typescript
    configure_sudoers
    create_env_file
    install_systemd_service
    configure_firewall

    display_next_steps
}

main "$@"
