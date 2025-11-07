#!/bin/bash

# MCP Infrastructure Integration Tests
# Tests SSH connectivity, network latency, and basic infrastructure

set -e

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
declare -A VMS
VMS["VMI01"]="46.250.243.123"
VMS["VMI02D"]="46.250.241.70"
VMS["VMI03"]="154.26.158.31"
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

# Test 1: SSH Connectivity to all VMs
echo "Testing SSH Connectivity..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    if sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@$vm_ip "echo 'SSH OK'" > /dev/null 2>&1; then
        end_time=$(date +%s%N)
        duration=$(( (end_time - start_time) / 1000000 ))
        log_test "ssh_connectivity_$vm_name" "PASS" "SSH connection successful to $vm_ip" $duration
    else
        end_time=$(date +%s%N)
        duration=$(( (end_time - start_time) / 1000000 ))
        log_test "ssh_connectivity_$vm_name" "FAIL" "SSH connection failed to $vm_ip" $duration
    fi
done

# Test 2: Network Latency between VMs
echo ""
echo "Testing Inter-VM Network Latency..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"

    for target_name in "${!VMS[@]}"; do
        if [ "$vm_name" != "$target_name" ]; then
            target_ip="${VMS[$target_name]}"
            start_time=$(date +%s%N)

            avg_latency=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$vm_ip \
                "ping -c 5 -q $target_ip 2>/dev/null | grep 'avg' | awk -F'/' '{print \$5}'" 2>/dev/null || echo "error")

            end_time=$(date +%s%N)
            duration=$(( (end_time - start_time) / 1000000 ))

            if [ "$avg_latency" != "error" ] && [ -n "$avg_latency" ]; then
                log_test "network_latency_${vm_name}_to_${target_name}" "PASS" "Average latency: ${avg_latency}ms" $duration
            else
                log_test "network_latency_${vm_name}_to_${target_name}" "FAIL" "Could not measure latency" $duration
            fi
        fi
    done
done

# Test 3: DNS Resolution
echo ""
echo "Testing DNS Resolution..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    dns_result=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "nslookup google.com 2>&1 | grep -q 'Address:' && echo 'OK' || echo 'FAIL'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$dns_result" == "OK" ]; then
        log_test "dns_resolution_$vm_name" "PASS" "DNS resolution working on $vm_name" $duration
    else
        log_test "dns_resolution_$vm_name" "FAIL" "DNS resolution failed on $vm_name" $duration
    fi
done

# Test 4: WireGuard VPN Status
echo ""
echo "Testing WireGuard VPN Tunnels..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    wg_status=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "wg show 2>/dev/null | grep -c 'interface:' || echo '0'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$wg_status" -gt 0 ]; then
        log_test "wireguard_status_$vm_name" "PASS" "WireGuard interface active on $vm_name" $duration
    else
        log_test "wireguard_status_$vm_name" "FAIL" "WireGuard not active on $vm_name" $duration
    fi
done

# Test 5: Firewall Status
echo ""
echo "Testing Firewall Configuration..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    fw_status=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "ufw status 2>/dev/null | grep -q 'Status: active' && echo 'OK' || echo 'FAIL'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$fw_status" == "OK" ]; then
        log_test "firewall_status_$vm_name" "PASS" "Firewall active on $vm_name" $duration
    else
        log_test "firewall_status_$vm_name" "FAIL" "Firewall not active on $vm_name" $duration
    fi
done

# Test 6: System Resources
echo ""
echo "Testing System Resources..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    # Check disk usage
    disk_usage=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "df -h / | awk 'NR==2 {print \$5}' | sed 's/%//'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ -n "$disk_usage" ] && [ "$disk_usage" -lt 80 ]; then
        log_test "disk_usage_$vm_name" "PASS" "Disk usage at ${disk_usage}%" $duration
    elif [ -n "$disk_usage" ]; then
        log_test "disk_usage_$vm_name" "FAIL" "High disk usage: ${disk_usage}%" $duration
    else
        log_test "disk_usage_$vm_name" "FAIL" "Could not check disk usage" $duration
    fi

    # Check memory usage
    start_time=$(date +%s%N)
    mem_available=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "free -m | awk 'NR==2 {print \$7}'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ -n "$mem_available" ] && [ "$mem_available" -gt 500 ]; then
        log_test "memory_available_$vm_name" "PASS" "Available memory: ${mem_available}MB" $duration
    elif [ -n "$mem_available" ]; then
        log_test "memory_available_$vm_name" "FAIL" "Low memory: ${mem_available}MB available" $duration
    else
        log_test "memory_available_$vm_name" "FAIL" "Could not check memory" $duration
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
echo "Infrastructure Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo "Success Rate: $(echo "scale=2; $PASS_COUNT * 100 / $TESTS_RUN" | bc)%"
echo ""
echo "Detailed report saved to: $REPORT_FILE"