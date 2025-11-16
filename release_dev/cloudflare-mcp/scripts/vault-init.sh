#!/bin/bash

#
# Vault Initialization Script for SERVER-MCP
#
# This script:
# 1. Initializes Vault
# 2. Unseals Vault
# 3. Creates policies
# 4. Enables secrets engines
# 5. Stores SERVER-MCP credentials
#

set -e

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VAULT_INIT_OUTPUT="$PROJECT_ROOT/deployment/vault/vault-init.json"
VAULT_KEYS_FILE="$PROJECT_ROOT/deployment/vault/.vault-keys"

echo "🔐 Initializing HashiCorp Vault for SERVER-MCP"
echo "================================================"
echo "Vault Address: $VAULT_ADDR"
echo ""

# Check if Vault is running
if ! curl -s "$VAULT_ADDR/v1/sys/health" > /dev/null 2>&1; then
    echo "❌ Error: Vault is not running at $VAULT_ADDR"
    echo "Please start Vault first:"
    echo "  cd deployment/vault && docker-compose up -d"
    exit 1
fi

# Check if Vault is already initialized
INIT_STATUS=$(curl -s "$VAULT_ADDR/v1/sys/init" | grep -o '"initialized":[^,]*' | cut -d':' -f2)

if [ "$INIT_STATUS" = "true" ]; then
    echo "✅ Vault is already initialized"

    if [ ! -f "$VAULT_KEYS_FILE" ]; then
        echo "⚠️  Warning: Vault keys file not found at $VAULT_KEYS_FILE"
        echo "You'll need to provide the unseal keys and root token manually"
        read -p "Do you have the root token? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
        read -sp "Enter root token: " VAULT_TOKEN
        echo
    else
        echo "📂 Loading Vault keys from $VAULT_KEYS_FILE"
        VAULT_TOKEN=$(grep "root_token" "$VAULT_KEYS_FILE" | cut -d'=' -f2)
    fi
else
    echo "🔧 Initializing Vault..."

    # Initialize Vault with 5 key shares and 3 key threshold
    INIT_RESPONSE=$(curl -s --request POST \
        --data '{"secret_shares": 5, "secret_threshold": 3}' \
        "$VAULT_ADDR/v1/sys/init")

    # Save initialization response
    echo "$INIT_RESPONSE" > "$VAULT_INIT_OUTPUT"
    chmod 600 "$VAULT_INIT_OUTPUT"

    # Extract keys and token
    UNSEAL_KEY_1=$(echo "$INIT_RESPONSE" | grep -o '"keys":\[[^]]*\]' | sed 's/.*"\([^"]*\)".*/\1/' | sed -n '1p')
    UNSEAL_KEY_2=$(echo "$INIT_RESPONSE" | grep -o '"keys":\[[^]]*\]' | sed 's/.*"\([^"]*\)".*/\1/' | sed -n '2p')
    UNSEAL_KEY_3=$(echo "$INIT_RESPONSE" | grep -o '"keys":\[[^]]*\]' | sed 's/.*"\([^"]*\)".*/\1/' | sed -n '3p')
    VAULT_TOKEN=$(echo "$INIT_RESPONSE" | grep -o '"root_token":"[^"]*"' | cut -d'"' -f4)

    # Save keys to file
    cat > "$VAULT_KEYS_FILE" <<EOF
# Vault Unseal Keys and Root Token
# KEEP THIS FILE SECURE - DO NOT COMMIT TO GIT
# Store in password manager or secure vault

unseal_key_1=$UNSEAL_KEY_1
unseal_key_2=$UNSEAL_KEY_2
unseal_key_3=$UNSEAL_KEY_3
root_token=$VAULT_TOKEN

# To unseal Vault manually:
# vault operator unseal $UNSEAL_KEY_1
# vault operator unseal $UNSEAL_KEY_2
# vault operator unseal $UNSEAL_KEY_3
EOF
    chmod 600 "$VAULT_KEYS_FILE"

    echo "✅ Vault initialized successfully"
    echo "📝 Unseal keys and root token saved to: $VAULT_KEYS_FILE"
    echo ""
    echo "⚠️  IMPORTANT: Back up $VAULT_KEYS_FILE to a secure location!"
    echo "⚠️  Add to .gitignore to prevent accidental commits"
    echo ""
fi

# Unseal Vault
echo "🔓 Unsealing Vault..."
SEALED_STATUS=$(curl -s "$VAULT_ADDR/v1/sys/seal-status" | grep -o '"sealed":[^,]*' | cut -d':' -f2)

if [ "$SEALED_STATUS" = "true" ]; then
    # Load unseal keys
    if [ -f "$VAULT_KEYS_FILE" ]; then
        UNSEAL_KEY_1=$(grep "unseal_key_1" "$VAULT_KEYS_FILE" | cut -d'=' -f2)
        UNSEAL_KEY_2=$(grep "unseal_key_2" "$VAULT_KEYS_FILE" | cut -d'=' -f2)
        UNSEAL_KEY_3=$(grep "unseal_key_3" "$VAULT_KEYS_FILE" | cut -d'=' -f2)

        # Unseal with first key
        curl -s --request POST --data "{\"key\": \"$UNSEAL_KEY_1\"}" \
            "$VAULT_ADDR/v1/sys/unseal" > /dev/null

        # Unseal with second key
        curl -s --request POST --data "{\"key\": \"$UNSEAL_KEY_2\"}" \
            "$VAULT_ADDR/v1/sys/unseal" > /dev/null

        # Unseal with third key
        curl -s --request POST --data "{\"key\": \"$UNSEAL_KEY_3\"}" \
            "$VAULT_ADDR/v1/sys/unseal" > /dev/null

        echo "✅ Vault unsealed"
    else
        echo "❌ Cannot unseal: Keys file not found"
        exit 1
    fi
