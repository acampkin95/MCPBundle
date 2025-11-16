#!/bin/bash
#
# Disable NextCloud Service
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Disabling NextCloud Service${NC}"
echo "================================"
echo ""

cd "$SCRIPT_DIR"

# Check if containers are running
if ! docker-compose ps | grep -q "Up"; then
    echo -e "${YELLOW}NextCloud is not running${NC}"
    exit 0
fi

echo "Stopping NextCloud containers..."
docker-compose down

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}NextCloud stopped successfully${NC}"
    echo ""
    echo "Data preserved in:"
    echo "  - /mnt/nextcloud/data"
    echo "  - Docker volumes"
    echo ""
    echo "To permanently remove data, run:"
    echo "  docker-compose down -v"
else
    echo -e "${RED}Failed to stop NextCloud${NC}"
    exit 1
fi
