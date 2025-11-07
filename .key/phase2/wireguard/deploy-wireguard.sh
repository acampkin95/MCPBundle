#!/bin/bash
# WireGuard Deployment Script for VMI03
# This script sets up all three WireGuard tunnels with key generation and QR codes

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}WireGuard Multi-Tunnel Deployment${NC}"
echo -e "${GREEN}VMI03 Security Gateway${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   exit 1
fi

# Install WireGuard
echo -e "${YELLOW}Installing WireGuard...${NC}"
apt-get update
apt-get install -y wireguard wireguard-tools qrencode iptables-persistent

# Enable IP forwarding
echo -e "${YELLOW}Enabling IP forwarding...${NC}"
echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
echo "net.ipv6.conf.all.forwarding=1" >> /etc/sysctl.conf
sysctl -p

# Create directory structure
mkdir -p /etc/wireguard/keys/{root,mcp,red}
mkdir -p /etc/wireguard/clients
chmod 700 /etc/wireguard/keys

# Function to generate key pair
generate_keypair() {
    local tunnel=$1
    local device=$2
    local keydir="/etc/wireguard/keys/${tunnel}"

    echo -e "${YELLOW}Generating keys for ${tunnel}/${device}...${NC}"

    if [[ "$device" == "server" ]]; then
        wg genkey | tee "${keydir}/server.key" | wg pubkey > "${keydir}/server.pub"
        chmod 600 "${keydir}/server.key"
    else
        wg genkey | tee "${keydir}/${device}.key" | wg pubkey > "${keydir}/${device}.pub"
        wg genpsk > "${keydir}/${device}.psk"
        chmod 600 "${keydir}/${device}.key" "${keydir}/${device}.psk"
    fi
}

# Generate server keys for all tunnels
echo -e "${GREEN}Generating server keys...${NC}"
generate_keypair "root" "server"
generate_keypair "mcp" "server"
generate_keypair "red" "server"

# Generate client keys for Root tunnel
echo -e "${GREEN}Generating Root tunnel client keys...${NC}"
generate_keypair "root" "macbook"
generate_keypair "root" "mobile"

# Generate client keys for MCP tunnel
echo -e "${GREEN}Generating MCP tunnel client keys...${NC}"
generate_keypair "mcp" "agent1"
generate_keypair "mcp" "agent2"
generate_keypair "mcp" "dev"

# Generate client keys for Red tunnel
echo -e "${GREEN}Generating Red tunnel client keys...${NC}"
generate_keypair "red" "guest1"
generate_keypair "red" "guest2"
generate_keypair "red" "guest3"

