#!/bin/bash

# MCP Comprehensive Integration Test
# Complete test of all MCP ecosystem components

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
VMI01_IP="46.250.243.123"
VMI02D_IP="46.250.241.70"
VMI03_IP="154.26.158.31"
VM_PASSWORD="${VM_PASSWORD:-${MCP_ROOT_PASSWORD:-}}"

if [[ -z "${VM_PASSWORD:-}" ]]; then
    echo "VM_PASSWORD (or MCP_ROOT_PASSWORD) must be exported via Contabo Secrets (npm run secrets:pull) before running this test." >&2
    exit 1
fi

DB_HOST="46.250.243.123"
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"
DB_PASSWORD="${DB_PASSWORD:-${DB_ADMIN_PASSWORD:-}}"

if [[ -z "${DB_PASSWORD:-}" ]]; then
    echo "DB_PASSWORD (or DB_ADMIN_PASSWORD) must be exported via Contabo Secrets (npm run secrets:pull) before running this test." >&2
    exit 1
fi

REPORT_FILE="/tmp/mcp_comprehensive_test_report.txt"
PASS_COUNT=0
FAIL_COUNT=0

# Initialize report
echo "MCP ECOSYSTEM INTEGRATION TEST REPORT" > "$REPORT_FILE"
echo "=====================================" >> "$REPORT_FILE"
echo "Timestamp: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# Function to log results
log_test() {
    local category=$1
    local test_name=$2
    local status=$3
    local message=$4

    if [ "$status" == "PASS" ]; then
        echo -e "${GREEN}✓${NC} [$category] $test_name: $message"
        echo "✓ [$category] $test_name: $message" >> "$REPORT_FILE"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}✗${NC} [$category] $test_name: $message"
        echo "✗ [$category] $test_name: $message" >> "$REPORT_FILE"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}MCP Comprehensive Integration Test${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ====================
# INFRASTRUCTURE TESTS
# ====================
echo -e "${BLUE}1. INFRASTRUCTURE TESTS${NC}"
echo -e "${BLUE}----------------------${NC}"
echo "1. INFRASTRUCTURE TESTS" >> "$REPORT_FILE"
echo "----------------------" >> "$REPORT_FILE"

# Test SSH connectivity
echo "Testing SSH connectivity..."
for vm_name in VMI01 VMI02D VMI03; do
    case $vm_name in
        VMI01) vm_ip=$VMI01_IP ;;
        VMI02D) vm_ip=$VMI02D_IP ;;
        VMI03) vm_ip=$VMI03_IP ;;
    esac

    if SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@$vm_ip "echo 'OK'" > /dev/null 2>&1; then
        log_test "INFRA" "SSH_$vm_name" "PASS" "Connected to $vm_ip"
    else
        log_test "INFRA" "SSH_$vm_name" "FAIL" "Cannot connect to $vm_ip"
    fi
done

# Test WireGuard
echo "Testing WireGuard VPN..."
wg_status=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "wg show 2>/dev/null | grep -c 'peer:' || echo '0'" 2>/dev/null)
if [ "$wg_status" -gt 0 ]; then
    log_test "INFRA" "WireGuard" "PASS" "$wg_status peers connected"
else
    log_test "INFRA" "WireGuard" "FAIL" "No VPN peers"
fi

# Test Firewall
echo "Testing firewall..."
fw_active=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "ufw status | grep -c 'Status: active' || echo '0'" 2>/dev/null)
if [ "$fw_active" -eq 1 ]; then
    log_test "INFRA" "Firewall_VMI01" "PASS" "UFW is active"
else
    log_test "INFRA" "Firewall_VMI01" "FAIL" "UFW not active"
fi

echo "" >> "$REPORT_FILE"

# =================
# DATABASE TESTS
# =================
echo ""
echo -e "${BLUE}2. DATABASE TESTS${NC}"
echo -e "${BLUE}----------------${NC}"
echo "2. DATABASE TESTS" >> "$REPORT_FILE"
echo "----------------" >> "$REPORT_FILE"

# Test primary connection
echo "Testing database connectivity..."
if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    log_test "DB" "Primary_Connection" "PASS" "Connected to PostgreSQL"
else
    log_test "DB" "Primary_Connection" "FAIL" "Cannot connect to database"
fi

# Test replication
echo "Testing replication..."
rep_status=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "sudo -u postgres psql -t -c \"SELECT state FROM pg_stat_replication LIMIT 1;\" 2>/dev/null | tr -d ' '" || echo "none")
if [ "$rep_status" == "streaming" ]; then
    log_test "DB" "Replication" "PASS" "Streaming replication active"
else
    log_test "DB" "Replication" "FAIL" "Replication not streaming"
fi

