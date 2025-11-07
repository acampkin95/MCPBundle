#!/bin/bash
# ============================================================================
# MCP Ecosystem - Service Deployment Script
# ============================================================================
# Purpose: Deploy MCP services (orchestrator, perplexity, IT-MCP) to VMI01
# Target: VMI01 (46.250.243.123)
# Version: 0.2.0
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DEPLOY_USER="dev-admin"
DEPLOY_HOST="46.250.243.123"
MCP_BASE_DIR="/opt/mcp"
SERVICE_DIR="$MCP_BASE_DIR/services"
LOG_FILE="/var/log/mcp/service_deploy_$(date +%Y%m%d_%H%M%S).log"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Services to deploy
SERVICES=("mcp-orchestrator" "perplexity-mcp" "it-mcp")

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

# ============================================================================
# Pre-deployment Checks
# ============================================================================

preflight_checks() {
    log "Running pre-deployment checks..."

    # Check if source directories exist
    for service in "${SERVICES[@]}"; do
        if [ ! -d "$SOURCE_DIR/release_dev/$service" ]; then
            log_error "Source directory not found: $SOURCE_DIR/release_dev/$service"
            exit 1
        fi
    done

    # Check SSH connectivity
    if ! ssh -o ConnectTimeout=5 "$DEPLOY_USER@$DEPLOY_HOST" "echo 'SSH OK'" &>/dev/null; then
        log_error "Cannot connect to $DEPLOY_HOST via SSH"
        log "Try: ssh $DEPLOY_USER@$DEPLOY_HOST"
        exit 1
    fi

    # Check Node.js version on remote
    NODE_VERSION=$(ssh "$DEPLOY_USER@$DEPLOY_HOST" "node --version" 2>/dev/null || echo "none")
    if [[ "$NODE_VERSION" =~ ^v(20|21|22) ]]; then
        log_success "Node.js version: $NODE_VERSION"
    else
        log_error "Node.js 20+ required, found: $NODE_VERSION"
        exit 1
    fi

    # Check PostgreSQL connectivity
    if ! ssh "$DEPLOY_USER@$DEPLOY_HOST" "systemctl is-active postgresql" &>/dev/null; then
        log_error "PostgreSQL is not running on remote host"
        exit 1
    fi

    log_success "All pre-deployment checks passed"
}

# ============================================================================
# Build Services Locally
# ============================================================================

build_services() {
    log "Building services locally..."

    for service in "${SERVICES[@]}"; do
        log "Building $service..."

        cd "$SOURCE_DIR/release_dev/$service"

        # Install dependencies
        if [ -f "package.json" ]; then
            log "Installing dependencies for $service..."
            npm ci --production=false 2>&1 | tee -a "$LOG_FILE"

            # Build TypeScript
            log "Compiling TypeScript for $service..."
            npm run build 2>&1 | tee -a "$LOG_FILE"

            if [ "${PIPESTATUS[0]}" -eq 0 ]; then
                log_success "$service built successfully"
            else
                log_error "$service build failed"
                exit 1
            fi
        else
            log_warning "No package.json found for $service"
        fi
    done

    cd "$SOURCE_DIR"
    log_success "All services built successfully"
}

# ============================================================================
# Deploy Service Files
# ============================================================================

deploy_service_files() {
    local service=$1
    log "Deploying $service files..."

    # Create service directory on remote
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo mkdir -p $SERVICE_DIR/$service"
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo chown -R $DEPLOY_USER:$DEPLOY_USER $SERVICE_DIR/$service"

    # Sync files (exclude node_modules, we'll install on remote)
    rsync -avz --delete \
        --exclude 'node_modules' \
        --exclude '.git' \
        --exclude '*.log' \
        --exclude '.env' \
        "$SOURCE_DIR/release_dev/$service/" \
        "$DEPLOY_USER@$DEPLOY_HOST:$SERVICE_DIR/$service/" | tee -a "$LOG_FILE"

    if [ "${PIPESTATUS[0]}" -eq 0 ]; then
        log_success "$service files deployed"
    else
        log_error "$service file deployment failed"
        return 1
    fi

    # Install production dependencies on remote
    log "Installing production dependencies for $service on remote..."
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "cd $SERVICE_DIR/$service && npm ci --production" 2>&1 | tee -a "$LOG_FILE"

    if [ "${PIPESTATUS[0]}" -eq 0 ]; then
        log_success "$service dependencies installed"
    else
        log_error "$service dependency installation failed"
        return 1
    fi
}

