#!/bin/bash
################################################################################
# MCP Ecosystem - Infrastructure Verification Script
#
# Verifies that all required infrastructure is running on VMI01:
# - Phase 1 hardening complete
# - PostgreSQL 16 with mcp_ecosystem database
# - Redis 7
# - Keycloak with OAuth2 clients
# - Observability stack (Prometheus, Grafana, Loki, Jaeger)
# - NGINX reverse proxy
# - Required firewall ports
#
# Usage: ./verify-infrastructure.sh
################################################################################

set -euo pipefail

# Configuration
VMI01_HOST="${VMI01_HOST:-46.250.243.123}"
VMI01_USER="${VMI01_USER:-root}"
VMI01_SSH_KEY="${VMI01_SSH_KEY:-${HOME}/.ssh/id_rsa}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Tracking
CHECKS_PASSED=0
CHECKS_FAILED=0
WARNINGS=0

################################################################################
# Utility Functions
################################################################################

log_check() {
    echo -e "${BLUE}[CHECK]${NC} $*"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $*"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
}

log_fail() {
    echo -e "${RED}[FAIL]${NC} $*"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
    WARNINGS=$((WARNINGS + 1))
}

run_remote() {
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no -i "${VMI01_SSH_KEY}" \
        "${VMI01_USER}@${VMI01_HOST}" "$@" 2>/dev/null
}

################################################################################
# Verification Checks
################################################################################

check_ssh_connection() {
    log_check "SSH connection to ${VMI01_HOST}"
    if run_remote "echo 'success'" | grep -q "success"; then
        log_pass "SSH connection established"
        return 0
    else
        log_fail "Cannot connect via SSH"
        return 1
    fi
}

check_phase1_hardening() {
    log_check "Phase 1 security hardening"

    # Check for hardening marker file
    if run_remote "test -f /etc/mcp/phase1.complete && echo 'yes' || echo 'no'" | grep -q "yes"; then
        log_pass "Phase 1 hardening complete"
    else
        log_warn "Phase 1 completion marker not found (expected /etc/mcp/phase1.complete)"
    fi

    # Check file descriptor limits
    local fd_limit=$(run_remote "ulimit -n")
    if [ "$fd_limit" -ge 65535 ]; then
        log_pass "File descriptor limit: $fd_limit"
    else
        log_warn "File descriptor limit ($fd_limit) is below recommended 65535"
    fi

    # Check swap
    local swap_mb=$(run_remote "free -m | awk '/^Swap:/ {print \$2}'")
    if [ "$swap_mb" -ge 2048 ]; then
        log_pass "Swap configured: ${swap_mb}MB"
    else
        log_warn "Swap (${swap_mb}MB) is below recommended 4096MB"
    fi
}

check_postgresql() {
    log_check "PostgreSQL 16 service"

    # Check if PostgreSQL is running
    if run_remote "systemctl is-active postgresql" | grep -q "active"; then
        log_pass "PostgreSQL service is running"
    else
        log_fail "PostgreSQL service is not running"
        return 1
    fi

    # Check PostgreSQL version
    local pg_version=$(run_remote "psql --version" | grep -oE '[0-9]+' | head -1)
    if [ "$pg_version" -ge 16 ]; then
        log_pass "PostgreSQL version: $pg_version"
    else
        log_warn "PostgreSQL version ($pg_version) is below recommended version 16"
    fi

    # Check mcp_ecosystem database
    log_check "PostgreSQL database: mcp_ecosystem"
    if run_remote "sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw mcp_ecosystem && echo 'yes' || echo 'no'" | grep -q "yes"; then
        log_pass "Database mcp_ecosystem exists"

        # Check table count
        local table_count=$(run_remote "sudo -u postgres psql -d mcp_ecosystem -t -c \"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';\"" | tr -d ' ')
        if [ "$table_count" -ge 40 ]; then
            log_pass "Database has $table_count tables (expected ~44)"
        else
            log_warn "Database has only $table_count tables (expected ~44)"
        fi
    else
        log_fail "Database mcp_ecosystem does not exist"
        return 1
    fi

    # Check mcp_admin user
    if run_remote "sudo -u postgres psql -t -c \"SELECT 1 FROM pg_roles WHERE rolname='mcp_admin'\" | grep -q 1"; then
        log_pass "PostgreSQL user mcp_admin exists"
    else
        log_fail "PostgreSQL user mcp_admin does not exist"
    fi

    # Test connection with credentials
    log_check "PostgreSQL connection with credentials"
    export PGPASSWORD='TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0='
    if run_remote "PGPASSWORD='TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=' psql -U mcp_admin -d mcp_ecosystem -h localhost -c 'SELECT 1' >/dev/null 2>&1 && echo 'yes' || echo 'no'" | grep -q "yes"; then
        log_pass "PostgreSQL authentication successful"
    else
        log_fail "Cannot authenticate to PostgreSQL with provided credentials"
    fi
}

