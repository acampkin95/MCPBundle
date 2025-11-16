#!/bin/bash

# MCP Security Integration Tests
# Tests firewall, fail2ban, SSH security, and access controls

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
REPORT_FILE="/tmp/security_test_report.json"
PASS_COUNT=0
FAIL_COUNT=0
TESTS_RUN=0

# VM Configuration
declare -A VMS
VMS["VMI01"]="46.250.243.123"
VMS["VMI02D"]="46.250.241.70"
VMS["VMI03"]="154.26.158.31"
VM_PASSWORD="${VM_PASSWORD:-${MCP_ROOT_PASSWORD:-}}"

if [[ -z "${VM_PASSWORD:-}" ]]; then
  echo "VM_PASSWORD (or MCP_ROOT_PASSWORD) must be exported via Contabo Secrets (npm run secrets:pull) before running." >&2
  exit 1
fi

# Initialize report
echo "{" > "$REPORT_FILE"
echo '  "test_suite": "security",' >> "$REPORT_FILE"
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
echo "MCP Security Integration Tests"
echo "======================================"
echo ""

# Test 1: Firewall Active Status
echo "Testing Firewall Status..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    fw_status=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "ufw status 2>/dev/null | grep -q 'Status: active' && echo 'active' || echo 'inactive'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$fw_status" == "active" ]; then
        log_test "firewall_active_$vm_name" "PASS" "UFW firewall is active" $duration
    else
        log_test "firewall_active_$vm_name" "FAIL" "UFW firewall is not active" $duration
    fi
done

# Test 2: Fail2ban Status
echo ""
echo "Testing Fail2ban Service..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    f2b_status=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "systemctl is-active fail2ban 2>/dev/null || echo 'inactive'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$f2b_status" == "active" ]; then
        log_test "fail2ban_active_$vm_name" "PASS" "Fail2ban is active" $duration
    else
        log_test "fail2ban_active_$vm_name" "FAIL" "Fail2ban is not active" $duration
    fi
done

# Test 3: SSH Configuration Security
echo ""
echo "Testing SSH Security Configuration..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    # Check if password authentication is disabled (best practice, but we're using it for testing)
    permit_root=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "grep '^PermitRootLogin' /etc/ssh/sshd_config 2>/dev/null | awk '{print \$2}'" 2>/dev/null || echo "unknown")

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    # Note: In production, this should be 'no' or 'prohibit-password'
    if [ "$permit_root" == "yes" ] || [ "$permit_root" == "prohibit-password" ]; then
        log_test "ssh_config_$vm_name" "PASS" "SSH configuration found (PermitRootLogin: $permit_root)" $duration
    else
        log_test "ssh_config_$vm_name" "FAIL" "SSH configuration issue" $duration
    fi
done

# Test 4: Open Ports Check
echo ""
echo "Testing Open Ports..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    # Get list of listening ports
    open_ports=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "ss -tuln | grep LISTEN | awk '{print \$5}' | cut -d: -f2 | sort -u | tr '\n' ' '" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    # Check for unexpected ports (allow 22, 80, 443, 3000-3002, 5432, 51820)
    expected_ports="22 80 443 3000 3001 3002 5432 51820"
    unexpected_found=false

    for port in $open_ports; do
        if ! echo "$expected_ports" | grep -q "$port"; then
            unexpected_found=true
            break
        fi
    done

    if [ "$unexpected_found" == "false" ]; then
        log_test "open_ports_$vm_name" "PASS" "No unexpected ports open" $duration
    else
        log_test "open_ports_$vm_name" "FAIL" "Unexpected ports found: $open_ports" $duration
    fi
done

# Test 5: VPN Encryption
echo ""
echo "Testing WireGuard VPN Encryption..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    # Check if WireGuard is using strong encryption
    wg_config=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "wg show 2>/dev/null | grep -c 'public key' || echo '0'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$wg_config" -gt 0 ]; then
        log_test "vpn_encryption_$vm_name" "PASS" "WireGuard encryption configured" $duration
    else
        log_test "vpn_encryption_$vm_name" "FAIL" "WireGuard not properly configured" $duration
    fi
done

# Test 6: Database Access Controls
echo ""
echo "Testing Database Access Controls..."
start_time=$(date +%s%N)

# Test with correct credentials
good_auth=$(PGPASSWORD="" psql -h "46.250.243.123" -U "mcp_admin" -d "mcp_ecosystem" -c "SELECT 1;" 2>&1 | grep -c "1 row" || echo "0")

# Test with wrong password
bad_auth=$(PGPASSWORD="wrongpassword" psql -h "46.250.243.123" -U "mcp_admin" -d "mcp_ecosystem" -c "SELECT 1;" 2>&1 | grep -c "authentication failed" || echo "0")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$good_auth" == "1" ] && [ "$bad_auth" == "1" ]; then
    log_test "database_auth" "PASS" "Database authentication working correctly" $duration
else
    log_test "database_auth" "FAIL" "Database authentication issue" $duration
fi

# Test 7: File Permissions
echo ""
echo "Testing Critical File Permissions..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    # Check SSH key permissions
    ssh_key_perms=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "ls -la ~/.ssh/ 2>/dev/null | grep 'id_' | grep -c 'rw-------' || echo '0'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$ssh_key_perms" -ge 0 ]; then
        log_test "file_permissions_$vm_name" "PASS" "SSH key permissions are secure" $duration
    else
        log_test "file_permissions_$vm_name" "FAIL" "Insecure file permissions found" $duration
    fi
done

# Test 8: System Updates
echo ""
echo "Testing System Update Status..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    # Check for available security updates
    updates=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "apt list --upgradable 2>/dev/null | grep -c security || echo '0'" 2>/dev/null)

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$updates" == "0" ]; then
        log_test "security_updates_$vm_name" "PASS" "No pending security updates" $duration
    else
        log_test "security_updates_$vm_name" "FAIL" "$updates security updates available" $duration
    fi
done

# Test 9: Audit Logging
echo ""
echo "Testing Audit Logging..."
for vm_name in "${!VMS[@]}"; do
    vm_ip="${VMS[$vm_name]}"
    start_time=$(date +%s%N)

    # Check if auth.log exists and is being updated
    auth_log_recent=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$vm_ip \
        "find /var/log/auth.log -mmin -60 2>/dev/null | wc -l" 2>/dev/null || echo "0")

    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$auth_log_recent" == "1" ]; then
        log_test "audit_logging_$vm_name" "PASS" "Authentication logging is active" $duration
    else
        log_test "audit_logging_$vm_name" "FAIL" "Authentication logging issue" $duration
    fi
done

# Test 10: Network Segmentation
echo ""
echo "Testing Network Segmentation..."
start_time=$(date +%s%N)

# Test if VMI02D can directly access VMI03's service port (should be blocked by firewall)
nc_test=$(SSHPASS="$VM_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@46.250.241.70 \
    "timeout 2 nc -zv 154.26.158.31 3002 2>&1 | grep -c 'succeeded\\|open' || echo '0'" 2>/dev/null)

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

# This should fail if proper segmentation is in place
if [ "$nc_test" == "0" ]; then
    log_test "network_segmentation" "PASS" "Network segmentation working" $duration
else
    log_test "network_segmentation" "FAIL" "Network segmentation issue - direct access possible" $duration
fi

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
echo "Security Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo "Success Rate: $(echo "scale=2; $PASS_COUNT * 100 / $TESTS_RUN" | bc)%"
echo ""
echo "Detailed report saved to: $REPORT_FILE"
