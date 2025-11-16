#!/usr/bin/env bash
# Import secrets from .env files into Contabo Secrets and clean up

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "========================================="
echo "MCP Bundle Secrets Import Tool"
echo "========================================="
echo

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Fix file ownership for contaboSecrets.ts if needed
if [ -f "src/tools/contaboSecrets.ts" ] && [ "$(stat -f '%Su' src/tools/contaboSecrets.ts)" == "root" ]; then
    echo -e "${YELLOW}Fixing file ownership...${NC}"
    sudo chown "$(whoami):staff" src/tools/contaboSecrets.ts
fi

# Step 2: Add PERPLEXITY_API_KEY to SECRET_DEFINITIONS
echo -e "${YELLOW}Step 1: Adding PERPLEXITY_API_KEY to secrets tool...${NC}"

if ! grep -q "PERPLEXITY_API_KEY" src/tools/contaboSecrets.ts; then
    # Backup the file
    cp src/tools/contaboSecrets.ts src/tools/contaboSecrets.ts.bak

    # Add the new secret definition before the closing bracket
    sed -i '' '/WORM_ACCESS_PASSWORD/,/},/a\
  {\
    envVar: '\''PERPLEXITY_API_KEY'\'',\
    name: '\''perplexity-api-key'\'',\
    type: '\''password'\'',\
    description: '\''Perplexity AI API key for search and research capabilities.'\'',\
  },' src/tools/contaboSecrets.ts

    echo -e "${GREEN}✓ Added PERPLEXITY_API_KEY to SECRET_DEFINITIONS${NC}"
else
    echo -e "${GREEN}✓ PERPLEXITY_API_KEY already in SECRET_DEFINITIONS${NC}"
fi

# Step 3: Check for Contabo credentials
echo
echo -e "${YELLOW}Step 2: Checking Contabo API credentials...${NC}"

MISSING_CREDS=()
for env_var in CONTABO_CLIENT_ID CONTABO_CLIENT_SECRET CONTABO_API_USER CONTABO_API_PASSWORD; do
    if [ -z "${!env_var:-}" ]; then
        MISSING_CREDS+=("$env_var")
    fi
done