# Test v0.2 schema
echo "Testing v0.2 schema..."
table_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
if [ "$table_count" -gt 8 ]; then
    log_test "DB" "Schema_v0.2" "PASS" "$table_count tables found"
else
    log_test "DB" "Schema_v0.2" "FAIL" "Only $table_count tables found"
fi

# Test functions
echo "Testing database functions..."
func_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;" 2>/dev/null | tr -d ' ')
if [ "$func_count" -gt 5 ]; then
    log_test "DB" "Functions" "PASS" "$func_count functions found"
else
    log_test "DB" "Functions" "FAIL" "Only $func_count functions found"
fi

echo "" >> "$REPORT_FILE"

# =================
# SERVICE TESTS
# =================
echo ""
echo -e "${BLUE}3. MCP SERVICE TESTS${NC}"
echo -e "${BLUE}-------------------${NC}"
echo "3. MCP SERVICE TESTS" >> "$REPORT_FILE"
echo "-------------------" >> "$REPORT_FILE"

# Test Orchestrator
echo "Testing MCP Orchestrator..."
orch_response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$VMI01_IP:3000/health" 2>/dev/null || echo "000")
if [ "$orch_response" == "200" ]; then
    log_test "SERVICE" "Orchestrator" "PASS" "Health endpoint responding"
else
    log_test "SERVICE" "Orchestrator" "FAIL" "Not responding (HTTP $orch_response)"
fi

# Test Perplexity MCP
echo "Testing Perplexity MCP..."
perp_response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$VMI02D_IP:3001/health" 2>/dev/null || echo "000")
if [ "$perp_response" == "200" ]; then
    log_test "SERVICE" "Perplexity_MCP" "PASS" "Health endpoint responding"
else
    log_test "SERVICE" "Perplexity_MCP" "FAIL" "Not responding (HTTP $perp_response)"
fi

# Test IT MCP
echo "Testing IT MCP..."
it_response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$VMI03_IP:3002/health" 2>/dev/null || echo "000")
if [ "$it_response" == "200" ]; then
    log_test "SERVICE" "IT_MCP" "PASS" "Health endpoint responding"
else
    log_test "SERVICE" "IT_MCP" "FAIL" "Not responding (HTTP $it_response)"
fi

echo "" >> "$REPORT_FILE"

# ==================
# END-TO-END TESTS
# ==================
echo ""
echo -e "${BLUE}4. END-TO-END TESTS${NC}"
echo -e "${BLUE}------------------${NC}"
echo "4. END-TO-END TESTS" >> "$REPORT_FILE"
echo "------------------" >> "$REPORT_FILE"

# Create test session
echo "Testing session creation..."
session_id=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
    "SELECT create_thought_session('Integration Test', 'test_user', '{}'::jsonb);" 2>/dev/null | tr -d ' ')

if [ -n "$session_id" ] && [ "$session_id" != "" ]; then
    log_test "E2E" "Session_Creation" "PASS" "Session ID: ${session_id:0:8}..."

    # Test thought insertion
    echo "Testing thought insertion..."
    thought_id=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
        "INSERT INTO thoughts (session_id, content, thought_type) VALUES ('$session_id', 'Test thought', 'test') RETURNING id;" 2>/dev/null | tr -d ' ')

    if [ -n "$thought_id" ]; then
        log_test "E2E" "Thought_Insert" "PASS" "Thought created"

        # Test FTS
        echo "Testing full-text search..."
        search_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
            "SELECT COUNT(*) FROM search_thoughts_fts('test');" 2>/dev/null | tr -d ' ')

        if [ "$search_count" -gt 0 ]; then
            log_test "E2E" "FTS_Search" "PASS" "Found $search_count results"
        else
            log_test "E2E" "FTS_Search" "FAIL" "No search results"
        fi

        # Cleanup
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
            "DELETE FROM thoughts WHERE session_id = '$session_id';" > /dev/null 2>&1
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
            "DELETE FROM thought_sessions WHERE id = '$session_id';" > /dev/null 2>&1
    else
        log_test "E2E" "Thought_Insert" "FAIL" "Could not create thought"
    fi
else
    log_test "E2E" "Session_Creation" "FAIL" "Could not create session"
fi

echo "" >> "$REPORT_FILE"

# ===================
# PERFORMANCE TESTS
# ===================
echo ""
echo -e "${BLUE}5. PERFORMANCE TESTS${NC}"
echo -e "${BLUE}-------------------${NC}"
echo "5. PERFORMANCE TESTS" >> "$REPORT_FILE"
echo "-------------------" >> "$REPORT_FILE"

# Test query performance
echo "Testing query performance..."
start_time=$(date +%s%3N 2>/dev/null || echo "0")
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
    "SELECT COUNT(*) FROM thoughts;" > /dev/null 2>&1