# ============================================================================
# Configure Service Environment
# ============================================================================

configure_service_env() {
    local service=$1
    log "Configuring environment for $service..."

    # Create .env file on remote based on service type
    case $service in
        "mcp-orchestrator")
            ssh "$DEPLOY_USER@$DEPLOY_HOST" "cat > $SERVICE_DIR/$service/.env" <<'EOF'
NODE_ENV=production
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcp_ecosystem
DB_USER=mcp_admin
DB_PASS=TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MCP Configuration
MCP_SERVER_NAME=mcp-orchestrator
MCP_SERVER_VERSION=0.2.0

# Keycloak (placeholder - configure after Keycloak deployment)
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=mcp-ecosystem
KEYCLOAK_CLIENT_ID=mcp-orchestrator

# Logging
LOG_LEVEL=info
LOG_DIR=/var/log/mcp
EOF
            ;;

        "perplexity-mcp")
            ssh "$DEPLOY_USER@$DEPLOY_HOST" "cat > $SERVICE_DIR/$service/.env" <<'EOF'
NODE_ENV=production
PORT=3001

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcp_ecosystem
DB_USER=mcp_admin
DB_PASS=TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=

# Perplexity API
PERPLEXITY_API_KEY=your_api_key_here

# MCP Configuration
MCP_SERVER_NAME=perplexity-mcp
MCP_SERVER_VERSION=0.2.0

# Cost Budget
DAILY_COST_LIMIT=10.00
MONTHLY_COST_LIMIT=200.00

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=mcp-ecosystem
KEYCLOAK_CLIENT_ID=perplexity-mcp

# Logging
LOG_LEVEL=info
LOG_DIR=/var/log/mcp
EOF
            ;;

        "it-mcp")
            ssh "$DEPLOY_USER@$DEPLOY_HOST" "cat > $SERVICE_DIR/$service/.env" <<'EOF'
NODE_ENV=production
PORT=3002

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcp_ecosystem
DB_USER=mcp_admin
DB_PASS=TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=

# MCP Configuration
MCP_SERVER_NAME=it-mcp
MCP_SERVER_VERSION=0.2.0

# Local SQLite Cache
SQLITE_DB_PATH=/var/lib/mcp/it-mcp.db

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=mcp-ecosystem
KEYCLOAK_CLIENT_ID=it-mcp

# Logging
LOG_LEVEL=info
LOG_DIR=/var/log/mcp
EOF
            ;;
    esac

    log_success "$service environment configured"
}

# ============================================================================
# Create Systemd Service
# ============================================================================

create_systemd_service() {
    local service=$1
    local port=$2
    log "Creating systemd service for $service..."

    # Create systemd service file
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo tee /etc/systemd/system/$service.service" > /dev/null <<EOF
[Unit]
Description=MCP Service - $service
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=$DEPLOY_USER
WorkingDirectory=$SERVICE_DIR/$service
Environment=NODE_ENV=production
EnvironmentFile=$SERVICE_DIR/$service/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$service

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/mcp /var/lib/mcp

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl daemon-reload"

    log_success "Systemd service created for $service"
}

# ============================================================================
# Deploy All Services
# ============================================================================

deploy_all_services() {
    log "Deploying all MCP services..."

    local ports=("3000" "3001" "3002")
    local idx=0

    for service in "${SERVICES[@]}"; do
        log "═══════════════════════════════════════════════════════════════"
        log "Deploying $service..."
        log "═══════════════════════════════════════════════════════════════"

        # Deploy files
        deploy_service_files "$service" || {
            log_error "Failed to deploy $service files"
            return 1
        }

        # Configure environment
        configure_service_env "$service"

        # Create systemd service
        create_systemd_service "$service" "${ports[$idx]}"

        # Enable service (but don't start yet)
        ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl enable $service"

        log_success "$service deployment complete"
        ((idx++))
    done

    log_success "All services deployed successfully"
}

