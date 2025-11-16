#!/usr/bin/env bash
# SOC Hub MCP Server - Deployment Script
# Deploys the SOC Hub server to VMI03 (SOC Hub)

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "==========================================="
echo "SOC Hub MCP Server - Deployment"
echo "==========================================="
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TARGET_HOST="${1:-154.26.158.31}"
TARGET_USER="${2:-root}"
INSTALL_DIR="/opt/mcp/soc-hub-mcp"

echo -e "${YELLOW}Deploying to: ${TARGET_USER}@${TARGET_HOST}${NC}"
echo -e "${YELLOW}Install directory: ${INSTALL_DIR}${NC}"
echo

# Step 1: Build the project
echo -e "${YELLOW}[1/6] Building project...${NC}"
npm run build
echo -e "${GREEN}✓ Build complete${NC}"
echo

# Step 2: Create deployment package
echo -e "${YELLOW}[2/6] Creating deployment package...${NC}"
TEMP_DIR=$(mktemp -d)
mkdir -p "$TEMP_DIR/soc-hub-mcp"

# Copy necessary files
cp -r dist "$TEMP_DIR/soc-hub-mcp/"
cp package.json package-lock.json "$TEMP_DIR/soc-hub-mcp/"
cp .env.example "$TEMP_DIR/soc-hub-mcp/"
cp README.md "$TEMP_DIR/soc-hub-mcp/"
cp -r deployment "$TEMP_DIR/soc-hub-mcp/"

echo -e "${GREEN}✓ Package created${NC}"
echo

# Step 3: Transfer to server
echo -e "${YELLOW}[3/6] Transferring files to server...${NC}"
ssh "$TARGET_USER@$TARGET_HOST" "mkdir -p $INSTALL_DIR"
rsync -avz --delete \
    "$TEMP_DIR/soc-hub-mcp/" \
    "$TARGET_USER@$TARGET_HOST:$INSTALL_DIR/"

echo -e "${GREEN}✓ Files transferred${NC}"
echo

# Step 4: Install dependencies on server
echo -e "${YELLOW}[4/6] Installing dependencies on server...${NC}"
ssh "$TARGET_USER@$TARGET_HOST" <<'ENDSSH'
cd /opt/mcp/soc-hub-mcp
npm ci --only=production
ENDSSH

echo -e "${GREEN}✓ Dependencies installed${NC}"
echo

# Step 5: Configure environment
echo -e "${YELLOW}[5/6] Configuring environment...${NC}"

if ssh "$TARGET_USER@$TARGET_HOST" "[ ! -f $INSTALL_DIR/.env ]"; then
    echo "Creating .env file from template..."
    ssh "$TARGET_USER@$TARGET_HOST" "cp $INSTALL_DIR/.env.example $INSTALL_DIR/.env"
    echo -e "${YELLOW}⚠ Please edit $INSTALL_DIR/.env with correct credentials${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

echo

# Step 6: Install and start systemd service
echo -e "${YELLOW}[6/6] Installing systemd service...${NC}"

ssh "$TARGET_USER@$TARGET_HOST" <<'ENDSSH'
# Copy systemd service file
cp /opt/mcp/soc-hub-mcp/deployment/soc-hub-mcp.service /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable service
systemctl enable soc-hub-mcp

# Restart service
systemctl restart soc-hub-mcp

# Wait a moment for service to start
sleep 2

# Check status
if systemctl is-active --quiet soc-hub-mcp; then
    echo "✓ Service started successfully"
else
    echo "⚠ Service failed to start. Check logs with: journalctl -u soc-hub-mcp -n 50"
    exit 1
fi
ENDSSH

echo -e "${GREEN}✓ Service installed and started${NC}"
echo

# Cleanup
rm -rf "$TEMP_DIR"

echo "==========================================="
echo -e "${GREEN}Deployment Complete!${NC}"
echo "==========================================="
echo
echo "Service: soc-hub-mcp"
echo "Status: systemctl status soc-hub-mcp"
echo "Logs:   journalctl -u soc-hub-mcp -f"
echo "API:    http://$TARGET_HOST:3200"
echo
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Edit /opt/mcp/soc-hub-mcp/.env with correct credentials"
echo "2. Restart service: systemctl restart soc-hub-mcp"
echo "3. Test API: curl http://$TARGET_HOST:3200/api/v1/health"
echo "4. Update admin panel to use: http://$TARGET_HOST:3200/api/v1"
echo
