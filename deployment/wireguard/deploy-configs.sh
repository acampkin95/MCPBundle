#!/bin/bash
# WireGuard Configuration Deployment Script
# Deploys configurations and sets up security

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== WireGuard Configuration Deployment ===${NC}"

# Configuration
VMI01="46.250.243.123"
VMI02D="46.250.241.70"
VMI03="154.26.158.31"
PASSWORD="${VM_ROOT_PASSWORD:?Error: VM_ROOT_PASSWORD environment variable not set}"

BASE_DIR="/Users/alex/Projects/MCP Bundle/deployment/wireguard"
CONFIG_DIR="$BASE_DIR/configs"

# Deploy to VMI01
echo -e "\n${YELLOW}Deploying configurations to VMI01...${NC}"

for tunnel in root mcp red; do
    echo -e "Deploying $tunnel tunnel configuration..."

    # Copy configuration file
    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=accept-new \
        "$CONFIG_DIR/vmi01-wg-$tunnel.conf" \
        root@$VMI01:/etc/wireguard/wg-$tunnel.conf

    # Set permissions and start tunnel
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=accept-new root@$VMI01 << EOF
chmod 600 /etc/wireguard/wg-$tunnel.conf
systemctl stop wg-quick@wg-$tunnel 2>/dev/null || true
wg-quick up wg-$tunnel
systemctl enable wg-quick@wg-$tunnel
EOF

    echo -e "${GREEN}✓ $tunnel tunnel deployed and started${NC}"
done

# Deploy to VMI02D
echo -e "\n${YELLOW}Deploying configurations to VMI02D...${NC}"

for tunnel in root mcp red; do
    echo -e "Deploying $tunnel tunnel configuration..."

    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=accept-new \
        "$CONFIG_DIR/vmi02d-wg-$tunnel.conf" \
        root@$VMI02D:/etc/wireguard/wg-$tunnel.conf

    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=accept-new root@$VMI02D << EOF
chmod 600 /etc/wireguard/wg-$tunnel.conf
systemctl stop wg-quick@wg-$tunnel 2>/dev/null || true
wg-quick up wg-$tunnel
systemctl enable wg-quick@wg-$tunnel
EOF

    echo -e "${GREEN}✓ $tunnel tunnel deployed and started${NC}"
done

# Deploy to VMI03
echo -e "\n${YELLOW}Deploying configurations to VMI03...${NC}"

for tunnel in root mcp red; do
    echo -e "Deploying $tunnel tunnel configuration..."

    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=accept-new \
        "$CONFIG_DIR/vmi03-wg-$tunnel.conf" \
        root@$VMI03:/etc/wireguard/wg-$tunnel.conf

    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=accept-new root@$VMI03 << EOF
chmod 600 /etc/wireguard/wg-$tunnel.conf
systemctl stop wg-quick@wg-$tunnel 2>/dev/null || true
wg-quick up wg-$tunnel
systemctl enable wg-quick@wg-$tunnel
EOF

    echo -e "${GREEN}✓ $tunnel tunnel deployed and started${NC}"
done

# Configure UFW firewall on all VMs
echo -e "\n${BLUE}Configuring UFW firewall on all VMs${NC}"

configure_firewall() {
    local server=$1
    local name=$2

    echo -e "${YELLOW}Configuring firewall on $name...${NC}"

    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=accept-new root@$server << 'EOF'
# Reset UFW
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# CRITICAL: Allow SSH (DO NOT RESTRICT)
ufw allow 22/tcp comment "SSH - DO NOT REMOVE"

# Allow WireGuard ports
ufw allow 51820/udp comment "WireGuard ROOT tunnel"
ufw allow 51821/udp comment "WireGuard MCP tunnel"
ufw allow 51822/udp comment "WireGuard RED tunnel"

# Allow inter-VM communication on VPN subnets
ufw allow from 10.0.50.0/24 comment "ROOT VPN subnet"
ufw allow from 10.0.51.0/24 comment "MCP VPN subnet"
ufw allow from 10.0.52.0/24 comment "RED VPN subnet"

# Enable UFW
ufw --force enable

# Show status
ufw status numbered
EOF

    echo -e "${GREEN}✓ Firewall configured on $name${NC}"
}

configure_firewall $VMI01 "VMI01"
configure_firewall $VMI02D "VMI02D"
configure_firewall $VMI03 "VMI03"

# Configure fail2ban on all VMs
echo -e "\n${BLUE}Configuring fail2ban intrusion prevention${NC}"

configure_fail2ban() {
    local server=$1
    local name=$2

    echo -e "${YELLOW}Configuring fail2ban on $name...${NC}"

    # Create fail2ban configuration
    cat > /tmp/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = admin@local
action = %(action_mwl)s

[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200

[wireguard]
enabled = true
port = 51820,51821,51822
protocol = udp
filter = wireguard
logpath = /var/log/syslog
maxretry = 10
bantime = 3600
EOF

    # Create WireGuard filter
    cat > /tmp/wireguard.conf << 'EOF'
[Definition]
failregex = .*Invalid handshake initiation from <HOST>
            .*Failed to decrypt packet from <HOST>
            .*Packet with invalid MAC from <HOST>
ignoreregex =
EOF

    # Deploy configurations
    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=accept-new \
        /tmp/jail.local root@$server:/etc/fail2ban/jail.local

    sshpass -p "$PASSWORD" scp -o StrictHostKeyChecking=accept-new \
        /tmp/wireguard.conf root@$server:/etc/fail2ban/filter.d/wireguard.conf

    # Restart fail2ban
    sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=accept-new root@$server << EOF
systemctl restart fail2ban
systemctl enable fail2ban
fail2ban-client status
EOF

    echo -e "${GREEN}✓ fail2ban configured on $name${NC}"
}

configure_fail2ban $VMI01 "VMI01"
configure_fail2ban $VMI02D "VMI02D"
configure_fail2ban $VMI03 "VMI03"

# Clean up temp files
rm -f /tmp/jail.local /tmp/wireguard.conf

echo -e "\n${GREEN}=== Deployment Complete ===${NC}"
echo -e "All WireGuard tunnels are active and secured"