end_time=$(date +%s%3N 2>/dev/null || echo "100")
query_time=$((end_time - start_time))

if [ "$query_time" -lt 1000 ] && [ "$query_time" -gt 0 ]; then
    log_test "PERF" "Query_Speed" "PASS" "Query completed in ~${query_time}ms"
else
    log_test "PERF" "Query_Speed" "FAIL" "Query slow or failed"
fi

# Test replication lag
echo "Testing replication lag..."
lag=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "sudo -u postgres psql -t -c \"SELECT COALESCE(EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp()))::int, 0) FROM pg_stat_replication LIMIT 1;\" 2>/dev/null" | tr -d ' ')

if [ -n "$lag" ] && [ "$lag" -lt 5 ] 2>/dev/null; then
    log_test "PERF" "Replication_Lag" "PASS" "Lag: ${lag}s"
else
    log_test "PERF" "Replication_Lag" "FAIL" "High lag or error"
fi

echo "" >> "$REPORT_FILE"

# ===================
# SECURITY TESTS
# ===================
echo ""
echo -e "${BLUE}6. SECURITY TESTS${NC}"
echo -e "${BLUE}----------------${NC}"
echo "6. SECURITY TESTS" >> "$REPORT_FILE"
echo "----------------" >> "$REPORT_FILE"

# Test fail2ban
echo "Testing fail2ban..."
f2b_status=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "systemctl is-active fail2ban 2>/dev/null" || echo "inactive")
if [ "$f2b_status" == "active" ]; then
    log_test "SEC" "Fail2ban" "PASS" "Service is active"
else
    log_test "SEC" "Fail2ban" "FAIL" "Service not active"
fi

# Test open ports
echo "Testing open ports..."
open_ports=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "ss -tuln | grep LISTEN | wc -l" 2>/dev/null || echo "0")
if [ "$open_ports" -lt 15 ] && [ "$open_ports" -gt 0 ]; then
    log_test "SEC" "Open_Ports" "PASS" "$open_ports ports listening"
else
    log_test "SEC" "Open_Ports" "FAIL" "Unexpected port count: $open_ports"
fi

# Test database authentication
echo "Testing database authentication..."
bad_auth=$(PGPASSWORD="wrongpass" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" 2>&1 | grep -c "authentication failed" || echo "0")
if [ "$bad_auth" -eq 1 ]; then
    log_test "SEC" "DB_Auth" "PASS" "Authentication enforced"
else
    log_test "SEC" "DB_Auth" "FAIL" "Authentication issue"
fi

echo "" >> "$REPORT_FILE"

# ====================
# SUMMARY
# ====================
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}TEST SUMMARY${NC}"
echo -e "${CYAN}========================================${NC}"
echo "========================================" >> "$REPORT_FILE"
echo "TEST SUMMARY" >> "$REPORT_FILE"
echo "========================================" >> "$REPORT_FILE"

TOTAL_TESTS=$((PASS_COUNT + FAIL_COUNT))
if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$((PASS_COUNT * 100 / TOTAL_TESTS))
else
    SUCCESS_RATE=0
fi

echo "Total Tests: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo "Success Rate: $SUCCESS_RATE%"

echo "Total Tests: $TOTAL_TESTS" >> "$REPORT_FILE"
echo "Passed: $PASS_COUNT" >> "$REPORT_FILE"
echo "Failed: $FAIL_COUNT" >> "$REPORT_FILE"
echo "Success Rate: $SUCCESS_RATE%" >> "$REPORT_FILE"

echo "" >> "$REPORT_FILE"

# Production readiness assessment
echo ""
if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✅ PRODUCTION READY${NC}"
    echo "✅ PRODUCTION READY" >> "$REPORT_FILE"
    echo "All integration tests passed successfully."
    echo "All integration tests passed successfully." >> "$REPORT_FILE"
elif [ $SUCCESS_RATE -gt 80 ]; then
    echo -e "${YELLOW}⚠️  MOSTLY READY${NC}"
    echo "⚠️  MOSTLY READY" >> "$REPORT_FILE"
    echo "System is mostly ready but has some issues to address."
    echo "System is mostly ready but has some issues to address." >> "$REPORT_FILE"
else
    echo -e "${RED}❌ NOT READY${NC}"
    echo "❌ NOT READY" >> "$REPORT_FILE"
    echo "Critical issues detected. Review failures before deployment."
    echo "Critical issues detected. Review failures before deployment." >> "$REPORT_FILE"
fi

echo ""
echo "Detailed report saved to: $REPORT_FILE"
echo ""

# Display any critical failures
if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${YELLOW}Failed Tests:${NC}"
    grep "^✗" "$REPORT_FILE"
fi

exit 0
