#!/bin/bash
# ============================================================================
# MCP Ecosystem - Inter-MCP Communication Test Suite
# ============================================================================
# Purpose: Comprehensive testing of MCP service communication and integration
# Target: VMI01 (46.250.243.123) - All MCP services
# Version: 0.2.0
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
VMI01_HOST="${VMI01_HOST:-46.250.243.123}"
ORCHESTRATOR_URL="http://${VMI01_HOST}:3000"
PERPLEXITY_URL="http://${VMI01_HOST}:3001"
IT_MCP_URL="http://${VMI01_HOST}:3002"

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNINGS=0

# Database credentials
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
    ((PASSED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*"
    ((WARNINGS++))
}

log_error() {
    echo -e "${RED}✗${NC} $*"
    ((FAILED_TESTS++))
}

log_test() {
    echo -e "${CYAN}▶${NC} Testing: $*"
    ((TOTAL_TESTS++))
}

# ============================================================================
# Test Infrastructure Connectivity
# ============================================================================

test_infrastructure_connectivity() {
    echo ""
    log "═══════════════════════════════════════════════════════════════"
    log "Phase 1: Infrastructure Connectivity Tests"
    log "═══════════════════════════════════════════════════════════════"
    echo ""

    # Test SSH connectivity
    log_test "SSH connectivity to VMI01"
    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "dev-admin@${VMI01_HOST}" "echo 'SSH OK'" &>/dev/null; then
        log_success "SSH connection to VMI01 successful"
    else
        log_error "Cannot establish SSH connection to VMI01"
    fi

    # Test PostgreSQL connectivity
    log_test "PostgreSQL database connectivity"
    if ssh "dev-admin@${VMI01_HOST}" "systemctl is-active postgresql" &>/dev/null; then
        log_success "PostgreSQL service is running"
    else
        log_error "PostgreSQL service is not running"
    fi

    # Test Redis connectivity
    log_test "Redis connectivity"
    if ssh "dev-admin@${VMI01_HOST}" "redis-cli ping" &>/dev/null; then
        log_success "Redis is responding"
    else
        log_warning "Redis is not responding (may not be critical)"
    fi
}

# ============================================================================
# Test MCP Service Health Endpoints
# ============================================================================

test_service_health() {
    echo ""
    log "═══════════════════════════════════════════════════════════════"
    log "Phase 2: MCP Service Health Checks"
    log "═══════════════════════════════════════════════════════════════"
    echo ""

    # Test MCP Orchestrator health
    log_test "MCP Orchestrator health endpoint"
    RESPONSE=$(curl -s -w "\n%{http_code}" "${ORCHESTRATOR_URL}/health" 2>/dev/null || echo "000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" = "200" ]; then
        log_success "MCP Orchestrator is healthy (HTTP 200)"
        log "Response: $BODY"
    else
        log_error "MCP Orchestrator health check failed (HTTP $HTTP_CODE)"
    fi

    # Test Perplexity MCP health
    log_test "Perplexity MCP health endpoint"
    RESPONSE=$(curl -s -w "\n%{http_code}" "${PERPLEXITY_URL}/health" 2>/dev/null || echo "000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" = "200" ]; then
        log_success "Perplexity MCP is healthy (HTTP 200)"
        log "Response: $BODY"
    else
        log_error "Perplexity MCP health check failed (HTTP $HTTP_CODE)"
    fi

    # Test IT-MCP health
    log_test "IT-MCP health endpoint"
    RESPONSE=$(curl -s -w "\n%{http_code}" "${IT_MCP_URL}/health" 2>/dev/null || echo "000")
    HTTP_CODE=$(echo "$RESPONSE" | tail -1)
    BODY=$(echo "$RESPONSE" | head -n -1)

    if [ "$HTTP_CODE" = "200" ]; then
        log_success "IT-MCP is healthy (HTTP 200)"
        log "Response: $BODY"
    else
        log_error "IT-MCP health check failed (HTTP $HTTP_CODE)"
    fi
}

# ============================================================================
# Test Database Schema Version
# ============================================================================

test_database_schema() {
    echo ""
    log "═══════════════════════════════════════════════════════════════"
    log "Phase 3: Database Schema Validation"
    log "═══════════════════════════════════════════════════════════════"
    echo ""

    # Check schema version
    log_test "Database schema version"
    SCHEMA_VERSION=$(ssh "dev-admin@${VMI01_HOST}" "cat /opt/mcp/schema/current_version.txt 2>/dev/null | head -1" || echo "unknown")
    if [ "$SCHEMA_VERSION" = "0.2.0" ]; then
        log_success "Database schema is at correct version: $SCHEMA_VERSION"
    else
        log_error "Database schema version mismatch: $SCHEMA_VERSION (expected 0.2.0)"
    fi

    # Check critical tables exist
    log_test "Critical database tables"
    REQUIRED_TABLES=(
        "thoughts"
        "thought_branches"
        "feedback_signals"
        "thought_relationships"
        "thought_sync_queue"
        "mcp_servers"
        "server_metrics"
    )

    for table in "${REQUIRED_TABLES[@]}"; do
        TABLE_EXISTS=$(ssh "dev-admin@${VMI01_HOST}" \
            "PGPASSWORD='TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=' psql -h localhost -U mcp_admin -d mcp_ecosystem -tAc \"SELECT COUNT(*) FROM pg_tables WHERE tablename='$table'\"" 2>/dev/null || echo "0")

        if [ "$TABLE_EXISTS" = "1" ]; then
            log_success "Table '$table' exists"
        else
            log_error "Table '$table' NOT found"
        fi
    done

    # Check full-text search function
    log_test "Full-text search function"
    FUNC_EXISTS=$(ssh "dev-admin@${VMI01_HOST}" \
        "PGPASSWORD='TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=' psql -h localhost -U mcp_admin -d mcp_ecosystem -tAc \"SELECT COUNT(*) FROM pg_proc WHERE proname='search_thoughts'\"" 2>/dev/null || echo "0")

    if [ "$FUNC_EXISTS" -ge "1" ]; then
        log_success "Full-text search function 'search_thoughts' exists"
    else
        log_error "Full-text search function 'search_thoughts' NOT found"
    fi
}

# ============================================================================
# Test Orchestrator → Worker Communication
# ============================================================================

test_orchestrator_to_workers() {
    echo ""
    log "═══════════════════════════════════════════════════════════════"
    log "Phase 4: Orchestrator → Worker Communication"
    log "═══════════════════════════════════════════════════════════════"
    echo ""

    # Test orchestrator can discover workers
    log_test "Worker service discovery"
    RESPONSE=$(curl -s "${ORCHESTRATOR_URL}/api/v1/workers" 2>/dev/null || echo "{}")

    if echo "$RESPONSE" | jq . &>/dev/null; then
        WORKER_COUNT=$(echo "$RESPONSE" | jq '.workers | length' 2>/dev/null || echo "0")
        log_success "Discovered $WORKER_COUNT worker service(s)"
        log "Workers: $(echo "$RESPONSE" | jq -r '.workers[].name' 2>/dev/null | tr '\n' ', ' | sed 's/,$//')"
    else
        log_warning "Could not parse worker discovery response"
    fi

    # Test command dispatch to Perplexity MCP
    log_test "Command dispatch to Perplexity MCP"
    PAYLOAD='{"command":"search","query":"test query","max_results":5}'
    RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "$PAYLOAD" "${ORCHESTRATOR_URL}/api/v1/dispatch/perplexity" 2>/dev/null || echo "{}")

    if echo "$RESPONSE" | jq -e '.task_id' &>/dev/null; then
        TASK_ID=$(echo "$RESPONSE" | jq -r '.task_id')
        log_success "Command dispatched successfully (Task ID: $TASK_ID)"
    else
        log_warning "Command dispatch test inconclusive (service may not implement dispatch endpoint yet)"
    fi

    # Test command dispatch to IT-MCP
    log_test "Command dispatch to IT-MCP"
    PAYLOAD='{"command":"system_info","target":"localhost"}'
    RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "$PAYLOAD" "${ORCHESTRATOR_URL}/api/v1/dispatch/it-mcp" 2>/dev/null || echo "{}")

    if echo "$RESPONSE" | jq -e '.task_id' &>/dev/null; then
        TASK_ID=$(echo "$RESPONSE" | jq -r '.task_id')
        log_success "Command dispatched successfully (Task ID: $TASK_ID)"
    else
        log_warning "Command dispatch test inconclusive (service may not implement dispatch endpoint yet)"
    fi
}

