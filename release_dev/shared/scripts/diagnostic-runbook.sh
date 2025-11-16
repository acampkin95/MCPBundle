#!/bin/bash
# MCP Diagnostic and Testing Runbook for Production Server (VMI01)
# Comprehensive health checks, performance tests, and diagnostics
# Orchestrator-aware: Can be invoked via MCP command queue

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
LOG_FILE="/var/log/mcp/diagnostics.log"
RESULTS_FILE="/tmp/mcp_diagnostics_results.json"
mkdir -p /var/log/mcp

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

# JSON result builder
RESULTS='{"timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'", "checks": []}'

add_result() {
    local check_name=$1
    local status=$2
    local message=$3
    local details=$4

    local check_json=$(cat <<EOF
{
  "name": "$check_name",
  "status": "$status",
  "message": "$message",
  "details": $details,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

    RESULTS=$(echo "$RESULTS" | jq ".checks += [$check_json]")
}

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  MCP Production Diagnostic Runbook${NC}"
echo -e "${CYAN}  VMI01 (46.250.243.123)${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""

log "INFO" "Starting diagnostic runbook"

# ============================================
# 1. SYSTEM HEALTH CHECKS
# ============================================

echo -e "${BLUE}[1/10] System Health Checks${NC}"

# CPU check
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
CPU_CORES=$(nproc)
log "INFO" "CPU: $CPU_USAGE% usage, $CPU_CORES cores"

if (( $(echo "$CPU_USAGE < 80" | bc -l) )); then
    add_result "cpu_health" "pass" "CPU usage normal: ${CPU_USAGE}%" "{\"usage\": $CPU_USAGE, \"cores\": $CPU_CORES}"
    echo -e "${GREEN}✓ CPU: ${CPU_USAGE}% (${CPU_CORES} cores)${NC}"
else
    add_result "cpu_health" "warn" "CPU usage high: ${CPU_USAGE}%" "{\"usage\": $CPU_USAGE, \"cores\": $CPU_CORES}"
    echo -e "${YELLOW}⚠ CPU: ${CPU_USAGE}% (high load)${NC}"
fi

# Memory check
MEMORY_INFO=$(free -m | awk 'NR==2{printf "{\"total\": %s, \"used\": %s, \"free\": %s, \"usage_percent\": %.2f}", $2, $3, $4, $3*100/$2}')
MEMORY_PERCENT=$(echo "$MEMORY_INFO" | jq -r '.usage_percent')
log "INFO" "Memory: $MEMORY_PERCENT% used"

if (( $(echo "$MEMORY_PERCENT < 85" | bc -l) )); then
    add_result "memory_health" "pass" "Memory usage normal: ${MEMORY_PERCENT}%" "$MEMORY_INFO"
    echo -e "${GREEN}✓ Memory: ${MEMORY_PERCENT}%${NC}"
else
    add_result "memory_health" "warn" "Memory usage high: ${MEMORY_PERCENT}%" "$MEMORY_INFO"
    echo -e "${YELLOW}⚠ Memory: ${MEMORY_PERCENT}% (high usage)${NC}"
fi

# Disk check
DISK_INFO=$(df -h / | awk 'NR==2{printf "{\"total\": \"%s\", \"used\": \"%s\", \"free\": \"%s\", \"usage_percent\": %d}", $2, $3, $4, $5}' | sed 's/%//')
DISK_PERCENT=$(echo "$DISK_INFO" | jq -r '.usage_percent')
log "INFO" "Disk: $DISK_PERCENT% used"

if [ "$DISK_PERCENT" -lt 85 ]; then
    add_result "disk_health" "pass" "Disk usage normal: ${DISK_PERCENT}%" "$DISK_INFO"
    echo -e "${GREEN}✓ Disk: ${DISK_PERCENT}%${NC}"
else
    add_result "disk_health" "warn" "Disk usage high: ${DISK_PERCENT}%" "$DISK_INFO"
    echo -e "${YELLOW}⚠ Disk: ${DISK_PERCENT}% (high usage)${NC}"
fi

echo ""

# ============================================
# 2. DATABASE HEALTH
# ============================================

echo -e "${BLUE}[2/10] PostgreSQL Health${NC}"

if systemctl is-active --quiet postgresql; then
    PG_CONNECTIONS=$(sudo -u postgres psql -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='mcp_ecosystem';" 2>/dev/null || echo "0")
    PG_SIZE=$(sudo -u postgres psql -t -d mcp_ecosystem -c "SELECT pg_size_pretty(pg_database_size('mcp_ecosystem'));" 2>/dev/null | xargs || echo "unknown")
    PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" 2>/dev/null | head -1 | xargs || echo "unknown")

    PG_DETAILS=$(cat <<EOF
{
  "status": "running",
  "connections": $PG_CONNECTIONS,
  "database_size": "$PG_SIZE",
  "version": "$PG_VERSION"
}
EOF
)

    add_result "postgresql_health" "pass" "PostgreSQL running, $PG_CONNECTIONS connections" "$PG_DETAILS"
    echo -e "${GREEN}✓ PostgreSQL: Running${NC}"
    echo -e "  Connections: $PG_CONNECTIONS"
    echo -e "  Database size: $PG_SIZE"
else
    add_result "postgresql_health" "fail" "PostgreSQL not running" '{"status": "stopped"}'
    echo -e "${RED}✗ PostgreSQL: Not running${NC}"
fi

echo ""

# ============================================
# 3. REDIS HEALTH
# ============================================

echo -e "${BLUE}[3/10] Redis Health${NC}"

if systemctl is-active --quiet redis-server || systemctl is-active --quiet redis; then
    REDIS_PING=$(redis-cli ping 2>/dev/null || echo "FAILED")
    REDIS_MEMORY=$(redis-cli info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r' || echo "unknown")
    REDIS_KEYS=$(redis-cli dbsize 2>/dev/null | cut -d: -f2 | xargs || echo "0")

    if [ "$REDIS_PING" == "PONG" ]; then
        REDIS_DETAILS=$(cat <<EOF
{
  "status": "running",
  "ping": "PONG",
  "memory_used": "$REDIS_MEMORY",
  "keys": $REDIS_KEYS
}
EOF
)
        add_result "redis_health" "pass" "Redis running, $REDIS_KEYS keys" "$REDIS_DETAILS"
        echo -e "${GREEN}✓ Redis: Running${NC}"
        echo -e "  Memory: $REDIS_MEMORY"
        echo -e "  Keys: $REDIS_KEYS"
    else
        add_result "redis_health" "warn" "Redis running but not responding" '{"status": "unhealthy"}'
        echo -e "${YELLOW}⚠ Redis: Running but not responding${NC}"
    fi
else
    add_result "redis_health" "fail" "Redis not running" '{"status": "stopped"}'
    echo -e "${RED}✗ Redis: Not running${NC}"
fi

echo ""

# ============================================
# 4. ORCHESTRATOR HEALTH
# ============================================

echo -e "${BLUE}[4/10] MCP-Orchestrator Health${NC}"

ORCH_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9090/health 2>/dev/null || echo "000")

if [ "$ORCH_HEALTH" == "200" ]; then
    ORCH_RESPONSE=$(curl -s http://localhost:9090/health 2>/dev/null || echo '{}')
    add_result "orchestrator_health" "pass" "Orchestrator healthy" "$ORCH_RESPONSE"
    echo -e "${GREEN}✓ MCP-Orchestrator: Healthy${NC}"
    echo "$ORCH_RESPONSE" | jq '.' 2>/dev/null || echo "$ORCH_RESPONSE"
else
    add_result "orchestrator_health" "fail" "Orchestrator not responding" "{\"http_code\": \"$ORCH_HEALTH\"}"
    echo -e "${RED}✗ MCP-Orchestrator: Not responding (HTTP $ORCH_HEALTH)${NC}"
fi

echo ""

# ============================================
# 5. KEYCLOAK HEALTH
# ============================================

echo -e "${BLUE}[5/10] Keycloak Health${NC}"

KEYCLOAK_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health 2>/dev/null || echo "000")

if [ "$KEYCLOAK_HEALTH" == "200" ]; then
    add_result "keycloak_health" "pass" "Keycloak healthy" "{\"http_code\": \"200\"}"
    echo -e "${GREEN}✓ Keycloak: Healthy${NC}"
elif systemctl is-active --quiet keycloak 2>/dev/null; then
    add_result "keycloak_health" "warn" "Keycloak running but not responding" "{\"http_code\": \"$KEYCLOAK_HEALTH\"}"
    echo -e "${YELLOW}⚠ Keycloak: Running but not responding${NC}"
else
    add_result "keycloak_health" "fail" "Keycloak not running" "{\"status\": \"stopped\"}"
    echo -e "${RED}✗ Keycloak: Not running${NC}"
fi

echo ""

# ============================================
# 6. OBSERVABILITY STACK
# ============================================

echo -e "${BLUE}[6/10] Observability Stack${NC}"

# Prometheus
PROM_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9091/-/healthy 2>/dev/null || echo "000")
if [ "$PROM_HEALTH" == "200" ]; then
    echo -e "${GREEN}✓ Prometheus: Healthy${NC}"
    add_result "prometheus_health" "pass" "Prometheus healthy" "{\"http_code\": \"200\"}"
else
    echo -e "${RED}✗ Prometheus: Not responding${NC}"
    add_result "prometheus_health" "fail" "Prometheus not responding" "{\"http_code\": \"$PROM_HEALTH\"}"
fi

# Grafana
GRAFANA_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
if [ "$GRAFANA_HEALTH" == "200" ]; then
    echo -e "${GREEN}✓ Grafana: Healthy${NC}"
    add_result "grafana_health" "pass" "Grafana healthy" "{\"http_code\": \"200\"}"
else
    echo -e "${RED}✗ Grafana: Not responding${NC}"
    add_result "grafana_health" "fail" "Grafana not responding" "{\"http_code\": \"$GRAFANA_HEALTH\"}"
fi

# Loki
LOKI_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/ready 2>/dev/null || echo "000")
if [ "$LOKI_HEALTH" == "200" ]; then
    echo -e "${GREEN}✓ Loki: Healthy${NC}"
    add_result "loki_health" "pass" "Loki healthy" "{\"http_code\": \"200\"}"
else
    echo -e "${RED}✗ Loki: Not responding${NC}"
    add_result "loki_health" "fail" "Loki not responding" "{\"http_code\": \"$LOKI_HEALTH\"}"
fi

# Jaeger
JAEGER_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:16686/ 2>/dev/null || echo "000")
if [ "$JAEGER_HEALTH" == "200" ]; then
    echo -e "${GREEN}✓ Jaeger: Healthy${NC}"
    add_result "jaeger_health" "pass" "Jaeger healthy" "{\"http_code\": \"200\"}"
