#!/bin/bash
################################################################################
# fix-wazuh-manager.sh
#
# Comprehensive Wazuh Manager troubleshooting and fix script
#
# Execute this script ON THE VMI03 SERVER
#
# Usage: ./fix-wazuh-manager.sh [--clean-install]
################################################################################

set -euo pipefail

# Colors
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly RED='\033[0;31m'
readonly NC='\033[0m'

# Options
CLEAN_INSTALL=false
if [ "${1:-}" = "--clean-install" ]; then
    CLEAN_INSTALL=true
fi

echo -e "${BLUE}=== Wazuh Manager Troubleshooting ===${NC}"
echo ""

# Check if running on server
if [ ! -f "/var/ossec/bin/wazuh-control" ] && [ "$CLEAN_INSTALL" = false ]; then
    echo -e "${RED}Error: Wazuh not found. Run with --clean-install to install fresh${NC}"
    exit 1
fi

################################################################################
# Step 1: Diagnostic Information
################################################################################

echo -e "${YELLOW}[1/6] Gathering diagnostic information...${NC}"

echo "Wazuh version:"
if [ -f "/var/ossec/bin/wazuh-control" ]; then
    /var/ossec/bin/wazuh-control info || true
fi

echo ""
echo "Service status:"
systemctl status wazuh-manager --no-pager || true

echo ""
echo "Listening ports:"
netstat -tulpn | grep -E '(1514|1515|1516|55000)' || echo "No Wazuh ports listening"

echo ""
echo "Running processes:"
ps aux | grep wazuh | grep -v grep || echo "No Wazuh processes running"

echo ""
echo "Disk space:"
df -h /var/ossec || df -h /

echo ""
echo "Recent log entries:"
if [ -f "/var/ossec/logs/ossec.log" ]; then
    tail -20 /var/ossec/logs/ossec.log
fi

################################################################################
# Step 2: Stop and Clean
################################################################################

echo ""
echo -e "${YELLOW}[2/6] Stopping Wazuh and cleaning processes...${NC}"

systemctl stop wazuh-manager 2>/dev/null || true
sleep 3

# Kill any remaining processes
killall -9 wazuh-authd wazuh-modulesd wazuh-analysisd wazuh-db wazuh-remoted wazuh-execd wazuh-syscheckd 2>/dev/null || true
sleep 2

echo -e "${GREEN}✓ Processes stopped${NC}"

################################################################################
# Step 3: Clean State Files
################################################################################

echo -e "${YELLOW}[3/6] Cleaning state files...${NC}"

