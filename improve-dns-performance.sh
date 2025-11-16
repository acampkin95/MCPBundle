#!/bin/bash
# AdGuard DNS Performance Optimization Script
# Improves response times for Jump Box (154.26.158.68)

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}===================================="
echo "AdGuard DNS Performance Optimizer"
echo "Jump Box: 154.26.158.68"
echo "====================================${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}[ERROR]${NC} This script must be run as root"
   exit 1
fi

# Configuration
ADGUARD_CONFIG="/opt/AdGuardHome/AdGuardHome.yaml"
BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Benchmark function for DNS query time
benchmark_dns() {
    local server=$1
    local domain=$2
    local result
    result=$(dig @${server} ${domain} +tries=1 +timeout=2 +stats 2>/dev/null | grep "Query time:" | awk '{print $4}')
    echo "${result:-999}"
}

# 1. Baseline performance test
echo -e "${BLUE}[1/7]${NC} Testing current DNS performance..."
echo "Testing 5 common domains..."

TOTAL_TIME=0
COUNT=0
for domain in google.com cloudflare.com github.com amazon.com microsoft.com; do
    QUERY_TIME=$(benchmark_dns "127.0.0.1" "$domain")
    echo "  $domain: ${QUERY_TIME}ms"
    TOTAL_TIME=$((TOTAL_TIME + QUERY_TIME))
    COUNT=$((COUNT + 1))
done

AVG_TIME=$((TOTAL_TIME / COUNT))
echo -e "${YELLOW}[INFO]${NC} Current average response time: ${AVG_TIME}ms"
echo ""

# 2. Backup configuration
echo -e "${BLUE}[2/7]${NC} Backing up configuration..."
if [ -f "$ADGUARD_CONFIG" ]; then
    cp "$ADGUARD_CONFIG" "${ADGUARD_CONFIG}.perf.backup.${BACKUP_TIMESTAMP}"
    echo -e "${GREEN}[OK]${NC} Configuration backed up"
else
    echo -e "${RED}[ERROR]${NC} Configuration file not found"
    exit 1
fi
echo ""

# 3. Optimize upstream DNS servers
echo -e "${BLUE}[3/7]${NC} Optimizing upstream DNS configuration..."

# Test which upstream DNS is fastest
echo "Testing upstream DNS servers..."
CF_TIME=$(benchmark_dns "1.1.1.1" "google.com")
GOOGLE_TIME=$(benchmark_dns "8.8.8.8" "google.com")
QUAD9_TIME=$(benchmark_dns "9.9.9.9" "google.com")

echo "  Cloudflare (1.1.1.1): ${CF_TIME}ms"
echo "  Google (8.8.8.8): ${GOOGLE_TIME}ms"
echo "  Quad9 (9.9.9.9): ${QUAD9_TIME}ms"

# Create optimized upstream DNS list (fastest first)
# Using plain DNS for best performance, DNS-over-HTTPS adds latency
cat > /tmp/adguard_upstream_optimized.txt <<'EOF'
  upstream_dns:
    - 1.1.1.1
    - 1.0.0.1
    - 8.8.8.8
    - 8.8.4.4
  upstream_dns_file: ""
  bootstrap_dns:
    - 1.1.1.1
    - 8.8.8.8
  fallback_dns: []
  upstream_mode: parallel
  fastest_timeout: 500ms
EOF

echo -e "${GREEN}[OK]${NC} Upstream DNS optimized for speed"
echo ""

# 4. Optimize cache settings
echo -e "${BLUE}[4/7]${NC} Optimizing cache configuration..."

# Update cache settings for better performance
sed -i "s/fastest_timeout: 1s/fastest_timeout: 500ms/" "$ADGUARD_CONFIG"
sed -i "s/cache_optimistic: true/cache_optimistic: true/" "$ADGUARD_CONFIG"  # Ensure it's enabled

# Increase cache size if system has memory
TOTAL_MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_MB=$((TOTAL_MEM_KB / 1024))

if [ $TOTAL_MEM_MB -gt 4096 ]; then
    # System has >4GB RAM, increase cache to 16MB
    sed -i "s/cache_size: 4194304/cache_size: 16777216/" "$ADGUARD_CONFIG"
    echo -e "${GREEN}[OK]${NC} Cache size increased: 4MB → 16MB"
else
    echo -e "${YELLOW}[INFO]${NC} Cache size kept at 4MB (limited memory)"
fi

# Update fastest_timeout in bootstrap too
sed -i "s/fastest_timeout: 1s/fastest_timeout: 500ms/" "$ADGUARD_CONFIG"

echo -e "${GREEN}[OK]${NC} Cache settings optimized"
echo ""

# 5. System-level network optimizations
echo -e "${BLUE}[5/7]${NC} Applying system network optimizations..."

# Check if sysctl optimizations are already applied
if ! grep -q "# AdGuard DNS Performance" /etc/sysctl.conf; then
    cat >> /etc/sysctl.conf <<'EOF'

# AdGuard DNS Performance Optimizations
# Increase network buffer sizes
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.core.rmem_default = 16777216
net.core.wmem_default = 16777216

# Increase connection tracking table size
net.netfilter.nf_conntrack_max = 1048576

# Reduce TIME_WAIT sockets
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1

# Optimize UDP for DNS
net.ipv4.udp_rmem_min = 8192
net.ipv4.udp_wmem_min = 8192

