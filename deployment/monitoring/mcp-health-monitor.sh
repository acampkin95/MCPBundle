#!/bin/bash
# ============================================================================
# MCP Ecosystem - Continuous Health Monitoring & Auto-Healing
# ============================================================================
# Purpose: Monitor MCP services, database, and infrastructure with auto-healing
# Target: VMI01, VMI02D, VMI03
# Version: 0.2.0
#
# Usage:
#   ./mcp-health-monitor.sh                    # Run once
#   ./mcp-health-monitor.sh --daemon           # Run as daemon
#   ./mcp-health-monitor.sh --install-systemd  # Install as systemd service
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
MONITOR_INTERVAL="${MONITOR_INTERVAL:-30}"  # Check every 30 seconds
LOG_FILE="/var/log/mcp/health-monitor.log"
ALERT_LOG="/var/log/mcp/alerts.log"
STATE_DIR="/var/lib/mcp/monitor"
AUTO_HEAL="${AUTO_HEAL:-true}"
MAX_RESTART_ATTEMPTS=3
RESTART_COOLDOWN=300  # 5 minutes

# Service endpoints
VMI01_HOST="${VMI01_HOST:-46.250.243.123}"
ORCHESTRATOR_URL="http://${VMI01_HOST}:3000"
PERPLEXITY_URL="http://${VMI01_HOST}:3001"
IT_MCP_URL="http://${VMI01_HOST}:3002"

# Alert thresholds
CPU_THRESHOLD=80
MEMORY_THRESHOLD=85
DISK_THRESHOLD=90
DB_CONNECTION_THRESHOLD=80  # Percentage of max connections

# State tracking
mkdir -p "$STATE_DIR"
RESTART_COUNT_FILE="$STATE_DIR/restart_counts.json"
LAST_ALERT_FILE="$STATE_DIR/last_alerts.json"

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
    echo -e "${YELLOW}[WARNING]${NC} $*" | tee -a "$LOG_FILE" "$ALERT_LOG"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE" "$ALERT_LOG"
}

log_critical() {
    echo -e "${RED}[CRITICAL]${NC} $*" | tee -a "$LOG_FILE" "$ALERT_LOG"
    # TODO: Send to alerting system (email, Slack, PagerDuty)
}

# ============================================================================
# State Management
# ============================================================================

initialize_state() {
    if [ ! -f "$RESTART_COUNT_FILE" ]; then
        echo '{}' > "$RESTART_COUNT_FILE"
    fi

    if [ ! -f "$LAST_ALERT_FILE" ]; then
        echo '{}' > "$LAST_ALERT_FILE"
    fi
}

get_restart_count() {
    local service=$1
    jq -r ".\"$service\" // 0" "$RESTART_COUNT_FILE"
}

increment_restart_count() {
    local service=$1
    local current=$(get_restart_count "$service")
    local new_count=$((current + 1))

    jq ".\"$service\" = $new_count" "$RESTART_COUNT_FILE" > "$RESTART_COUNT_FILE.tmp"
    mv "$RESTART_COUNT_FILE.tmp" "$RESTART_COUNT_FILE"

    echo "$new_count"
}

reset_restart_count() {
    local service=$1
    jq ".\"$service\" = 0" "$RESTART_COUNT_FILE" > "$RESTART_COUNT_FILE.tmp"
    mv "$RESTART_COUNT_FILE.tmp" "$RESTART_COUNT_FILE"
}

should_restart() {
    local service=$1
    local count=$(get_restart_count "$service")

    if [ "$count" -ge "$MAX_RESTART_ATTEMPTS" ]; then
        log_critical "Service $service has reached maximum restart attempts ($MAX_RESTART_ATTEMPTS)"
        return 1
    fi

    # Check if we're in cooldown period
    local last_restart_file="$STATE_DIR/${service}_last_restart"
    if [ -f "$last_restart_file" ]; then
        local last_restart=$(cat "$last_restart_file")
        local now=$(date +%s)
        local elapsed=$((now - last_restart))

        if [ "$elapsed" -lt "$RESTART_COOLDOWN" ]; then
            log_warning "Service $service is in cooldown period (${elapsed}s / ${RESTART_COOLDOWN}s)"
            return 1
        fi
    fi

    return 0
}

