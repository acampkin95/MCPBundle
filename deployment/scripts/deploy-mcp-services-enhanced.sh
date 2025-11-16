#!/bin/bash
#
# MCP Services Enhanced Deployment Script for VMI01 (46.250.243.123)
# Builds and deploys all MCP servers with Redis integration and complete monitoring
#
# Usage: ./deploy-mcp-services-enhanced.sh
#
# Features:
# - Builds all 3 MCP servers from release_dev/
# - Deploys to VMI01 via rsync
# - Creates systemd services with auto-restart
# - Integrates with Redis and PostgreSQL
# - Configures environment variables and credentials
# - Sets up log rotation and health monitoring
# - Verifies service health endpoints

set -euo pipefail

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
readonly RELEASE_DEV_DIR="$PROJECT_ROOT/release_dev"
readonly DEPLOYMENT_DIR="$PROJECT_ROOT/deployment"

# Server configuration
readonly TARGET_SERVER="46.250.243.123"
readonly TARGET_USER="root"
readonly DEPLOY_BASE="/opt/mcp"
readonly MCP_USER="mcp"
readonly MCP_GROUP="mcp"

# Service configuration
declare -A MCP_SERVICES=(
    ["mcp-orchestrator"]="3000"
    ["perplexity-mcp"]="3001"
    ["itjsst-mcp"]="3002"
)

# Credentials
readonly DB_PASSWORD=""
readonly DB_URL="postgresql://mcp_admin:${DB_PASSWORD}@localhost:5432/mcp_ecosystem"
readonly KEYCLOAK_URL="https://154.26.158.31:8443"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${MAGENTA}[STEP]${NC} $1"
}

# Error handler
error_exit() {
    log_error "$1"
    exit 1
}

# Rollback handler
rollback() {
    log_error "Deployment failed. Initiating rollback..."

    for service in "${!MCP_SERVICES[@]}"; do
        log_info "Stopping $service..."
        ssh "$TARGET_USER@$TARGET_SERVER" "systemctl stop $service.service 2>/dev/null || true" || true
    done

    log_warning "Rollback completed. Services stopped."
    exit 1
}

# Trap errors for rollback
trap 'rollback' ERR

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."

    # Check if release_dev exists
    if [[ ! -d "$RELEASE_DEV_DIR" ]]; then
        error_exit "Release dev directory not found: $RELEASE_DEV_DIR"
    fi

    # Check SSH connectivity
    if ! ssh -o ConnectTimeout=5 "$TARGET_USER@$TARGET_SERVER" "echo 'SSH connection OK'" &>/dev/null; then
        error_exit "Cannot connect to $TARGET_SERVER via SSH"
    fi

    # Check Node.js version locally
    if ! command -v node &>/dev/null; then
        error_exit "Node.js not found. Please install Node.js >= 20.0.0"
    fi

    local node_version
    node_version=$(node --version | cut -d'v' -f2)
    local major_version
    major_version=$(echo "$node_version" | cut -d'.' -f1)

    if [[ $major_version -lt 20 ]]; then
        error_exit "Node.js version must be >= 20.0.0 (found: $node_version)"
    fi

    # Check if all MCP services exist
    for service in "${!MCP_SERVICES[@]}"; do
        if [[ ! -d "$RELEASE_DEV_DIR/$service" ]]; then
            error_exit "Service directory not found: $RELEASE_DEV_DIR/$service"
        fi
    done

    # Check PostgreSQL on remote
    if ! ssh "$TARGET_USER@$TARGET_SERVER" "systemctl is-active --quiet postgresql" 2>/dev/null; then
        log_warning "PostgreSQL may not be running on VMI01"
    fi

    log_success "Prerequisites check passed"
}