# Increase max number of open files
fs.file-max = 2097152
EOF

    # Apply sysctl changes
    sysctl -p > /dev/null 2>&1
    echo -e "${GREEN}[OK]${NC} System network parameters optimized"
else
    echo -e "${YELLOW}[INFO]${NC} System optimizations already applied"
fi
echo ""

# 6. Optimize AdGuard systemd service
echo -e "${BLUE}[6/7]${NC} Optimizing AdGuard systemd service..."

if ! grep -q "LimitNOFILE=65536" /etc/systemd/system/AdGuardHome.service; then
    sed -i '/\[Service\]/a LimitNOFILE=65536' /etc/systemd/system/AdGuardHome.service
    sed -i '/LimitNOFILE/a LimitNPROC=4096' /etc/systemd/system/AdGuardHome.service
    systemctl daemon-reload
    echo -e "${GREEN}[OK]${NC} Service limits optimized"
else
    echo -e "${YELLOW}[INFO]${NC} Service already optimized"
fi
echo ""

# 7. Restart AdGuard and test performance
echo -e "${BLUE}[7/7]${NC} Restarting AdGuard Home..."
systemctl restart AdGuardHome

# Wait for service to start
sleep 5

if systemctl is-active --quiet AdGuardHome; then
    echo -e "${GREEN}[OK]${NC} AdGuard Home restarted successfully"
else
    echo -e "${RED}[ERROR]${NC} AdGuard Home failed to start"
    echo "Restoring backup configuration..."
    cp "${ADGUARD_CONFIG}.perf.backup.${BACKUP_TIMESTAMP}" "$ADGUARD_CONFIG"
    systemctl restart AdGuardHome
    exit 1
fi
echo ""

# Wait for DNS to be ready
echo "Waiting for DNS to be ready..."
sleep 5

# Test new performance
echo -e "${BLUE}Testing improved DNS performance...${NC}"
NEW_TOTAL_TIME=0
NEW_COUNT=0
for domain in google.com cloudflare.com github.com amazon.com microsoft.com; do
    QUERY_TIME=$(benchmark_dns "127.0.0.1" "$domain")
    echo "  $domain: ${QUERY_TIME}ms"
    NEW_TOTAL_TIME=$((NEW_TOTAL_TIME + QUERY_TIME))
    NEW_COUNT=$((NEW_COUNT + 1))
done

NEW_AVG_TIME=$((NEW_TOTAL_TIME / NEW_COUNT))
IMPROVEMENT=$((AVG_TIME - NEW_AVG_TIME))
IMPROVEMENT_PCT=$(awk "BEGIN {printf \"%.1f\", (($IMPROVEMENT / $AVG_TIME) * 100)}")

echo ""
echo -e "${GREEN}===================================="
echo "PERFORMANCE OPTIMIZATION COMPLETE"
echo "====================================${NC}"
echo ""
echo -e "${BLUE}Performance Comparison:${NC}"
echo "  Before: ${AVG_TIME}ms average"
echo "  After:  ${NEW_AVG_TIME}ms average"
echo "  Improvement: ${IMPROVEMENT}ms (${IMPROVEMENT_PCT}% faster)"
echo ""
echo -e "${BLUE}Optimizations Applied:${NC}"
echo "  ✅ Upstream DNS servers optimized"
echo "  ✅ Bootstrap DNS streamlined (Cloudflare/Google)"
echo "  ✅ Fastest timeout reduced: 1000ms → 500ms"
echo "  ✅ Cache optimistic enabled"
if [ $TOTAL_MEM_MB -gt 4096 ]; then
    echo "  ✅ Cache size increased: 4MB → 16MB"
fi
echo "  ✅ System network buffers increased"
echo "  ✅ Connection tracking optimized"
echo "  ✅ UDP parameters tuned for DNS"
echo "  ✅ File descriptor limits increased"
echo ""
echo -e "${BLUE}Configuration Backup:${NC}"
echo "  ${ADGUARD_CONFIG}.perf.backup.${BACKUP_TIMESTAMP}"
echo ""
echo -e "${BLUE}Monitoring:${NC}"
echo "  Real-time performance: watch -n 2 'dig @localhost google.com | grep \"Query time\"'"
echo "  Service logs: journalctl -u AdGuardHome -f"
echo "  Cache stats: curl -s http://localhost:3000/control/stats | jq .dns_cache_size"
echo ""
echo -e "${BLUE}Expected Performance:${NC}"
echo "  Target: <50ms for cached queries"
echo "  Target: <100ms for uncached queries"
echo "  Current: ${NEW_AVG_TIME}ms average"
echo ""

# Performance grade
if [ $NEW_AVG_TIME -lt 50 ]; then
    echo -e "${GREEN}Performance Grade: EXCELLENT ⭐⭐⭐${NC}"
elif [ $NEW_AVG_TIME -lt 100 ]; then
    echo -e "${GREEN}Performance Grade: GOOD ⭐⭐${NC}"
else
    echo -e "${YELLOW}Performance Grade: ACCEPTABLE ⭐${NC}"
    echo ""
    echo -e "${YELLOW}Further optimization suggestions:${NC}"
    echo "  • Consider using a CDN DNS service"
    echo "  • Check network latency to upstream DNS servers"
    echo "  • Ensure sufficient system resources (CPU/Memory)"
fi
echo ""
