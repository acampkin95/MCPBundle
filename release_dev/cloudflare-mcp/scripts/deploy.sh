#!/bin/bash
set -euo pipefail

# ============================================
# SERVER-MCP Deployment Script
# ============================================
# This script deploys updates to an existing SERVER-MCP installation
#
# Usage:
#   sudo ./scripts/deploy.sh [--skip-build] [--restart]
#
# Options:
#   --skip-build  Skip npm install and TypeScript compilation
#   --restart     Restart service after deployment
# ============================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SERVICE_USER="mcp-agent"
INSTALL_DIR="/opt/server-mcp"
BACKUP_DIR="/var/backups/server-mcp"
SERVICE_NAME="server-mcp"

# Flags
SKIP_BUILD=false
RESTART_SERVICE=false

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

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --restart)
                RESTART_SERVICE=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Usage: sudo ./scripts/deploy.sh [--skip-build] [--restart]"
                exit 1
                ;;
        esac
    done
}

create_backup() {
    log_step "Creating pre-deployment backup..."

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/pre-deploy-$TIMESTAMP.tar.gz"

    mkdir -p "$BACKUP_DIR"

    tar -czf "$BACKUP_FILE" \
        -C "$INSTALL_DIR" \
        --exclude="node_modules" \
        --exclude="*.log" \
        --exclude="*.db" \
        --exclude="*.db-shm" \
        --exclude="*.db-wal" \
        . 2>/dev/null || true

    chown "$SERVICE_USER:$SERVICE_USER" "$BACKUP_FILE"

    log_info "Backup created: $BACKUP_FILE"
}

stop_service() {
    log_step "Stopping $SERVICE_NAME..."

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        systemctl stop "$SERVICE_NAME"
        log_info "Service stopped "
    else
        log_warn "Service not running"
    fi
}

pull_latest_code() {
    log_step "Pulling latest code..."

    cd "$INSTALL_DIR"

    if [[ -d .git ]]; then
        sudo -u "$SERVICE_USER" git pull
        log_info "Code updated "
    else
        log_warn "Not a git repository, skipping pull"
    fi
}

install_dependencies() {
    if [[ "$SKIP_BUILD" == true ]]; then
        log_warn "Skipping dependency installation (--skip-build flag)"
        return 0
    fi

    log_step "Installing dependencies..."

    cd "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" npm install --production

    log_info "Dependencies installed "
}

build_typescript() {
    if [[ "$SKIP_BUILD" == true ]]; then
        log_warn "Skipping TypeScript build (--skip-build flag)"
        return 0
    fi

    log_step "Building TypeScript..."

    cd "$INSTALL_DIR"
    sudo -u "$SERVICE_USER" npm run build

    log_info "TypeScript compiled "
}

verify_build() {
    log_step "Verifying build..."

    if [[ ! -f "$INSTALL_DIR/dist/index.js" ]]; then
        log_error "Build verification failed: dist/index.js not found"
        exit 1
    fi

    log_info "Build verified "
}

update_permissions() {
    log_step "Updating file permissions..."

    chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
    chmod -R 750 "$INSTALL_DIR"

    # Ensure dist is executable
    chmod -R 755 "$INSTALL_DIR/dist"

    log_info "Permissions updated "
}

start_service() {
    log_step "Starting $SERVICE_NAME..."

    systemctl start "$SERVICE_NAME"

    # Wait for service to start
    sleep 2

    if systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "Service started successfully "
    else
        log_error "Service failed to start!"
        log_error "Check logs with: sudo journalctl -u $SERVICE_NAME -n 50"
        exit 1
    fi
}

verify_deployment() {
    log_step "Verifying deployment..."

    # Check service status
    if ! systemctl is-active --quiet "$SERVICE_NAME"; then
        log_error "Service is not running!"
        return 1
    fi

    # Check for errors in last 30 seconds
    if journalctl -u "$SERVICE_NAME" --since "30 seconds ago" | grep -q "ERROR"; then
        log_warn "Errors detected in recent logs"
        log_warn "Review with: sudo journalctl -u $SERVICE_NAME -p err -n 20"
    fi

    log_info "Deployment verified "
}

display_status() {
    cat <<EOF

${GREEN}========================================
Deployment Complete!
========================================${NC}

${YELLOW}Service Status:${NC}
$(systemctl status "$SERVICE_NAME" --no-pager -l | head -n 10)

${YELLOW}Quick Commands:${NC}
  ${BLUE}View logs:${NC}       sudo journalctl -u $SERVICE_NAME -f
  ${BLUE}Restart:${NC}         sudo systemctl restart $SERVICE_NAME
  ${BLUE}Check status:${NC}    sudo systemctl status $SERVICE_NAME
  ${BLUE}Rollback:${NC}        sudo ./scripts/rollback.sh

${GREEN}Deployment successful!${NC}

EOF
}

rollback_on_error() {
    log_error "Deployment failed! Starting rollback..."

    # Find latest backup
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/pre-deploy-*.tar.gz 2>/dev/null | head -n 1)

    if [[ -n "$LATEST_BACKUP" ]]; then
        log_info "Restoring from: $LATEST_BACKUP"

        systemctl stop "$SERVICE_NAME" || true

        # Clear dist directory
        rm -rf "$INSTALL_DIR/dist"

        # Restore backup
        tar -xzf "$LATEST_BACKUP" -C "$INSTALL_DIR"

        # Fix permissions
        chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

        # Start service
        systemctl start "$SERVICE_NAME"

        log_info "Rollback complete. Please investigate deployment failure."
    else
        log_error "No backup found for rollback!"
    fi

    exit 1
}

# Main execution
main() {
    log_info "Starting SERVER-MCP deployment..."

    parse_args "$@"
    check_root

    # Set error trap
    trap rollback_on_error ERR

    create_backup
    stop_service
    pull_latest_code
    install_dependencies
    build_typescript
    verify_build
    update_permissions
    start_service
    verify_deployment

    display_status
}

main "$@"