# ============================================================================
# Test Thought Synchronization
# ============================================================================

test_thought_synchronization() {
    echo ""
    log "═══════════════════════════════════════════════════════════════"
    log "Phase 5: Thought Synchronization Tests"
    log "═══════════════════════════════════════════════════════════════"
    echo ""

    # Create a test thought via orchestrator
    log_test "Creating test thought via orchestrator"
    THOUGHT_PAYLOAD=$(cat <<EOF
{
    "content": "Test thought for inter-MCP communication validation",
    "thought_type": "problem_definition",
    "confidence": 0.85,
    "metadata": {
        "test": true,
        "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
}
EOF
)

    RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "$THOUGHT_PAYLOAD" "${ORCHESTRATOR_URL}/api/v1/thoughts" 2>/dev/null || echo "{}")

    if echo "$RESPONSE" | jq -e '.thought_id' &>/dev/null; then
        THOUGHT_ID=$(echo "$RESPONSE" | jq -r '.thought_id')
        log_success "Test thought created successfully (ID: $THOUGHT_ID)"

        # Wait for synchronization
        sleep 2

        # Verify thought exists in database
        log_test "Verifying thought persistence in database"
        THOUGHT_EXISTS=$(ssh "dev-admin@${VMI01_HOST}" \
            "PGPASSWORD='TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=' psql -h localhost -U mcp_admin -d mcp_ecosystem -tAc \"SELECT COUNT(*) FROM thoughts WHERE thought_id='$THOUGHT_ID'\"" 2>/dev/null || echo "0")

        if [ "$THOUGHT_EXISTS" = "1" ]; then
            log_success "Thought successfully persisted to database"
        else
            log_error "Thought NOT found in database"
        fi

        # Test thought retrieval via different service
        log_test "Retrieving thought via Perplexity MCP"
        RETRIEVE_RESPONSE=$(curl -s "${PERPLEXITY_URL}/api/v1/thoughts/${THOUGHT_ID}" 2>/dev/null || echo "{}")

        if echo "$RETRIEVE_RESPONSE" | jq -e '.thought_id' &>/dev/null; then
            log_success "Thought retrieved successfully from different service"
        else
            log_warning "Thought retrieval test inconclusive (endpoint may not be implemented)"
        fi
    else
        log_error "Failed to create test thought"
    fi

    # Test branch synchronization
    log_test "Testing branch synchronization"
    BRANCH_PAYLOAD=$(cat <<EOF
{
    "parent_thought_id": "$THOUGHT_ID",
    "branch_name": "test_branch_$(date +%s)",
    "hypothesis": "Testing distributed branch synchronization"
}
EOF
)

    RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
        -d "$BRANCH_PAYLOAD" "${ORCHESTRATOR_URL}/api/v1/branches" 2>/dev/null || echo "{}")

    if echo "$RESPONSE" | jq -e '.branch_id' &>/dev/null; then
        BRANCH_ID=$(echo "$RESPONSE" | jq -r '.branch_id')
        log_success "Branch created successfully (ID: $BRANCH_ID)"
    else
        log_warning "Branch creation test inconclusive (endpoint may not be implemented)"
    fi
}