else
    echo "✅ Vault is already unsealed"
fi

# Enable KV v2 secrets engine
echo ""
echo "🔧 Enabling secrets engine..."
curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
    --request POST \
    --data '{"type": "kv-v2"}' \
    "$VAULT_ADDR/v1/sys/mounts/secret" > /dev/null 2>&1 || echo "✅ Secrets engine already enabled"

# Create SERVER-MCP policy
echo "📝 Creating SERVER-MCP policy..."
cat > /tmp/server-mcp-policy.json <<'EOF'
{
  "policy": "path \"secret/data/server-mcp/*\" {\n  capabilities = [\"read\", \"list\"]\n}\n\npath \"secret/metadata/server-mcp/*\" {\n  capabilities = [\"list\", \"read\"]\n}\n\npath \"auth/token/renew-self\" {\n  capabilities = [\"update\"]\n}\n\npath \"auth/token/lookup-self\" {\n  capabilities = [\"read\"]\n}"
}
EOF

curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
    --request PUT \
    --data @/tmp/server-mcp-policy.json \
    "$VAULT_ADDR/v1/sys/policies/acl/server-mcp" > /dev/null

rm /tmp/server-mcp-policy.json

echo "✅ Policy created"

# Store sample secrets (will be overwritten with real values in production)
echo ""
echo "🔐 Storing SERVER-MCP secrets..."

# PostgreSQL credentials
curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
    --request POST \
    --data '{
      "data": {
        "host": "localhost",
        "port": "5432",
        "user": "postgres",
        "password": "CHANGE_ME_IN_PRODUCTION",
        "database": "postgres"
      }
    }' \
    "$VAULT_ADDR/v1/secret/data/server-mcp/postgres" > /dev/null

echo "  ✅ PostgreSQL credentials stored"

# Redis credentials
curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
    --request POST \
    --data '{
      "data": {
        "host": "localhost",
        "port": "6379",
        "password": "CHANGE_ME_IN_PRODUCTION"
      }
    }' \
    "$VAULT_ADDR/v1/secret/data/server-mcp/redis" > /dev/null

echo "  ✅ Redis credentials stored"

# Keycloak credentials
curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
    --request POST \
    --data '{
      "data": {
        "server_url": "http://localhost:8080",
        "realm": "master",
        "client_id": "server-mcp",
        "client_secret": "CHANGE_ME_IN_PRODUCTION"
      }
    }' \
    "$VAULT_ADDR/v1/secret/data/server-mcp/keycloak" > /dev/null

echo "  ✅ Keycloak credentials stored"

# Create a token for SERVER-MCP with limited permissions
echo ""
echo "🎫 Creating SERVER-MCP access token..."
TOKEN_RESPONSE=$(curl -s --header "X-Vault-Token: $VAULT_TOKEN" \
    --request POST \
    --data '{
      "policies": ["server-mcp"],
      "ttl": "720h",
      "renewable": true
    }' \
    "$VAULT_ADDR/v1/auth/token/create")

SERVER_MCP_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"client_token":"[^"]*"' | cut -d'"' -f4)

# Save token to env file
ENV_FILE="$PROJECT_ROOT/.env.vault"
cat > "$ENV_FILE" <<EOF
# Vault Configuration for SERVER-MCP
# Generated: $(date)
# Source this file or add to your environment

VAULT_ADDR=$VAULT_ADDR
VAULT_TOKEN=$SERVER_MCP_TOKEN
VAULT_NAMESPACE=server-mcp

# Token Info:
# - Policy: server-mcp (read-only access to secret/server-mcp/*)
# - TTL: 720h (30 days, renewable)
# - Created: $(date)

# Usage:
# export \$(cat .env.vault | xargs)
# npm start
EOF

chmod 600 "$ENV_FILE"

echo "✅ Access token created and saved to $ENV_FILE"
echo ""
echo "================================================"
echo "✅ Vault initialization complete!"
echo "================================================"
echo ""
echo "📋 Summary:"
echo "  • Vault Address: $VAULT_ADDR"
echo "  • Root Token: $VAULT_TOKEN"
echo "  • SERVER-MCP Token: $SERVER_MCP_TOKEN"
echo "  • Keys File: $VAULT_KEYS_FILE"
echo "  • Env File: $ENV_FILE"
echo ""
echo "📝 Next Steps:"
echo "  1. Update secrets with real production values:"
echo "     vault kv put secret/server-mcp/postgres password=REAL_PASSWORD"
echo ""
echo "  2. Source the environment file:"
echo "     source $ENV_FILE"
echo ""
echo "  3. Update SERVER-MCP .env file with Vault configuration"
echo ""
echo "  4. Start SERVER-MCP:"
echo "     npm start"
echo ""
echo "🔗 Vault UI: $VAULT_ADDR/ui"
echo "   Login with root token: $VAULT_TOKEN"
echo ""
echo "⚠️  SECURITY REMINDERS:"
echo "  • Back up $VAULT_KEYS_FILE to secure storage"
echo "  • Rotate root token after initial setup"
echo "  • Enable audit logging for production"
echo "  • Consider using TLS for Vault in production"
echo ""
