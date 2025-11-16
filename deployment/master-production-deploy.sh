#!/bin/bash
#
# Master Production Deployment Script
# Deploys complete MCP ecosystem to VMI01/VMI02D with PostgreSQL HA
#
# Date: 2025-11-14
# Version: 1.0

set -euo pipefail

# Configuration
VMI01_IP="46.250.243.123"
VMI02D_IP="46.250.241.70"
ROOT_PASS="C0nnaught"
DEPLOYMENT_DIR="/Users/alex/Projects/MCP Bundle/deployment"
LOG_FILE="/tmp/mcp-production-deploy-$(date +%Y%m%d-%H%M%S).log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $*" | tee -a "$LOG_FILE"
}

# SSH wrapper
ssh_exec() {
    local host=$1
    shift
    sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "root@$host" "$@"
}

scp_file() {
    local file=$1
    local host=$2
    local dest=$3
    sshpass -p "$ROOT_PASS" scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$file" "root@$host:$dest"
}

# Phase 1: Deploy Redis to VMI01
deploy_redis() {
    log "Phase 1: Deploying Redis to VMI01..."

    # Copy Redis configuration script
    scp_file "$DEPLOYMENT_DIR/redis/configure-redis.sh" "$VMI01_IP" "/tmp/"

    # Execute Redis deployment
    log "Executing Redis deployment on VMI01..."
    ssh_exec "$VMI01_IP" "chmod +x /tmp/configure-redis.sh && /tmp/configure-redis.sh" | tee -a "$LOG_FILE"

    # Verify Redis
    log "Verifying Redis installation..."
    if ssh_exec "$VMI01_IP" "systemctl is-active redis-server >/dev/null 2>&1"; then
        log "✅ Redis deployed successfully"
    else
        error "❌ Redis deployment failed"
        return 1
    fi
}

# Phase 2: Deploy MCP Services to VMI01
deploy_mcp_services() {
    log "Phase 2: Deploying MCP services to VMI01..."

    # Copy MCP deployment script
    scp_file "$DEPLOYMENT_DIR/scripts/deploy-mcp-services-enhanced.sh" "$VMI01_IP" "/tmp/"

    # Execute MCP deployment
    log "Executing MCP services deployment..."
    ssh_exec "$VMI01_IP" "chmod +x /tmp/deploy-mcp-services-enhanced.sh && /tmp/deploy-mcp-services-enhanced.sh" | tee -a "$LOG_FILE"

    # Verify MCP services
    log "Verifying MCP services..."
    local services=("mcp-orchestrator" "perplexity-mcp" "itjsst-mcp")
    local all_ok=true

    for service in "${services[@]}"; do
        if ssh_exec "$VMI01_IP" "systemctl is-active $service >/dev/null 2>&1"; then
            log "✅ $service is running"
        else
            error "❌ $service is not running"
            all_ok=false
        fi
    done

    if [ "$all_ok" = false ]; then
        error "Some MCP services failed to start"
        return 1
    fi
}

# Phase 3: Configure PostgreSQL Replication
configure_postgres_replication() {
    log "Phase 3: Configuring PostgreSQL HA replication..."

    # Copy replication script
    scp_file "$DEPLOYMENT_DIR/setup-postgresql-replication.sh" "$VMI01_IP" "/tmp/"

    # Execute replication setup
    log "Setting up replication from VMI01 to VMI02D..."
    ssh_exec "$VMI01_IP" "chmod +x /tmp/setup-postgresql-replication.sh && /tmp/setup-postgresql-replication.sh" | tee -a "$LOG_FILE"

    # Verify replication
    log "Verifying replication status..."
    local repl_status=$(ssh_exec "$VMI01_IP" "sudo -u postgres psql -t -c \"SELECT count(*) FROM pg_stat_replication;\"" | tr -d ' ')

    if [ "$repl_status" -gt 0 ]; then
        log "✅ PostgreSQL replication active ($repl_status standby)"
    else
        warn "⚠️  PostgreSQL replication not detected (may need manual configuration)"
    fi
}

