#!/bin/bash
# Quick configuration script

set -e

KEYCLOAK_URL="http://localhost:8080"
ADMIN_USER="admin"
ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:?Error: KEYCLOAK_ADMIN_PASSWORD environment variable not set}"
REALM="mcp-ecosystem"

# Get admin token
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" | jq -r '.access_token')

echo "Token obtained"

# Create minimal realm
curl -s -X POST "${KEYCLOAK_URL}/admin/realms" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "realm": "mcp-ecosystem",
      "enabled": true,
      "sslRequired": "external",
      "registrationAllowed": false,
      "loginWithEmailAllowed": true,
      "duplicateEmailsAllowed": false,
      "resetPasswordAllowed": true,
      "bruteForceProtected": true
    }'

echo "Realm created"

# Generate secrets
MCP_ORCHESTRATOR_SECRET=$(openssl rand -base64 32)
PERPLEXITY_MCP_SECRET=$(openssl rand -base64 32)
IT_MCP_SECRET=$(openssl rand -base64 32)
TEST_ADMIN_PASSWORD=$(openssl rand -base64 16)

# Create clients
curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"mcp-orchestrator\",
      \"name\": \"MCP Orchestrator Service\",
      \"enabled\": true,
      \"clientAuthenticatorType\": \"client-secret\",
      \"secret\": \"${MCP_ORCHESTRATOR_SECRET}\",
      \"redirectUris\": [\"*\"],
      \"webOrigins\": [\"*\"],
      \"protocol\": \"openid-connect\",
      \"publicClient\": false,
      \"serviceAccountsEnabled\": true
    }"

curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"perplexity-mcp\",
      \"name\": \"Perplexity MCP Service\",
      \"enabled\": true,
      \"clientAuthenticatorType\": \"client-secret\",
      \"secret\": \"${PERPLEXITY_MCP_SECRET}\",
      \"redirectUris\": [\"*\"],
      \"webOrigins\": [\"*\"],
      \"protocol\": \"openid-connect\",
      \"publicClient\": false,
      \"serviceAccountsEnabled\": true
    }"

curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"clientId\": \"it-mcp\",
      \"name\": \"IT MCP Service\",
      \"enabled\": true,
      \"clientAuthenticatorType\": \"client-secret\",
      \"secret\": \"${IT_MCP_SECRET}\",
      \"redirectUris\": [\"*\"],
      \"webOrigins\": [\"*\"],
      \"protocol\": \"openid-connect\",
      \"publicClient\": false,
      \"serviceAccountsEnabled\": true
    }"

echo "Clients created"

# Create roles
curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/roles" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"name": "admin", "description": "Administrator role"}'

curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/roles" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"name": "operator", "description": "Operator role"}'

curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/roles" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"name": "user", "description": "User role"}'

echo "Roles created"

# Create test user
curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"username\": \"mcp-admin\",
      \"email\": \"admin@mcp-ecosystem.local\",
      \"emailVerified\": true,
      \"enabled\": true,
      \"firstName\": \"MCP\",
      \"lastName\": \"Administrator\",
      \"credentials\": [{
        \"type\": \"password\",
        \"value\": \"${TEST_ADMIN_PASSWORD}\",
        \"temporary\": false
      }]
    }"

echo "User created"

# Save credentials
cat > /opt/keycloak/mcp-credentials.txt << EOF
=========================================
MCP Ecosystem Keycloak Configuration
=========================================

KEYCLOAK ADMIN ACCESS
---------------------
URL: https://154.26.158.31:8443
Admin Console: https://154.26.158.31:8443/admin
Master Realm Admin: admin
Master Realm Password: ${ADMIN_PASSWORD}

MCP ECOSYSTEM REALM
-------------------
Realm Name: mcp-ecosystem
Test Admin User: mcp-admin
Test Admin Password: ${TEST_ADMIN_PASSWORD}
Test Admin Email: admin@mcp-ecosystem.local

CLIENT CONFIGURATIONS
---------------------

1. MCP Orchestrator
   Client ID: mcp-orchestrator
   Client Secret: ${MCP_ORCHESTRATOR_SECRET}

2. Perplexity MCP
   Client ID: perplexity-mcp
   Client Secret: ${PERPLEXITY_MCP_SECRET}

3. IT MCP
   Client ID: it-mcp
   Client Secret: ${IT_MCP_SECRET}

OIDC ENDPOINTS
--------------
Issuer: https://154.26.158.31:8443/realms/mcp-ecosystem
Authorization: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/auth
Token: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token
UserInfo: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/userinfo
Logout: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/logout
JWKS: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/certs

Generated: $(date)
EOF

echo "Configuration complete!"
cat /opt/keycloak/mcp-credentials.txt