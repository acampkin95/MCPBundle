#!/bin/bash
#
# Redis 7.x Configuration Script for MCP Bundle (VMI01)
# Configures Redis for pub/sub operations, caching, and agent coordination
#
# Usage: ./configure-redis.sh
#
# Features:
# - Redis 7.x installation from official repository
# - Production-grade configuration (persistence, memory, security)
# - Systemd service with auto-restart
# - Redis exporter for Prometheus monitoring
# - Health check automation
# - Secure credential management

set -euo pipefail

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
readonly REDIS_VERSION="7:7.2.4-1rl1~jammy1"
readonly REDIS_PORT="6379"
readonly REDIS_EXPORTER_VERSION="1.55.0"
readonly REDIS_EXPORTER_PORT="9121"
readonly REDIS_DATA_DIR="/var/lib/redis"
readonly REDIS_LOG_DIR="/var/log/redis"
readonly REDIS_CONFIG="/etc/redis/redis.conf"
readonly REDIS_CREDENTIALS="/opt/redis/credentials.txt"
readonly REDIS_HEALTH_CHECK="/usr/local/bin/redis-health-check.sh"
readonly VPN_INTERFACE="10.0.50.1"
readonly MAX_MEMORY="2gb"

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

# Error handler
error_exit() {
    log_error "$1"
    exit 1
}

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root"
    fi
}

# Generate secure random password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
}

# Install Redis from official repository
install_redis() {
    log_info "Installing Redis 7.x from official repository..."

    # Check if already installed
    if command -v redis-server &> /dev/null; then
        local installed_version
        installed_version=$(redis-server --version | awk '{print $3}' | cut -d'=' -f2)
        log_warning "Redis already installed (version: $installed_version)"

        # Ask if should continue
        read -rp "Continue with reconfiguration? (y/n): " continue_install
        if [[ ! "$continue_install" =~ ^[Yy]$ ]]; then
            log_info "Skipping Redis installation"
            return 0
        fi
    fi

    # Add Redis repository
    log_info "Adding Redis official repository..."
    curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg

    echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | \
        tee /etc/apt/sources.list.d/redis.list

    # Update and install
    apt-get update -qq
    apt-get install -y redis-server redis-tools

    log_success "Redis installed successfully"
}

# Configure Redis for production
configure_redis() {
    log_info "Configuring Redis for MCP operations..."

    # Backup original config
    if [[ -f "$REDIS_CONFIG" ]]; then
        cp "$REDIS_CONFIG" "${REDIS_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "Backed up existing configuration"
    fi

    # Generate Redis password
    local redis_password
    redis_password=$(generate_password)

    # Create credentials directory
    mkdir -p "$(dirname "$REDIS_CREDENTIALS")"
    chmod 700 "$(dirname "$REDIS_CREDENTIALS")"

    # Save credentials
    cat > "$REDIS_CREDENTIALS" << EOF
# Redis Credentials for MCP Bundle
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Server: VMI01 (46.250.243.123)

REDIS_PASSWORD=$redis_password
REDIS_URL=redis://:$redis_password@localhost:$REDIS_PORT
REDIS_VPN_URL=redis://:$redis_password@$VPN_INTERFACE:$REDIS_PORT

# Connection examples:
# redis-cli -a '$redis_password'
# redis-cli -h $VPN_INTERFACE -a '$redis_password'
EOF

    chmod 600 "$REDIS_CREDENTIALS"
    log_success "Generated and saved Redis credentials to $REDIS_CREDENTIALS"

    # Create optimized Redis configuration
    cat > "$REDIS_CONFIG" << EOF
# Redis Configuration for MCP Bundle v0.2.0
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# Purpose: Pub/Sub messaging, caching, session storage

# Network Configuration
bind 127.0.0.1 $VPN_INTERFACE
port $REDIS_PORT
protected-mode yes
tcp-backlog 511
timeout 300
tcp-keepalive 300

# Security
requirepass $redis_password
# Disable dangerous commands
rename-command FLUSHDB ""
rename-command FLUSHALL ""
rename-command CONFIG "CONFIG_MCP_ADMIN_ONLY"
rename-command SHUTDOWN "SHUTDOWN_MCP_ADMIN_ONLY"

# Memory Management
maxmemory $MAX_MEMORY
maxmemory-policy allkeys-lru
maxmemory-samples 5

# Persistence - AOF (Append Only File)
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
no-appendfsync-on-rewrite no
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Persistence - RDB (Snapshots)
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir $REDIS_DATA_DIR

# Logging
loglevel notice
logfile $REDIS_LOG_DIR/redis-server.log
syslog-enabled no

# Performance
databases 16
always-show-logo no
supervised systemd

# Pub/Sub
notify-keyspace-events "Ex"

# Slow Log
slowlog-log-slower-than 10000
slowlog-max-len 128

# Latency Monitor
latency-monitor-threshold 100

# Advanced Config
hash-max-ziplist-entries 512
hash-max-ziplist-value 64
list-max-ziplist-size -2
list-compress-depth 0
set-max-intset-entries 512
zset-max-ziplist-entries 128
zset-max-ziplist-value 64
hll-sparse-max-bytes 3000
stream-node-max-bytes 4096
stream-node-max-entries 100
activerehashing yes
client-output-buffer-limit normal 0 0 0
client-output-buffer-limit replica 256mb 64mb 60
client-output-buffer-limit pubsub 32mb 8mb 60
hz 10
dynamic-hz yes
aof-rewrite-incremental-fsync yes
rdb-save-incremental-fsync yes
EOF

    log_success "Redis configuration written to $REDIS_CONFIG"
}

