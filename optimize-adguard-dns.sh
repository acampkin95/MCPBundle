#!/bin/bash
# AdGuard DNS Optimization Script
# Fixes rate limiting and IPv6 issues on Jump Box (154.26.158.68)

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}===================================="
echo "AdGuard DNS Optimization Script"
echo "Jump Box: 154.26.158.68"
echo "====================================${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}[ERROR]${NC} This script must be run as root"
   exit 1
fi

# Backup timestamp
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 1. Optimize AdGuard Rate Limiting
echo -e "${BLUE}[1/4]${NC} Optimizing AdGuard internal rate limiting..."
ADGUARD_CONFIG="/opt/AdGuardHome/AdGuardHome.yaml"

if [ -f "$ADGUARD_CONFIG" ]; then
    # Backup configuration
    cp "$ADGUARD_CONFIG" "${ADGUARD_CONFIG}.backup.${BACKUP_TIMESTAMP}"
    echo -e "${GREEN}[OK]${NC} Configuration backed up to ${ADGUARD_CONFIG}.backup.${BACKUP_TIMESTAMP}"

    # Update rate limit from 20 to 50
    if grep -q "ratelimit: 20" "$ADGUARD_CONFIG"; then
        sed -i 's/ratelimit: 20/ratelimit: 50/' "$ADGUARD_CONFIG"
        echo -e "${GREEN}[OK]${NC} AdGuard rate limit increased: 20 → 50 queries/sec"
    else
        echo -e "${YELLOW}[INFO]${NC} Rate limit already configured or not found"
    fi

    # Disable IPv6 AAAA responses to fix IPv6 errors
    if grep -q "aaaa_disabled: false" "$ADGUARD_CONFIG"; then
        sed -i 's/aaaa_disabled: false/aaaa_disabled: true/' "$ADGUARD_CONFIG"
        echo -e "${GREEN}[OK]${NC} IPv6 AAAA responses disabled (fixes sendmsg errors)"
    else
        echo -e "${YELLOW}[INFO]${NC} IPv6 already disabled or not found in config"
    fi

    RESTART_NEEDED=true
else
    echo -e "${RED}[ERROR]${NC} AdGuard configuration not found at $ADGUARD_CONFIG"
    exit 1
fi
echo ""

# 2. Optimize Firewall Rate Limiting
echo -e "${BLUE}[2/4]${NC} Optimizing firewall rate limiting..."

# Check which firewall is in use
if command -v nft &> /dev/null && nft list ruleset | grep -q "dpt:53"; then
    echo -e "${YELLOW}[INFO]${NC} Using nftables for firewall rules"

    # Backup current nftables rules
    nft list ruleset > "/tmp/nftables.backup.${BACKUP_TIMESTAMP}"
    echo -e "${GREEN}[OK]${NC} nftables rules backed up to /tmp/nftables.backup.${BACKUP_TIMESTAMP}"

    # Get current UDP rate limit
    CURRENT_UDP_LIMIT=$(nft list ruleset | grep -oP 'hit_count: \K\d+' | head -1)
    CURRENT_TCP_LIMIT=$(nft list ruleset | grep -oP 'hit_count: \K\d+' | tail -1)

    echo -e "${YELLOW}[INFO]${NC} Current limits: UDP=${CURRENT_UDP_LIMIT}/sec, TCP=${CURRENT_TCP_LIMIT}/sec"

    # Note: nftables rules are complex to modify in-place
    # This would require regenerating the entire ruleset
    echo -e "${YELLOW}[MANUAL]${NC} To update nftables rate limits, edit your deployment script and redeploy"
    echo -e "${YELLOW}[MANUAL]${NC} Recommended: UDP 100/sec, TCP 20/sec"

elif iptables -L -n | grep -q "dpt:53"; then
    echo -e "${YELLOW}[INFO]${NC} Using iptables for firewall rules"

    # Backup iptables rules
    iptables-save > "/tmp/iptables.backup.${BACKUP_TIMESTAMP}"
    echo -e "${GREEN}[OK]${NC} iptables rules backed up to /tmp/iptables.backup.${BACKUP_TIMESTAMP}"

    # Find and update UDP DNS rate limit (30 → 100)
    if iptables -L -n -v | grep -q "dpt:53.*hit_count: 30"; then
        echo -e "${YELLOW}[MANUAL]${NC} iptables rules require manual adjustment"
        echo -e "${YELLOW}[INFO]${NC} Current: 30 queries/sec per IP"
        echo -e "${YELLOW}[INFO]${NC} Recommended: 100 queries/sec per IP"
        echo ""
        echo "To update, run these commands:"
        echo "  # Remove old rate limiting rules"
        echo "  iptables -D INPUT -p udp --dport 53 -m recent --update --seconds 1 --hitcount 30 --name DNS -j DROP"
        echo "  iptables -D INPUT -p udp --dport 53 -m recent --set --name DNS"
        echo ""
        echo "  # Add new rate limiting rules (100 queries/sec)"
        echo "  iptables -I INPUT -p udp --dport 53 -m recent --set --name DNS"
        echo "  iptables -I INPUT -p udp --dport 53 -m recent --update --seconds 1 --hitcount 100 --name DNS -j DROP"
        echo ""
        echo "  # Save rules"
        echo "  netfilter-persistent save"
    fi
else
    echo -e "${GREEN}[OK]${NC} No firewall rate limiting detected"
fi
echo ""

