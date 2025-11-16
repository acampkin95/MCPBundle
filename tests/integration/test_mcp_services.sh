#!/bin/bash

# MCP Services Integration Tests
# Tests MCP Orchestrator, Perplexity MCP, and IT MCP services

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
REPORT_FILE="/tmp/mcp_services_test_report.json"
PASS_COUNT=0
FAIL_COUNT=0
TESTS_RUN=0

# Service configuration
declare -A SERVICES
SERVICES["orchestrator"]="46.250.243.123:3000"
SERVICES["perplexity"]="46.250.241.70:3001"
SERVICES["it_mcp"]="154.26.158.31:3002"

# VM configuration
VM_PASSWORD="${VM_PASSWORD:-${MCP_ROOT_PASSWORD:-}}"

if [[ -z "${VM_PASSWORD:-}" ]]; then
    echo "VM_PASSWORD (or MCP_ROOT_PASSWORD) must be exported via Contabo Secrets (npm run secrets:pull) before running." >&2
    exit 1
fi
declare -A VM_IPS
VM_IPS["orchestrator"]="46.250.243.123"
VM_IPS["perplexity"]="46.250.241.70"
VM_IPS["it_mcp"]="154.26.158.31"

# Initialize report
echo "{" > "$REPORT_FILE"
echo '  "test_suite": "mcp_services",' >> "$REPORT_FILE"
echo '  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",' >> "$REPORT_FILE"
echo '  "tests": [' >> "$REPORT_FILE"

# Function to log test results
log_test() {
    local test_name=$1
    local status=$2
    local message=$3
    local duration=$4

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ "$status" == "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name: $message"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}✗${NC} $test_name: $message"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Add to JSON report
    if [ $TESTS_RUN -gt 1 ]; then
        echo "," >> "$REPORT_FILE"
    fi
    echo -n '    {
      "name": "'$test_name'",
      "status": "'$status'",
      "message": "'$message'",
      "duration_ms": '$duration'
    }' >> "$REPORT_FILE"
}

echo "======================================"
echo "MCP Services Integration Tests"
echo "======================================"
echo ""

# Test 1: Service Health Endpoints
echo "Testing Service Health Endpoints..."
for service_name in "${!SERVICES[@]}"; do
    service_url="${SERVICES[$service_name]}"
    start_time=$(date +%s%N)

    # Test health endpoint
    response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$service_url/health" 2>/dev/null || echo "000")
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$response" == "200" ]; then
        log_test "${service_name}_health" "PASS" "Health endpoint responding (HTTP $response)" $duration
    else
        log_test "${service_name}_health" "FAIL" "Health endpoint not responding (HTTP $response)" $duration
    fi
done

# Test 2: Service Process Status
echo ""
echo "Testing Service Process Status..."
for service_name in "${!VM_IPS[@]}"; do
    vm_ip="${VM_IPS[$service_name]}"
    start_time=$(date +%s%N)

    # Check if service process is running
    if [ "$service_name" == "orchestrator" ]; then
        process_name="mcp-orchestrator"
    elif [ "$service_name" == "perplexity" ]; then
        process_name="perplexity-mcp"
    else
        process_name="it-mcp"
    fi

    process_count=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "ps aux | grep -v grep | grep -c '$process_name' || echo '0'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$process_count" -gt 0 ]; then
        log_test "${service_name}_process" "PASS" "Service process running ($process_count instances)" $duration
    else
        log_test "${service_name}_process" "FAIL" "Service process not found" $duration
    fi
done

# Test 3: Service Logs
echo ""
echo "Testing Service Logs for Errors..."
for service_name in "${!VM_IPS[@]}"; do
    vm_ip="${VM_IPS[$service_name]}"
    start_time=$(date +%s%N)

    # Check for recent errors in logs
    if [ "$service_name" == "orchestrator" ]; then
        log_path="/var/log/mcp-orchestrator.log"
    elif [ "$service_name" == "perplexity" ]; then
        log_path="/var/log/perplexity-mcp.log"
    else
        log_path="/var/log/it-mcp.log"
    fi

    error_count=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "[ -f $log_path ] && tail -n 100 $log_path | grep -ci 'error\\|fatal\\|critical' || echo '0'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$error_count" == "0" ]; then
        log_test "${service_name}_logs" "PASS" "No errors in recent logs" $duration
    else
        log_test "${service_name}_logs" "FAIL" "Found $error_count errors in recent logs" $duration
    fi
done

# Test 4: Service Restart
echo ""
echo "Testing Service Restart Capability..."
for service_name in "${!VM_IPS[@]}"; do
    vm_ip="${VM_IPS[$service_name]}"
    service_url="${SERVICES[$service_name]}"
    start_time=$(date +%s%N)

    # Restart service
    if [ "$service_name" == "orchestrator" ]; then
        service_unit="mcp-orchestrator"
    elif [ "$service_name" == "perplexity" ]; then
        service_unit="perplexity-mcp"
    else
        service_unit="it-mcp"
    fi

    # Restart and wait
    SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "systemctl restart $service_unit 2>/dev/null || service $service_unit restart 2>/dev/null" 2>/dev/null

    # Wait for service to come up
    sleep 5

    # Check if service is responding
    response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "http://$service_url/health" 2>/dev/null || echo "000")
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$response" == "200" ]; then
        log_test "${service_name}_restart" "PASS" "Service restarted successfully" $duration
    else
        log_test "${service_name}_restart" "FAIL" "Service failed to restart properly" $duration
    fi