record_restart() {
    local service=$1
    date +%s > "$STATE_DIR/${service}_last_restart"
}

# ============================================================================
# Service Health Checks
# ============================================================================

check_service_health() {
    local service_name=$1
    local url=$2
    local healthy=true

    # Check if service is running (systemd)
    if ! systemctl is-active --quiet "$service_name"; then
        log_error "Service $service_name is not running"
        healthy=false
    fi

    # Check HTTP endpoint
    local http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url/health" 2>/dev/null || echo "000")
    if [ "$http_code" != "200" ]; then
        log_error "Service $service_name health endpoint returned HTTP $http_code"
        healthy=false
    fi

    if [ "$healthy" = true ]; then
        log_success "Service $service_name is healthy"
        reset_restart_count "$service_name"
        return 0
    else
        return 1
    fi
}

# ============================================================================
# Auto-Healing Actions
# ============================================================================

heal_service() {
    local service=$1

    log_warning "Initiating auto-heal for $service"

    if ! should_restart "$service"; then
        log_critical "Cannot restart $service - maximum attempts reached or in cooldown"
        return 1
    fi

    # Attempt restart
    log "Restarting $service..."
    if sudo systemctl restart "$service"; then
        log_success "Service $service restarted successfully"
        record_restart "$service"
        increment_restart_count "$service"

        # Wait and verify
        sleep 5
        if systemctl is-active --quiet "$service"; then
            log_success "Service $service is now healthy after restart"
            return 0
        else
            log_error "Service $service failed to start after restart"
            return 1
        fi
    else
        log_error "Failed to restart service $service"
        return 1
    fi
}

# ============================================================================
# Database Health Checks
# ============================================================================

check_database_health() {
    local healthy=true

    # Check PostgreSQL is running
    if ! systemctl is-active --quiet postgresql; then
        log_error "PostgreSQL is not running"
        healthy=false

        if [ "$AUTO_HEAL" = true ]; then
            heal_database
        fi
    fi

    # Check database connections
    local connection_query="SELECT count(*) FROM pg_stat_activity WHERE datname='mcp_ecosystem';"
    local connections=$(sudo -u postgres psql -t -c "$connection_query" 2>/dev/null | tr -d ' ' || echo "0")
    local max_connections=$(sudo -u postgres psql -t -c "SHOW max_connections;" 2>/dev/null | tr -d ' ' || echo "100")

    local connection_pct=$((connections * 100 / max_connections))

    if [ "$connection_pct" -ge "$DB_CONNECTION_THRESHOLD" ]; then
        log_warning "Database connections at ${connection_pct}% ($connections / $max_connections)"
    else
        log "Database connections: $connections / $max_connections (${connection_pct}%)"
    fi

    # Check for long-running queries
    local long_queries=$(sudo -u postgres psql -t -c \
        "SELECT count(*) FROM pg_stat_activity WHERE state='active' AND now() - query_start > interval '5 minutes';" \
        2>/dev/null | tr -d ' ' || echo "0")

    if [ "$long_queries" -gt 0 ]; then
        log_warning "Found $long_queries long-running queries (>5 minutes)"
    fi

    # Check database size
    local db_size=$(sudo -u postgres psql -t -c \
        "SELECT pg_size_pretty(pg_database_size('mcp_ecosystem'));" \
        2>/dev/null || echo "unknown")
    log "Database size: $db_size"

    # Check for locks
    local locks=$(sudo -u postgres psql -t -c \
        "SELECT count(*) FROM pg_locks WHERE NOT granted;" \
        2>/dev/null | tr -d ' ' || echo "0")

    if [ "$locks" -gt 0 ]; then
        log_warning "Found $locks blocked queries waiting for locks"
    fi

    if [ "$healthy" = true ]; then
        log_success "Database health check passed"
        return 0
    else
        return 1
    fi
}

