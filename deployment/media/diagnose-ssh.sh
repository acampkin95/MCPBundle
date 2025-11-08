#!/bin/bash

# SSH Connectivity Diagnostic Script
# Diagnoses SSH connectivity issues to VMI servers
# Version: 1.0.0
# Date: November 8, 2025

set -uo pipefail

# Server Configuration
declare -A SERVERS
SERVERS[VMI01]="46.250.243.123"
SERVERS[VMI02D]="46.250.241.70"
SERVERS[VMI03]="154.26.158.31"

declare -A INTERNAL_IPS
INTERNAL_IPS[VMI01]="10.0.0.1"
INTERNAL_IPS[VMI02D]="10.0.0.2"
INTERNAL_IPS[VMI03]="10.0.0.3"

declare -A SSH_KEYS
SSH_KEYS[VMI01]="ssh-keys/vmi01-acdev-vmi01-id_ed25519"
SSH_KEYS[VMI02D]="ssh-keys/vmi02-acdev-vmi02-id_ed25519"
SSH_KEYS[VMI03]="ssh-keys/vmi03-acdev-vmi03-id_ed25519"

declare -A DOMAINS
DOMAINS[VMI01]="acdev.host"
DOMAINS[VMI02D]="data.acdev.host"
DOMAINS[VMI03]="auth.acdev.host"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Functions
log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
section() { echo -e "\n${CYAN}════ $1 ════${NC}\n"; }

pass_test() {
    echo -e "  ${GREEN}✓${NC} $1"
    ((TOTAL_TESTS++))
    ((PASSED_TESTS++))
}

fail_test() {
    echo -e "  ${RED}✗${NC} $1"
    ((TOTAL_TESTS++))
    ((FAILED_TESTS++))
}

# Display banner
display_banner() {
    clear
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║          SSH CONNECTIVITY DIAGNOSTIC TOOL              ║"
    echo "║                                                        ║"
    echo "║  Diagnosing connections to VMI01, VMI02D, VMI03       ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
}

# Get public IP
get_public_ip() {
    section "Checking Your Public IP"

    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || \
                curl -s icanhazip.com 2>/dev/null || \
                curl -s ipinfo.io/ip 2>/dev/null || \
                echo "Unknown")

    if [ "$PUBLIC_IP" != "Unknown" ]; then
        log "Your public IP: $PUBLIC_IP"
        info "Make sure this IP is whitelisted in the server's firewall"
    else
        warning "Could not determine public IP"
    fi
}

# Test network connectivity
test_network() {
    section "Testing Network Connectivity"

    for name in "${!SERVERS[@]}"; do
        ip="${SERVERS[$name]}"
        echo -e "\n${BLUE}Testing $name ($ip)${NC}"

        # ICMP ping test
        if ping -c 2 -W 2 "$ip" >/dev/null 2>&1; then
            pass_test "ICMP ping successful"
        else
            fail_test "ICMP ping failed (may be blocked)"
        fi

        # DNS resolution
        domain="${DOMAINS[$name]}"
        if nslookup "$domain" >/dev/null 2>&1; then
            resolved_ip=$(nslookup "$domain" 2>/dev/null | grep -A1 "Name:" | grep "Address:" | tail -1 | awk '{print $2}')
            if [ "$resolved_ip" == "$ip" ]; then
                pass_test "DNS resolution correct: $domain → $ip"
            else
                warning "  DNS resolution mismatch: $domain → $resolved_ip (expected $ip)"
            fi
        else
            fail_test "DNS resolution failed for $domain"
        fi

        # TCP port 22 test
        echo -n "  Testing SSH port 22... "
        if timeout 5 nc -zv "$ip" 22 >/dev/null 2>&1; then
            echo -e "${GREEN}open${NC}"
            pass_test "SSH port 22 is open"
        else
            echo -e "${RED}closed/filtered${NC}"
            fail_test "SSH port 22 is not accessible"
        fi

        # Alternative ports
        for port in 2222 22022; do
            if timeout 2 nc -zv "$ip" "$port" >/dev/null 2>&1; then
                info "  Alternative SSH port $port is open"
            fi
        done
    done
}