done

# Test 5: Database Connectivity from Services
echo ""
echo "Testing Database Connectivity from Services..."
for service_name in "${!VM_IPS[@]}"; do
    vm_ip="${VM_IPS[$service_name]}"
    start_time=$(date +%s%N)

    # Test database connectivity from service VM
    db_test=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "PGPASSWORD='' psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c 'SELECT 1' 2>&1 | grep -c '1 row' || echo '0'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$db_test" == "1" ]; then
        log_test "${service_name}_db_connectivity" "PASS" "Can connect to database" $duration
    else
        log_test "${service_name}_db_connectivity" "FAIL" "Cannot connect to database" $duration
    fi
done

# Test 6: Service API Endpoints
echo ""
echo "Testing Service API Endpoints..."

# Test Orchestrator API
start_time=$(date +%s%N)
orchestrator_test=$(curl -s -X POST "http://${SERVICES[orchestrator]}/api/thoughts" \
    -H "Content-Type: application/json" \
    -d '{"content":"Test thought from integration test","type":"test"}' \
    -w "\n%{http_code}" 2>/dev/null | tail -1 || echo "000")
end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$orchestrator_test" == "200" ] || [ "$orchestrator_test" == "201" ]; then
    log_test "orchestrator_api" "PASS" "API endpoint working" $duration
else
    log_test "orchestrator_api" "FAIL" "API endpoint returned $orchestrator_test" $duration
fi

# Test Perplexity API
start_time=$(date +%s%N)
perplexity_test=$(curl -s -X GET "http://${SERVICES[perplexity]}/api/search?q=test" \
    -w "\n%{http_code}" 2>/dev/null | tail -1 || echo "000")
end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$perplexity_test" == "200" ]; then
    log_test "perplexity_api" "PASS" "Search API working" $duration
else
    log_test "perplexity_api" "FAIL" "Search API returned $perplexity_test" $duration
fi

# Test 7: Service Memory Usage
echo ""
echo "Testing Service Memory Usage..."
for service_name in "${!VM_IPS[@]}"; do
    vm_ip="${VM_IPS[$service_name]}"
    start_time=$(date +%s%N)

    if [ "$service_name" == "orchestrator" ]; then
        process_name="mcp-orchestrator"
    elif [ "$service_name" == "perplexity" ]; then
        process_name="perplexity-mcp"
    else
        process_name="it-mcp"
    fi

    # Get memory usage percentage
    mem_usage=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "ps aux | grep '$process_name' | grep -v grep | awk '{print \$4}' | head -1" 2>/dev/null || echo "0")

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ -n "$mem_usage" ] && (( $(echo "$mem_usage < 50" | bc -l) )); then
        log_test "${service_name}_memory" "PASS" "Memory usage: ${mem_usage}%" $duration
    elif [ -n "$mem_usage" ]; then
        log_test "${service_name}_memory" "FAIL" "High memory usage: ${mem_usage}%" $duration
    else
        log_test "${service_name}_memory" "FAIL" "Could not measure memory usage" $duration
    fi
done

# Test 8: Service Response Time
echo ""
echo "Testing Service Response Times..."
for service_name in "${!SERVICES[@]}"; do
    service_url="${SERVICES[$service_name]}"
    total_time=0
    request_count=5

    for i in $(seq 1 $request_count); do
        start_time=$(date +%s%N)
        curl -s -o /dev/null "http://$service_url/health" 2>/dev/null
        end_time=$(date +%s%N)
        request_time=$(( (end_time - start_time) / 1000000 ))
        total_time=$((total_time + request_time))
    done

    avg_time=$((total_time / request_count))

    if [ $avg_time -lt 500 ]; then
        log_test "${service_name}_response_time" "PASS" "Average response time: ${avg_time}ms" $avg_time
    else
        log_test "${service_name}_response_time" "FAIL" "Slow response time: ${avg_time}ms" $avg_time
    fi
done

# Close JSON report
echo "" >> "$REPORT_FILE"
echo '  ],' >> "$REPORT_FILE"
echo '  "summary": {' >> "$REPORT_FILE"
echo '    "total": '$TESTS_RUN',' >> "$REPORT_FILE"
echo '    "passed": '$PASS_COUNT',' >> "$REPORT_FILE"
echo '    "failed": '$FAIL_COUNT',' >> "$REPORT_FILE"
echo '    "success_rate": '$(echo "scale=2; $PASS_COUNT * 100 / $TESTS_RUN" | bc)'
  }
}' >> "$REPORT_FILE"

# Print summary
echo ""
echo "======================================"
echo "MCP Services Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo "Success Rate: $(echo "scale=2; $PASS_COUNT * 100 / $TESTS_RUN" | bc)%"
echo ""
echo "Detailed report saved to: $REPORT_FILE"