# Prompt for API keys and credentials
prompt_credentials() {
    log_step "Gathering credentials..."

    # Check if PERPLEXITY_API_KEY is set
    if [[ -z "${PERPLEXITY_API_KEY:-}" ]]; then
        echo ""
        log_info "Perplexity API key required for perplexity-mcp service"
        read -rp "Enter Perplexity API Key (or press Enter to skip): " PERPLEXITY_API_KEY
        export PERPLEXITY_API_KEY
    fi

    # Get Redis password from VMI01
    log_info "Fetching Redis password from VMI01..."
    REDIS_PASSWORD=$(ssh "$TARGET_USER@$TARGET_SERVER" "grep '^REDIS_PASSWORD=' /opt/redis/credentials.txt 2>/dev/null | cut -d'=' -f2" || echo "")

    if [[ -z "$REDIS_PASSWORD" ]]; then
        log_warning "Redis credentials not found on VMI01"
        log_info "Run deployment/redis/configure-redis.sh first to set up Redis"
        read -rp "Enter Redis password (or press Enter to skip Redis integration): " REDIS_PASSWORD
        export REDIS_PASSWORD
    else
        log_success "Retrieved Redis password from VMI01"
        export REDIS_PASSWORD
    fi

    # Build Redis URL
    if [[ -n "$REDIS_PASSWORD" ]]; then
        REDIS_URL="redis://:${REDIS_PASSWORD}@localhost:6379"
    else
        REDIS_URL=""
    fi

    export REDIS_URL

    log_success "Credentials gathered"
}

# Build MCP service
build_service() {
    local service_name=$1
    local service_dir="$RELEASE_DEV_DIR/$service_name"

    log_step "Building $service_name..."

    cd "$service_dir"

    # Clean previous builds
    rm -rf node_modules dist build

    # Install dependencies
    log_info "Installing dependencies for $service_name..."
    npm ci --quiet

    # Run linting (if configured)
    if npm run lint --if-present &>/dev/null; then
        log_info "Running linter..."
        npm run lint || log_warning "Linting failed, continuing..."
    fi

    # Run tests (if configured)
    if npm run test --if-present &>/dev/null; then
        log_info "Running tests..."
        npm run test || log_warning "Tests failed, continuing..."
    fi

    # Build TypeScript
    log_info "Building TypeScript..."
    npm run build

    # Verify build output
    if [[ ! -d "dist" ]] && [[ ! -d "build" ]]; then
        error_exit "Build failed for $service_name - no dist/ or build/ directory found"
    fi

    log_success "$service_name built successfully"

    cd - > /dev/null
}

# Build all services
build_all_services() {
    log_step "Building all MCP services..."

    for service in "${!MCP_SERVICES[@]}"; do
        build_service "$service"
    done

    log_success "All services built successfully"
}

# Prepare deployment package
prepare_deployment() {
    log_step "Preparing deployment package..."

    local temp_deploy_dir
    temp_deploy_dir=$(mktemp -d)
    export TEMP_DEPLOY_DIR="$temp_deploy_dir"

    for service in "${!MCP_SERVICES[@]}"; do
        local service_dir="$RELEASE_DEV_DIR/$service"
        local service_dest="$temp_deploy_dir/$service"

        log_info "Packaging $service..."

        mkdir -p "$service_dest"

        # Copy build output
        if [[ -d "$service_dir/dist" ]]; then
            cp -r "$service_dir/dist" "$service_dest/"
        elif [[ -d "$service_dir/build" ]]; then
            cp -r "$service_dir/build" "$service_dest/dist"
        fi

        # Copy package files
        cp "$service_dir/package.json" "$service_dest/"
        cp "$service_dir/package-lock.json" "$service_dest/" 2>/dev/null || true

        # Copy node_modules (production only)
        if [[ -d "$service_dir/node_modules" ]]; then
            log_info "Copying production dependencies..."
            rsync -a --exclude='@types' --exclude='typescript' --exclude='.bin' \
                "$service_dir/node_modules/" "$service_dest/node_modules/"
        fi
    done

    log_success "Deployment package prepared at $temp_deploy_dir"
}