if [ -d "/var/ossec/var/run" ]; then
    rm -f /var/ossec/var/run/*.pid
    rm -f /var/ossec/var/run/*.state
    echo -e "${GREEN}✓ Removed PID and state files${NC}"
fi

# Fix ownership
if [ -d "/var/ossec" ]; then
    chown -R wazuh:wazuh /var/ossec
    echo -e "${GREEN}✓ Fixed ownership${NC}"
fi

################################################################################
# Step 4: Fix Configuration Issues
################################################################################

echo -e "${YELLOW}[4/6] Checking configuration...${NC}"

if [ -f "/var/ossec/etc/ossec.conf" ]; then
    # Backup configuration
    cp /var/ossec/etc/ossec.conf /var/ossec/etc/ossec.conf.backup.$(date +%Y%m%d_%H%M%S)

    # Remove deprecated tags
    if grep -q '<force_time>' /var/ossec/etc/ossec.conf; then
        sed -i.bak '/<force_time>/d; /<force_insert>/d' /var/ossec/etc/ossec.conf
        echo -e "${GREEN}✓ Removed deprecated configuration tags${NC}"
    fi

    # Validate configuration
    if /var/ossec/bin/wazuh-logtest < /dev/null 2>&1 | grep -q "ERROR"; then
        echo -e "${YELLOW}⚠ Configuration validation found issues${NC}"
        /var/ossec/bin/wazuh-logtest < /dev/null || true
    else
        echo -e "${GREEN}✓ Configuration valid${NC}"
    fi
fi

################################################################################
# Step 5: Clean Install (if requested)
################################################################################

if [ "$CLEAN_INSTALL" = true ]; then
    echo -e "${YELLOW}[5/6] Performing clean installation...${NC}"

    # Backup configuration and data
    BACKUP_DIR="/root/wazuh-backup-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"

    if [ -d "/var/ossec/etc" ]; then
        cp -r /var/ossec/etc "$BACKUP_DIR/"
        echo "Configuration backed up to: $BACKUP_DIR"
    fi

    # Remove Wazuh
    apt-get remove --purge wazuh-manager -y 2>/dev/null || true
    rm -rf /var/ossec

    # Reinstall
    echo "Installing Wazuh Manager..."

    # Add repository if not present
    if [ ! -f "/etc/apt/sources.list.d/wazuh.list" ]; then
        curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -
        echo "deb https://packages.wazuh.com/4.x/apt/ stable main" > /etc/apt/sources.list.d/wazuh.list
        apt-get update
    fi

    # Install
    apt-get install -y wazuh-manager

    echo -e "${GREEN}✓ Clean installation complete${NC}"
else
    echo -e "${YELLOW}[5/6] Skipping clean installation (use --clean-install to reinstall)${NC}"
fi

################################################################################
# Step 6: Start and Verify
################################################################################

echo -e "${YELLOW}[6/6] Starting Wazuh Manager...${NC}"

systemctl enable wazuh-manager
systemctl start wazuh-manager

echo "Waiting for Wazuh to initialize (60 seconds)..."
sleep 60

# Check status
if systemctl is-active --quiet wazuh-manager; then
    echo -e "${GREEN}✓ Wazuh Manager is running${NC}"

    # Check processes
    echo ""
    echo "Wazuh processes:"
    ps aux | grep wazuh | grep -v grep

    # Check API
    echo ""
    echo "Testing Wazuh API:"
    API_RESPONSE=$(curl -sk -u admin:admin -X GET "https://localhost:55000/" 2>/dev/null || echo "failed")
    if echo "$API_RESPONSE" | grep -q "title"; then
        echo -e "${GREEN}✓ Wazuh API responding${NC}"
    else
        echo -e "${YELLOW}⚠ Wazuh API not responding (may need a few more minutes)${NC}"
    fi

    # Update SOC Hub configuration
    echo ""
    echo "Updating SOC Hub configuration..."
    if [ -f "/opt/mcp/soc-hub-mcp/.env" ]; then
        cd /opt/mcp/soc-hub-mcp/

        # Ensure Wazuh configuration is correct
        if grep -q "WAZUH_API_URL" .env; then
            echo -e "${GREEN}✓ SOC Hub already configured for Wazuh${NC}"
        else
            cat >> .env <<EOF

# Wazuh Configuration (Fixed)
WAZUH_API_URL=https://154.26.158.31:55000
WAZUH_API_USER=admin
WAZUH_API_PASSWORD=admin
WAZUH_VERIFY_SSL=false
EOF
            echo -e "${GREEN}✓ Added Wazuh configuration to SOC Hub${NC}"
        fi

        # Restart SOC Hub
        systemctl restart soc-hub-mcp
        echo -e "${GREEN}✓ SOC Hub restarted${NC}"
    fi

else
    echo -e "${RED}✗ Wazuh Manager failed to start${NC}"
    echo ""
    echo "Check logs for details:"
    echo "  tail -100 /var/ossec/logs/ossec.log"
    echo "  journalctl -u wazuh-manager -n 100"
    exit 1
fi

echo ""
echo -e "${BLUE}=== Wazuh Manager Status ===${NC}"
echo ""

systemctl status wazuh-manager --no-pager

echo ""
echo -e "${GREEN}Fix complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Test Wazuh API: curl -sk -u admin:admin https://localhost:55000/"
echo "  2. Test via SOC Hub: curl http://localhost:3200/api/v1/health | jq '.data.services[] | select(.service==\"wazuh\")'"
echo "  3. View agents: curl http://localhost:3200/api/v1/agents"
echo ""
echo "If issues persist, check logs:"
echo "  tail -f /var/ossec/logs/ossec.log"
echo ""
