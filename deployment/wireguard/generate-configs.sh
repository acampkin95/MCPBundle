#!/bin/bash
# WireGuard Configuration Generator
# Creates all tunnel configurations for the mesh network

set -e

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== WireGuard Configuration Generator ===${NC}"

# Base directory
BASE_DIR="/Users/alex/Projects/MCP Bundle/deployment/wireguard"
CONFIG_DIR="$BASE_DIR/configs"
KEY_DIR="$BASE_DIR/keys"

# Create config directory
mkdir -p "$CONFIG_DIR"

# Server IPs
VMI01_IP="46.250.243.123"
VMI02D_IP="46.250.241.70"
VMI03_IP="154.26.158.31"

# Function to read key
read_key() {
    local vm=$1
    local tunnel=$2
    local type=$3
    cat "$KEY_DIR/$vm/$tunnel/$type.key" 2>/dev/null || echo "KEY_NOT_FOUND"
}

# Generate ROOT tunnel configurations (port 51820)
echo -e "${YELLOW}Generating ROOT tunnel configurations...${NC}"

# VMI01 - ROOT
cat > "$CONFIG_DIR/vmi01-wg-root.conf" << EOF
# WireGuard ROOT Tunnel - VMI01
# Full Admin Access - 10.0.50.0/24
[Interface]
Address = 10.0.50.1/24
ListenPort = 51820
PrivateKey = $(read_key VMI01 root private)
SaveConfig = false

# Security rules
PostUp = iptables -A FORWARD -i wg-root -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-root -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI02D
[Peer]
PublicKey = $(read_key VMI02D root public)
AllowedIPs = 10.0.50.2/32
Endpoint = ${VMI02D_IP}:51820
PersistentKeepalive = 25

# Peer: VMI03
[Peer]
PublicKey = $(read_key VMI03 root public)
AllowedIPs = 10.0.50.3/32
Endpoint = ${VMI03_IP}:51820
PersistentKeepalive = 25
EOF

# VMI02D - ROOT
cat > "$CONFIG_DIR/vmi02d-wg-root.conf" << EOF
# WireGuard ROOT Tunnel - VMI02D
# Full Admin Access - 10.0.50.0/24
[Interface]
Address = 10.0.50.2/24
ListenPort = 51820
PrivateKey = $(read_key VMI02D root private)
SaveConfig = false

PostUp = iptables -A FORWARD -i wg-root -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-root -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI01
[Peer]
PublicKey = $(read_key VMI01 root public)
AllowedIPs = 10.0.50.1/32
Endpoint = ${VMI01_IP}:51820
PersistentKeepalive = 25

# Peer: VMI03
[Peer]
PublicKey = $(read_key VMI03 root public)
AllowedIPs = 10.0.50.3/32
Endpoint = ${VMI03_IP}:51820
PersistentKeepalive = 25
EOF

# VMI03 - ROOT
cat > "$CONFIG_DIR/vmi03-wg-root.conf" << EOF
# WireGuard ROOT Tunnel - VMI03
# Full Admin Access - 10.0.50.0/24
[Interface]
Address = 10.0.50.3/24
ListenPort = 51820
PrivateKey = $(read_key VMI03 root private)
SaveConfig = false

PostUp = iptables -A FORWARD -i wg-root -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-root -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI01
[Peer]
PublicKey = $(read_key VMI01 root public)
AllowedIPs = 10.0.50.1/32
Endpoint = ${VMI01_IP}:51820
PersistentKeepalive = 25

# Peer: VMI02D
[Peer]
PublicKey = $(read_key VMI02D root public)
AllowedIPs = 10.0.50.2/32
Endpoint = ${VMI02D_IP}:51820
PersistentKeepalive = 25
EOF

echo -e "${GREEN}✓ ROOT tunnel configurations generated${NC}"

# Generate MCP tunnel configurations (port 51821)
echo -e "${YELLOW}Generating MCP tunnel configurations...${NC}"

# VMI01 - MCP
cat > "$CONFIG_DIR/vmi01-wg-mcp.conf" << EOF
# WireGuard MCP Tunnel - VMI01
# Service Mesh - 10.0.51.0/24
[Interface]
Address = 10.0.51.1/24
ListenPort = 51821
PrivateKey = $(read_key VMI01 mcp private)
SaveConfig = false

PostUp = iptables -A FORWARD -i wg-mcp -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-mcp -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI02D
[Peer]
PublicKey = $(read_key VMI02D mcp public)
AllowedIPs = 10.0.51.2/32
Endpoint = ${VMI02D_IP}:51821
PersistentKeepalive = 25