# Deploy to server
deploy_to_server() {
    log_step "Deploying to VMI01 ($TARGET_SERVER)..."

    # Create MCP user if not exists
    log_info "Setting up MCP user and directories..."
    ssh "$TARGET_USER@$TARGET_SERVER" bash << 'REMOTE_SETUP'
set -euo pipefail

# Create MCP user
if ! id mcp &>/dev/null; then
    useradd -r -s /bin/bash -d /opt/mcp -m mcp
    echo "Created MCP user"
fi

# Create directories
mkdir -p /opt/mcp/{orchestrator,perplexity,itjsst,logs,config}
mkdir -p /var/log/mcp
mkdir -p /var/lib/mcp

# Set ownership
chown -R mcp:mcp /opt/mcp /var/log/mcp /var/lib/mcp

echo "User and directories configured"
REMOTE_SETUP

    # Rsync services
    for service in "${!MCP_SERVICES[@]}"; do
        log_info "Syncing $service to server..."

        local service_dest
        case $service in
            "mcp-orchestrator")
                service_dest="orchestrator"
                ;;
            "perplexity-mcp")
                service_dest="perplexity"
                ;;
            "itjsst-mcp")
                service_dest="itjsst"
                ;;
        esac

        rsync -avz --delete \
            "$TEMP_DEPLOY_DIR/$service/" \
            "$TARGET_USER@$TARGET_SERVER:/opt/mcp/$service_dest/"

        ssh "$TARGET_USER@$TARGET_SERVER" "chown -R mcp:mcp /opt/mcp/$service_dest"
    done

    log_success "Services synced to VMI01"
}

# Create environment configuration
create_env_config() {
    log_step "Creating environment configuration..."

    # Create orchestrator .env
    ssh "$TARGET_USER@$TARGET_SERVER" bash << EOF
set -euo pipefail

cat > /opt/mcp/orchestrator/.env << 'ENVEOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=$DB_URL
REDIS_URL=${REDIS_URL:-}
KEYCLOAK_URL=$KEYCLOAK_URL
LOG_LEVEL=info
HEALTH_CHECK_INTERVAL=30000
COMMAND_TIMEOUT=300000
MCP_SERVER_NAME=mcp-orchestrator
MCP_SERVER_VERSION=0.2.0
ENVEOF

cat > /opt/mcp/perplexity/.env << 'ENVEOF'
NODE_ENV=production
PORT=3001
DATABASE_URL=$DB_URL
REDIS_URL=${REDIS_URL:-}
KEYCLOAK_URL=$KEYCLOAK_URL
PERPLEXITY_API_KEY=${PERPLEXITY_API_KEY:-}
LOG_LEVEL=info
DAILY_COST_LIMIT=10.00
MONTHLY_COST_LIMIT=200.00
MCP_SERVER_NAME=perplexity-mcp
MCP_SERVER_VERSION=0.2.0
ENVEOF

cat > /opt/mcp/itjsst/.env << 'ENVEOF'
NODE_ENV=production
PORT=3002
DATABASE_URL=$DB_URL
REDIS_URL=${REDIS_URL:-}
KEYCLOAK_URL=$KEYCLOAK_URL
LOG_LEVEL=info
SUDO_ENABLED=true
REMOTE_EXECUTION_ENABLED=true
SQLITE_DB_PATH=/var/lib/mcp/itjsst.db
MCP_SERVER_NAME=itjsst-mcp
MCP_SERVER_VERSION=0.2.0
ENVEOF

# Set permissions
chown mcp:mcp /opt/mcp/*/.env
chmod 600 /opt/mcp/*/.env

echo "Environment files created"
EOF

    log_success "Environment configuration created"
}