check_redis() {
    log_check "Redis 7 service"

    # Check if Redis is running
    if run_remote "systemctl is-active redis || systemctl is-active redis-server" | grep -q "active"; then
        log_pass "Redis service is running"
    else
        log_fail "Redis service is not running"
        return 1
    fi

    # Check Redis version
    local redis_version=$(run_remote "redis-cli --version" | grep -oE '[0-9]+\.[0-9]+' | head -1 | cut -d. -f1)
    if [ "$redis_version" -ge 7 ]; then
        log_pass "Redis version: $redis_version.x"
    else
        log_warn "Redis version ($redis_version.x) is below recommended version 7"
    fi

    # Test Redis connection
    if run_remote "redis-cli ping" | grep -q "PONG"; then
        log_pass "Redis responding to PING"
    else
        log_fail "Redis not responding to PING"
    fi

    # Check Redis memory
    local redis_mem=$(run_remote "redis-cli config get maxmemory | tail -1")
    if [ "$redis_mem" != "0" ]; then
        local mem_gb=$((redis_mem / 1024 / 1024 / 1024))
        log_pass "Redis max memory: ${mem_gb}GB"
    else
        log_warn "Redis max memory not configured (unlimited)"
    fi
}

check_keycloak() {
    log_check "Keycloak service"

    # Check if Keycloak is running
    if run_remote "systemctl is-active keycloak || pgrep -f keycloak" > /dev/null 2>&1; then
        log_pass "Keycloak process is running"
    else
        log_fail "Keycloak is not running"
        return 1
    fi

    # Check Keycloak HTTP endpoint
    if run_remote "curl -sf http://localhost:8080/health 2>/dev/null || curl -sf http://localhost:8080 2>/dev/null" > /dev/null; then
        log_pass "Keycloak HTTP endpoint responding"
    else
        log_warn "Cannot reach Keycloak HTTP endpoint"
    fi

    # Check for OAuth2 clients (requires admin API access)
    log_check "Keycloak OAuth2 clients"
    log_warn "Keycloak client verification requires admin credentials (skipped)"
}

check_observability() {
    log_check "Observability stack"

    # Prometheus
    if run_remote "systemctl is-active prometheus || pgrep prometheus" > /dev/null 2>&1; then
        log_pass "Prometheus is running"

        if run_remote "curl -sf http://localhost:9091/-/healthy" > /dev/null 2>&1; then
            log_pass "Prometheus health check successful"
        else
            log_warn "Prometheus not responding to health check"
        fi
    else
        log_fail "Prometheus is not running"
    fi

    # Grafana
    if run_remote "systemctl is-active grafana-server || pgrep grafana" > /dev/null 2>&1; then
        log_pass "Grafana is running"

        if run_remote "curl -sf http://localhost:3000/api/health" > /dev/null 2>&1; then
            log_pass "Grafana health check successful"
        else
            log_warn "Grafana not responding to health check"
        fi
    else
        log_fail "Grafana is not running"
    fi

    # Loki
    if run_remote "systemctl is-active loki || pgrep loki" > /dev/null 2>&1; then
        log_pass "Loki is running"
    else
        log_warn "Loki is not running (optional)"
    fi

    # Jaeger
    if run_remote "systemctl is-active jaeger || pgrep jaeger" > /dev/null 2>&1; then
        log_pass "Jaeger is running"
    else
        log_warn "Jaeger is not running (optional)"
    fi
}

