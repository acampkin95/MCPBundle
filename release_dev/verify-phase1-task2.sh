#!/bin/bash

# Phase 1 Task 2 Verification Script
# Verifies all deliverables are in place

set -e

echo "=========================================="
echo "Phase 1 Task 2 Verification"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
TOTAL=0
PASSED=0
FAILED=0

check_file() {
    TOTAL=$((TOTAL + 1))
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗${NC} $2 - NOT FOUND: $1"
        FAILED=$((FAILED + 1))
    fi
}

check_dir() {
    TOTAL=$((TOTAL + 1))
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗${NC} $2 - NOT FOUND: $1"
        FAILED=$((FAILED + 1))
    fi
}

# Change to script directory
cd "$(dirname "$0")"

echo "1. Package.json Files"
echo "---------------------"
check_file "itjsst-mcp/package.json" "itjsst-mcp package.json"
check_file "mcp-orchestrator/package.json" "mcp-orchestrator package.json"
check_file "perplexity-mcp/package.json" "perplexity-mcp package.json"
check_file "cloudflare-mcp/package.json" "cloudflare-mcp package.json"
check_file "soc-hub-mcp/package.json" "soc-hub-mcp package.json"
check_file "admin-panel/package.json" "admin-panel package.json"
echo ""

echo "2. Vitest Configuration Files"
echo "-----------------------------"
check_file "itjsst-mcp/vitest.config.ts" "itjsst-mcp vitest config"
check_file "mcp-orchestrator/vitest.config.ts" "mcp-orchestrator vitest config"
check_file "cloudflare-mcp/vitest.config.ts" "cloudflare-mcp vitest config"
check_file "admin-panel/vitest.config.ts" "admin-panel vitest config"
echo ""

echo "3. Test Templates"
echo "----------------"
check_file "shared/test-templates/unit.test.template.ts" "Unit test template"
check_file "shared/test-templates/integration.test.template.ts" "Integration test template"
check_file "shared/test-templates/e2e.test.template.ts" "E2E test template"
check_file "shared/test-templates/performance.test.template.ts" "Performance test template"
check_file "shared/test-templates/README.md" "Templates README"
echo ""

echo "4. Test Directory Structures"
echo "---------------------------"
check_dir "itjsst-mcp/tests/unit" "itjsst-mcp tests/unit"
check_dir "itjsst-mcp/tests/integration" "itjsst-mcp tests/integration"
check_dir "mcp-orchestrator/tests/unit" "mcp-orchestrator tests/unit"
check_dir "mcp-orchestrator/tests/integration" "mcp-orchestrator tests/integration"
check_dir "cloudflare-mcp/tests/unit" "cloudflare-mcp tests/unit"
check_dir "cloudflare-mcp/tests/integration" "cloudflare-mcp tests/integration"
check_dir "admin-panel/tests/unit" "admin-panel tests/unit"
check_dir "admin-panel/tests/integration" "admin-panel tests/integration"
echo ""

echo "5. Documentation Files"
echo "---------------------"
check_file "../V2_DEPENDENCY_UPGRADE_NOTES.md" "Dependency upgrade notes"
check_file "V2_TESTING_INFRASTRUCTURE_GUIDE.md" "Testing infrastructure guide"
check_file "PHASE1_TASK2_COMPLETE.md" "Task completion summary"
echo ""

echo "6. Backup Files"
echo "--------------"
check_dir ".backup/package-json-originals" "Backup directory"
check_file ".backup/package-json-originals/itjsst-mcp-package.json.bak" "itjsst-mcp backup"
check_file ".backup/package-json-originals/mcp-orchestrator-package.json.bak" "mcp-orchestrator backup"
check_file ".backup/package-json-originals/perplexity-mcp-package.json.bak" "perplexity-mcp backup"
check_file ".backup/package-json-originals/cloudflare-mcp-package.json.bak" "cloudflare-mcp backup"
check_file ".backup/package-json-originals/soc-hub-mcp-package.json.bak" "soc-hub-mcp backup"
check_file ".backup/package-json-originals/admin-panel-package.json.bak" "admin-panel backup"
echo ""

echo "7. Example Test Files"
echo "--------------------"
check_file "itjsst-mcp/tests/unit/example.test.ts" "itjsst-mcp example test"
check_file "admin-panel/tests/setup.ts" "admin-panel test setup"
echo ""

# Summary
echo "=========================================="
echo "Verification Summary"
echo "=========================================="
echo -e "Total checks: ${TOTAL}"
echo -e "${GREEN}Passed: ${PASSED}${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: ${FAILED}${NC}"
else
    echo -e "Failed: ${FAILED}"
fi
echo ""

# Check package.json versions
echo "=========================================="
echo "Dependency Version Check"
echo "=========================================="
echo ""

check_version() {
    local file=$1
    local dep=$2
    local expected=$3

    if [ -f "$file" ]; then
        local version=$(grep "\"$dep\"" "$file" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
        if [ "$version" = "$expected" ]; then
            echo -e "${GREEN}✓${NC} $file: $dep = $version"
        else
            echo -e "${YELLOW}⚠${NC} $file: $dep = $version (expected: $expected)"
        fi
    fi
}

echo "TypeScript versions (expected: 5.9.6):"
check_version "itjsst-mcp/package.json" "typescript" "5.9.6"
check_version "mcp-orchestrator/package.json" "typescript" "5.9.6"
check_version "cloudflare-mcp/package.json" "typescript" "5.9.6"
check_version "soc-hub-mcp/package.json" "typescript" "5.9.6"
check_version "admin-panel/package.json" "typescript" "5.9.6"
echo ""

echo "Vitest versions (expected: ^2.1.8):"
check_version "itjsst-mcp/package.json" "vitest" "^2.1.8"
check_version "mcp-orchestrator/package.json" "vitest" "^2.1.8"
check_version "cloudflare-mcp/package.json" "vitest" "^2.1.8"
check_version "soc-hub-mcp/package.json" "vitest" "^2.1.8"
check_version "admin-panel/package.json" "vitest" "^2.1.8"
echo ""

echo "MCP SDK versions (expected: 1.0.4):"
check_version "itjsst-mcp/package.json" "@modelcontextprotocol/sdk" "1.0.4"
check_version "mcp-orchestrator/package.json" "@modelcontextprotocol/sdk" "1.0.4"
check_version "perplexity-mcp/package.json" "@modelcontextprotocol/sdk" "1.0.4"
check_version "cloudflare-mcp/package.json" "@modelcontextprotocol/sdk" "1.0.4"
check_version "soc-hub-mcp/package.json" "@modelcontextprotocol/sdk" "1.0.4"
echo ""

# Final verdict
echo "=========================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ ALL CHECKS PASSED!${NC}"
    echo ""
    echo "Phase 1 Task 2 is complete and verified."
    echo ""
    echo "Next steps:"
    echo "1. Run 'npm install' in each server directory"
    echo "2. Run 'npm run build' to verify TypeScript compilation"
    echo "3. Run 'npm test' to verify test infrastructure"
    exit 0
else
    echo -e "${RED}✗ SOME CHECKS FAILED${NC}"
    echo ""
    echo "Please review the failed checks above."
    exit 1
fi
