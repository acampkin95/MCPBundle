#!/bin/bash
################################################################################
# WireGuard Gateway Setup for VMI03
#
# Configures VMI03 as a WireGuard gateway for secure remote administration
# Allows external clients to access:
# - Private LAN (10.0.0.0/22) for VM management
# - MCP services on VMI01
# - Admin dashboard and monitoring on VMI03
#
# WireGuard Network: 10.0.100.0/24
# - 10.0.100.1: VMI03 (gateway)
# - 10.0.100.10-99: Admin clients
################################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[$(date +'%H:%M:%S')] ERROR:${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }

# Configuration
VMI03_IP="154.26.158.31"
VMI03_PRIVATE_IP="10.0.0.3"
SSH_KEY=".keys/mcp-deployment-ed25519"
WG_PORT="51820"
WG_NETWORK="10.0.100.0/24"
WG_SERVER_IP="10.0.100.1"
OUTPUT_DIR="deployment/wireguard-configs"

################################################################################
# Generate WireGuard Keys
################################################################################

generate_keys() {
    local name=$1
    local private_key=$(wg genkey)
    local public_key=$(echo "$private_key" | wg pubkey)
    local preshared_key=$(wg genpsk)

    echo "$private_key" > "$OUTPUT_DIR/${name}.private"
    echo "$public_key" > "$OUTPUT_DIR/${name}.public"
    echo "$preshared_key" > "$OUTPUT_DIR/${name}.preshared"

    chmod 600 "$OUTPUT_DIR/${name}".{private,preshared}

    log "Generated keys for: $name"
}

################################################################################
# PHASE 1: Setup WireGuard on VMI03
################################################################################

setup_wireguard_server() {
    log "=== Setting up WireGuard Server on VMI03 ==="

    # Generate server keys
    log "Generating WireGuard server keys..."
    mkdir -p "$OUTPUT_DIR"
    generate_keys "vmi03-server"

    SERVER_PRIVATE_KEY=$(cat "$OUTPUT_DIR/vmi03-server.private")
    SERVER_PUBLIC_KEY=$(cat "$OUTPUT_DIR/vmi03-server.public")

    # Create server configuration
    log "Creating WireGuard server configuration..."

    cat > "$OUTPUT_DIR/wg0.conf" << EOF
[Interface]
# VMI03 WireGuard Gateway
Address = $WG_SERVER_IP/24
ListenPort = $WG_PORT
PrivateKey = $SERVER_PRIVATE_KEY

# Packet forwarding and NAT
PostUp = sysctl -w net.ipv4.ip_forward=1
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# MTU optimization
MTU = 1420

# Clients will be added below...
EOF

    # Transfer configuration to VMI03
    log "Transferring WireGuard configuration to VMI03..."
    ssh -i "$SSH_KEY" "root@$VMI03_IP" bash << EOF
#!/bin/bash
set -euo pipefail

echo "[VMI03] Installing WireGuard..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq wireguard wireguard-tools

echo "[VMI03] Configuring WireGuard interface..."
mkdir -p /etc/wireguard
chmod 700 /etc/wireguard

# Create server config
cat > /etc/wireguard/wg0.conf << 'WG0'
$(cat "$OUTPUT_DIR/wg0.conf")
WG0

chmod 600 /etc/wireguard/wg0.conf

echo "[VMI03] Enabling IP forwarding..."
cat >> /etc/sysctl.d/99-wireguard.conf << 'SYSCTL'
net.ipv4.ip_forward = 1
net.ipv6.conf.all.forwarding = 1
SYSCTL

sysctl -p /etc/sysctl.d/99-wireguard.conf

echo "[VMI03] Configuring firewall rules..."
# Allow WireGuard port
ufw allow $WG_PORT/udp comment 'WireGuard'

# Allow forwarding from WireGuard to private LAN
iptables -A FORWARD -i wg0 -o eth0 -s $WG_NETWORK -d 10.0.0.0/22 -j ACCEPT
iptables -A FORWARD -i eth0 -o wg0 -s 10.0.0.0/22 -d $WG_NETWORK -m state --state RELATED,ESTABLISHED -j ACCEPT

echo "[VMI03] Starting WireGuard..."
systemctl enable wg-quick@wg0
systemctl start wg-quick@wg0

echo "[VMI03] WireGuard server configured and running ✓"
wg show
EOF

    log "WireGuard server installed on VMI03 ✓"
}