heal_database() {
    log_warning "Initiating database auto-heal"

    if ! should_restart "postgresql"; then
        log_critical "Cannot restart PostgreSQL - maximum attempts reached or in cooldown"
        return 1
    fi

    # Attempt restart
    log "Restarting PostgreSQL..."
    if sudo systemctl restart postgresql; then
        log_success "PostgreSQL restarted successfully"
        record_restart "postgresql"
        increment_restart_count "postgresql"

        sleep 10  # PostgreSQL needs more time to start

        if systemctl is-active --quiet postgresql; then
            log_success "PostgreSQL is now healthy"
            return 0
        else
            log_error "PostgreSQL failed to start"
            return 1
        fi
    else
        log_error "Failed to restart PostgreSQL"
        return 1
    fi
}

# ============================================================================
# System Resource Checks
# ============================================================================

check_system_resources() {
    # CPU usage
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
    cpu_usage=${cpu_usage%.*}  # Remove decimals

    if [ "$cpu_usage" -ge "$CPU_THRESHOLD" ]; then
        log_warning "High CPU usage: ${cpu_usage}%"
    else
        log "CPU usage: ${cpu_usage}%"
    fi

    # Memory usage
    local mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')

    if [ "$mem_usage" -ge "$MEMORY_THRESHOLD" ]; then
        log_warning "High memory usage: ${mem_usage}%"

        # Check for memory leaks in MCP services
        log "Checking MCP service memory usage..."
        ps aux | grep -E 'mcp-orchestrator|perplexity-mcp|it-mcp' | grep -v grep | \
            awk '{printf "  %-20s %6s %6s\n", $11, $3, $4}'
    else
        log "Memory usage: ${mem_usage}%"
    fi

    # Disk usage
    local disk_usage=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')

    if [ "$disk_usage" -ge "$DISK_THRESHOLD" ]; then
        log_warning "High disk usage: ${disk_usage}%"

        # Check log file sizes
        log "Checking log directory sizes..."
        du -sh /var/log/mcp/* 2>/dev/null | sort -h | tail -5 || true
    else
        log "Disk usage: ${disk_usage}%"
    fi
}

# ============================================================================
# Network Connectivity Checks
# ============================================================================

check_network_connectivity() {
    # Check inter-VM connectivity (if WireGuard is configured)
    local vpn_interfaces=("wg-root" "wg-mcp" "wg-red")

    for iface in "${vpn_interfaces[@]}"; do
        if ip link show "$iface" &>/dev/null; then
            if ip link show "$iface" | grep -q "state UP"; then
                log_success "VPN interface $iface is UP"
            else
                log_warning "VPN interface $iface is DOWN"

                if [ "$AUTO_HEAL" = true ]; then
                    log "Attempting to restart WireGuard interface $iface"
                    sudo wg-quick down "$iface" 2>/dev/null || true
                    sleep 2
                    sudo wg-quick up "$iface" && log_success "VPN interface $iface restarted" || log_error "Failed to restart $iface"
                fi
            fi
        fi
    done

    # Check external connectivity
    if ping -c 1 -W 2 8.8.8.8 &>/dev/null; then
        log_success "External network connectivity OK"
    else
        log_warning "External network connectivity issues detected"
    fi
}

# ============================================================================
# Synchronization Queue Check
# ============================================================================

check_sync_queue() {
    local queue_size=$(sudo -u postgres psql -U mcp_admin -d mcp_ecosystem -t -c \
        "SELECT count(*) FROM thought_sync_queue WHERE sync_status='pending';" \
        2>/dev/null | tr -d ' ' || echo "0")

    if [ "$queue_size" -gt 1000 ]; then
        log_warning "Sync queue has $queue_size pending items (high backlog)"

        # Check for stuck items
        local stuck_items=$(sudo -u postgres psql -U mcp_admin -d mcp_ecosystem -t -c \
            "SELECT count(*) FROM thought_sync_queue WHERE sync_status='pending' AND created_at < NOW() - INTERVAL '1 hour';" \
            2>/dev/null | tr -d ' ' || echo "0")

        if [ "$stuck_items" -gt 0 ]; then
            log_error "Found $stuck_items sync items stuck for >1 hour"

            if [ "$AUTO_HEAL" = true ]; then
                log "Resetting stuck sync items..."
                sudo -u postgres psql -U mcp_admin -d mcp_ecosystem -c \
                    "UPDATE thought_sync_queue SET sync_status='failed', error_message='Timeout - reset by health monitor' WHERE sync_status='pending' AND created_at < NOW() - INTERVAL '2 hours';" \
                    &>/dev/null && log_success "Reset stuck sync items"
            fi
        fi
    else
        log "Sync queue size: $queue_size pending items"
    fi
}

# ============================================================================
# Main Health Check Loop
# ============================================================================

run_health_checks() {
    log "═══════════════════════════════════════════════════════════════"
    log "Starting health check cycle"
    log "═══════════════════════════════════════════════════════════════"

    # Check MCP services
    local services_ok=true

    if ! check_service_health "mcp-orchestrator" "$ORCHESTRATOR_URL"; then
        services_ok=false
        if [ "$AUTO_HEAL" = true ]; then
            heal_service "mcp-orchestrator"
        fi
    fi

    if ! check_service_health "perplexity-mcp" "$PERPLEXITY_URL"; then
        services_ok=false
        if [ "$AUTO_HEAL" = true ]; then
            heal_service "perplexity-mcp"
        fi
    fi

    if ! check_service_health "it-mcp" "$IT_MCP_URL"; then
        services_ok=false
        if [ "$AUTO_HEAL" = true ]; then
            heal_service "it-mcp"
        fi
    fi

    # Check database
    check_database_health

    # Check system resources
    check_system_resources

    # Check network
    check_network_connectivity

    # Check sync queue
    check_sync_queue

    log "Health check cycle completed"
    echo ""
}

# ============================================================================
# Daemon Mode
# ============================================================================

run_daemon() {
    log "Starting MCP Health Monitor in daemon mode"
    log "Interval: ${MONITOR_INTERVAL}s"
    log "Auto-heal: $AUTO_HEAL"

    while true; do
        run_health_checks
        sleep "$MONITOR_INTERVAL"
    done
}

# ============================================================================
# Install as Systemd Service
# ============================================================================

install_systemd() {
    log "Installing MCP Health Monitor as systemd service"

    cat | sudo tee /etc/systemd/system/mcp-health-monitor.service > /dev/null <<EOF
[Unit]
Description=MCP Ecosystem Health Monitor
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=dev-admin
WorkingDirectory=/opt/mcp/monitoring
Environment=AUTO_HEAL=true
Environment=MONITOR_INTERVAL=30
ExecStart=/opt/mcp/monitoring/mcp-health-monitor.sh --daemon
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable mcp-health-monitor
    sudo systemctl start mcp-health-monitor

    log_success "Health monitor installed and started as systemd service"
    log "Check status: sudo systemctl status mcp-health-monitor"
    log "View logs: journalctl -u mcp-health-monitor -f"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$(dirname "$ALERT_LOG")"

    # Initialize state
    initialize_state

    # Parse arguments
    case "${1:-}" in
        --daemon)
            run_daemon
            ;;
        --install-systemd)
            install_systemd
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --daemon           Run as daemon (continuous monitoring)"
            echo "  --install-systemd  Install as systemd service"
            echo "  --help             Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  MONITOR_INTERVAL   Check interval in seconds (default: 30)"
            echo "  AUTO_HEAL          Enable auto-healing (default: true)"
            echo "  VMI01_HOST         VMI01 hostname/IP (default: 46.250.243.123)"
            ;;
        *)
            run_health_checks
            ;;
    esac
}

# Run main function
main "$@"