# Test SSH keys
test_ssh_keys() {
    section "Testing SSH Keys"

    for name in "${!SSH_KEYS[@]}"; do
        key="${SSH_KEYS[$name]}"
        echo -e "\n${BLUE}Checking $name SSH key${NC}"

        if [ -f "$key" ]; then
            pass_test "Key file exists: $key"

            # Check permissions
            perms=$(stat -f %A "$key" 2>/dev/null || stat -c %a "$key" 2>/dev/null)
            if [ "$perms" == "600" ]; then
                pass_test "Key permissions correct (600)"
            else
                warning "  Key permissions are $perms (should be 600)"
                echo "    Fix with: chmod 600 $key"
            fi

            # Check key type
            key_type=$(ssh-keygen -l -f "$key" 2>/dev/null | awk '{print $4}')
            if [ -n "$key_type" ]; then
                info "  Key type: $key_type"
            fi
        else
            fail_test "Key file not found: $key"
        fi
    done

    # Check SSH config
    if [ -f ~/.ssh/config ]; then
        echo -e "\n${BLUE}SSH Config${NC}"
        pass_test "SSH config file exists"

        for name in "${!SERVERS[@]}"; do
            if grep -q "acdev-${name,,}" ~/.ssh/config 2>/dev/null; then
                info "  Host acdev-${name,,} is configured"
            fi
        done
    else
        warning "No SSH config file found at ~/.ssh/config"
    fi
}

# Test SSH authentication
test_ssh_auth() {
    section "Testing SSH Authentication"

    for name in "${!SERVERS[@]}"; do
        ip="${SERVERS[$name]}"
        key="${SSH_KEYS[$name]}"

        echo -e "\n${BLUE}Testing SSH to $name ($ip)${NC}"

        if [ ! -f "$key" ]; then
            fail_test "Cannot test - key file missing"
            continue
        fi

        # Test direct connection
        if timeout 10 ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=5 \
            -o StrictHostKeyChecking=no "root@$ip" "echo 'Connection successful'" >/dev/null 2>&1; then
            pass_test "Direct SSH connection successful"
        else
            fail_test "Direct SSH connection failed"

            # Get detailed error
            error_msg=$(timeout 10 ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=5 \
                -o StrictHostKeyChecking=no -v "root@$ip" "exit" 2>&1 | \
                grep -E "Permission denied|Connection refused|Connection timed out|No route to host" | head -1)

            if [ -n "$error_msg" ]; then
                info "  Error: $error_msg"
            fi
        fi
    done
}

# Test jump host connections
test_jump_hosts() {
    section "Testing Jump Host Connections"

    echo -e "${BLUE}Testing connections via jump hosts${NC}\n"

    # Test VMI02D via VMI01
    echo "Testing VMI02D via VMI01..."
    if timeout 15 ssh -i "${SSH_KEYS[VMI01]}" -o BatchMode=yes -o ConnectTimeout=5 \
        -o StrictHostKeyChecking=no -o ProxyCommand="ssh -i ${SSH_KEYS[VMI01]} -W %h:%p root@${SERVERS[VMI01]}" \
        "root@${INTERNAL_IPS[VMI02D]}" "echo 'Success'" >/dev/null 2>&1; then
        pass_test "Can reach VMI02D via VMI01 jump host"
    else
        fail_test "Cannot reach VMI02D via VMI01"
    fi

    # Test VMI02D via VMI03
    echo "Testing VMI02D via VMI03..."
    if timeout 15 ssh -i "${SSH_KEYS[VMI03]}" -o BatchMode=yes -o ConnectTimeout=5 \
        -o StrictHostKeyChecking=no -o ProxyCommand="ssh -i ${SSH_KEYS[VMI03]} -W %h:%p root@${SERVERS[VMI03]}" \
        "root@${INTERNAL_IPS[VMI02D]}" "echo 'Success'" >/dev/null 2>&1; then
        pass_test "Can reach VMI02D via VMI03 jump host"
    else
        fail_test "Cannot reach VMI02D via VMI03"
    fi
}

# Check firewall status
check_firewall() {
    section "Checking Firewall/Fail2Ban Status"

    echo -e "${BLUE}Possible firewall issues:${NC}\n"

    # Check if IP might be blocked
    if [ "$PUBLIC_IP" != "Unknown" ]; then
        info "Your IP ($PUBLIC_IP) might be blocked by:"
        echo "  • UFW firewall rules"
        echo "  • Fail2Ban (after failed login attempts)"
        echo "  • CloudFlare security rules"
        echo "  • Provider-level DDoS protection"
    fi

    echo -e "\n${YELLOW}Known whitelisted IPs:${NC}"
    echo "  • 146.70.148.46 (Admin IP)"
    echo "  • 10.0.0.0/22 (Internal VPN network)"

    echo -e "\n${YELLOW}To request whitelisting:${NC}"
    echo "  1. Contact system administrator"
    echo "  2. Provide your public IP: $PUBLIC_IP"
    echo "  3. Specify which servers you need access to"
}