################################################################################
# PHASE 2: Generate Client Configurations
################################################################################

generate_client_config() {
    local client_name=$1
    local client_ip=$2
    local description=$3

    log "Generating client configuration: $client_name ($client_ip)"

    # Generate client keys
    generate_keys "$client_name"

    local CLIENT_PRIVATE_KEY=$(cat "$OUTPUT_DIR/${client_name}.private")
    local CLIENT_PUBLIC_KEY=$(cat "$OUTPUT_DIR/${client_name}.public")
    local PRESHARED_KEY=$(cat "$OUTPUT_DIR/${client_name}.preshared")
    local SERVER_PUBLIC_KEY=$(cat "$OUTPUT_DIR/vmi03-server.public")

    # Create client configuration file
    cat > "$OUTPUT_DIR/${client_name}.conf" << EOF
# WireGuard Client Configuration
# Name: $client_name
# Description: $description
# Generated: $(date)

[Interface]
# Client private key
PrivateKey = $CLIENT_PRIVATE_KEY

# Client IP address in WireGuard network
Address = $client_ip/24

# DNS servers (use VMI03 for internal DNS resolution)
DNS = 1.1.1.1, 8.8.8.8

# MTU optimization
MTU = 1420

[Peer]
# VMI03 WireGuard Gateway
PublicKey = $SERVER_PUBLIC_KEY
PresharedKey = $PRESHARED_KEY

# VMI03 public endpoint
Endpoint = $VMI03_IP:$WG_PORT

# Routes through VPN
# Private LAN: 10.0.0.0/22 (all 3 VMs)
# WireGuard network: 10.0.100.0/24
AllowedIPs = 10.0.0.0/22, 10.0.100.0/24

# Keep-alive (every 25 seconds)
PersistentKeepalive = 25
EOF

    # Add peer to server configuration
    cat >> "$OUTPUT_DIR/wg0.conf" << EOF

# $client_name - $description
[Peer]
PublicKey = $CLIENT_PUBLIC_KEY
PresharedKey = $PRESHARED_KEY
AllowedIPs = $client_ip/32
EOF

    log "Client configuration created: $OUTPUT_DIR/${client_name}.conf"
}

################################################################################
# PHASE 3: Create Client Configurations
################################################################################

create_client_configs() {
    log "=== Generating Client Configurations ==="

    # Admin clients
    generate_client_config "admin-laptop" "10.0.100.10" "Primary admin workstation"
    generate_client_config "admin-mobile" "10.0.100.11" "Admin mobile device"
    generate_client_config "admin-backup" "10.0.100.12" "Backup admin access"

    # Development clients
    generate_client_config "dev-workstation" "10.0.100.20" "Development workstation"

    # Monitoring clients
    generate_client_config "monitoring-client" "10.0.100.30" "External monitoring probe"

    log "All client configurations generated ✓"
}

################################################################################
# PHASE 4: Update Server Configuration
################################################################################

update_server_config() {
    log "=== Updating WireGuard Server with Client Peers ==="

    # Transfer updated configuration to VMI03
    scp -i "$SSH_KEY" "$OUTPUT_DIR/wg0.conf" "root@$VMI03_IP:/etc/wireguard/wg0.conf"

    # Reload WireGuard
    ssh -i "$SSH_KEY" "root@$VMI03_IP" bash << 'EOF'
#!/bin/bash
echo "[VMI03] Reloading WireGuard configuration..."
wg syncconf wg0 <(wg-quick strip wg0)
echo "[VMI03] WireGuard configuration reloaded ✓"
wg show
EOF

    log "Server configuration updated ✓"
}