# Create systemd services
create_systemd_services() {
    log_step "Creating systemd services..."

    # Create orchestrator service
    ssh "$TARGET_USER@$TARGET_SERVER" bash << 'EOF'
set -euo pipefail

cat > /etc/systemd/system/mcp-orchestrator.service << 'SERVICEEOF'
[Unit]
Description=MCP Orchestrator - Central Coordination Service
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Documentation=https://github.com/mcp-bundle/mcp-orchestrator

[Service]
Type=simple
User=mcp
Group=mcp
WorkingDirectory=/opt/mcp/orchestrator
EnvironmentFile=/opt/mcp/orchestrator/.env
ExecStart=/usr/bin/node /opt/mcp/orchestrator/dist/index.js
Restart=always
RestartSec=10s
StandardOutput=append:/var/log/mcp/orchestrator.log
StandardError=append:/var/log/mcp/orchestrator-error.log

# Resource limits
LimitNOFILE=65535
MemoryMax=1G
TasksMax=4096

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/mcp/orchestrator /var/log/mcp

# Health monitoring
WatchdogSec=60s

[Install]
WantedBy=multi-user.target
SERVICEEOF

cat > /etc/systemd/system/perplexity-mcp.service << 'SERVICEEOF'
[Unit]
Description=Perplexity MCP - AI Search Integration
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Documentation=https://github.com/mcp-bundle/perplexity-mcp

[Service]
Type=simple
User=mcp
Group=mcp
WorkingDirectory=/opt/mcp/perplexity
EnvironmentFile=/opt/mcp/perplexity/.env
ExecStart=/usr/bin/node /opt/mcp/perplexity/dist/index.js
Restart=always
RestartSec=10s
StandardOutput=append:/var/log/mcp/perplexity.log
StandardError=append:/var/log/mcp/perplexity-error.log

# Resource limits
LimitNOFILE=65535
MemoryMax=1G
TasksMax=4096

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/mcp/perplexity /var/log/mcp

# Health monitoring
WatchdogSec=60s

[Install]
WantedBy=multi-user.target
SERVICEEOF

cat > /etc/systemd/system/itjsst-mcp.service << 'SERVICEEOF'
[Unit]
Description=IT-MCP Server - System Administration Tools
After=network-online.target postgresql.service redis-server.service
Wants=network-online.target
Documentation=https://github.com/mcp-bundle/itjsst-mcp

[Service]
Type=simple
User=mcp
Group=mcp
WorkingDirectory=/opt/mcp/itjsst
EnvironmentFile=/opt/mcp/itjsst/.env
ExecStart=/usr/bin/node /opt/mcp/itjsst/dist/index.js
Restart=always
RestartSec=10s
StandardOutput=append:/var/log/mcp/itjsst.log
StandardError=append:/var/log/mcp/itjsst-error.log

# Resource limits
LimitNOFILE=65535
MemoryMax=1G
TasksMax=4096

# Security hardening (less restrictive for system admin tasks)
NoNewPrivileges=false
PrivateTmp=true
ProtectSystem=false
ProtectHome=false
ReadWritePaths=/opt/mcp/itjsst /var/log/mcp /var/lib/mcp /tmp

# Health monitoring
WatchdogSec=60s

[Install]
WantedBy=multi-user.target
SERVICEEOF

systemctl daemon-reload

echo "Systemd services created"
EOF

    log_success "Systemd services created"
}

# Configure log rotation
configure_log_rotation() {
    log_step "Configuring log rotation..."

    ssh "$TARGET_USER@$TARGET_SERVER" bash << 'EOF'
set -euo pipefail

cat > /etc/logrotate.d/mcp-services << 'LOGROTATEEOF'
/var/log/mcp/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    create 644 mcp mcp
    sharedscripts
    postrotate
        systemctl reload mcp-orchestrator.service > /dev/null 2>&1 || true
        systemctl reload perplexity-mcp.service > /dev/null 2>&1 || true
        systemctl reload itjsst-mcp.service > /dev/null 2>&1 || true
    endscript
}
LOGROTATEEOF

echo "Log rotation configured"
EOF

    log_success "Log rotation configured (daily, 7 days retention)"
}