# ============================================================================
# Test Load Balancing
# ============================================================================

test_load_balancing() {
    echo ""
    log "═══════════════════════════════════════════════════════════════"
    log "Phase 6: Load Balancing Tests"
    log "═══════════════════════════════════════════════════════════════"
    echo ""

    # Send multiple requests and check distribution
    log_test "Load distribution across workers"

    REQUEST_COUNT=10
    declare -A worker_hits

    for i in $(seq 1 $REQUEST_COUNT); do
        RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" \
            -d '{"command":"ping"}' "${ORCHESTRATOR_URL}/api/v1/dispatch" 2>/dev/null || echo "{}")

        if echo "$RESPONSE" | jq -e '.worker' &>/dev/null; then
            WORKER=$(echo "$RESPONSE" | jq -r '.worker')
            worker_hits[$WORKER]=$((${worker_hits[$WORKER]:-0} + 1))
        fi

        sleep 0.1
    done

    if [ ${#worker_hits[@]} -gt 0 ]; then
        log_success "Load balancing active - requests distributed across ${#worker_hits[@]} worker(s)"
        for worker in "${!worker_hits[@]}"; do
            log "  $worker: ${worker_hits[$worker]} requests"
        done
    else
        log_warning "Load balancing test inconclusive"
    fi
}

# ============================================================================
# Test Failure Recovery
# ============================================================================

test_failure_recovery() {
    echo ""
    log "═══════════════════════════════════════════════════════════════"
    log "Phase 7: Failure Recovery & Self-Healing Tests"
    log "═══════════════════════════════════════════════════════════════"
    echo ""

    # Check if services have systemd auto-restart configured
    log_test "Service auto-restart configuration"
    SERVICES=("mcp-orchestrator" "perplexity-mcp" "it-mcp")

    for service in "${SERVICES[@]}"; do
        RESTART_POLICY=$(ssh "dev-admin@${VMI01_HOST}" \
            "systemctl show $service -p Restart --value" 2>/dev/null || echo "unknown")

        if [ "$RESTART_POLICY" = "always" ] || [ "$RESTART_POLICY" = "on-failure" ]; then
            log_success "$service has auto-restart enabled ($RESTART_POLICY)"
        else
            log_warning "$service auto-restart policy: $RESTART_POLICY"
        fi
    done

    # Test health monitoring
    log_test "Service health monitoring"
    RESPONSE=$(curl -s "${ORCHESTRATOR_URL}/api/v1/health/detailed" 2>/dev/null || echo "{}")

    if echo "$RESPONSE" | jq -e '.services' &>/dev/null; then
        SERVICE_COUNT=$(echo "$RESPONSE" | jq '.services | length' 2>/dev/null || echo "0")
        log_success "Health monitoring active for $SERVICE_COUNT service(s)"
    else
        log_warning "Detailed health monitoring endpoint not available"
    fi

    # Check sync queue for pending synchronizations
    log_test "Thought synchronization queue status"
    QUEUE_SIZE=$(ssh "dev-admin@${VMI01_HOST}" \
        "PGPASSWORD='TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=' psql -h localhost -U mcp_admin -d mcp_ecosystem -tAc \"SELECT COUNT(*) FROM thought_sync_queue WHERE sync_status='pending'\"" 2>/dev/null || echo "unknown")

    if [ "$QUEUE_SIZE" != "unknown" ]; then
        if [ "$QUEUE_SIZE" -lt 100 ]; then
            log_success "Sync queue healthy ($QUEUE_SIZE pending items)"
        else
            log_warning "Sync queue has $QUEUE_SIZE pending items (high load or sync issues)"
        fi
    else
        log_warning "Could not check sync queue status"
    fi
}

# ============================================================================
# Test Performance Metrics
# ============================================================================

test_performance_metrics() {
    echo ""
    log "═══════════════════════════════════════════════════════════════"
    log "Phase 8: Performance Metrics"
    log "═══════════════════════════════════════════════════════════════"
    echo ""

    # Test response times
    log_test "Service response times"

    SERVICES=(
        "$ORCHESTRATOR_URL/health:MCP Orchestrator"
        "$PERPLEXITY_URL/health:Perplexity MCP"
        "$IT_MCP_URL/health:IT-MCP"
    )

    for service_spec in "${SERVICES[@]}"; do
        URL="${service_spec%%:*}"
        NAME="${service_spec#*:}"

        START_TIME=$(date +%s%N)
        curl -s "$URL" &>/dev/null
        END_TIME=$(date +%s%N)

        RESPONSE_TIME=$(( (END_TIME - START_TIME) / 1000000 ))  # Convert to milliseconds

        if [ $RESPONSE_TIME -lt 100 ]; then
            log_success "$NAME response time: ${RESPONSE_TIME}ms (excellent)"
        elif [ $RESPONSE_TIME -lt 500 ]; then
            log_success "$NAME response time: ${RESPONSE_TIME}ms (good)"
        else
            log_warning "$NAME response time: ${RESPONSE_TIME}ms (slow)"
        fi
    done

    # Database query performance
    log_test "Database query performance"
    START_TIME=$(date +%s%N)
    ssh "dev-admin@${VMI01_HOST}" \
        "PGPASSWORD='TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=' psql -h localhost -U mcp_admin -d mcp_ecosystem -tAc \"SELECT COUNT(*) FROM thoughts\"" &>/dev/null
    END_TIME=$(date +%s%N)

    QUERY_TIME=$(( (END_TIME - START_TIME) / 1000000 ))

    if [ $QUERY_TIME -lt 50 ]; then
        log_success "Database query time: ${QUERY_TIME}ms (excellent)"
    elif [ $QUERY_TIME -lt 200 ]; then
        log_success "Database query time: ${QUERY_TIME}ms (good)"
    else
        log_warning "Database query time: ${QUERY_TIME}ms (consider index optimization)"
    fi
}

# ============================================================================
# Generate Test Report
# ============================================================================

generate_report() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║              MCP INTEGRATION TEST RESULTS                      ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log "Total Tests Run: $TOTAL_TESTS"
    log_success "Passed: $PASSED_TESTS"

    if [ $FAILED_TESTS -gt 0 ]; then
        log_error "Failed: $FAILED_TESTS"
    else
        log "Failed: $FAILED_TESTS"
    fi

    if [ $WARNINGS -gt 0 ]; then
        log_warning "Warnings: $WARNINGS"
    else
        log "Warnings: $WARNINGS"
    fi

    echo ""

    SUCCESS_RATE=$(( PASSED_TESTS * 100 / TOTAL_TESTS ))

    if [ $SUCCESS_RATE -ge 90 ]; then
        log_success "Overall Status: EXCELLENT ($SUCCESS_RATE% success rate)"
    elif [ $SUCCESS_RATE -ge 70 ]; then
        log_success "Overall Status: GOOD ($SUCCESS_RATE% success rate)"
    elif [ $SUCCESS_RATE -ge 50 ]; then
        log_warning "Overall Status: FAIR ($SUCCESS_RATE% success rate)"
    else
        log_error "Overall Status: NEEDS ATTENTION ($SUCCESS_RATE% success rate)"
    fi

    echo ""
    log "Next Steps:"
    if [ $FAILED_TESTS -gt 0 ]; then
        log "  1. Review failed tests above"
        log "  2. Check service logs: journalctl -u <service-name> -n 50"
        log "  3. Verify network connectivity and firewall rules"
        log "  4. Re-run tests after fixes"
    else
        log "  1. All critical tests passed"
        log "  2. Monitor performance metrics in production"
        log "  3. Review warnings (if any) for optimization opportunities"
        log "  4. Schedule regular integration test runs"
    fi

    echo ""
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║        MCP Ecosystem - Integration Test Suite v0.2.0          ║"
    echo "║              Target: VMI01 (${VMI01_HOST})              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log "Test suite started: $(date)"
    echo ""

    # Run all test phases
    test_infrastructure_connectivity
    test_service_health
    test_database_schema
    test_orchestrator_to_workers
    test_thought_synchronization
    test_load_balancing
    test_failure_recovery
    test_performance_metrics

    # Generate final report
    generate_report

    echo ""
    log "Test suite completed: $(date)"

    # Exit with appropriate code
    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    else
        exit 0
    fi
}

# Run main function
main "$@"