# Peer: VMI03
[Peer]
PublicKey = $(read_key VMI03 mcp public)
AllowedIPs = 10.0.51.3/32
Endpoint = ${VMI03_IP}:51821
PersistentKeepalive = 25
EOF

# VMI02D - MCP
cat > "$CONFIG_DIR/vmi02d-wg-mcp.conf" << EOF
# WireGuard MCP Tunnel - VMI02D
# Service Mesh - 10.0.51.0/24
[Interface]
Address = 10.0.51.2/24
ListenPort = 51821
PrivateKey = $(read_key VMI02D mcp private)
SaveConfig = false

PostUp = iptables -A FORWARD -i wg-mcp -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-mcp -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI01
[Peer]
PublicKey = $(read_key VMI01 mcp public)
AllowedIPs = 10.0.51.1/32
Endpoint = ${VMI01_IP}:51821
PersistentKeepalive = 25

# Peer: VMI03
[Peer]
PublicKey = $(read_key VMI03 mcp public)
AllowedIPs = 10.0.51.3/32
Endpoint = ${VMI03_IP}:51821
PersistentKeepalive = 25
EOF

# VMI03 - MCP
cat > "$CONFIG_DIR/vmi03-wg-mcp.conf" << EOF
# WireGuard MCP Tunnel - VMI03
# Service Mesh - 10.0.51.0/24
[Interface]
Address = 10.0.51.3/24
ListenPort = 51821
PrivateKey = $(read_key VMI03 mcp private)
SaveConfig = false

PostUp = iptables -A FORWARD -i wg-mcp -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-mcp -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI01
[Peer]
PublicKey = $(read_key VMI01 mcp public)
AllowedIPs = 10.0.51.1/32
Endpoint = ${VMI01_IP}:51821
PersistentKeepalive = 25

# Peer: VMI02D
[Peer]
PublicKey = $(read_key VMI02D mcp public)
AllowedIPs = 10.0.51.2/32
Endpoint = ${VMI02D_IP}:51821
PersistentKeepalive = 25
EOF

echo -e "${GREEN}✓ MCP tunnel configurations generated${NC}"

# Generate RED tunnel configurations (port 51822)
echo -e "${YELLOW}Generating RED tunnel configurations...${NC}"

# VMI01 - RED
cat > "$CONFIG_DIR/vmi01-wg-red.conf" << EOF
# WireGuard RED Tunnel - VMI01
# Restricted Network - 10.0.52.0/24
[Interface]
Address = 10.0.52.1/24
ListenPort = 51822
PrivateKey = $(read_key VMI01 red private)
SaveConfig = false

PostUp = iptables -A FORWARD -i wg-red -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-red -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI02D
[Peer]
PublicKey = $(read_key VMI02D red public)
AllowedIPs = 10.0.52.2/32
Endpoint = ${VMI02D_IP}:51822
PersistentKeepalive = 25

# Peer: VMI03
[Peer]
PublicKey = $(read_key VMI03 red public)
AllowedIPs = 10.0.52.3/32
Endpoint = ${VMI03_IP}:51822
PersistentKeepalive = 25
EOF

# VMI02D - RED
cat > "$CONFIG_DIR/vmi02d-wg-red.conf" << EOF
# WireGuard RED Tunnel - VMI02D
# Restricted Network - 10.0.52.0/24
[Interface]
Address = 10.0.52.2/24
ListenPort = 51822
PrivateKey = $(read_key VMI02D red private)
SaveConfig = false

PostUp = iptables -A FORWARD -i wg-red -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-red -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI01
[Peer]
PublicKey = $(read_key VMI01 red public)
AllowedIPs = 10.0.52.1/32
Endpoint = ${VMI01_IP}:51822
PersistentKeepalive = 25

# Peer: VMI03
[Peer]
PublicKey = $(read_key VMI03 red public)
AllowedIPs = 10.0.52.3/32
Endpoint = ${VMI03_IP}:51822
PersistentKeepalive = 25
EOF

# VMI03 - RED
cat > "$CONFIG_DIR/vmi03-wg-red.conf" << EOF
# WireGuard RED Tunnel - VMI03
# Restricted Network - 10.0.52.0/24
[Interface]
Address = 10.0.52.3/24
ListenPort = 51822
PrivateKey = $(read_key VMI03 red private)
SaveConfig = false

PostUp = iptables -A FORWARD -i wg-red -j ACCEPT
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg-red -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peer: VMI01
[Peer]
PublicKey = $(read_key VMI01 red public)
AllowedIPs = 10.0.52.1/32
Endpoint = ${VMI01_IP}:51822
PersistentKeepalive = 25

