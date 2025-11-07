#!/bin/bash
# Configure Keycloak Realm for MCP Ecosystem

set -e

KEYCLOAK_URL="http://localhost:8080"
ADMIN_USER="admin"
ADMIN_PASSWORD="RJBZPH/r+ZdTy54E9EP00U32fImBH9N0pa5lwjUeh3s="
REALM="mcp-ecosystem"

echo "Waiting for Keycloak to be fully ready..."
until curl -f -s "${KEYCLOAK_URL}/health/ready" > /dev/null; do
    echo "Waiting for Keycloak..."
    sleep 5
done

echo "Keycloak is ready. Getting admin token..."

# Get admin token
TOKEN=$(curl -s -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${ADMIN_USER}" \
    -d "password=${ADMIN_PASSWORD}" \
    -d "grant_type=password" \
    -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo "Failed to get admin token"
    exit 1
fi

echo "Admin token obtained successfully"

# Create realm configuration
cat > /tmp/realm-config.json << 'EOF'
{
  "realm": "mcp-ecosystem",
  "enabled": true,
  "sslRequired": "external",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": true,
  "editUsernameAllowed": false,
  "bruteForceProtected": true,
  "permanentLockout": false,
  "maxFailureWaitSeconds": 900,
  "minimumQuickLoginWaitSeconds": 60,
  "waitIncrementSeconds": 60,
  "quickLoginCheckMilliSeconds": 1000,
  "maxDeltaTimeSeconds": 43200,
  "failureFactor": 3,
  "defaultSignatureAlgorithm": "RS256",
  "offlineSessionMaxLifespanEnabled": false,
  "offlineSessionMaxLifespan": 5184000,
  "clientSessionIdleTimeout": 0,
  "clientSessionMaxLifespan": 0,
  "clientOfflineSessionIdleTimeout": 0,
  "clientOfflineSessionMaxLifespan": 0,
  "accessTokenLifespan": 300,
  "accessTokenLifespanForImplicitFlow": 900,
  "ssoSessionIdleTimeout": 1800,
  "ssoSessionMaxLifespan": 36000,
  "ssoSessionIdleTimeoutRememberMe": 0,
  "ssoSessionMaxLifespanRememberMe": 0,
  "offlineSessionIdleTimeout": 2592000,
  "accessCodeLifespan": 60,
  "accessCodeLifespanUserAction": 300,
  "accessCodeLifespanLogin": 1800,
  "actionTokenGeneratedByAdminLifespan": 43200,
  "actionTokenGeneratedByUserLifespan": 300,
  "oauth2DeviceCodeLifespan": 600,
  "oauth2DevicePollingInterval": 5,
  "roles": {
    "realm": [
      {
        "name": "admin",
        "description": "Administrator role with full access",
        "composite": false,
        "clientRole": false
      },
      {
        "name": "operator",
        "description": "Operator role with limited admin access",
        "composite": false,
        "clientRole": false
      },
      {
        "name": "user",
        "description": "Standard user role",
        "composite": false,
        "clientRole": false
      }
    ]
  }
}
EOF

# Create the realm
echo "Creating realm: ${REALM}..."
curl -s -X POST "${KEYCLOAK_URL}/admin/realms" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d @/tmp/realm-config.json

echo "Realm created successfully"

# Generate client secrets
MCP_ORCHESTRATOR_SECRET=$(openssl rand -base64 32)
PERPLEXITY_MCP_SECRET=$(openssl rand -base64 32)
IT_MCP_SECRET=$(openssl rand -base64 32)

# Create clients
echo "Creating clients..."

# MCP Orchestrator Client
cat > /tmp/mcp-orchestrator-client.json << EOF
{
  "clientId": "mcp-orchestrator",
  "name": "MCP Orchestrator Service",
  "description": "Main orchestrator service for MCP ecosystem",
  "rootUrl": "https://154.26.158.29",
  "adminUrl": "https://154.26.158.29",
  "baseUrl": "/",
  "enabled": true,
  "clientAuthenticatorType": "client-secret",
  "secret": "${MCP_ORCHESTRATOR_SECRET}",
  "redirectUris": [
    "https://154.26.158.29/*",
    "http://localhost:3000/*"
  ],
  "webOrigins": [
    "https://154.26.158.29",
    "http://localhost:3000"
  ],
  "protocol": "openid-connect",
  "attributes": {
    "saml.assertion.signature": "false",
    "saml.multivalued.roles": "false",
    "saml.force.post.binding": "false",
    "saml.encrypt": "false",
    "post.logout.redirect.uris": "+",
    "oauth2.device.authorization.grant.enabled": "false",
    "oidc.ciba.grant.enabled": "false",
    "backchannel.logout.session.required": "true",
    "backchannel.logout.revoke.offline.tokens": "false"
  },
  "authenticationFlowBindingOverrides": {},
  "fullScopeAllowed": true,
  "nodeReRegistrationTimeout": -1,
  "defaultClientScopes": [
    "web-origins",
    "profile",
    "roles",
    "email"
  ],
  "optionalClientScopes": [
    "address",
    "phone",
    "offline_access"
  ],
  "access": {
    "view": true,
    "configure": true,
    "manage": true
  },
  "authorizationServicesEnabled": false
}
EOF

curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d @/tmp/mcp-orchestrator-client.json

# Perplexity MCP Client
cat > /tmp/perplexity-mcp-client.json << EOF
{
  "clientId": "perplexity-mcp",
  "name": "Perplexity MCP Service",
  "description": "Perplexity integration for MCP ecosystem",
  "rootUrl": "https://154.26.158.30",
  "adminUrl": "https://154.26.158.30",
  "baseUrl": "/",
  "enabled": true,
  "clientAuthenticatorType": "client-secret",
  "secret": "${PERPLEXITY_MCP_SECRET}",
  "redirectUris": [
    "https://154.26.158.30/*",
    "http://localhost:3001/*"
  ],
  "webOrigins": [
    "https://154.26.158.30",
    "http://localhost:3001"
  ],
  "protocol": "openid-connect",
  "fullScopeAllowed": true,
  "defaultClientScopes": [
    "web-origins",
    "profile",
    "roles",
    "email"
  ]
}
EOF

curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d @/tmp/perplexity-mcp-client.json

# IT MCP Client
cat > /tmp/it-mcp-client.json << EOF
{
  "clientId": "it-mcp",
  "name": "IT MCP Service",
  "description": "IT automation service for MCP ecosystem",
  "rootUrl": "https://154.26.158.31",
  "adminUrl": "https://154.26.158.31",
  "baseUrl": "/",
  "enabled": true,
  "clientAuthenticatorType": "client-secret",
  "secret": "${IT_MCP_SECRET}",
  "redirectUris": [
    "https://154.26.158.31/*",
    "http://localhost:3002/*"
  ],
  "webOrigins": [
    "https://154.26.158.31",
    "http://localhost:3002"
  ],
  "protocol": "openid-connect",
  "fullScopeAllowed": true,
  "defaultClientScopes": [
    "web-origins",
    "profile",
    "roles",
    "email"
  ]
}
EOF

curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/clients" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d @/tmp/it-mcp-client.json

echo "Clients created successfully"

# Create test admin user
TEST_ADMIN_PASSWORD=$(openssl rand -base64 16)

cat > /tmp/test-admin-user.json << EOF
{
  "username": "mcp-admin",
  "email": "admin@mcp-ecosystem.local",
  "emailVerified": true,
  "enabled": true,
  "firstName": "MCP",
  "lastName": "Administrator",
  "credentials": [
    {
      "type": "password",
      "value": "${TEST_ADMIN_PASSWORD}",
      "temporary": false
    }
  ],
  "realmRoles": ["admin", "operator", "user"],
  "groups": []
}
EOF

echo "Creating test admin user..."
curl -s -X POST "${KEYCLOAK_URL}/admin/realms/${REALM}/users" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d @/tmp/test-admin-user.json

# Save all credentials
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
   Redirect URIs: https://154.26.158.29/*, http://localhost:3000/*

2. Perplexity MCP
   Client ID: perplexity-mcp
   Client Secret: ${PERPLEXITY_MCP_SECRET}
   Redirect URIs: https://154.26.158.30/*, http://localhost:3001/*

3. IT MCP
   Client ID: it-mcp
   Client Secret: ${IT_MCP_SECRET}
   Redirect URIs: https://154.26.158.31/*, http://localhost:3002/*

OIDC ENDPOINTS
--------------
Issuer: https://154.26.158.31:8443/realms/mcp-ecosystem
Authorization: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/auth
Token: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token
UserInfo: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/userinfo
Logout: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/logout
JWKS: https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/certs

REALM ROLES
-----------
- admin: Administrator role with full access
- operator: Operator role with limited admin access
- user: Standard user role

Generated: $(date)
EOF

echo "Configuration complete! Credentials saved to /opt/keycloak/mcp-credentials.txt"