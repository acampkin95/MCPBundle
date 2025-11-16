#!/bin/bash
# Enterprise Code Quality & Security Scanning Script
# Optimized for MCP Development with Vitest, TypeScript strict mode, and performance testing

set -e

echo "=============================================="
echo "🚀 MCP Enterprise Code Quality Suite"
echo "=============================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Track failures
FAILED=0
START_TIME=$(date +%s)

# 1. TypeScript Strict Type Checking
echo -e "${BLUE}[1/8]${NC} ${YELLOW}TypeScript Strict Mode Type Checking...${NC}"
TYPE_START=$(date +%s)
if npx tsc --noEmit; then
    TYPE_END=$(date +%s)
    TYPE_DURATION=$((TYPE_END - TYPE_START))
    echo -e "${GREEN}✓ TypeScript type check passed (${TYPE_DURATION}s)${NC}"
    if [ $TYPE_DURATION -gt 1 ]; then
        echo -e "${YELLOW}  ⚠ Type checking took ${TYPE_DURATION}s (target: <1s)${NC}"
    fi
else
    echo -e "${RED}✗ TypeScript type check failed${NC}"
    FAILED=$((FAILED+1))
fi
echo ""

# 2. ESLint with Security Rules
echo -e "${BLUE}[2/8]${NC} ${YELLOW}ESLint (with security plugin)...${NC}"
if npx eslint . --ext .ts,.tsx,.js,.jsx; then
    echo -e "${GREEN}✓ ESLint passed${NC}"
else
    echo -e "${RED}✗ ESLint found issues${NC}"
    FAILED=$((FAILED+1))
fi
echo ""

# 3. Prettier Formatting
echo -e "${BLUE}[3/8]${NC} ${YELLOW}Code Formatting (Prettier)...${NC}"
if npx prettier --check "**/*.{ts,tsx,js,jsx,json,md}"; then
    echo -e "${GREEN}✓ Code formatting is correct${NC}"
else
    echo -e "${RED}✗ Code formatting issues. Run: npm run format${NC}"
    FAILED=$((FAILED+1))
fi
echo ""

# 4. Vitest Unit Tests with Coverage
echo -e "${BLUE}[4/8]${NC} ${YELLOW}Vitest Unit Tests + Coverage...${NC}"
TEST_START=$(date +%s)
if npx vitest run --coverage; then
    TEST_END=$(date +%s)
    TEST_DURATION=$((TEST_END - TEST_START))
    echo -e "${GREEN}✓ All tests passed (${TEST_DURATION}s)${NC}"
    if [ $TEST_DURATION -gt 10 ]; then
        echo -e "${YELLOW}  ⚠ Tests took ${TEST_DURATION}s (target: <10s)${NC}"
    fi
else
    echo -e "${RED}✗ Tests failed${NC}"
    FAILED=$((FAILED+1))
fi
echo ""

# 5. npm Security Audit
echo -e "${BLUE}[5/8]${NC} ${YELLOW}npm Security Audit...${NC}"
if npm audit --audit-level=moderate; then
    echo -e "${GREEN}✓ No moderate+ vulnerabilities${NC}"
else
    echo -e "${RED}✗ Security vulnerabilities found. Run: npm audit fix${NC}"
    FAILED=$((FAILED+1))
fi
echo ""

# 6. Semgrep Security Scan
echo -e "${BLUE}[6/8]${NC} ${YELLOW}Semgrep Security Analysis...${NC}"
SEM_GREP_TARGETS=(release_dev/cloudflare-mcp/src release_dev/admin-panel)
if command -v semgrep &> /dev/null; then
    if semgrep --config=auto --error --quiet "${SEM_GREP_TARGETS[@]}"; then
        echo -e "${GREEN}✓ Semgrep security scan passed${NC}"
    else
        echo -e "${RED}✗ Semgrep found security issues${NC}"
        FAILED=$((FAILED+1))
    fi
else
    echo -e "${YELLOW}⚠ Semgrep not installed (optional)${NC}"
fi
echo ""

# 7. ShellCheck (Shell Scripts)
echo -e "${BLUE}[7/8]${NC} ${YELLOW}ShellCheck (Shell Scripts)...${NC}"
if find deployment scripts release_dev -name "*.sh" -not -path "*/node_modules/*" -not -path "*/dist/*" -quit 2>/dev/null | grep -q .; then
    if command -v shellcheck &> /dev/null; then
        if find deployment scripts release_dev -name "*.sh" -not -path "*/node_modules/*" -not -path "*/dist/*" -print0 2>/dev/null | \
            xargs -0 --no-run-if-empty shellcheck --severity=error; then
            echo -e "${GREEN}✓ ShellCheck passed${NC}"
        else
            echo -e "${RED}✗ ShellCheck found issues${NC}"
            FAILED=$((FAILED+1))
        fi
    else
        echo -e "${YELLOW}⚠ ShellCheck not installed${NC}"
    fi
else
    echo -e "${YELLOW}⚠ No shell scripts found${NC}"
fi
echo ""

# 8. Bundle Size Check (if dist exists)
echo -e "${BLUE}[8/8]${NC} ${YELLOW}Bundle Size Analysis...${NC}"
if [ -d "dist" ]; then
    BUNDLE_SIZE=$(du -sh dist | cut -f1)
    echo -e "${GREEN}✓ Bundle size: ${BUNDLE_SIZE}${NC}"
else
    echo -e "${YELLOW}⚠ No dist/ folder. Run: npm run build${NC}"
fi
echo ""

# Release package QA
echo -e "${BLUE}[*]${NC} ${YELLOW}Release Package QA (lint/test/build)${NC}"
PACKAGES=(
  "release_dev/itjsst-mcp:ITJSST-MCP:--runInBand"
  "release_dev/mcp-orchestrator:MCP-Orchestrator:--runInBand"
  "release_dev/cloudflare-mcp:Cloudflare-MCP:--runInBand"
  "release_dev/admin-panel:Admin-Panel:"
)

for entry in "${PACKAGES[@]}"; do
    IFS=':' read -r path label test_args <<< "$entry"
    echo -e "  → ${label}"
    if (cd "$path" && npm ci && npm run lint && { if [ -n "$test_args" ]; then npm run test -- "$test_args"; else npm run test; fi; } && npm run build); then
        echo -e "    ${GREEN}✓ ${label} passed lint/test/build${NC}"
    else
        echo -e "    ${RED}✗ ${label} failed quality gates${NC}"
        FAILED=$((FAILED + 1))
    fi
    echo ""
done

# Performance Summary
END_TIME=$(date +%s)
TOTAL_DURATION=$((END_TIME - START_TIME))

echo "=============================================="
echo "📊 Performance Summary"
echo "=============================================="
echo -e "Total time: ${BLUE}${TOTAL_DURATION}s${NC}"
echo ""

# Final Result
echo "=============================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All quality checks passed!${NC}"
    echo -e "${GREEN}Code is ready to commit and deploy.${NC}"
    exit 0
else
    echo -e "${RED}❌ $FAILED check(s) failed${NC}"
    echo -e "${RED}Please fix issues before committing.${NC}"
    exit 1
fi