# Peer: VMI02D
[Peer]
PublicKey = $(read_key VMI02D red public)
AllowedIPs = 10.0.52.2/32
Endpoint = ${VMI02D_IP}:51822
PersistentKeepalive = 25
EOF

echo -e "${GREEN}✓ RED tunnel configurations generated${NC}"

# Generate client configurations
echo -e "\n${YELLOW}Generating client configurations for admin access...${NC}"

# Generate client keypair
CLIENT_PRIVATE=$(wg genkey)
CLIENT_PUBLIC=$(echo "$CLIENT_PRIVATE" | wg pubkey)

# Save client keys
mkdir -p "$KEY_DIR/client"
echo "$CLIENT_PRIVATE" > "$KEY_DIR/client/private.key"
echo "$CLIENT_PUBLIC" > "$KEY_DIR/client/public.key"

# Client config for ROOT tunnel
cat > "$CONFIG_DIR/client-root.conf" << EOF
# WireGuard Client Configuration - ROOT Tunnel
# Full Admin Access to all VMs
[Interface]
Address = 10.0.50.254/24
PrivateKey = $CLIENT_PRIVATE
DNS = 1.1.1.1, 8.8.8.8

# VMI01
[Peer]
PublicKey = $(read_key VMI01 root public)
AllowedIPs = 10.0.50.1/32
Endpoint = ${VMI01_IP}:51820
PersistentKeepalive = 25

# VMI02D
[Peer]
PublicKey = $(read_key VMI02D root public)
AllowedIPs = 10.0.50.2/32
Endpoint = ${VMI02D_IP}:51820
PersistentKeepalive = 25

# VMI03
[Peer]
PublicKey = $(read_key VMI03 root public)
AllowedIPs = 10.0.50.3/32
Endpoint = ${VMI03_IP}:51820
PersistentKeepalive = 25
EOF

# Client config for MCP tunnel
cat > "$CONFIG_DIR/client-mcp.conf" << EOF
# WireGuard Client Configuration - MCP Tunnel
# Service Mesh Access
[Interface]
Address = 10.0.51.254/24
PrivateKey = $CLIENT_PRIVATE
DNS = 1.1.1.1, 8.8.8.8

# VMI01
[Peer]
PublicKey = $(read_key VMI01 mcp public)
AllowedIPs = 10.0.51.1/32
Endpoint = ${VMI01_IP}:51821
PersistentKeepalive = 25

# VMI02D
[Peer]
PublicKey = $(read_key VMI02D mcp public)
AllowedIPs = 10.0.51.2/32
Endpoint = ${VMI02D_IP}:51821
PersistentKeepalive = 25

# VMI03
[Peer]
PublicKey = $(read_key VMI03 mcp public)
AllowedIPs = 10.0.51.3/32
Endpoint = ${VMI03_IP}:51821
PersistentKeepalive = 25
EOF

# Client config for RED tunnel
cat > "$CONFIG_DIR/client-red.conf" << EOF
# WireGuard Client Configuration - RED Tunnel
# Restricted Network Access
[Interface]
Address = 10.0.52.254/24
PrivateKey = $CLIENT_PRIVATE
DNS = 1.1.1.1, 8.8.8.8

# VMI01
[Peer]
PublicKey = $(read_key VMI01 red public)
AllowedIPs = 10.0.52.1/32
Endpoint = ${VMI01_IP}:51822
PersistentKeepalive = 25

# VMI02D
[Peer]
PublicKey = $(read_key VMI02D red public)
AllowedIPs = 10.0.52.2/32
Endpoint = ${VMI02D_IP}:51822
PersistentKeepalive = 25

# VMI03
[Peer]
PublicKey = $(read_key VMI03 red public)
AllowedIPs = 10.0.52.3/32
Endpoint = ${VMI03_IP}:51822
PersistentKeepalive = 25
EOF

echo -e "${GREEN}✓ Client configurations generated${NC}"

# Set proper permissions
chmod 600 "$CONFIG_DIR"/*.conf
chmod 600 "$KEY_DIR"/*/private.key 2>/dev/null || true
chmod 600 "$KEY_DIR"/*/*/private.key 2>/dev/null || true

echo -e "\n${GREEN}=== Configuration Generation Complete ===${NC}"
echo -e "Server configs: $CONFIG_DIR/vmi*.conf"
echo -e "Client configs: $CONFIG_DIR/client-*.conf"
echo -e "Keys stored in: $KEY_DIR/"