if [ ${#MISSING_CREDS[@]} -gt 0 ]; then
    echo -e "${RED}ERROR: Missing Contabo credentials:${NC}"
    for cred in "${MISSING_CREDS[@]}"; do
        echo "  - $cred"
    done
    echo
    echo "Please set these environment variables before running this script:"
    echo "  export CONTABO_CLIENT_ID=..."
    echo "  export CONTABO_CLIENT_SECRET=..."
    echo "  export CONTABO_API_USER=admin@example.com"
    echo "  export CONTABO_API_PASSWORD=..."
    echo
    echo "See docs/Contabo Secrets API.pdf for instructions."
    exit 1
fi

echo -e "${GREEN}✓ Contabo credentials found${NC}"

# Step 4: Extract secrets from .env files
echo
echo -e "${YELLOW}Step 3: Extracting secrets from .env files...${NC}"

# Extract from release_dev/perplexity-mcp/.env
if [ -f "release_dev/perplexity-mcp/.env" ]; then
    export PERPLEXITY_API_KEY=$(grep "^PERPLEXITY_API_KEY=" release_dev/perplexity-mcp/.env | cut -d'=' -f2-)

    # Extract DB password from DATABASE_URL
    DB_PASS=$(grep "^DATABASE_URL=" release_dev/perplexity-mcp/.env | sed -E 's/.*:\/\/[^:]+:([^@]+)@.*/\1/')
    export DB_ADMIN_PASSWORD="$DB_PASS"

    echo -e "${GREEN}✓ Extracted PERPLEXITY_API_KEY${NC}"
    echo -e "${GREEN}✓ Extracted DB_ADMIN_PASSWORD${NC}"
else
    echo -e "${RED}ERROR: release_dev/perplexity-mcp/.env not found${NC}"
    exit 1
fi

# Step 5: Push secrets to Contabo
echo
echo -e "${YELLOW}Step 4: Pushing secrets to Contabo...${NC}"
echo

npm run secrets:push

# Step 6: Verify secrets were uploaded
echo
echo -e "${YELLOW}Step 5: Verifying secrets...${NC}"
echo

npm run secrets:list

# Step 7: Update .env file to reference Contabo Secrets
echo
echo -e "${YELLOW}Step 6: Updating .env files...${NC}"

if [ -f "release_dev/perplexity-mcp/.env" ]; then
    # Backup the file
    cp release_dev/perplexity-mcp/.env release_dev/perplexity-mcp/.env.backup

    # Update the file to reference Contabo Secrets
    cat > release_dev/perplexity-mcp/.env <<'EOF'
# Perplexity MCP Server Configuration
# Production configuration for ACDev

# ======================
# API Configuration
# ======================

# Perplexity API Key
# Managed via Contabo Secrets: npm run secrets:pull -- --out .env.secrets
# Get your API key from https://www.perplexity.ai/settings/api
PERPLEXITY_API_KEY=${PERPLEXITY_API_KEY}

# ======================
# Mode Configuration
# ======================

# MCP Mode: 'acdev' (full features) or 'public' (BI only)
MCP_MODE=acdev

# ======================
# Database Configuration
# ======================

# PostgreSQL Connection String
# Password managed via Contabo Secrets (DB_ADMIN_PASSWORD)
DATABASE_URL=postgresql://mcp_admin:${DB_ADMIN_PASSWORD}@localhost:5432/mcp_ecosystem

# ======================
# Redis Configuration
# ======================

# Redis URL for caching
REDIS_URL=redis://localhost:6379

# ======================
# Budget Configuration
# ======================

# Daily auto-approval limit in USD
DAILY_AUTO_APPROVAL_USD=1.00

# Weekly minimum budget in USD
WEEKLY_BUDGET_USD=8.00

# ======================
# Authentication (Optional)
# ======================

# Keycloak URL for authentication
KEYCLOAK_URL=http://localhost:8080

# ======================
# Logging Configuration
# ======================

# Log level: error, warn, info, debug
LOG_LEVEL=info

# ======================
# Development Settings
# ======================

# Node environment: development, production, test
NODE_ENV=development

# ======================
# Secrets Management
# ======================
# All secrets are managed via Contabo Secrets API
# To use this .env file, first pull secrets:
#   npm run secrets:pull -- --out .env.secrets
#   source .env.secrets
# Then the ${VARIABLE} references will be substituted
EOF

    echo -e "${GREEN}✓ Updated release_dev/perplexity-mcp/.env${NC}"
    echo -e "  Original backed up to release_dev/perplexity-mcp/.env.backup"
fi

# Step 8: Clean up sensitive documentation
echo
echo -e "${YELLOW}Step 7: Cleaning up documentation...${NC}"

# MCP_CREDENTIALS.txt is already clean (empty passwords)
# SOC_PROJECT_SUMMARY_AND_CREDENTIALS.md already references Contabo Secrets
echo -e "${GREEN}✓ Documentation already references Contabo Secrets${NC}"

# Summary
echo
echo "========================================="
echo -e "${GREEN}✓ Secrets import complete!${NC}"
echo "========================================="
echo
echo "Next steps:"
echo "1. Verify secrets in Contabo: npm run secrets:list"
echo "2. Pull secrets locally when needed:"
echo "   npm run secrets:pull -- --out .env.secrets"
echo "   source .env.secrets"
echo "3. Remove backup files if everything works:"
echo "   rm release_dev/perplexity-mcp/.env.backup"
echo "   rm src/tools/contaboSecrets.ts.bak"
echo
echo "Secrets managed:"
echo "  ✓ PERPLEXITY_API_KEY"
echo "  ✓ DB_ADMIN_PASSWORD"
echo "  ✓ MCP_ROOT_PASSWORD (if set)"
echo "  ✓ DB_REPL_PASSWORD (if set)"
echo "  ✓ WORM_ACCESS_PASSWORD (if set)"
echo