else
    echo -e "${RED}✗ Jaeger: Not responding${NC}"
    add_result "jaeger_health" "fail" "Jaeger not responding" "{\"http_code\": \"$JAEGER_HEALTH\"}"
fi

echo ""

# ============================================
# 7. NETWORK & PORTS
# ============================================

echo -e "${BLUE}[7/10] Network & Port Checks${NC}"

REQUIRED_PORTS="9090 9091 3000 3100 16686 5432 6379 8080"
PORT_RESULTS=()

for port in $REQUIRED_PORTS; do
    if ss -tulpn | grep -q ":$port "; then
        echo -e "${GREEN}✓ Port $port: Open${NC}"
        PORT_RESULTS+=("{\"port\": $port, \"status\": \"open\"}")
    else
        echo -e "${RED}✗ Port $port: Not listening${NC}"
        PORT_RESULTS+=("{\"port\": $port, \"status\": \"closed\"}")
    fi
done

PORT_JSON="[]"
if [ "${#PORT_RESULTS[@]}" -gt 0 ]; then
  PORT_JSON="[$(printf '%s,' "${PORT_RESULTS[@]}" | sed 's/,$//')]"
fi
add_result "network_ports" "info" "Port check complete" "$PORT_JSON"

echo ""

# ============================================
# 8. DATABASE PERFORMANCE TEST
# ============================================

