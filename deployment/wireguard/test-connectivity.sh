#!/bin/bash
# WireGuard VPN Connectivity Test Script
# Tests all tunnels between all VMs

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== WireGuard VPN Connectivity Test ===${NC}"

# Configuration
VMI01="46.250.243.123"
VMI02D="46.250.241.70"
VMI03="154.26.158.31"
PASSWORD="C0nnaught"

# Test function
test_tunnel() {
    local source_ip=$1
    local source_name=$2
    local target_ip=$3
    local target_name=$4
    local tunnel=$5

    result=$(sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$source_ip \
        "ping -c 1 -W 2 $target_ip 2>&1" || echo "FAILED")

    if echo "$result" | grep -q "1 received"; then
        echo -e "${GREEN}✓${NC} $source_name -> $target_name ($target_ip)"
        return 0
    else
        echo -e "${RED}✗${NC} $source_name -> $target_name ($target_ip)"
        return 1
    fi
}

# Check WireGuard status on each VM
echo -e "\n${YELLOW}Checking WireGuard status on all VMs...${NC}"

echo -e "\n${BLUE}VMI01 WireGuard Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI01 "wg show"

echo -e "\n${BLUE}VMI02D WireGuard Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI02D "wg show"

echo -e "\n${BLUE}VMI03 WireGuard Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI03 "wg show"

# Test ROOT tunnel (10.0.50.0/24)
echo -e "\n${YELLOW}Testing ROOT tunnel (10.0.50.0/24)...${NC}"
test_tunnel $VMI01 "VMI01" "10.0.50.2" "VMI02D" "ROOT"
test_tunnel $VMI01 "VMI01" "10.0.50.3" "VMI03" "ROOT"
test_tunnel $VMI02D "VMI02D" "10.0.50.1" "VMI01" "ROOT"
test_tunnel $VMI02D "VMI02D" "10.0.50.3" "VMI03" "ROOT"
test_tunnel $VMI03 "VMI03" "10.0.50.1" "VMI01" "ROOT"
test_tunnel $VMI03 "VMI03" "10.0.50.2" "VMI02D" "ROOT"

# Test MCP tunnel (10.0.51.0/24)
echo -e "\n${YELLOW}Testing MCP tunnel (10.0.51.0/24)...${NC}"
test_tunnel $VMI01 "VMI01" "10.0.51.2" "VMI02D" "MCP"
test_tunnel $VMI01 "VMI01" "10.0.51.3" "VMI03" "MCP"
test_tunnel $VMI02D "VMI02D" "10.0.51.1" "VMI01" "MCP"
test_tunnel $VMI02D "VMI02D" "10.0.51.3" "VMI03" "MCP"
test_tunnel $VMI03 "VMI03" "10.0.51.1" "VMI01" "MCP"
test_tunnel $VMI03 "VMI03" "10.0.51.2" "VMI02D" "MCP"

# Test RED tunnel (10.0.52.0/24)
echo -e "\n${YELLOW}Testing RED tunnel (10.0.52.0/24)...${NC}"
test_tunnel $VMI01 "VMI01" "10.0.52.2" "VMI02D" "RED"
test_tunnel $VMI01 "VMI01" "10.0.52.3" "VMI03" "RED"
test_tunnel $VMI02D "VMI02D" "10.0.52.1" "VMI01" "RED"
test_tunnel $VMI02D "VMI02D" "10.0.52.3" "VMI03" "RED"
test_tunnel $VMI03 "VMI03" "10.0.52.1" "VMI01" "RED"
test_tunnel $VMI03 "VMI03" "10.0.52.2" "VMI02D" "RED"

# Check firewall status
echo -e "\n${YELLOW}Checking firewall status...${NC}"

echo -e "\n${BLUE}VMI01 Firewall Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI01 "ufw status numbered | head -20"

echo -e "\n${BLUE}VMI02D Firewall Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI02D "ufw status numbered | head -20"

echo -e "\n${BLUE}VMI03 Firewall Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI03 "ufw status numbered | head -20"

# Check fail2ban status
echo -e "\n${YELLOW}Checking fail2ban status...${NC}"

echo -e "\n${BLUE}VMI01 fail2ban Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI01 "fail2ban-client status"

echo -e "\n${BLUE}VMI02D fail2ban Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI02D "fail2ban-client status"

echo -e "\n${BLUE}VMI03 fail2ban Status:${NC}"
sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no root@$VMI03 "fail2ban-client status"

echo -e "\n${GREEN}=== Connectivity Test Complete ===${NC}"