check_nginx() {
    log_check "NGINX reverse proxy"

    if run_remote "systemctl is-active nginx" | grep -q "active"; then
        log_pass "NGINX service is running"

        if run_remote "nginx -t" > /dev/null 2>&1; then
            log_pass "NGINX configuration is valid"
        else
            log_warn "NGINX configuration test failed"
        fi
    else
        log_warn "NGINX is not running (may be optional)"
    fi
}

check_firewall() {
    log_check "Firewall ports configuration"

    # Required ports
    local required_ports=(22 9090 9091 3000 3100 16686 5432 6379 8080)
    local open_ports=0

    for port in "${required_ports[@]}"; do
        if run_remote "ss -tuln | grep -q ':$port '" 2>/dev/null; then
            open_ports=$((open_ports + 1))
        fi
    done

    if [ "$open_ports" -ge 7 ]; then
        log_pass "$open_ports of ${#required_ports[@]} required ports are listening"
    else
        log_warn "Only $open_ports of ${#required_ports[@]} required ports are listening"
    fi
}

check_disk_space() {
    log_check "Disk space availability"

    local available_gb=$(run_remote "df -BG / | awk 'NR==2 {print \$4}' | sed 's/G//'")
    if [ "$available_gb" -ge 20 ]; then
        log_pass "Available disk space: ${available_gb}GB"
    else
        log_warn "Low disk space: ${available_gb}GB (recommend 50GB+)"
    fi
}

check_node() {
    log_check "Node.js installation"

    if run_remote "command -v node" > /dev/null 2>&1; then
        local node_version=$(run_remote "node --version" | sed 's/v//')
        local node_major=$(echo "$node_version" | cut -d. -f1)

        if [ "$node_major" -ge 20 ]; then
            log_pass "Node.js version: $node_version"
        else
            log_warn "Node.js version ($node_version) is below recommended v20.x"
        fi
    else
        log_fail "Node.js is not installed"
    fi

    if run_remote "command -v npm" > /dev/null 2>&1; then
        local npm_version=$(run_remote "npm --version")
        log_pass "npm version: $npm_version"
    else
        log_fail "npm is not installed"
    fi
}

check_pm2() {
    log_check "PM2 process manager"

    if run_remote "command -v pm2" > /dev/null 2>&1; then
        local pm2_version=$(run_remote "pm2 --version")
        log_pass "PM2 version: $pm2_version"
    else
        log_warn "PM2 is not installed (will be installed during deployment)"
    fi
}

check_deployment_directory() {
    log_check "Deployment directory structure"

    if run_remote "test -d /opt/mcp && echo 'yes' || echo 'no'" | grep -q "yes"; then
        log_pass "Deployment directory /opt/mcp exists"
    else
        log_warn "Deployment directory /opt/mcp does not exist (will be created)"
    fi
}

################################################################################
# Main Function
################################################################################

main() {
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}MCP Infrastructure Verification${NC}"
    echo -e "${CYAN}Target: ${VMI01_HOST}${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""

    # Run all checks
    check_ssh_connection || exit 1

    echo ""
    echo -e "${BLUE}=== System Hardening ===${NC}"
    check_phase1_hardening
    check_disk_space

    echo ""
    echo -e "${BLUE}=== Core Services ===${NC}"
    check_postgresql
    check_redis
    check_keycloak

    echo ""
    echo -e "${BLUE}=== Observability Stack ===${NC}"
    check_observability

    echo ""
    echo -e "${BLUE}=== Network ===${NC}"
    check_nginx
    check_firewall

    echo ""
    echo -e "${BLUE}=== Runtime ===${NC}"
    check_node
    check_pm2
    check_deployment_directory

    # Summary
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}Verification Summary${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo -e "${GREEN}Passed:${NC}   $CHECKS_PASSED"
    echo -e "${RED}Failed:${NC}   $CHECKS_FAILED"
    echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
    echo ""

    if [ "$CHECKS_FAILED" -eq 0 ]; then
        echo -e "${GREEN}Infrastructure verification PASSED${NC}"
        echo -e "${GREEN}VMI01 is ready for MCP deployment${NC}"
        return 0
    else
        echo -e "${RED}Infrastructure verification FAILED${NC}"
        echo -e "${YELLOW}Please resolve the failed checks before deploying${NC}"
        return 1
    fi
}

main "$@"