################################################################################
# PHASE 5: Generate QR Codes for Mobile Clients
################################################################################

generate_qr_codes() {
    log "=== Generating QR Codes for Mobile Clients ==="

    if ! command -v qrencode > /dev/null; then
        warn "qrencode not installed. Install with: brew install qrencode"
        info "Skipping QR code generation..."
        return
    fi

    # Generate QR code for mobile client
    qrencode -t PNG -o "$OUTPUT_DIR/admin-mobile-qr.png" < "$OUTPUT_DIR/admin-mobile.conf"

    log "QR code generated: $OUTPUT_DIR/admin-mobile-qr.png"
}

################################################################################
# PHASE 6: Create Connection Guide
################################################################################

create_connection_guide() {
    log "=== Creating Connection Guide ==="

    cat > "$OUTPUT_DIR/CONNECTION_GUIDE.md" << 'EOF'
# WireGuard VPN Connection Guide

## Overview

This WireGuard VPN provides secure remote access to the MCP Ecosystem infrastructure:

- **Gateway**: VMI03 (154.26.158.31:51820)
- **VPN Network**: 10.0.100.0/24
- **Access**: Private LAN (10.0.0.0/22) containing all 3 VMs

## What You Can Access

Once connected to the VPN:

1. **VMI01** (10.0.0.1) - Primary database and MCP services
   - PostgreSQL: `psql -h 10.0.0.1 -U mcp_admin -d mcp_ecosystem`
   - MCP Orchestrator: http://10.0.0.1:3000
   - Perplexity MCP: http://10.0.0.1:3001
   - IT-MCP: http://10.0.0.1:3002
   - Cloudflare MCP: http://10.0.0.1:3003

2. **VMI02D** (10.0.0.2) - Storage and standby
   - PostgreSQL Standby: `psql -h 10.0.0.2 -U mcp_admin -d mcp_ecosystem`
   - Plex: http://10.0.0.2:32400
   - Nextcloud: http://10.0.0.2:80

3. **VMI03** (10.0.0.3) - Orchestrator and monitoring
   - HAProxy Stats: http://10.0.0.3:8404/stats
   - Prometheus: http://10.0.0.3:9090
   - Grafana: http://10.0.0.3:3004
   - Admin Dashboard: http://10.0.0.3:3100

4. **SSH Access** to all VMs:
   ```bash
   ssh -i .keys/mcp-deployment-ed25519 root@10.0.0.1  # VMI01
   ssh -i .keys/mcp-deployment-ed25519 root@10.0.0.2  # VMI02D
   ssh -i .keys/mcp-deployment-ed25519 root@10.0.0.3  # VMI03
   ```

## Installation Instructions

### macOS / Linux

1. **Install WireGuard**:
   ```bash
   # macOS
   brew install wireguard-tools

   # Ubuntu/Debian
   sudo apt install wireguard

   # Arch
   sudo pacman -S wireguard-tools
   ```

2. **Import Configuration**:
   ```bash
   # Copy your .conf file
   sudo cp admin-laptop.conf /etc/wireguard/wg-mcp.conf
   sudo chmod 600 /etc/wireguard/wg-mcp.conf
   ```

3. **Connect**:
   ```bash
   # Start VPN
   sudo wg-quick up wg-mcp

   # Check status
   sudo wg show

   # Disconnect
   sudo wg-quick down wg-mcp
   ```

4. **Auto-Start on Boot** (optional):
   ```bash
   sudo systemctl enable wg-quick@wg-mcp
   ```

### Windows

1. **Download WireGuard**: https://www.wireguard.com/install/

2. **Import Configuration**:
   - Open WireGuard app
   - Click "Import tunnel(s) from file"
   - Select your `.conf` file

3. **Connect**:
   - Click "Activate" button in WireGuard app

### iOS / Android

1. **Install WireGuard App**:
   - iOS: https://apps.apple.com/us/app/wireguard/id1441195209
   - Android: https://play.google.com/store/apps/details?id=com.wireguard.android

2. **Import Configuration**:
   - **Option A**: Scan QR code (see `admin-mobile-qr.png`)
   - **Option B**: Copy `.conf` file to device and import manually

3. **Connect**:
   - Toggle VPN connection in app

## Troubleshooting

### Can't Connect

1. **Check WireGuard is running on VMI03**:
   ```bash
   ssh root@154.26.158.31 'wg show'
   ```

2. **Verify firewall allows UDP 51820**:
   ```bash
   ssh root@154.26.158.31 'ufw status | grep 51820'
   ```

3. **Check client configuration**:
   ```bash
   sudo wg show wg-mcp
   ```

### Can Connect but Can't Access Services

1. **Verify routing**:
   ```bash
   # Should show routes to 10.0.0.0/22
   netstat -rn | grep 10.0.0
   ```

2. **Test connectivity**:
   ```bash
   ping 10.0.0.1  # VMI01
   ping 10.0.0.2  # VMI02D
   ping 10.0.0.3  # VMI03
   ```

3. **Check service is running**:
   ```bash
   curl http://10.0.0.1:3000/health  # MCP Orchestrator
   ```

## Security Best Practices

1. **Keep private keys secure**:
   - Never commit `.conf` files to git
   - Store backups encrypted
   - Don't share keys between devices

2. **Rotate keys periodically**:
   - Generate new keys every 90 days
   - Remove old peer configurations from server

3. **Monitor connections**:
   ```bash
   ssh root@154.26.158.31 'wg show'
   ```

4. **Revoke compromised access**:
   ```bash
   # Remove peer from /etc/wireguard/wg0.conf on VMI03
   # Reload configuration
   ssh root@154.26.158.31 'wg syncconf wg0 <(wg-quick strip wg0)'
   ```

## Client Configurations

The following client configurations have been generated:

| Client | IP | Purpose |
|--------|-----|---------|
| admin-laptop | 10.0.100.10 | Primary admin workstation |
| admin-mobile | 10.0.100.11 | Admin mobile device |
| admin-backup | 10.0.100.12 | Backup admin access |
| dev-workstation | 10.0.100.20 | Development workstation |
| monitoring-client | 10.0.100.30 | External monitoring |

## Support

For issues, check:
- WireGuard logs: `sudo journalctl -u wg-quick@wg-mcp`
- Server logs: `ssh root@154.26.158.31 'journalctl -u wg-quick@wg0'`
EOF

    log "Connection guide created: $OUTPUT_DIR/CONNECTION_GUIDE.md"
}

