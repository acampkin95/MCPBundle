#!/bin/bash
# Phase 2 Package Verification Script
# Verifies that all files are present and scripts are executable

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Phase 2 Package Verification${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Check for required files
echo -e "${YELLOW}Checking required files...${NC}"

check_file() {
    local file=$1
    local type=${2:-"file"}

    if [[ -e "$file" ]]; then
        if [[ "$type" == "executable" ]]; then
            if [[ -x "$file" ]]; then
                echo -e "  ${GREEN}✓${NC} $file (executable)"
            else
                echo -e "  ${RED}✗${NC} $file (not executable)"
                ((ERRORS++))
            fi
        else
            echo -e "  ${GREEN}✓${NC} $file"
        fi
    else
        echo -e "  ${RED}✗${NC} $file (missing)"
        ((ERRORS++))
    fi
}

# Documentation files
echo
echo "Documentation files:"
check_file "README.md"
check_file "DEPLOYMENT_CHECKLIST.md"
check_file "TROUBLESHOOTING.md"
check_file "SECURITY.md"
check_file "PHASE2_SUMMARY.md"

# Master deployment script
echo
echo "Master deployment script:"
check_file "deploy-phase2.sh" "executable"

# WireGuard files
echo
echo "WireGuard files:"
check_file "wireguard/deploy-wireguard.sh" "executable"
check_file "wireguard/server-configs/wg-root.conf"
check_file "wireguard/server-configs/wg-mcp.conf"
check_file "wireguard/server-configs/wg-red.conf"
check_file "wireguard/client-configs/root-tunnel-macbook.conf"
check_file "wireguard/client-configs/root-tunnel-mobile.conf"
check_file "wireguard/client-configs/mcp-tunnel-agent.conf"
check_file "wireguard/client-configs/red-tunnel-guest.conf"
check_file "wireguard/systemd/wg-quick@.service"

# Keycloak files
echo
echo "Keycloak files:"
check_file "keycloak/init-keycloak.sh" "executable"
check_file "keycloak/docker-compose.yml"
check_file "keycloak/realm-config.json"
check_file "keycloak/.env.example"
check_file "keycloak/KEYCLOAK_GUIDE.md"

# PiHole files
echo
echo "PiHole files:"
check_file "pihole/deploy-pihole.sh" "executable"
check_file "pihole/docker-compose.yml"
check_file "pihole/custom-dns.list"
check_file "pihole/suricata/suricata.yaml"
check_file "pihole/dpi-ssl-setup.sh" "executable"

# Postfix files
echo
echo "Postfix files:"
check_file "postfix/install-postfix.sh" "executable"
check_file "postfix/main.cf"
check_file "postfix/test-mail.sh" "executable"

# Check for common issues
echo
echo -e "${YELLOW}Checking for common issues...${NC}"

# Check for placeholder values in configs
echo
echo "Checking for unreplaced placeholders:"
PLACEHOLDERS=$(grep -r "REPLACE_WITH_" wireguard/server-configs/ wireguard/client-configs/ 2>/dev/null | wc -l || echo 0)
if [[ $PLACEHOLDERS -gt 0 ]]; then
    echo -e "  ${YELLOW}⚠${NC} Found $PLACEHOLDERS placeholder(s) - these will be replaced during deployment"
    ((WARNINGS++))
else
    echo -e "  ${GREEN}✓${NC} No unexpected placeholders found"
fi

# Check file sizes
echo
echo "Checking file sizes:"
TOTAL_SIZE=$(du -sh . | awk '{print $1}')
echo -e "  ${GREEN}✓${NC} Total package size: $TOTAL_SIZE"

# Check line endings (should be Unix LF, not Windows CRLF)
echo
echo "Checking line endings:"
if command -v dos2unix &> /dev/null; then
    CRLF_FILES=$(find . -name "*.sh" -o -name "*.conf" -o -name "*.yml" -o -name "*.yaml" | xargs file | grep CRLF | wc -l || echo 0)
    if [[ $CRLF_FILES -gt 0 ]]; then
        echo -e "  ${RED}✗${NC} Found $CRLF_FILES file(s) with Windows line endings (CRLF)"
        echo -e "    Run: find . -name '*.sh' -o -name '*.conf' | xargs dos2unix"
        ((ERRORS++))
    else
        echo -e "  ${GREEN}✓${NC} All files have Unix line endings (LF)"
    fi
else
    echo -e "  ${YELLOW}⚠${NC} dos2unix not installed, skipping line ending check"
    ((WARNINGS++))
fi

# Summary
echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Verification Summary${NC}"
echo -e "${GREEN}========================================${NC}"
echo

if [[ $ERRORS -eq 0 && $WARNINGS -eq 0 ]]; then
    echo -e "${GREEN}✓ Package verification PASSED${NC}"
    echo -e "${GREEN}✓ All files present and properly configured${NC}"
    echo -e "${GREEN}✓ Ready for deployment to VMI03${NC}"
    echo
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Review README.md"
    echo "  2. Transfer to VMI03: scp -r phase2 root@154.26.158.31:/opt/"
    echo "  3. Deploy: ssh root@154.26.158.31 'cd /opt/phase2 && bash deploy-phase2.sh'"
    exit 0
elif [[ $ERRORS -eq 0 ]]; then
    echo -e "${YELLOW}⚠ Package verification PASSED with warnings${NC}"
    echo -e "  Errors: $ERRORS"
    echo -e "  Warnings: $WARNINGS"
    echo
    echo -e "${YELLOW}Warnings can be safely ignored if expected.${NC}"
    echo -e "${GREEN}Package is ready for deployment.${NC}"
    exit 0
else
    echo -e "${RED}✗ Package verification FAILED${NC}"
    echo -e "  Errors: $ERRORS"
    echo -e "  Warnings: $WARNINGS"
    echo
    echo -e "${RED}Please fix errors before deployment.${NC}"
    exit 1
fi