# Function to replace placeholders in config
configure_file() {
    local config=$1
    local tunnel=$2
    local device=$3

    local keydir="/etc/wireguard/keys/${tunnel}"

    if [[ "$device" == "server" ]]; then
        local server_key=$(cat "${keydir}/server.key")
        sed -i "s|REPLACE_WITH_SERVER_PRIVATE_KEY|${server_key}|g" "$config"

        # Replace all client public keys and PSKs
        for client_key in "${keydir}"/*.pub; do
            if [[ "$client_key" != *"server.pub" ]]; then
                local client=$(basename "$client_key" .pub)
                local pub_key=$(cat "$client_key")
                local psk=$(cat "${keydir}/${client}.psk")

                # This is a simplified replacement - manual editing may be needed
                sed -i "0,/REPLACE_WITH_.*_PUBLIC_KEY/{s|REPLACE_WITH_.*_PUBLIC_KEY|${pub_key}|}" "$config"
                sed -i "0,/REPLACE_WITH_.*_PSK/{s|REPLACE_WITH_.*_PSK|${psk}|}" "$config"
            fi
        done
    else
        local client_key=$(cat "${keydir}/${device}.key")
        local server_pub=$(cat "${keydir}/../${tunnel}/server.pub" 2>/dev/null || cat "${keydir}/server.pub")
        local psk=$(cat "${keydir}/${device}.psk")

        sed -i "s|REPLACE_WITH_CLIENT_PRIVATE_KEY|${client_key}|g" "$config"
        sed -i "s|REPLACE_WITH_SERVER_PUBLIC_KEY|${server_pub}|g" "$config"
        sed -i "s|REPLACE_WITH_PSK|${psk}|g" "$config"
    fi
}

# Copy and configure server configs
echo -e "${GREEN}Configuring server tunnels...${NC}"
for tunnel in root mcp red; do
    echo -e "${YELLOW}Configuring wg-${tunnel}...${NC}"
    cp "server-configs/wg-${tunnel}.conf" "/etc/wireguard/wg-${tunnel}.conf"
    chmod 600 "/etc/wireguard/wg-${tunnel}.conf"
    configure_file "/etc/wireguard/wg-${tunnel}.conf" "$tunnel" "server"
done

# Generate client configurations
echo -e "${GREEN}Generating client configurations...${NC}"

# Root tunnel clients
for client in macbook mobile; do
    cp "client-configs/root-tunnel-${client}.conf" "/etc/wireguard/clients/root-${client}.conf"
    configure_file "/etc/wireguard/clients/root-${client}.conf" "root" "$client"
done

# MCP tunnel clients
for client in agent1 agent2 dev; do
    cp "client-configs/mcp-tunnel-agent.conf" "/etc/wireguard/clients/mcp-${client}.conf"
    configure_file "/etc/wireguard/clients/mcp-${client}.conf" "mcp" "$client"
    # Update IP address
    sed -i "s|10.101.0.10|10.101.0.$((10 + ${client//[!0-9]/}))|g" "/etc/wireguard/clients/mcp-${client}.conf"
done

# Red tunnel clients
for i in 1 2 3; do
    cp "client-configs/red-tunnel-guest.conf" "/etc/wireguard/clients/red-guest${i}.conf"
    configure_file "/etc/wireguard/clients/red-guest${i}.conf" "red" "guest${i}"
    sed -i "s|10.102.0.10|10.102.0.$((9 + i))|g" "/etc/wireguard/clients/red-guest${i}.conf"
done

# Generate QR codes for mobile clients
echo -e "${GREEN}Generating QR codes for mobile enrollment...${NC}"
qrencode -t PNG -o /etc/wireguard/clients/root-mobile-qr.png < /etc/wireguard/clients/root-mobile.conf
qrencode -t PNG -o /etc/wireguard/clients/red-guest1-qr.png < /etc/wireguard/clients/red-guest1.conf

echo -e "${GREEN}QR codes generated:${NC}"
echo "  - /etc/wireguard/clients/root-mobile-qr.png"
echo "  - /etc/wireguard/clients/red-guest1-qr.png"

# Enable and start WireGuard services
echo -e "${GREEN}Enabling WireGuard services...${NC}"
for tunnel in root mcp red; do
    systemctl enable wg-quick@wg-${tunnel}
    systemctl start wg-quick@wg-${tunnel}
    echo -e "${GREEN}Started wg-${tunnel}${NC}"
done

# Save iptables rules
echo -e "${YELLOW}Saving iptables rules...${NC}"
iptables-save > /etc/iptables/rules.v4
ip6tables-save > /etc/iptables/rules.v6

# Display status
echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}WireGuard Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo -e "${YELLOW}Tunnel Status:${NC}"
for tunnel in root mcp red; do
    systemctl status wg-quick@wg-${tunnel} --no-pager | grep Active
done
echo
echo -e "${YELLOW}Interface Status:${NC}"
wg show all
echo
echo -e "${GREEN}Client configurations available in: /etc/wireguard/clients/${NC}"
echo -e "${GREEN}Download these files securely and import to WireGuard clients${NC}"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Copy client configs to devices securely (use SCP/SFTP)"
echo "2. Scan QR codes with WireGuard mobile app"
echo "3. Test connectivity from each client"
echo "4. Review logs: journalctl -u wg-quick@wg-root -f"
echo
