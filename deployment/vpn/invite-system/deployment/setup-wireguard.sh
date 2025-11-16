#!/bin/bash
set -e

# VPN Invite System - WireGuard Setup Script
# This script configures the wg1 interface on VMI03 (Gateway)

echo "========================================="
echo "VPN Invite System - WireGuard Setup"
echo "========================================="

# Configuration
WG_INTERFACE="${WG_INTERFACE:-wg1}"
WG_PORT="${WG_PORT:-51823}"
WG_NETWORK="${WG_NETWORK:-10.10.10.0/24}"
WG_SERVER_IP="${WG_SERVER_IP:-10.10.10.1}"
WG_LISTEN_PORT="${WG_LISTEN_PORT:-51823}"

echo "WireGuard Configuration:"
echo "  Interface: $WG_INTERFACE"
echo "  Port: $WG_PORT"
echo "  Network: $WG_NETWORK"
echo "  Server IP: $WG_SERVER_IP"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: This script must be run as root"
    echo "Usage: sudo ./setup-wireguard.sh"
    exit 1
fi

# Check if WireGuard is installed
if ! command -v wg &> /dev/null; then
    echo "Error: WireGuard is not installed"
    echo "Install with: apt install wireguard (Ubuntu/Debian)"
    exit 1
fi

echo "✓ WireGuard is installed"

# Generate server keys if they don't exist
WG_PRIVATE_KEY_FILE="/etc/wireguard/${WG_INTERFACE}-private.key"
WG_PUBLIC_KEY_FILE="/etc/wireguard/${WG_INTERFACE}-public.key"

if [ ! -f "$WG_PRIVATE_KEY_FILE" ]; then
    echo "Generating server keys..."
    umask 077
    wg genkey > "$WG_PRIVATE_KEY_FILE"
    wg pubkey < "$WG_PRIVATE_KEY_FILE" > "$WG_PUBLIC_KEY_FILE"
    echo "✓ Server keys generated"
else
    echo "✓ Server keys already exist"
fi

WG_PRIVATE_KEY=$(cat "$WG_PRIVATE_KEY_FILE")
WG_PUBLIC_KEY=$(cat "$WG_PUBLIC_KEY_FILE")

echo ""
echo "Server Public Key: $WG_PUBLIC_KEY"
echo "(Save this for backend configuration)"

# Create WireGuard configuration
WG_CONFIG_FILE="/etc/wireguard/${WG_INTERFACE}.conf"

echo ""
echo "Creating WireGuard configuration..."

cat > "$WG_CONFIG_FILE" <<EOF
[Interface]
Address = $WG_SERVER_IP/24
ListenPort = $WG_LISTEN_PORT
PrivateKey = $WG_PRIVATE_KEY
PostUp = iptables -A FORWARD -i $WG_INTERFACE -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i $WG_INTERFACE -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

# Peers will be added dynamically by the invite system
EOF

chmod 600 "$WG_CONFIG_FILE"
echo "✓ Configuration created at $WG_CONFIG_FILE"

# Enable IP forwarding
echo ""
echo "Enabling IP forwarding..."
if ! grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
sysctl -w net.ipv4.ip_forward=1 > /dev/null
echo "✓ IP forwarding enabled"

# Configure firewall
echo ""
echo "Configuring firewall..."
ufw allow $WG_PORT/udp comment "WireGuard VPN"
echo "✓ Firewall configured"

# Start WireGuard interface
echo ""
echo "Starting WireGuard interface..."
systemctl enable wg-quick@$WG_INTERFACE
systemctl start wg-quick@$WG_INTERFACE

if systemctl is-active --quiet wg-quick@$WG_INTERFACE; then
    echo "✓ WireGuard interface started"
else
    echo "✗ Failed to start WireGuard interface"
    exit 1
fi

# Verify interface
echo ""
echo "Verifying interface status..."
wg show $WG_INTERFACE

echo ""
echo "========================================="
echo "WireGuard setup complete!"
echo "========================================="
echo ""
echo "Configuration Summary:"
echo "  Interface: $WG_INTERFACE"
echo "  Public Key: $WG_PUBLIC_KEY"
echo "  Listen Port: $WG_PORT"
echo "  Network: $WG_NETWORK"
echo ""
echo "Update backend .env with:"
echo "  WG_SERVER_PUBLIC_KEY=$WG_PUBLIC_KEY"
echo ""
echo "Test with: wg show $WG_INTERFACE"
