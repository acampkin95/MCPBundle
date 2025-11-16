#!/bin/bash
# AdGuard Public DNS Fix Script for Jump Box (154.26.158.68)
# Fixes common issues preventing external DNS access

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=================================="
echo "AdGuard Public DNS Fix Script"
echo "Jump Box: 154.26.158.68"
echo "==================================${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}[ERROR]${NC} This script must be run as root"
   exit 1
fi

# Fix 1: Disable systemd-resolved if it's using port 53
echo -e "${BLUE}[1/6]${NC} Checking for port 53 conflicts..."
if systemctl is-active --quiet systemd-resolved; then
    echo -e "${YELLOW}[FIX]${NC} systemd-resolved is using port 53, disabling it..."
    systemctl stop systemd-resolved
    systemctl disable systemd-resolved

    # Update resolv.conf
    rm -f /etc/resolv.conf
    cat > /etc/resolv.conf <<EOF
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF

    echo -e "${GREEN}[OK]${NC} systemd-resolved disabled"
else
    echo -e "${GREEN}[OK]${NC} No port 53 conflicts"
fi
echo ""

# Fix 2: Ensure AdGuard is installed
echo -e "${BLUE}[2/6]${NC} Checking AdGuard installation..."
if [ ! -f /usr/local/bin/AdGuardHome ]; then
    echo -e "${YELLOW}[FIX]${NC} AdGuard not installed. Please run the deployment script first:"
    echo "    scp deployment/dns/deploy-adguard.sh root@154.26.158.68:/tmp/"
    echo "    ssh root@154.26.158.68 'bash /tmp/deploy-adguard.sh'"
    exit 1
else
    echo -e "${GREEN}[OK]${NC} AdGuard is installed"
fi
echo ""

# Fix 3: Update AdGuard config to listen on all interfaces
echo -e "${BLUE}[3/6]${NC} Checking AdGuard network binding..."
ADGUARD_CONFIG="/opt/adguard/AdGuardHome.yaml"

if [ -f "$ADGUARD_CONFIG" ]; then
    # Check if already bound to 0.0.0.0
    if grep -q "bind_hosts:" "$ADGUARD_CONFIG"; then
        if ! grep -A 1 "bind_hosts:" "$ADGUARD_CONFIG" | grep -q "0.0.0.0"; then
            echo -e "${YELLOW}[FIX]${NC} Updating bind_hosts to 0.0.0.0..."
            # Backup config
            cp "$ADGUARD_CONFIG" "${ADGUARD_CONFIG}.backup.$(date +%Y%m%d_%H%M%S)"

            # Update bind_hosts in DNS section
            sed -i '/^dns:/,/^[a-z]/ s/bind_hosts:.*/bind_hosts:\n    - 0.0.0.0/' "$ADGUARD_CONFIG"

            # Also update top-level bind_host
            sed -i 's/^bind_host:.*/bind_host: 0.0.0.0/' "$ADGUARD_CONFIG"

            echo -e "${GREEN}[OK]${NC} Configuration updated (backup saved)"
            RESTART_NEEDED=true
        else
            echo -e "${GREEN}[OK]${NC} Already bound to 0.0.0.0"
        fi
    else
        echo -e "${YELLOW}[WARN]${NC} bind_hosts not found in config, may need manual fix"
    fi
else
    echo -e "${RED}[ERROR]${NC} AdGuard config not found at $ADGUARD_CONFIG"
    exit 1
fi
echo ""

# Fix 4: Configure firewall to allow public DNS
echo -e "${BLUE}[4/6]${NC} Configuring firewall for public DNS access..."

if command -v ufw &> /dev/null; then
    # Check if UFW is active
    if ufw status | grep -q "Status: active"; then
        echo -e "${YELLOW}[FIX]${NC} Adding UFW rules for public DNS..."

        # Allow DNS from anywhere
        ufw allow 53/udp comment 'AdGuard DNS - UDP'
        ufw allow 53/tcp comment 'AdGuard DNS - TCP'

        # Optionally allow DNS-over-HTTPS and DNS-over-TLS
        ufw allow 443/tcp comment 'DNS-over-HTTPS'
        ufw allow 853/tcp comment 'DNS-over-TLS'

        echo -e "${GREEN}[OK]${NC} UFW rules added"
    else
        echo -e "${GREEN}[OK]${NC} UFW not active"
    fi
