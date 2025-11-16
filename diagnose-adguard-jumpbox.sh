#!/bin/bash
# AdGuard DNS Diagnostic Script for Jump Box (154.26.158.68)
# Run this on the Jump Box to diagnose DNS issues

set -euo pipefail

echo "=================================="
echo "AdGuard DNS Diagnostics - Jump Box"
echo "=================================="
echo ""

# 1. Check AdGuard Home service status
echo "=== 1. AdGuard Home Service Status ==="
systemctl status AdGuardHome 2>&1 || systemctl status adguard-home 2>&1 || echo "ERROR: AdGuard service not found"
echo ""

# 2. Check if AdGuard is listening on port 53
echo "=== 2. Listening Ports ==="
echo "DNS Port (53):"
ss -tulnp | grep ":53 " || echo "ERROR: Nothing listening on port 53"
echo ""
echo "Web Interface (3000, 3030, 80):"
ss -tulnp | grep -E ":(3000|3030|80) " || echo "No web interface ports found"
echo ""

# 3. Check AdGuard process
echo "=== 3. AdGuard Process ==="
ps aux | grep -i adguard | grep -v grep || echo "ERROR: No AdGuard process running"
echo ""

# 4. Check firewall rules
echo "=== 4. Firewall Rules (UFW) ==="
if command -v ufw &> /dev/null; then
    ufw status verbose | grep -E "53|DNS" || echo "No DNS firewall rules found"
else
    echo "UFW not installed, checking iptables..."
    iptables -L -n -v | grep -E ":53|dpt:53" || echo "No DNS iptables rules found"
fi
echo ""

# 5. Check nftables (if used)
echo "=== 5. Firewall Rules (nftables) ==="
if command -v nft &> /dev/null; then
    nft list ruleset | grep -E "53|dns" || echo "No DNS nftables rules found"
else
    echo "nftables not in use"
fi
echo ""

# 6. Test local DNS resolution
echo "=== 6. Local DNS Resolution Test ==="
if command -v dig &> /dev/null; then
    echo "Testing DNS on localhost:"
    dig @127.0.0.1 google.com +short || echo "ERROR: DNS resolution failed"
    echo ""
    echo "Testing DNS on public interface:"
    dig @154.26.158.68 google.com +short || echo "ERROR: DNS resolution failed on public IP"
else
    echo "dig command not available, trying nslookup..."
    nslookup google.com 127.0.0.1 || echo "ERROR: DNS resolution failed"
fi
echo ""

# 7. Check what's using port 53
echo "=== 7. What's Using Port 53? ==="
lsof -i :53 2>/dev/null || ss -tulnp | grep ":53 " || echo "Nothing using port 53"
echo ""

# 8. Check systemd-resolved (conflicts with port 53)
echo "=== 8. systemd-resolved Status ==="
systemctl status systemd-resolved --no-pager || echo "systemd-resolved not active"
echo ""

# 9. Check AdGuard configuration
echo "=== 9. AdGuard Configuration ==="
if [ -f /opt/adguard/AdGuardHome.yaml ]; then
    echo "AdGuard config exists at /opt/adguard/AdGuardHome.yaml"
    echo "DNS bind configuration:"
    grep -A 5 "bind_hosts:" /opt/adguard/AdGuardHome.yaml || echo "bind_hosts not found"
    echo ""
    echo "DNS port configuration:"
    grep "port:" /opt/adguard/AdGuardHome.yaml | head -3 || echo "port config not found"
else
    echo "ERROR: AdGuard config not found at /opt/adguard/AdGuardHome.yaml"
    echo "Searching for AdGuard installation..."
    find /opt /usr/local /etc -name "AdGuardHome.yaml" 2>/dev/null || echo "No config found"
fi
echo ""

# 10. Check AdGuard logs
echo "=== 10. Recent AdGuard Logs ==="
if systemctl list-units | grep -qi adguard; then
    journalctl -u AdGuardHome -u adguard-home -n 20 --no-pager 2>&1 | tail -20 || echo "No logs available"
else
    echo "AdGuard service not found in systemd"
fi
echo ""

# 11. Network connectivity test from outside
echo "=== 11. Network Information ==="
echo "Public IP addresses:"
ip addr show | grep "inet " | grep -v "127.0.0.1"
echo ""
echo "Default route:"
ip route | grep default
echo ""

# Summary
echo "=================================="
echo "DIAGNOSTIC SUMMARY"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. If AdGuard is not installed, run deployment script"
echo "2. If AdGuard is installed but not listening on 0.0.0.0:53, check bind configuration"
echo "3. If listening but firewall blocking, add UFW rule: ufw allow 53/udp && ufw allow 53/tcp"
echo "4. If systemd-resolved is using port 53, disable it: systemctl disable --now systemd-resolved"
echo "5. Test from external: dig @154.26.158.68 google.com"
echo ""