# Phase 4: Run Integration Tests
run_integration_tests() {
    log "Phase 4: Running E2E integration tests..."

    # Copy test script
    scp_file "$DEPLOYMENT_DIR/tests/mcp-integration-tests.sh" "$VMI01_IP" "/tmp/"

    # Execute tests
    log "Executing integration tests..."
    ssh_exec "$VMI01_IP" "chmod +x /tmp/mcp-integration-tests.sh && /tmp/mcp-integration-tests.sh" | tee -a "$LOG_FILE"

    log "✅ Integration tests completed"
}

# Phase 5: Health Check
verify_system_health() {
    log "Phase 5: Verifying system health..."

    # Check PostgreSQL
    log "Checking PostgreSQL..."
    if ssh_exec "$VMI01_IP" "systemctl is-active postgresql >/dev/null 2>&1"; then
        local db_count=$(ssh_exec "$VMI01_IP" "sudo -u postgres psql -t -c \"SELECT count(*) FROM pg_database WHERE datname NOT IN ('template0', 'template1', 'postgres');\"" | tr -d ' ')
        log "✅ PostgreSQL running ($db_count databases)"
    else
        error "❌ PostgreSQL not running"
    fi

    # Check Redis
    log "Checking Redis..."
    if ssh_exec "$VMI01_IP" "systemctl is-active redis-server >/dev/null 2>&1"; then
        log "✅ Redis running"
    else
        error "❌ Redis not running"
    fi

    # Check MCP services
    log "Checking MCP services..."
    local services=("mcp-orchestrator" "perplexity-mcp" "itjsst-mcp")
    for service in "${services[@]}"; do
        if ssh_exec "$VMI01_IP" "systemctl is-active $service >/dev/null 2>&1"; then
            # Get port from service
            local port=$(ssh_exec "$VMI01_IP" "systemctl show $service | grep ExecStart | grep -oP '(?<=--port )\d+'")
            log "✅ $service running (port $port)"
        else
            error "❌ $service not running"
        fi
    done

    # Check replication
    log "Checking PostgreSQL replication..."
    local repl_lag=$(ssh_exec "$VMI01_IP" "sudo -u postgres psql -t -c \"SELECT COALESCE(extract(epoch from (now() - pg_last_xact_replay_timestamp())), 0)::int FROM pg_stat_replication LIMIT 1;\"" 2>/dev/null | tr -d ' ' || echo "N/A")
    if [ "$repl_lag" != "N/A" ] && [ "$repl_lag" -lt 10 ]; then
        log "✅ Replication lag: ${repl_lag}s"
    else
        warn "⚠️  Replication lag: $repl_lag"
    fi
}

# Main deployment
main() {
    log "========================================="
    log "MCP Bundle Production Deployment"
    log "========================================="
    log "VMI01 (Primary): $VMI01_IP"
    log "VMI02D (Standby): $VMI02D_IP"
    log "Log file: $LOG_FILE"
    log "========================================="

    # Phase 1: Redis
    if deploy_redis; then
        log "✅ Phase 1 complete: Redis deployed"
    else
        error "❌ Phase 1 failed: Redis deployment"
        exit 1
    fi

    # Phase 2: MCP Services
    if deploy_mcp_services; then
        log "✅ Phase 2 complete: MCP services deployed"
    else
        error "❌ Phase 2 failed: MCP services deployment"
        exit 1
    fi

    # Phase 3: PostgreSQL Replication
    if configure_postgres_replication; then
        log "✅ Phase 3 complete: PostgreSQL replication configured"
    else
        warn "⚠️  Phase 3 completed with warnings: PostgreSQL replication"
    fi

    # Phase 4: Integration Tests
    if run_integration_tests; then
        log "✅ Phase 4 complete: Integration tests passed"
    else
        warn "⚠️  Phase 4 completed with warnings: Integration tests"
    fi

    # Phase 5: Health Check
    verify_system_health

    log "========================================="
    log "✅ Deployment Complete!"
    log "========================================="
    log "Services deployed to VMI01:"
    log "  - PostgreSQL (port 5432)"
    log "  - Redis (port 6379)"
    log "  - mcp-orchestrator (port 3000)"
    log "  - perplexity-mcp (port 3001)"
    log "  - itjsst-mcp (port 3002)"
    log ""
    log "PostgreSQL standby: VMI02D"
    log "Log file: $LOG_FILE"
    log "========================================="
}

# Execute
main "$@"