# Set up systemd service
configure_systemd() {
    log_info "Configuring systemd service for Redis..."

    # Create systemd override directory
    mkdir -p /etc/systemd/system/redis-server.service.d

    # Create override configuration for auto-restart
    cat > /etc/systemd/system/redis-server.service.d/override.conf << EOF
[Unit]
Description=Redis In-Memory Data Store for MCP Bundle
After=network-online.target
Wants=network-online.target
Documentation=https://redis.io/documentation

[Service]
Type=notify
User=redis
Group=redis
ExecStart=/usr/bin/redis-server $REDIS_CONFIG
ExecStop=/bin/redis-cli -a $redis_password shutdown
Restart=always
RestartSec=5s
LimitNOFILE=65535

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$REDIS_DATA_DIR $REDIS_LOG_DIR

# Resource limits
LimitMEMLOCK=infinity
MemoryMax=3G
TasksMax=8192

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    log_success "Systemd service configured with auto-restart and security hardening"
}

# Set up log rotation
configure_log_rotation() {
    log_info "Configuring log rotation..."

    cat > /etc/logrotate.d/redis-server << EOF
$REDIS_LOG_DIR/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    create 640 redis redis
    sharedscripts
    postrotate
        /bin/systemctl reload redis-server > /dev/null 2>&1 || true
    endscript
}
EOF

    log_success "Log rotation configured (daily, 7 days retention)"
}

# Install Redis exporter for Prometheus
install_redis_exporter() {
    log_info "Installing Redis exporter for Prometheus monitoring..."

    # Check if already installed
    if systemctl is-active --quiet redis_exporter.service; then
        log_warning "Redis exporter already running"
        return 0
    fi

    # Download and install
    local download_url="https://github.com/oliver006/redis_exporter/releases/download/v${REDIS_EXPORTER_VERSION}/redis_exporter-v${REDIS_EXPORTER_VERSION}.linux-amd64.tar.gz"
    local tmp_dir
    tmp_dir=$(mktemp -d)

    cd "$tmp_dir"
    curl -sL "$download_url" | tar xz

    # Install binary
    install -m 755 redis_exporter-v${REDIS_EXPORTER_VERSION}.linux-amd64/redis_exporter /usr/local/bin/

    # Clean up
    cd - > /dev/null
    rm -rf "$tmp_dir"

    # Create systemd service
    cat > /etc/systemd/system/redis_exporter.service << EOF
[Unit]
Description=Redis Exporter for Prometheus
After=redis-server.service
Wants=redis-server.service
Documentation=https://github.com/oliver006/redis_exporter

[Service]
Type=simple
User=redis
Group=redis
Environment="REDIS_PASSWORD=$redis_password"
ExecStart=/usr/local/bin/redis_exporter \
    --redis.addr=redis://localhost:$REDIS_PORT \
    --redis.password=\${REDIS_PASSWORD} \
    --web.listen-address=:$REDIS_EXPORTER_PORT \
    --web.telemetry-path=/metrics
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF

    # Reload and enable
    systemctl daemon-reload
    systemctl enable redis_exporter.service

    log_success "Redis exporter installed (port $REDIS_EXPORTER_PORT)"
}

