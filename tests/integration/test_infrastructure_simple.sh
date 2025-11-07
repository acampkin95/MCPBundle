#!/bin/bash

# MCP Infrastructure Integration Tests - Simplified Version
# Tests SSH connectivity, network latency, and basic infrastructure

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
REPORT_FILE="/tmp/infrastructure_test_report.json"
PASS_COUNT=0
FAIL_COUNT=0
TESTS_RUN=0

# VM Configuration
VMI01_IP="46.250.243.123"
VMI02D_IP="46.250.241.70"
VMI03_IP="154.26.158.31"
VM_PASSWORD="C0nnaught"

# Initialize report
echo "{" > "$REPORT_FILE"
echo '  "test_suite": "infrastructure",' >> "$REPORT_FILE"
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
echo "MCP Infrastructure Integration Tests"
echo "======================================"
echo ""

# Test SSH Connectivity to all VMs
echo "Testing SSH Connectivity..."

# Test VMI01
start_time=$(date +%s%3N 2>/dev/null || date +%s)
if sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$VMI01_IP "echo 'SSH OK'" > /dev/null 2>&1; then
    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    duration=$(( end_time - start_time ))
    log_test "ssh_connectivity_VMI01" "PASS" "SSH connection successful to $VMI01_IP" $duration
else
    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    duration=$(( end_time - start_time ))
    log_test "ssh_connectivity_VMI01" "FAIL" "SSH connection failed to $VMI01_IP" $duration
fi

# Test VMI02D
start_time=$(date +%s%3N 2>/dev/null || date +%s)
if sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$VMI02D_IP "echo 'SSH OK'" > /dev/null 2>&1; then
    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    duration=$(( end_time - start_time ))
    log_test "ssh_connectivity_VMI02D" "PASS" "SSH connection successful to $VMI02D_IP" $duration
else
    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    duration=$(( end_time - start_time ))
    log_test "ssh_connectivity_VMI02D" "FAIL" "SSH connection failed to $VMI02D_IP" $duration
fi

# Test VMI03
start_time=$(date +%s%3N 2>/dev/null || date +%s)
if sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$VMI03_IP "echo 'SSH OK'" > /dev/null 2>&1; then
    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    duration=$(( end_time - start_time ))
    log_test "ssh_connectivity_VMI03" "PASS" "SSH connection successful to $VMI03_IP" $duration
else
    end_time=$(date +%s%3N 2>/dev/null || date +%s)
    duration=$(( end_time - start_time ))
    log_test "ssh_connectivity_VMI03" "FAIL" "SSH connection failed to $VMI03_IP" $duration
fi

# Test Network Latency
echo ""
echo "Testing Network Latency..."

# VMI01 to VMI02D
start_time=$(date +%s%3N 2>/dev/null || date +%s)
avg_latency=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "ping -c 5 -q $VMI02D_IP 2>/dev/null | grep 'avg' | awk -F'/' '{print \$5}'" 2>/dev/null || echo "error")
end_time=$(date +%s%3N 2>/dev/null || date +%s)
duration=$(( end_time - start_time ))

if [ "$avg_latency" != "error" ] && [ -n "$avg_latency" ]; then
    log_test "network_latency_VMI01_to_VMI02D" "PASS" "Average latency: ${avg_latency}ms" $duration
else
    log_test "network_latency_VMI01_to_VMI02D" "FAIL" "Could not measure latency" $duration
fi

# Test DNS Resolution
echo ""
echo "Testing DNS Resolution..."

# VMI01 DNS
start_time=$(date +%s%3N 2>/dev/null || date +%s)
dns_result=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "nslookup google.com 2>&1 | grep -q 'Address:' && echo 'OK' || echo 'FAIL'" 2>/dev/null)
end_time=$(date +%s%3N 2>/dev/null || date +%s)
duration=$(( end_time - start_time ))

if [ "$dns_result" == "OK" ]; then
    log_test "dns_resolution_VMI01" "PASS" "DNS resolution working on VMI01" $duration
else
    log_test "dns_resolution_VMI01" "FAIL" "DNS resolution failed on VMI01" $duration
fi

# Test WireGuard VPN Status
echo ""
echo "Testing WireGuard VPN..."

# VMI01 WireGuard
start_time=$(date +%s%3N 2>/dev/null || date +%s)
wg_status=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "wg show 2>/dev/null | grep -c 'interface:' || echo '0'" 2>/dev/null)
end_time=$(date +%s%3N 2>/dev/null || date +%s)
duration=$(( end_time - start_time ))

if [ "$wg_status" -gt 0 ]; then
    log_test "wireguard_status_VMI01" "PASS" "WireGuard interface active on VMI01" $duration
else
    log_test "wireguard_status_VMI01" "FAIL" "WireGuard not active on VMI01" $duration
fi

# Test Firewall Status
echo ""
echo "Testing Firewall..."

# VMI01 Firewall
start_time=$(date +%s%3N 2>/dev/null || date +%s)
fw_status=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "ufw status 2>/dev/null | grep -q 'Status: active' && echo 'OK' || echo 'FAIL'" 2>/dev/null)
end_time=$(date +%s%3N 2>/dev/null || date +%s)
duration=$(( end_time - start_time ))

if [ "$fw_status" == "OK" ]; then
    log_test "firewall_status_VMI01" "PASS" "Firewall active on VMI01" $duration
else
    log_test "firewall_status_VMI01" "FAIL" "Firewall not active on VMI01" $duration
fi

# Test System Resources
echo ""
echo "Testing System Resources..."

# VMI01 Disk Usage
start_time=$(date +%s%3N 2>/dev/null || date +%s)
disk_usage=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI01_IP \
    "df -h / | awk 'NR==2 {print \$5}' | sed 's/%//'" 2>/dev/null)
end_time=$(date +%s%3N 2>/dev/null || date +%s)
duration=$(( end_time - start_time ))

if [ -n "$disk_usage" ] && [ "$disk_usage" -lt 80 ]; then
    log_test "disk_usage_VMI01" "PASS" "Disk usage at ${disk_usage}%" $duration
elif [ -n "$disk_usage" ]; then
    log_test "disk_usage_VMI01" "FAIL" "High disk usage: ${disk_usage}%" $duration
else
    log_test "disk_usage_VMI01" "FAIL" "Could not check disk usage" $duration
fi

# Close JSON report
echo "" >> "$REPORT_FILE"
echo '  ],' >> "$REPORT_FILE"
echo '  "summary": {' >> "$REPORT_FILE"
echo '    "total": '$TESTS_RUN',' >> "$REPORT_FILE"
echo '    "passed": '$PASS_COUNT',' >> "$REPORT_FILE"
echo '    "failed": '$FAIL_COUNT',' >> "$REPORT_FILE"

if [ $TESTS_RUN -gt 0 ]; then
    SUCCESS_RATE=$(( PASS_COUNT * 100 / TESTS_RUN ))
else
    SUCCESS_RATE=0
fi

echo '    "success_rate": '$SUCCESS_RATE'
  }
}' >> "$REPORT_FILE"

# Print summary
echo ""
echo "======================================"
echo "Infrastructure Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo "Success Rate: ${SUCCESS_RATE}%"
echo ""
echo "Detailed report saved to: $REPORT_FILE"