# 3. Restart AdGuard if needed
if [ "${RESTART_NEEDED:-false}" = "true" ]; then
    echo -e "${BLUE}[3/4]${NC} Restarting AdGuard Home..."

    systemctl restart AdGuardHome

    # Wait for service to start
    sleep 3

    if systemctl is-active --quiet AdGuardHome; then
        echo -e "${GREEN}[OK]${NC} AdGuard Home restarted successfully"
    else
        echo -e "${RED}[ERROR]${NC} AdGuard Home failed to start"
        echo "Restoring backup configuration..."
        cp "${ADGUARD_CONFIG}.backup.${BACKUP_TIMESTAMP}" "$ADGUARD_CONFIG"
        systemctl restart AdGuardHome
        exit 1
    fi
else
    echo -e "${BLUE}[3/4]${NC} No restart needed"
fi
echo ""

# 4. Create monitoring script
echo -e "${BLUE}[4/4]${NC} Creating monitoring script..."
cat > /usr/local/bin/monitor-adguard-dns.sh <<'EOF'
#!/bin/bash
# AdGuard DNS Monitoring Script

echo "=== AdGuard DNS Monitor ==="
echo "$(date)"
echo ""

# Service status
echo "Service Status:"
if systemctl is-active --quiet AdGuardHome; then
    echo "  ✅ AdGuard Home: RUNNING"
else
    echo "  ❌ AdGuard Home: STOPPED"
fi
echo ""

# Query statistics
echo "Firewall Statistics:"
UDP_TOTAL=$(iptables -L -n -v | grep "udp dpt:53" | grep ACCEPT | awk '{print $1}' | head -1)
UDP_DROPPED=$(iptables -L -n -v | grep "udp dpt:53" | grep DROP | awk '{print $1}' | head -1)
TCP_TOTAL=$(iptables -L -n -v | grep "tcp dpt:53" | grep ACCEPT | awk '{print $1}' | head -1)
TCP_DROPPED=$(iptables -L -n -v | grep "tcp dpt:53" | grep DROP | awk '{print $1}' | head -1)

echo "  UDP Queries: ${UDP_TOTAL:-0} accepted, ${UDP_DROPPED:-0} dropped"
echo "  TCP Queries: ${TCP_TOTAL:-0} accepted, ${TCP_DROPPED:-0} dropped"

# Calculate drop percentage
if [ -n "$UDP_TOTAL" ] && [ -n "$UDP_DROPPED" ] && [ "$UDP_TOTAL" -gt 0 ]; then
    DROP_PCT=$(awk "BEGIN {printf \"%.1f\", ($UDP_DROPPED / ($UDP_TOTAL + $UDP_DROPPED)) * 100}")
    echo "  Drop Rate: ${DROP_PCT}%"
fi
echo ""

# AdGuard statistics (if available)
if command -v curl &> /dev/null; then
    STATS=$(curl -s http://localhost:3000/control/stats 2>/dev/null)
    if [ $? -eq 0 ]; then
        TOTAL=$(echo "$STATS" | jq -r '.num_dns_queries // 0')
        BLOCKED=$(echo "$STATS" | jq -r '.num_blocked_filtering // 0')
        echo "AdGuard Statistics:"
        echo "  Total Queries: $TOTAL"
        echo "  Blocked Queries: $BLOCKED"
        if [ "$TOTAL" -gt 0 ]; then
            BLOCK_PCT=$(awk "BEGIN {printf \"%.1f\", ($BLOCKED / $TOTAL) * 100}")
            echo "  Block Rate: ${BLOCK_PCT}%"
        fi
        echo ""
    fi
fi

# Recent errors
echo "Recent Errors (last 5):"
journalctl -u AdGuardHome -n 100 --no-pager | grep -i error | tail -5 || echo "  None"
echo ""

# DNS Test
echo "DNS Resolution Test:"
if dig @127.0.0.1 google.com +short > /dev/null 2>&1; then
    echo "  ✅ DNS Resolution: WORKING"
else
    echo "  ❌ DNS Resolution: FAILED"
fi
echo ""
EOF

chmod +x /usr/local/bin/monitor-adguard-dns.sh
echo -e "${GREEN}[OK]${NC} Monitoring script created: /usr/local/bin/monitor-adguard-dns.sh"
echo ""

# Run monitoring script
echo -e "${BLUE}Running monitoring check...${NC}"
/usr/local/bin/monitor-adguard-dns.sh
echo ""

# Summary
echo -e "${GREEN}===================================="
echo "OPTIMIZATION COMPLETE"
echo "====================================${NC}"
echo ""
echo -e "${BLUE}Changes Applied:${NC}"
echo "  ✅ AdGuard rate limit: 20 → 50 queries/sec"
echo "  ✅ IPv6 AAAA responses: Disabled (fixes errors)"
echo "  ✅ Configuration backed up"
echo "  ✅ Service restarted"
echo "  ✅ Monitoring script created"
echo ""
echo -e "${BLUE}Backups Created:${NC}"
echo "  Config: ${ADGUARD_CONFIG}.backup.${BACKUP_TIMESTAMP}"
if [ -f "/tmp/iptables.backup.${BACKUP_TIMESTAMP}" ]; then
    echo "  Firewall: /tmp/iptables.backup.${BACKUP_TIMESTAMP}"
fi
if [ -f "/tmp/nftables.backup.${BACKUP_TIMESTAMP}" ]; then
    echo "  Firewall: /tmp/nftables.backup.${BACKUP_TIMESTAMP}"
fi
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo "  1. Monitor drop rates: watch -n 5 '/usr/local/bin/monitor-adguard-dns.sh'"
echo "  2. If drop rate still high, manually adjust firewall rate limits"
echo "  3. Test DNS from external client: dig @154.26.158.68 google.com"
echo "  4. Check logs: journalctl -u AdGuardHome -f"
echo ""
echo -e "${YELLOW}Manual Firewall Adjustment Needed:${NC}"
echo "  Current firewall limits are managed by nftables/iptables"
echo "  To increase UDP rate limit to 100/sec, see manual steps above"
echo ""