################################################################################
# Main Execution
################################################################################

main() {
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  WireGuard Gateway Setup - VMI03                         ║"
    log "║  External Admin Access to MCP Ecosystem                  ║"
    log "╚════════════════════════════════════════════════════════════╝"
    echo ""

    # Check prerequisites
    if ! command -v wg > /dev/null; then
        warn "WireGuard tools not installed locally"
        info "Install with: brew install wireguard-tools (macOS)"
        info "               apt install wireguard (Ubuntu)"
        read -p "Continue anyway? (yes/no): " -r
        [[ ! $REPLY =~ ^[Yy]es$ ]] && exit 0
    fi

    # Phase 1: Setup WireGuard on VMI03
    setup_wireguard_server

    # Phase 2: Generate client configurations
    create_client_configs

    # Phase 3: Update server with client peers
    update_server_config

    # Phase 4: Generate QR codes
    generate_qr_codes || true

    # Phase 5: Create connection guide
    create_connection_guide

    log ""
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  WireGuard Gateway Setup Complete!                       ║"
    log "╚════════════════════════════════════════════════════════════╝"
    log ""
    info "Client configurations: $OUTPUT_DIR/"
    info "Connection guide: $OUTPUT_DIR/CONNECTION_GUIDE.md"
    log ""
    log "Server Status:"
    ssh -i "$SSH_KEY" "root@$VMI03_IP" 'wg show' || warn "Could not retrieve status"
}

main "$@"