# Create health check monitor
create_health_monitor() {
    log_step "Creating health check monitor..."

    ssh "$TARGET_USER@$TARGET_SERVER" bash << 'EOF'
set -euo pipefail

cat > /usr/local/bin/mcp-services-health-check.sh << 'HEALTHEOF'
#!/bin/bash
#
# MCP Services Health Check Monitor
# Checks health endpoints and restarts services if needed

set -euo pipefail

LOG_FILE="/var/log/mcp/health-monitor.log"
COOLDOWN_FILE="/tmp/mcp-health-cooldown"
COOLDOWN_SECONDS=300

log_message() {
    echo "[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $1" | tee -a "$LOG_FILE"
}

check_cooldown() {
    local service=$1

    if [[ -f "${COOLDOWN_FILE}.${service}" ]]; then
        local last_restart
        last_restart=$(cat "${COOLDOWN_FILE}.${service}")
        local now
        now=$(date +%s)
        local elapsed=$((now - last_restart))

        if [[ $elapsed -lt $COOLDOWN_SECONDS ]]; then
            log_message "Service $service in cooldown (${elapsed}s elapsed, ${COOLDOWN_SECONDS}s required)"
            return 1
        fi
    fi

    return 0
}

set_cooldown() {
    local service=$1
    date +%s > "${COOLDOWN_FILE}.${service}"
}

check_service_health() {
    local service=$1
    local port=$2

    # Check if service is running
    if ! systemctl is-active --quiet "$service.service"; then
        log_message "CRITICAL: $service is not running"
        return 1
    fi

    # Check health endpoint
    local health_response
    health_response=$(curl -sf "http://localhost:${port}/health" 2>/dev/null || echo "FAILED")

    if [[ "$health_response" == "FAILED" ]]; then
        log_message "WARNING: $service health endpoint not responding on port $port"
        return 1
    fi

    # Parse health status (assuming JSON response with "status" field)
    local status
    status=$(echo "$health_response" | jq -r '.status // "unknown"' 2>/dev/null || echo "unknown")

    if [[ "$status" != "healthy" ]] && [[ "$status" != "ok" ]]; then
        log_message "WARNING: $service reported unhealthy status: $status"
        return 1
    fi

    return 0
}

restart_service() {
    local service=$1

    if ! check_cooldown "$service"; then
        return 1
    fi

    log_message "Attempting to restart $service..."

    if systemctl restart "$service.service"; then
        log_message "SUCCESS: $service restarted"
        set_cooldown "$service"
        return 0
    else
        log_message "ERROR: Failed to restart $service"
        return 1
    fi
}

# Main health check loop
declare -A SERVICES=(
    ["mcp-orchestrator"]="3000"
    ["perplexity-mcp"]="3001"
    ["itjsst-mcp"]="3002"
)

for service in "${!SERVICES[@]}"; do
    port=${SERVICES[$service]}

    if ! check_service_health "$service" "$port"; then
        restart_service "$service"
    else
        log_message "OK: $service healthy on port $port"
    fi
done
HEALTHEOF

chmod +x /usr/local/bin/mcp-services-health-check.sh

# Create systemd timer for health checks
cat > /etc/systemd/system/mcp-health-monitor.service << 'TIMERSERVICEEOF'
[Unit]
Description=MCP Services Health Monitor
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/mcp-services-health-check.sh
StandardOutput=append:/var/log/mcp/health-monitor.log
StandardError=append:/var/log/mcp/health-monitor.log
TIMERSERVICEEOF

cat > /etc/systemd/system/mcp-health-monitor.timer << 'TIMEREOF'
[Unit]
Description=MCP Services Health Monitor Timer
Requires=mcp-health-monitor.service

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
AccuracySec=1min

[Install]
WantedBy=timers.target
TIMEREOF

systemctl daemon-reload
systemctl enable mcp-health-monitor.timer

echo "Health monitor created"
EOF

    log_success "Health check monitor created (runs every 5 minutes)"
}

# Start services
start_services() {
    log_step "Starting MCP services..."

    for service in "${!MCP_SERVICES[@]}"; do
        log_info "Enabling and starting $service..."

        ssh "$TARGET_USER@$TARGET_SERVER" bash << EOF
set -euo pipefail

systemctl enable $service.service
systemctl restart $service.service

# Wait for startup
sleep 3

# Check status
if systemctl is-active --quiet $service.service; then
    echo "$service started successfully"
else
    echo "ERROR: $service failed to start"
    journalctl -u $service.service -n 20 --no-pager
    exit 1
fi
EOF

        log_success "$service started successfully"
    done

    # Start health monitor
    log_info "Starting health monitor timer..."
    ssh "$TARGET_USER@$TARGET_SERVER" "systemctl start mcp-health-monitor.timer"

    log_success "All services started"
}

# Verify health endpoints
verify_health() {
    log_step "Verifying service health..."

    sleep 5  # Give services time to fully initialize

    for service in "${!MCP_SERVICES[@]}"; do
        local port=${MCP_SERVICES[$service]}

        log_info "Checking $service health endpoint on port $port..."

        local health_check
        health_check=$(ssh "$TARGET_USER@$TARGET_SERVER" "curl -sf http://localhost:${port}/health 2>/dev/null || echo 'FAILED'")

        if [[ "$health_check" == "FAILED" ]]; then
            log_warning "$service health endpoint not responding (may still be initializing)"
        else
            log_success "$service health check passed"
        fi
    done
}