# Create health check script
create_health_check() {
    log_info "Creating health check script..."

    cat > "$REDIS_HEALTH_CHECK" << 'EOF'
#!/bin/bash
#
# Redis Health Check Script
# Returns: 0 (healthy), 1 (unhealthy)

set -euo pipefail

REDIS_CREDENTIALS="/opt/redis/credentials.txt"
REDIS_PORT="6379"

# Source credentials
if [[ ! -f "$REDIS_CREDENTIALS" ]]; then
    echo "ERROR: Credentials file not found"
    exit 1
fi

source "$REDIS_CREDENTIALS"

# Extract password
if [[ -z "${REDIS_PASSWORD:-}" ]]; then
    echo "ERROR: REDIS_PASSWORD not set"
    exit 1
fi

# Perform health checks
check_ping() {
    redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null | grep -q "PONG"
}

check_memory() {
    local used_memory
    used_memory=$(redis-cli -a "$REDIS_PASSWORD" info memory 2>/dev/null | grep "^used_memory:" | cut -d: -f2 | tr -d '\r')

    if [[ -z "$used_memory" ]]; then
        return 1
    fi

    # Check if memory usage is reasonable (< 2.5GB)
    if [[ $used_memory -gt 2684354560 ]]; then
        echo "WARNING: High memory usage: $used_memory bytes"
        return 1
    fi

    return 0
}

check_persistence() {
    # Check if AOF is enabled and working
    local aof_enabled
    aof_enabled=$(redis-cli -a "$REDIS_PASSWORD" config get appendonly 2>/dev/null | tail -n1)

    if [[ "$aof_enabled" != "yes" ]]; then
        echo "WARNING: AOF persistence disabled"
        return 1
    fi

    return 0
}

check_connections() {
    local connected_clients
    connected_clients=$(redis-cli -a "$REDIS_PASSWORD" info clients 2>/dev/null | grep "^connected_clients:" | cut -d: -f2 | tr -d '\r')

    if [[ -z "$connected_clients" ]]; then
        return 1
    fi

    # Warn if too many connections (> 1000)
    if [[ $connected_clients -gt 1000 ]]; then
        echo "WARNING: High connection count: $connected_clients"
    fi

    return 0
}

# Run all checks
if ! check_ping; then
    echo "FAIL: Redis not responding to PING"
    exit 1
fi

if ! check_memory; then
    echo "FAIL: Memory check failed"
    exit 1
fi

if ! check_persistence; then
    echo "FAIL: Persistence check failed"
    exit 1
fi

if ! check_connections; then
    echo "FAIL: Connection check failed"
    exit 1
fi

echo "OK: All health checks passed"
exit 0
EOF

    chmod +x "$REDIS_HEALTH_CHECK"
    log_success "Health check script created at $REDIS_HEALTH_CHECK"
}

# Start and verify Redis
start_and_verify() {
    log_info "Starting Redis service..."

    # Enable service
    systemctl enable redis-server.service

    # Start service
    systemctl restart redis-server.service

    # Wait for startup
    sleep 3

    # Check status
    if ! systemctl is-active --quiet redis-server.service; then
        error_exit "Redis service failed to start"
    fi

    log_success "Redis service started successfully"

    # Start exporter
    log_info "Starting Redis exporter..."
    systemctl restart redis_exporter.service

    if ! systemctl is-active --quiet redis_exporter.service; then
        log_warning "Redis exporter failed to start (non-critical)"
    else
        log_success "Redis exporter started on port $REDIS_EXPORTER_PORT"
    fi

    # Run health check
    log_info "Running health verification..."
    sleep 2

    if $REDIS_HEALTH_CHECK; then
        log_success "Health check passed"
    else
        log_warning "Health check failed (Redis may still be starting)"
    fi
}

# Display configuration summary
display_summary() {
    local redis_password
    redis_password=$(grep "^REDIS_PASSWORD=" "$REDIS_CREDENTIALS" | cut -d'=' -f2)

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Redis Configuration Complete${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${BLUE}Service Status:${NC}"
    systemctl status redis-server.service --no-pager -l | head -n 10
    echo ""
    echo -e "${BLUE}Configuration:${NC}"
    echo "  Config file:      $REDIS_CONFIG"
    echo "  Data directory:   $REDIS_DATA_DIR"
    echo "  Log directory:    $REDIS_LOG_DIR"
    echo "  Credentials:      $REDIS_CREDENTIALS"
    echo ""
    echo -e "${BLUE}Network:${NC}"
    echo "  Port:             $REDIS_PORT"
    echo "  Bind addresses:   127.0.0.1, $VPN_INTERFACE"
    echo "  Exporter port:    $REDIS_EXPORTER_PORT"
    echo ""
    echo -e "${BLUE}Memory:${NC}"
    echo "  Max memory:       $MAX_MEMORY"
    echo "  Eviction policy:  allkeys-lru"
    echo ""
    echo -e "${BLUE}Persistence:${NC}"
    echo "  AOF:              enabled (everysec)"
    echo "  RDB snapshots:    900s/1, 300s/10, 60s/10000"
    echo ""
    echo -e "${BLUE}Connection URLs:${NC}"
    echo "  Local:            redis://:${redis_password}@localhost:$REDIS_PORT"
    echo "  VPN:              redis://:${redis_password}@$VPN_INTERFACE:$REDIS_PORT"
    echo ""
    echo -e "${BLUE}Quick Commands:${NC}"
    echo "  CLI:              redis-cli -a '$redis_password'"
    echo "  Health check:     $REDIS_HEALTH_CHECK"
    echo "  Service status:   systemctl status redis-server"
    echo "  View logs:        journalctl -u redis-server -f"
    echo "  Metrics:          curl http://localhost:$REDIS_EXPORTER_PORT/metrics"
    echo ""
    echo -e "${YELLOW}IMPORTANT:${NC} Save the credentials file: $REDIS_CREDENTIALS"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Main execution
main() {
    log_info "Starting Redis configuration for MCP Bundle v0.2.0..."
    echo ""

    check_root
    install_redis
    configure_redis
    configure_systemd
    configure_log_rotation
    install_redis_exporter
    create_health_check
    start_and_verify
    display_summary

    log_success "Redis configuration completed successfully!"
}

main "$@"