# ============================================================================
# Start Services
# ============================================================================

start_services() {
    log "Starting MCP services..."

    for service in "${SERVICES[@]}"; do
        log "Starting $service..."
        ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl start $service"

        # Wait and check status
        sleep 3
        if ssh "$DEPLOY_USER@$DEPLOY_HOST" "systemctl is-active --quiet $service"; then
            log_success "$service started successfully"
        else
            log_error "$service failed to start"
            log "Check logs: ssh $DEPLOY_USER@$DEPLOY_HOST journalctl -u $service -n 50"
            return 1
        fi
    done

    log_success "All services started"
}

# ============================================================================
# Validate Deployment
# ============================================================================

validate_deployment() {
    log "Validating deployment..."

    # Check all services are running
    for service in "${SERVICES[@]}"; do
        if ssh "$DEPLOY_USER@$DEPLOY_HOST" "systemctl is-active --quiet $service"; then
            log_success "$service is running"
        else
            log_error "$service is not running"
            return 1
        fi
    done

    # Check service ports
    local ports=("3000" "3001" "3002")
    for port in "${ports[@]}"; do
        if ssh "$DEPLOY_USER@$DEPLOY_HOST" "ss -tuln | grep -q :$port"; then
            log_success "Port $port is listening"
        else
            log_warning "Port $port is not listening"
        fi
    done

    # Check database connectivity from orchestrator
    log "Testing database connectivity..."
    if ssh "$DEPLOY_USER@$DEPLOY_HOST" "cd $SERVICE_DIR/mcp-orchestrator && node -e \"require('./dist/database').testConnection().catch(e => process.exit(1))\"" &>/dev/null; then
        log_success "Database connectivity verified"
    else
        log_warning "Database connectivity test inconclusive"
    fi

    log_success "Deployment validation complete"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║           MCP Ecosystem Service Deployment                    ║"
    echo "║              Target: VMI01 (46.250.243.123)                   ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    mkdir -p "$(dirname "$LOG_FILE")"

    log "Deployment started"
    log "Target: $DEPLOY_USER@$DEPLOY_HOST"
    log "Services: ${SERVICES[*]}"
    log "Log file: $LOG_FILE"
    echo ""

    # Pre-flight checks
    preflight_checks || exit 1
    echo ""

    # Build services
    build_services || exit 1
    echo ""

    # Confirmation prompt
    log_warning "╔════════════════════════════════════════════════════════════════╗"
    log_warning "║                  READY TO DEPLOY                               ║"
    log_warning "║                                                                ║"
    log_warning "║  This will deploy ${#SERVICES[@]} MCP services to production            ║"
    log_warning "║  Existing services will be stopped and replaced               ║"
    log_warning "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    read -rp "Proceed with deployment? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log "Deployment cancelled by user"
        exit 0
    fi

    echo ""

    # Stop existing services
    log "Stopping existing services..."
    for service in "${SERVICES[@]}"; do
        if ssh "$DEPLOY_USER@$DEPLOY_HOST" "systemctl is-active --quiet $service" 2>/dev/null; then
            ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo systemctl stop $service"
            log "Stopped $service"
        fi
    done
    echo ""

    # Deploy services
    deploy_all_services || exit 1
    echo ""

    # Start services
    start_services || exit 1
    echo ""

    # Validate
    validate_deployment || exit 1
    echo ""

    # Success summary
    log_success "╔════════════════════════════════════════════════════════════════╗"
    log_success "║           DEPLOYMENT COMPLETED SUCCESSFULLY                    ║"
    log_success "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    log "Service URLs:"
    log "  - MCP Orchestrator: http://46.250.243.123:3000"
    log "  - Perplexity MCP:   http://46.250.243.123:3001"
    log "  - IT-MCP Server:    http://46.250.243.123:3002"
    echo ""
    log "Next steps:"
    log "  1. Configure Perplexity API key in $SERVICE_DIR/perplexity-mcp/.env"
    log "  2. Configure Keycloak URLs after SSO deployment"
    log "  3. Test inter-MCP communication"
    log "  4. Monitor logs: journalctl -u mcp-orchestrator -f"
    echo ""
    log "Deployment log: $LOG_FILE"
}

# Run main function
main "$@"