# Provide solutions
provide_solutions() {
    section "Recommended Solutions"

    if [ $FAILED_TESTS -gt 0 ]; then
        echo -e "${YELLOW}Based on the test results, try these solutions:${NC}\n"

        # Check for common issues
        if ! timeout 5 nc -zv "${SERVERS[VMI02D]}" 22 >/dev/null 2>&1; then
            echo -e "${BLUE}SSH Port Blocked:${NC}"
            echo "  1. Your IP might be blocked by firewall"
            echo "  2. Try accessing via VPN"
            echo "  3. Use a jump host (VMI01 or VMI03)"
            echo ""
        fi

        echo -e "${BLUE}Alternative Access Methods:${NC}"
        echo ""
        echo "1. Via Jump Host (if VMI01 is accessible):"
        echo "   ssh -i ${SSH_KEYS[VMI01]} -J root@${SERVERS[VMI01]} root@${INTERNAL_IPS[VMI02D]}"
        echo ""
        echo "2. Via SSH Config (add to ~/.ssh/config):"
        cat << EOF
   Host vmi02d-jump
       HostName ${INTERNAL_IPS[VMI02D]}
       User root
       ProxyJump root@${SERVERS[VMI01]}
       IdentityFile ${SSH_KEYS[VMI02D]}
EOF
        echo ""
        echo "3. Via SSH Tunnel:"
        echo "   # Create tunnel through VMI01"
        echo "   ssh -i ${SSH_KEYS[VMI01]} -L 2222:${INTERNAL_IPS[VMI02D]}:22 root@${SERVERS[VMI01]}"
        echo "   # Then connect locally"
        echo "   ssh -p 2222 root@localhost"
        echo ""
        echo "4. Via Console Access:"
        echo "   • Login to hosting provider panel"
        echo "   • Use KVM/VNC console"
        echo "   • Check and fix SSH/firewall settings"
    else
        echo -e "${GREEN}All tests passed! You should be able to connect directly.${NC}"
    fi
}

# Generate report
generate_report() {
    section "Diagnostic Report"

    echo "Test Results:"
    echo "  Total Tests: $TOTAL_TESTS"
    echo -e "  Passed: ${GREEN}$PASSED_TESTS${NC}"
    echo -e "  Failed: ${RED}$FAILED_TESTS${NC}"
    echo ""

    if [ $FAILED_TESTS -eq 0 ]; then
        echo -e "${GREEN}✓ All connectivity tests passed${NC}"
        echo ""
        echo "You should be able to connect using:"
        for name in "${!SERVERS[@]}"; do
            echo "  ssh -i ${SSH_KEYS[$name]} root@${SERVERS[$name]}"
        done
    else
        echo -e "${YELLOW}⚠ Some connectivity issues detected${NC}"
        echo ""
        echo "Review the solutions above and try alternative access methods."
    fi

    # Save report
    REPORT_FILE="ssh-diagnostic-$(date +%Y%m%d-%H%M%S).log"
    {
        echo "SSH Connectivity Diagnostic Report"
        echo "Generated: $(date)"
        echo "Public IP: $PUBLIC_IP"
        echo ""
        echo "Test Summary:"
        echo "  Total: $TOTAL_TESTS"
        echo "  Passed: $PASSED_TESTS"
        echo "  Failed: $FAILED_TESTS"
    } > "$REPORT_FILE"

    echo ""
    info "Report saved to: $REPORT_FILE"
}

# Quick test mode
quick_test() {
    echo -e "${CYAN}Running quick connectivity test...${NC}\n"

    for name in "${!SERVERS[@]}"; do
        ip="${SERVERS[$name]}"
        echo -n "$name ($ip): "

        if ping -c 1 -W 1 "$ip" >/dev/null 2>&1; then
            echo -n "ping ✓ "
        else
            echo -n "ping ✗ "
        fi

        if timeout 2 nc -zv "$ip" 22 >/dev/null 2>&1; then
            echo -n "ssh ✓ "
        else
            echo -n "ssh ✗ "
        fi

        key="${SSH_KEYS[$name]}"
        if [ -f "$key" ]; then
            if timeout 5 ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=3 \
                "root@$ip" "exit" >/dev/null 2>&1; then
                echo -e "${GREEN}connected${NC}"
            else
                echo -e "${RED}auth failed${NC}"
            fi
        else
            echo -e "${YELLOW}no key${NC}"
        fi
    done
}

# Main execution
main() {
    display_banner

    # Get public IP
    get_public_ip

    # Run tests
    test_network
    test_ssh_keys
    test_ssh_auth
    test_jump_hosts

    # Check firewall
    check_firewall

    # Provide solutions
    provide_solutions

    # Generate report
    generate_report
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick|-q)
            quick_test
            exit 0
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "SSH Connectivity Diagnostic Tool"
            echo ""
            echo "Options:"
            echo "  --quick, -q    Run quick connectivity test"
            echo "  --help, -h     Show this help message"
            echo ""
            echo "This tool diagnoses SSH connectivity issues to VMI servers and"
            echo "provides solutions for common problems."
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main diagnostic
main "$@"