elif command -v nft &> /dev/null; then
    echo -e "${YELLOW}[INFO]${NC} nftables detected. Adding DNS rules..."

    # Check if MCP nftables config exists
    if [ -f /etc/nftables.conf ]; then
        # Backup nftables config
        cp /etc/nftables.conf /etc/nftables.conf.backup.$(date +%Y%m%d_%H%M%S)

        # Check if DNS rules already exist
        if ! grep -q "udp dport 53 accept" /etc/nftables.conf; then
            # Add DNS rules to input chain
            sed -i '/chain input {/a \        # Allow public DNS\n        udp dport 53 accept comment "AdGuard DNS - UDP"\n        tcp dport 53 accept comment "AdGuard DNS - TCP"' /etc/nftables.conf

            # Reload nftables
            nft -f /etc/nftables.conf

            echo -e "${GREEN}[OK]${NC} nftables rules added and reloaded"
        else
            echo -e "${GREEN}[OK]${NC} DNS rules already exist in nftables"
        fi
    fi
else
    echo -e "${YELLOW}[WARN]${NC} No firewall detected (UFW or nftables)"
fi
echo ""

# Fix 5: Restart AdGuard if needed
if [ "${RESTART_NEEDED:-false}" = "true" ] || ! systemctl is-active --quiet adguard-home; then
    echo -e "${BLUE}[5/6]${NC} Restarting AdGuard Home..."
    systemctl restart adguard-home || systemctl restart AdGuardHome

    # Wait for service to start
    sleep 3

    if systemctl is-active --quiet adguard-home || systemctl is-active --quiet AdGuardHome; then
        echo -e "${GREEN}[OK]${NC} AdGuard Home restarted successfully"
    else
        echo -e "${RED}[ERROR]${NC} AdGuard Home failed to start"
        journalctl -u adguard-home -u AdGuardHome -n 20 --no-pager
        exit 1
    fi
else
    echo -e "${BLUE}[5/6]${NC} Checking AdGuard Home status..."
    echo -e "${GREEN}[OK]${NC} AdGuard Home is running"
fi
echo ""

# Fix 6: Verify DNS is working
echo -e "${BLUE}[6/6]${NC} Testing DNS resolution..."

# Test local resolution
if dig @127.0.0.1 google.com +short > /dev/null 2>&1; then
    echo -e "${GREEN}[OK]${NC} Local DNS resolution working"
else
    echo -e "${RED}[ERROR]${NC} Local DNS resolution failed"
fi

# Test public IP resolution
if dig @154.26.158.68 google.com +short > /dev/null 2>&1; then
    echo -e "${GREEN}[OK]${NC} Public DNS resolution working"
else
    echo -e "${YELLOW}[WARN]${NC} Public DNS resolution failed (may work from external clients)"
fi
echo ""

# Summary
echo -e "${GREEN}=================================="
echo "FIX COMPLETE"
echo "==================================${NC}"
echo ""
echo "AdGuard Public DNS is now configured for external access"
echo ""
echo -e "${BLUE}DNS Server Details:${NC}"
echo "  Public DNS IP: 154.26.158.68"
echo "  DNS Port: 53 (UDP/TCP)"
echo "  Web Interface: http://154.26.158.68:3030 (VPN recommended)"
echo ""
echo -e "${BLUE}Test from external client:${NC}"
echo "  dig @154.26.158.68 google.com"
echo "  nslookup google.com 154.26.158.68"
echo ""
echo -e "${BLUE}Configure on devices:${NC}"
echo "  Primary DNS: 154.26.158.68"
echo "  Secondary DNS: 1.1.1.1 (fallback)"
echo ""
echo -e "${BLUE}Check service status:${NC}"
echo "  systemctl status adguard-home"
echo "  journalctl -u adguard-home -f"
echo ""
echo -e "${BLUE}View listening ports:${NC}"
echo "  ss -tulnp | grep :53"
echo ""
echo -e "${YELLOW}Security Note:${NC}"
echo "  - Consider rate limiting to prevent DNS amplification attacks"
echo "  - Monitor query logs for suspicious activity"
echo "  - Keep AdGuard Home updated regularly"
echo ""
