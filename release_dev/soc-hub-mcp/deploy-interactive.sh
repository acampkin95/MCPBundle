#!/usr/bin/env bash
# SOC Hub MCP - Interactive Deployment Script
# Deploys to VMI03 with password prompts

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TARGET_HOST="154.26.158.31"
TARGET_USER="root"
INSTALL_DIR="/opt/mcp/soc-hub-mcp"

clear
echo "==========================================="
echo "  SOC Hub MCP - Interactive Deployment"
echo "==========================================="
echo
echo -e "${BLUE}Target: ${TARGET_USER}@${TARGET_HOST}${NC}"
echo -e "${BLUE}Install: ${INSTALL_DIR}${NC}"
echo
echo "This script will:"
echo "  1. Transfer files to VMI03"
echo "  2. Install dependencies"
echo "  3. Retrieve credentials"
echo "  4. Configure the service"
echo "  5. Start and verify deployment"
echo
read -p "Press Enter to continue or Ctrl+C to cancel..."
echo

# Check sshpass
if ! command -v sshpass &> /dev/null; then
    echo -e "${RED}Error: sshpass not found${NC}"
    echo "Install with: brew install hudochenkov/sshpass/sshpass"
    exit 1
fi

# Get password
echo -e "${YELLOW}Enter root password for ${TARGET_HOST}:${NC}"
read -s ROOT_PASSWORD
echo
export SSHPASS="$ROOT_PASSWORD"

# Test connection
echo -e "${YELLOW}[1/8] Testing SSH connection...${NC}"
if ! sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    -o ConnectTimeout=10 "${TARGET_USER}@${TARGET_HOST}" "echo 'Connection successful'" &>/dev/null; then
    echo -e "${RED}✗ SSH connection failed${NC}"
    echo "Please check:"
    echo "  - Password is correct"
    echo "  - Server is accessible"
    echo "  - Network connection"
    exit 1
fi
echo -e "${GREEN}✓ SSH connection successful${NC}"
echo

# Create directory
echo -e "${YELLOW}[2/8] Creating installation directory...${NC}"
sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "${TARGET_USER}@${TARGET_HOST}" "mkdir -p ${INSTALL_DIR}"
echo -e "${GREEN}✓ Directory created${NC}"
echo

# Transfer files
echo -e "${YELLOW}[3/8] Transferring files...${NC}"
sshpass -e rsync -avz --delete \
    -e "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
    dist/ package.json package-lock.json .env deployment/ README.md \
    "${TARGET_USER}@${TARGET_HOST}:${INSTALL_DIR}/"
echo -e "${GREEN}✓ Files transferred${NC}"
echo

# Install dependencies
echo -e "${YELLOW}[4/8] Installing dependencies on server...${NC}"
sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "${TARGET_USER}@${TARGET_HOST}" "cd ${INSTALL_DIR} && npm ci --only=production" 2>&1 | \
    grep -E "(added|audited|packages|vulnerabilities)" || true
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo

# Get Elasticsearch password
echo -e "${YELLOW}[5/8] Retrieving Elasticsearch password...${NC}"
ELASTIC_PASSWORD=$(sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "${TARGET_USER}@${TARGET_HOST}" "cat /opt/mcp/credentials/elasticsearch.txt 2>/dev/null || echo 'NOT_FOUND'")

if [ "$ELASTIC_PASSWORD" != "NOT_FOUND" ] && [ -n "$ELASTIC_PASSWORD" ]; then
    echo -e "${GREEN}✓ Elasticsearch password retrieved${NC}"

    # Update .env file
    echo -e "${YELLOW}[6/8] Updating configuration...${NC}"
    sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
        "${TARGET_USER}@${TARGET_HOST}" "cd ${INSTALL_DIR} && sed -i 's/ELASTICSEARCH_PASSWORD=.*/ELASTICSEARCH_PASSWORD=${ELASTIC_PASSWORD}/' .env"
    echo -e "${GREEN}✓ Configuration updated${NC}"
else
    echo -e "${YELLOW}⚠ Elasticsearch password not found${NC}"
    echo "  You'll need to update it manually later"
fi
echo

# Install systemd service
echo -e "${YELLOW}[7/8] Installing systemd service...${NC}"
sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "${TARGET_USER}@${TARGET_HOST}" << 'ENDSSH'
cd /opt/mcp/soc-hub-mcp
cp deployment/soc-hub-mcp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable soc-hub-mcp
systemctl restart soc-hub-mcp
sleep 3
ENDSSH
echo -e "${GREEN}✓ Service installed and started${NC}"
echo

# Check service status
echo -e "${YELLOW}[8/8] Verifying deployment...${NC}"
SERVICE_STATUS=$(sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "${TARGET_USER}@${TARGET_HOST}" "systemctl is-active soc-hub-mcp" || echo "inactive")

if [ "$SERVICE_STATUS" = "active" ]; then
    echo -e "${GREEN}✓ Service is running${NC}"
else
    echo -e "${RED}✗ Service is not running${NC}"
    echo "Check logs with: ssh root@${TARGET_HOST} 'journalctl -u soc-hub-mcp -n 50'"
fi
echo

# Test API
echo -e "${YELLOW}Testing API endpoint...${NC}"
sleep 2
if curl -s -f "http://${TARGET_HOST}:3200/api/v1/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ API is responding${NC}"
    echo
    echo "API Health Check:"
    curl -s "http://${TARGET_HOST}:3200/api/v1/health" | jq '.data.services[] | {service, status, response_time_ms}' 2>/dev/null || \
    curl -s "http://${TARGET_HOST}:3200/api/v1/health"
else
    echo -e "${YELLOW}⚠ API not responding yet (may need credentials)${NC}"
fi
echo

# Summary
echo "==========================================="
echo -e "${GREEN}  Deployment Complete!${NC}"
echo "==========================================="
echo
echo "Service Status:"
echo "  • Service: soc-hub-mcp"
echo "  • Status: ${SERVICE_STATUS}"
echo "  • API URL: http://${TARGET_HOST}:3200"
echo
echo "Next Steps:"
echo "  1. Generate TheHive API key at http://${TARGET_HOST}:9000"
echo "  2. Update .env: ssh root@${TARGET_HOST} 'nano ${INSTALL_DIR}/.env'"
echo "  3. Restart service: ssh root@${TARGET_HOST} 'systemctl restart soc-hub-mcp'"
echo "  4. View logs: ssh root@${TARGET_HOST} 'journalctl -u soc-hub-mcp -f'"
echo
echo "Test Endpoints:"
echo "  curl http://${TARGET_HOST}:3200/api/v1/health | jq ."
echo "  curl http://${TARGET_HOST}:3200/api/v1/dashboard | jq .data.overview"
echo "  curl http://${TARGET_HOST}:3200/api/v1/agents | jq ."
echo
echo -e "${GREEN}🎉 SOC Hub deployed successfully!${NC}"
echo

# Unset password
unset SSHPASS
