#!/bin/bash
# WireGuard VPN Mesh Network Setup Script
# Direct execution script for immediate deployment

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== WireGuard VPN Mesh Network Setup ===${NC}"
echo -e "${YELLOW}Starting infrastructure security configuration...${NC}\n"

# Configuration
VMI01="46.250.243.123"
VMI02D="46.250.241.70"
VMI03="154.26.158.31"
PASSWORD="${PASSWORD:-${MCP_ROOT_PASSWORD:-}}"

if [[ -z "${PASSWORD:-}" ]]; then
  echo "Set PASSWORD or MCP_ROOT_PASSWORD from Vault before running." >&2
  exit 1
fi

# Create local directories
mkdir -p /Users/alex/Projects/MCP\ Bundle/deployment/wireguard/{configs,keys,scripts}

# Phase 1: Install WireGuard on all VMs
echo -e "${BLUE}Phase 1: Installing WireGuard on all VMs${NC}"

echo -e "${YELLOW}Installing on VMI01...${NC}"
SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01 << 'EOF'
apt-get update
apt-get install -y wireguard wireguard-tools qrencode ufw fail2ban
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p
mkdir -p /etc/wireguard/keys/{root,mcp,red}
EOF
echo -e "${GREEN}✓ WireGuard installed on VMI01${NC}"

echo -e "${YELLOW}Installing on VMI02D...${NC}"
SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI02D << 'EOF'
apt-get update
apt-get install -y wireguard wireguard-tools qrencode ufw fail2ban
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p
mkdir -p /etc/wireguard/keys/{root,mcp,red}
EOF
echo -e "${GREEN}✓ WireGuard installed on VMI02D${NC}"

echo -e "${YELLOW}Installing on VMI03...${NC}"
SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI03 << 'EOF'
apt-get update
apt-get install -y wireguard wireguard-tools qrencode ufw fail2ban
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
sysctl -p
mkdir -p /etc/wireguard/keys/{root,mcp,red}
EOF
echo -e "${GREEN}✓ WireGuard installed on VMI03${NC}"

# Phase 2: Generate keys for all VMs and tunnels
echo -e "\n${BLUE}Phase 2: Generating WireGuard keypairs${NC}"

# Generate keys for VMI01
echo -e "${YELLOW}Generating keys for VMI01...${NC}"
for tunnel in root mcp red; do
    mkdir -p /Users/alex/Projects/MCP\ Bundle/deployment/wireguard/keys/VMI01/$tunnel

    # Generate keys on remote server
    PRIVATE_KEY=$(SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01 "wg genkey")
    PUBLIC_KEY=$(echo "$PRIVATE_KEY" | SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01 "wg pubkey")

    # Save keys locally
    echo "$PRIVATE_KEY" > "/Users/alex/Projects/MCP Bundle/deployment/wireguard/keys/VMI01/$tunnel/private.key"
    echo "$PUBLIC_KEY" > "/Users/alex/Projects/MCP Bundle/deployment/wireguard/keys/VMI01/$tunnel/public.key"

    # Save keys on server
    SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI01 << EOF
echo "$PRIVATE_KEY" > /etc/wireguard/keys/$tunnel/private.key
echo "$PUBLIC_KEY" > /etc/wireguard/keys/$tunnel/public.key
chmod 600 /etc/wireguard/keys/$tunnel/private.key
EOF

    echo -e "${GREEN}✓ Keys generated for VMI01 - $tunnel tunnel${NC}"
done

# Generate keys for VMI02D
echo -e "${YELLOW}Generating keys for VMI02D...${NC}"
for tunnel in root mcp red; do
    mkdir -p /Users/alex/Projects/MCP\ Bundle/deployment/wireguard/keys/VMI02D/$tunnel

    PRIVATE_KEY=$(SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI02D "wg genkey")
    PUBLIC_KEY=$(echo "$PRIVATE_KEY" | SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI02D "wg pubkey")

    echo "$PRIVATE_KEY" > "/Users/alex/Projects/MCP Bundle/deployment/wireguard/keys/VMI02D/$tunnel/private.key"
    echo "$PUBLIC_KEY" > "/Users/alex/Projects/MCP Bundle/deployment/wireguard/keys/VMI02D/$tunnel/public.key"

    SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI02D << EOF
echo "$PRIVATE_KEY" > /etc/wireguard/keys/$tunnel/private.key
echo "$PUBLIC_KEY" > /etc/wireguard/keys/$tunnel/public.key
chmod 600 /etc/wireguard/keys/$tunnel/private.key
EOF

    echo -e "${GREEN}✓ Keys generated for VMI02D - $tunnel tunnel${NC}"
done

# Generate keys for VMI03
echo -e "${YELLOW}Generating keys for VMI03...${NC}"
for tunnel in root mcp red; do
    mkdir -p /Users/alex/Projects/MCP\ Bundle/deployment/wireguard/keys/VMI03/$tunnel

    PRIVATE_KEY=$(SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI03 "wg genkey")
    PUBLIC_KEY=$(echo "$PRIVATE_KEY" | SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI03 "wg pubkey")

    echo "$PRIVATE_KEY" > "/Users/alex/Projects/MCP Bundle/deployment/wireguard/keys/VMI03/$tunnel/private.key"
    echo "$PUBLIC_KEY" > "/Users/alex/Projects/MCP Bundle/deployment/wireguard/keys/VMI03/$tunnel/public.key"

    SSHPASS="$PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no root@$VMI03 << EOF
echo "$PRIVATE_KEY" > /etc/wireguard/keys/$tunnel/private.key
echo "$PUBLIC_KEY" > /etc/wireguard/keys/$tunnel/public.key
chmod 600 /etc/wireguard/keys/$tunnel/private.key
EOF

    echo -e "${GREEN}✓ Keys generated for VMI03 - $tunnel tunnel${NC}"
done

echo -e "\n${GREEN}✓ All keypairs generated and stored${NC}"
echo -e "${YELLOW}Keys saved to: /Users/alex/Projects/MCP Bundle/deployment/wireguard/keys/${NC}"