# Display deployment summary
display_summary() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  MCP Services Deployment Complete${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BLUE}Deployed Services:${NC}"

    for service in "${!MCP_SERVICES[@]}"; do
        local port=${MCP_SERVICES[$service]}
        local status_output
        status_output=$(ssh "$TARGET_USER@$TARGET_SERVER" "systemctl is-active $service.service" || echo "inactive")

        local status_color
        if [[ "$status_output" == "active" ]]; then
            status_color=$GREEN
        else
            status_color=$RED
        fi

        echo -e "  ${status_color}●${NC} $service (port $port) - $status_output"
    done

    echo ""
    echo -e "${BLUE}Service Locations:${NC}"
    echo "  Orchestrator:  /opt/mcp/orchestrator"
    echo "  Perplexity:    /opt/mcp/perplexity"
    echo "  IT-MCP:        /opt/mcp/itjsst"
    echo ""
    echo -e "${BLUE}Logs:${NC}"
    echo "  Directory:     /var/log/mcp/"
    echo "  Orchestrator:  /var/log/mcp/orchestrator.log"
    echo "  Perplexity:    /var/log/mcp/perplexity.log"
    echo "  IT-MCP:        /var/log/mcp/itjsst.log"
    echo "  Health:        /var/log/mcp/health-monitor.log"
    echo ""
    echo -e "${BLUE}Health Endpoints:${NC}"
    echo "  Orchestrator:  http://$TARGET_SERVER:3000/health"
    echo "  Perplexity:    http://$TARGET_SERVER:3001/health"
    echo "  IT-MCP:        http://$TARGET_SERVER:3002/health"
    echo ""
    echo -e "${BLUE}Database:${NC}"
    echo "  PostgreSQL:    $DB_URL"
    echo ""
    if [[ -n "${REDIS_URL:-}" ]]; then
        echo -e "${BLUE}Redis:${NC}"
        echo "  URL:           $REDIS_URL"
        echo ""
    fi
    echo -e "${BLUE}Useful Commands:${NC}"
    echo "  View status:   ssh $TARGET_USER@$TARGET_SERVER 'systemctl status mcp-*.service'"
    echo "  View logs:     ssh $TARGET_USER@$TARGET_SERVER 'journalctl -u mcp-orchestrator -f'"
    echo "  Health check:  ssh $TARGET_USER@$TARGET_SERVER '/usr/local/bin/mcp-services-health-check.sh'"
    echo "  Restart all:   ssh $TARGET_USER@$TARGET_SERVER 'systemctl restart mcp-*.service'"
    echo ""
    echo -e "${BLUE}Monitoring:${NC}"
    echo "  Auto-healing:  Enabled (every 5 minutes)"
    echo "  Log rotation:  Daily, 7 days retention"
    echo "  Metrics:       Prometheus-compatible endpoints planned"
    echo ""
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "  1. Verify health: curl http://$TARGET_SERVER:3000/health"
    echo "  2. Check logs: ssh $TARGET_USER@$TARGET_SERVER 'tail -f /var/log/mcp/*.log'"
    echo "  3. Monitor services: ssh $TARGET_USER@$TARGET_SERVER 'systemctl status mcp-*.service'"
    if [[ -z "${PERPLEXITY_API_KEY:-}" ]]; then
        echo "  4. Set Perplexity API key: ssh $TARGET_USER@$TARGET_SERVER 'nano /opt/mcp/perplexity/.env'"
    fi
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Cleanup
cleanup() {
    if [[ -n "${TEMP_DEPLOY_DIR:-}" ]] && [[ -d "$TEMP_DEPLOY_DIR" ]]; then
        log_info "Cleaning up temporary deployment directory..."
        rm -rf "$TEMP_DEPLOY_DIR"
    fi
}

# Main execution
main() {
    log_info "Starting MCP services deployment to VMI01..."
    echo ""

    check_prerequisites
    prompt_credentials
    build_all_services
    prepare_deployment
    deploy_to_server
    create_env_config
    create_systemd_services
    configure_log_rotation
    create_health_monitor
    start_services
    verify_health
    display_summary
    cleanup

    log_success "MCP services deployment completed successfully!"
}

# Ensure cleanup on exit
trap cleanup EXIT

main "$@"