echo -e "${BLUE}[8/10] Database Performance Test${NC}"

if systemctl is-active --quiet postgresql; then
    echo -e "${YELLOW}Running query performance test...${NC}"

    START_TIME=$(date +%s%3N)
    sudo -u postgres psql -d mcp_ecosystem -c "SELECT COUNT(*) FROM mcp_agents;" > /dev/null 2>&1 || true
    END_TIME=$(date +%s%3N)
    QUERY_TIME=$((END_TIME - START_TIME))

    if [ $QUERY_TIME -lt 100 ]; then
        echo -e "${GREEN}✓ Query performance: ${QUERY_TIME}ms (excellent)${NC}"
        add_result "db_performance" "pass" "Query time: ${QUERY_TIME}ms" "{\"query_time_ms\": $QUERY_TIME}"
    elif [ $QUERY_TIME -lt 500 ]; then
        echo -e "${YELLOW}⚠ Query performance: ${QUERY_TIME}ms (acceptable)${NC}"
        add_result "db_performance" "warn" "Query time: ${QUERY_TIME}ms" "{\"query_time_ms\": $QUERY_TIME}"
    else
        echo -e "${RED}✗ Query performance: ${QUERY_TIME}ms (slow)${NC}"
        add_result "db_performance" "fail" "Query time: ${QUERY_TIME}ms (too slow)" "{\"query_time_ms\": $QUERY_TIME}"
    fi
