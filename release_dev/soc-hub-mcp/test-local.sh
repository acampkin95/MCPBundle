#!/usr/bin/env bash
# Quick local test of SOC Hub MCP Server
# Tests the server locally before deploying to production

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "========================================="
echo "SOC Hub MCP - Local Test"
echo "========================================="
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if built
if [ ! -d "dist" ]; then
    echo -e "${RED}Error: dist/ directory not found${NC}"
    echo "Run: npm run build"
    exit 1
fi

echo -e "${GREEN}✓ Build directory found${NC}"

# Check .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Warning: .env file not found, copying from example${NC}"
    cp .env.example .env
fi

echo -e "${GREEN}✓ Configuration file found${NC}"
echo

# Start server in background
echo -e "${YELLOW}Starting SOC Hub server on port 3200...${NC}"
PORT=3200 NODE_ENV=development node dist/index.js &
SERVER_PID=$!

echo "Server PID: $SERVER_PID"
echo "Waiting for server to start..."
sleep 3

# Test if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${RED}Error: Server failed to start${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Server started successfully${NC}"
echo

# Test endpoints
echo -e "${YELLOW}Testing endpoints...${NC}"
echo

# Root endpoint
echo -n "Testing GET / ... "
if curl -s http://localhost:3200/ | jq -e '.service' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC}"
fi

# Health endpoint
echo -n "Testing GET /api/v1/health ... "
if curl -s http://localhost:3200/api/v1/health | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    curl -s http://localhost:3200/api/v1/health | jq '.data.services[] | {service, status}'
else
    echo -e "${RED}✗${NC}"
    echo "Note: Some services may be unreachable in local test"
fi

echo
echo -e "${YELLOW}Stopping server...${NC}"
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo
echo "========================================="
echo -e "${GREEN}Local test complete!${NC}"
echo "========================================="
echo
echo "Server is ready for deployment."
echo "See DEPLOY_MANUAL.md for deployment instructions."
echo