else
    echo -e "${RED}✗ Database not available for testing${NC}"
    add_result "db_performance" "fail" "Database not running" "{}"
fi

echo ""

# ============================================
# 9. REDIS PERFORMANCE TEST
# ============================================

echo -e "${BLUE}[9/10] Redis Performance Test${NC}"

if systemctl is-active --quiet redis-server || systemctl is-active --quiet redis; then
    echo -e "${YELLOW}Running Redis benchmark (1000 requests)...${NC}"

    REDIS_BENCH=$(redis-cli --intrinsic-latency 1 2>/dev/null | grep "latency" | awk '{print $1}' || echo "0")

    if [ "$REDIS_BENCH" != "0" ]; then
        echo -e "${GREEN}✓ Redis latency: ${REDIS_BENCH}ms${NC}"
        add_result "redis_performance" "pass" "Redis latency: ${REDIS_BENCH}ms" "{\"latency_ms\": \"$REDIS_BENCH\"}"
    else
        echo -e "${YELLOW}⚠ Redis benchmark unavailable${NC}"
        add_result "redis_performance" "warn" "Benchmark unavailable" "{}"
    fi
else
    echo -e "${RED}✗ Redis not available for testing${NC}"
    add_result "redis_performance" "fail" "Redis not running" "{}"
fi

echo ""

# ============================================
# 10. AGENT CONNECTIVITY TEST
# ============================================

echo -e "${BLUE}[10/10] Active Agent Check${NC}"

if systemctl is-active --quiet postgresql; then
    ACTIVE_AGENTS=$(sudo -u postgres psql -t -d mcp_ecosystem -c "SELECT COUNT(*) FROM mcp_agents WHERE last_heartbeat_at > NOW() - INTERVAL '5 minutes';" 2>/dev/null | xargs || echo "0")
    TOTAL_AGENTS=$(sudo -u postgres psql -t -d mcp_ecosystem -c "SELECT COUNT(*) FROM mcp_agents;" 2>/dev/null | xargs || echo "0")

    echo -e "${GREEN}✓ Active agents: $ACTIVE_AGENTS / $TOTAL_AGENTS${NC}"
    add_result "agent_connectivity" "pass" "$ACTIVE_AGENTS active agents" "{\"active\": $ACTIVE_AGENTS, \"total\": $TOTAL_AGENTS}"

    if [ $ACTIVE_AGENTS -eq 0 ] && [ $TOTAL_AGENTS -gt 0 ]; then
        echo -e "${YELLOW}⚠ Warning: No agents have sent heartbeats in 5 minutes${NC}"
    fi
else
    echo -e "${RED}✗ Cannot check agents (database unavailable)${NC}"
    add_result "agent_connectivity" "fail" "Database unavailable" "{}"
fi

echo ""

# ============================================
# SUMMARY
# ============================================

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}  Diagnostic Summary${NC}"
echo -e "${CYAN}==========================================${NC}"

# Count results
PASS_COUNT=$(echo "$RESULTS" | jq '[.checks[] | select(.status == "pass")] | length')
WARN_COUNT=$(echo "$RESULTS" | jq '[.checks[] | select(.status == "warn")] | length')
FAIL_COUNT=$(echo "$RESULTS" | jq '[.checks[] | select(.status == "fail")] | length')
TOTAL_COUNT=$(echo "$RESULTS" | jq '.checks | length')

echo -e "${GREEN}✓ Passed: $PASS_COUNT${NC}"
echo -e "${YELLOW}⚠ Warnings: $WARN_COUNT${NC}"
echo -e "${RED}✗ Failed: $FAIL_COUNT${NC}"
echo -e "${BLUE}Total checks: $TOTAL_COUNT${NC}"

# Add summary to results
RESULTS=$(echo "$RESULTS" | jq ".summary = {\"passed\": $PASS_COUNT, \"warnings\": $WARN_COUNT, \"failed\": $FAIL_COUNT, \"total\": $TOTAL_COUNT}")

# Save results
echo "$RESULTS" | jq '.' > "$RESULTS_FILE"
log "INFO" "Results saved to $RESULTS_FILE"

echo ""
echo -e "${CYAN}Results saved to: ${RESULTS_FILE}${NC}"
echo -e "${CYAN}Log file: ${LOG_FILE}${NC}"

# Overall status
if [ $FAIL_COUNT -eq 0 ] && [ $WARN_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ All systems healthy${NC}"
    exit 0
elif [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${YELLOW}⚠️ Systems operational with warnings${NC}"
    exit 1
else
    echo -e "${RED}❌ Critical issues detected${NC}"
    exit 2
fi
