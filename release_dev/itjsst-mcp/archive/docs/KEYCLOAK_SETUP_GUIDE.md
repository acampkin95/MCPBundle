# Keycloak Setup Guide for IT-MCP

**Date**: 2025-11-02
**Keycloak URL**: https://acdev.host:8080
**Target Realm**: mcp-agents
**Status**: Ready for Configuration

---

## Overview

This guide walks through setting up Keycloak for IT-MCP policy enforcement, including realm creation, client configuration, role mapping, and capability assignment.

---

## Prerequisites

- ✅ Keycloak installed and running on acdev.host:8080
- ✅ Access to Keycloak admin console
- ✅ Master realm admin credentials
- ✅ IT-MCP policy enforcement layer implemented

---

## Step 1: Create MCP Agents Realm

### Via Admin Console (Recommended)

1. Navigate to https://acdev.host:8080
2. Login to Administration Console
3. Click dropdown in top-left (currently "Master")
4. Click "Create Realm"
5. Fill in details:
   - **Realm name**: `mcp-agents`
   - **Enabled**: ON
   - **Display name**: MCP Agents
   - **Display name HTML**: `<strong>MCP Agents</strong>`
6. Click "Create"

### Via REST API (Alternative)

```bash
# Get admin token
ADMIN_TOKEN=$(curl -X POST https://acdev.host:8080/realms/master/protocol/openid-connect/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=${KEYCLOAK_ADMIN_PASSWORD}" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  | jq -r '.access_token')

# Create realm
curl -X POST https://acdev.host:8080/admin/realms \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "realm": "mcp-agents",
    "enabled": true,
    "displayName": "MCP Agents",
    "accessTokenLifespan": 3600,
    "ssoSessionIdleTimeout": 1800,
    "ssoSessionMaxLifespan": 36000
  }'
```

---

## Step 2: Create IT-MCP Client

### Via Admin Console

1. Select `mcp-agents` realm from dropdown
2. Navigate to **Clients** in left sidebar
3. Click "Create client"
4. **General Settings**:
   - **Client type**: OpenID Connect
   - **Client ID**: `it-mcp-server`
   - Click "Next"
5. **Capability config**:
   - **Client authentication**: ON
   - **Authorization**: OFF
   - **Authentication flow**:
     - ✅ Standard flow
     - ✅ Direct access grants
     - ✅ Service accounts roles
   - Click "Next"
6. **Login settings**:
   - **Root URL**: `http://acdev.host:3001`
   - **Valid redirect URIs**: `http://acdev.host:3001/*`
   - **Web origins**: `+` (for CORS)
7. Click "Save"

### Get Client Secret

1. Go to **Clients** → `it-mcp-server`
2. Click **Credentials** tab
3. Copy the **Client secret** value
4. Save this for later (needed for `.env` file)

### Via REST API

```bash
# Create client
curl -X POST https://acdev.host:8080/admin/realms/mcp-agents/clients \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "it-mcp-server",
    "name": "IT-MCP Server",
    "description": "Model Context Protocol server for IT operations",
    "enabled": true,
    "clientAuthenticatorType": "client-secret",
    "redirectUris": ["http://acdev.host:3001/*"],
    "webOrigins": ["+"],
    "protocol": "openid-connect",
    "publicClient": false,
    "serviceAccountsEnabled": true,
    "standardFlowEnabled": true,
    "directAccessGrantsEnabled": true,
    "attributes": {
      "access.token.lifespan": "3600"
    }
  }'

# Get client secret
CLIENT_UUID=$(curl -s https://acdev.host:8080/admin/realms/mcp-agents/clients \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq -r '.[] | select(.clientId=="it-mcp-server") | .id')

curl -s https://acdev.host:8080/admin/realms/mcp-agents/clients/${CLIENT_UUID}/client-secret \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq -r '.value'
```

---

## Step 3: Create Realm Roles (Capabilities)

These roles map 1:1 to IT-MCP capabilities.

### Via Admin Console

1. Navigate to **Realm roles** in left sidebar
2. Click "Create role" for each capability:

**Basic Capabilities:**

- Role name: `local-shell`
  - Description: Local shell command execution
- Role name: `local-sudo`
  - Description: Elevated privileges (sudo)
- Role name: `macos-wireless`
  - Description: macOS wireless diagnostics

**Remote Access:**

- Role name: `ssh-linux`
  - Description: SSH access to Linux servers
- Role name: `ssh-mac`
  - Description: SSH access to macOS servers
- Role name: `winrm`
  - Description: Windows PowerShell remoting

**Administrative:**

- Role name: `system-modify`
  - Description: System configuration changes
- Role name: `service-control`
  - Description: Service lifecycle management
- Role name: `firewall-admin`
  - Description: Firewall rule management
- Role name: `remote-exec`
  - Description: Remote command execution

### Via REST API

```bash
# Create all capability roles
for ROLE in local-shell local-sudo macos-wireless ssh-linux ssh-mac winrm system-modify service-control firewall-admin remote-exec; do
  curl -X POST https://acdev.host:8080/admin/realms/mcp-agents/roles \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${ROLE}\",
      \"description\": \"IT-MCP capability: ${ROLE}\"
    }"
done
```

---

## Step 4: Create Composite Roles (Role Groups)

Create role groups for common permission sets.

### Via Admin Console

1. Navigate to **Realm roles**
2. Click "Create role"
3. Create these composite roles:

**read-only-operator**:

- Name: `read-only-operator`
- Description: Read-only system diagnostics
- Composite: ON
- Associated roles:
  - ✅ local-shell

**linux-admin**:

- Name: `linux-admin`
- Description: Linux system administrator
- Composite: ON
- Associated roles:
  - ✅ local-shell
  - ✅ local-sudo
  - ✅ ssh-linux
  - ✅ system-modify
  - ✅ service-control

**windows-admin**:

- Name: `windows-admin`
- Description: Windows system administrator
- Composite: ON
- Associated roles:
  - ✅ local-shell
  - ✅ winrm
  - ✅ system-modify
  - ✅ service-control

**security-admin**:

- Name: `security-admin`
- Description: Security and firewall administrator
- Composite: ON
- Associated roles:
  - ✅ local-shell
  - ✅ local-sudo
  - ✅ ssh-linux
  - ✅ firewall-admin

**super-admin**:

- Name: `super-admin`
- Description: Full administrative access
- Composite: ON
- Associated roles:
  - ✅ local-shell
  - ✅ local-sudo
  - ✅ macos-wireless
  - ✅ ssh-linux
  - ✅ ssh-mac
  - ✅ winrm
  - ✅ system-modify
  - ✅ service-control
  - ✅ firewall-admin
  - ✅ remote-exec

---

## Step 5: Create Users

### Via Admin Console

1. Navigate to **Users** in left sidebar
2. Click "Create new user"
3. Fill in details:
   - **Username**: `admin@example.com`
   - **Email**: `admin@example.com`
   - **First name**: Admin
   - **Last name**: User
   - **Email verified**: ON
   - **Enabled**: ON
4. Click "Create"
5. Go to **Credentials** tab:
   - Click "Set password"
   - Enter password
   - **Temporary**: OFF
   - Click "Save"
6. Go to **Role mapping** tab:
   - Click "Assign role"
   - Filter by realm roles
   - Select `super-admin`
   - Click "Assign"

### Create Additional Users

Repeat for different permission levels:

**Operator User** (read-only):

- Username: `operator@example.com`
- Role: `read-only-operator`

**Linux Admin**:

- Username: `linux-admin@example.com`
- Role: `linux-admin`

**Windows Admin**:

- Username: `windows-admin@example.com`
- Role: `windows-admin`

**Security Admin**:

- Username: `security-admin@example.com`
- Role: `security-admin`

---

## Step 6: Configure Service Account

The IT-MCP server uses a service account for authentication.

### Via Admin Console

1. Navigate to **Clients** → `it-mcp-server`
2. Click **Service account roles** tab
3. Click "Assign role"
4. Filter by realm roles
5. Assign roles based on server needs:
   - For development: Assign `super-admin`
   - For production: Assign specific capabilities needed

---

## Step 7: Test JWT Token

### Get Token with Client Credentials

```bash
# Set environment variables
export KEYCLOAK_SERVER_URL="https://acdev.host:8080"
export KEYCLOAK_REALM="mcp-agents"
export KEYCLOAK_CLIENT_ID="it-mcp-server"
export KEYCLOAK_CLIENT_SECRET="<from-step-2>"

# Get token
TOKEN_RESPONSE=$(curl -X POST \
  "${KEYCLOAK_SERVER_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=${KEYCLOAK_CLIENT_ID}" \
  -d "client_secret=${KEYCLOAK_CLIENT_SECRET}")

echo $TOKEN_RESPONSE | jq

# Extract access token
ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')

# Decode JWT to see roles
echo $ACCESS_TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq
```

### Expected JWT Payload

```json
{
  "exp": 1699012345,
  "iat": 1699008745,
  "jti": "abc123...",
  "iss": "https://acdev.host:8080/realms/mcp-agents",
  "aud": "it-mcp-server",
  "sub": "service-account-it-mcp-server",
  "typ": "Bearer",
  "azp": "it-mcp-server",
  "realm_access": {
    "roles": ["local-shell", "local-sudo", "ssh-linux", "system-modify", "service-control"]
  },
  "resource_access": {
    "it-mcp-server": {
      "roles": []
    }
  },
  "scope": "profile email",
  "email_verified": false,
  "clientId": "it-mcp-server",
  "clientHost": "46.250.243.123",
  "preferred_username": "service-account-it-mcp-server"
}
```

**Key Field**: `realm_access.roles` contains the capabilities

---

## Step 8: Get JWKS Public Keys

IT-MCP needs the public keys to verify JWT signatures offline.

```bash
# Get JWKS endpoint URL
JWKS_URL="${KEYCLOAK_SERVER_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs"

# Fetch public keys
curl -s $JWKS_URL | jq

# Expected output:
{
  "keys": [
    {
      "kid": "abc123...",
      "kty": "RSA",
      "alg": "RS256",
      "use": "sig",
      "n": "...",
      "e": "AQAB"
    }
  ]
}
```

---

## Step 9: Update IT-MCP Environment Variables

Create or update `.env` file in IT-MCP project root:

```bash
# Policy Enforcement
ENABLE_POLICY_ENFORCEMENT=true

# Keycloak Configuration
KEYCLOAK_SERVER_URL=https://acdev.host:8080
KEYCLOAK_REALM=mcp-agents
KEYCLOAK_CLIENT_ID=it-mcp-server
KEYCLOAK_CLIENT_SECRET=<from-step-2>

# Optional: Override token lifespan
KEYCLOAK_TOKEN_LIFESPAN=3600
```

---

## Step 10: Verify Integration

### Test Authentication

```bash
cd /Users/alex/Projects/IT-MCP
npm run build

# Start server with policy enforcement
ENABLE_POLICY_ENFORCEMENT=true npm start
```

### Check Logs

Look for these messages:

```
INFO: Initializing policy enforcement layer...
INFO: KeycloakAuthService initialized {
  serverUrl: "https://acdev.host:8080",
  realm: "mcp-agents"
}
INFO: JWT verification configured {
  jwksUrl: "https://acdev.host:8080/realms/mcp-agents/protocol/openid-connect/certs"
}
INFO: Policy enforcement layer initialized
```

### Test Tool Invocation

The server will now extract capabilities from JWT tokens automatically.

---

## Troubleshooting

### Issue: "Failed to connect to Keycloak"

**Cause**: Network connectivity or SSL certificate issues

**Fix**:

```bash
# Test connectivity
curl -v https://acdev.host:8080/realms/mcp-agents/.well-known/openid-configuration

# If SSL error, check certificate
openssl s_client -connect acdev.host:8080 -servername acdev.host

# For development, can disable SSL verification (NOT for production):
NODE_TLS_REJECT_UNAUTHORIZED=0 npm start
```

### Issue: "Invalid client credentials"

**Cause**: Wrong client secret or client ID

**Fix**:

1. Go to Keycloak Admin Console
2. Navigate to Clients → it-mcp-server → Credentials
3. Regenerate client secret
4. Update `.env` file

### Issue: "Token has no roles"

**Cause**: Service account not assigned roles

**Fix**:

1. Go to Clients → it-mcp-server → Service account roles
2. Assign required roles
3. Get new token

### Issue: "JWT signature verification failed"

**Cause**: Token signed by different realm or expired JWKS cache

**Fix**:

```bash
# Verify issuer matches
echo $ACCESS_TOKEN | cut -d'.' -f2 | base64 -d 2>/dev/null | jq '.iss'
# Should be: "https://acdev.host:8080/realms/mcp-agents"

# Clear JWKS cache (restart IT-MCP server)
```

---

## Security Best Practices

### 1. Rotate Client Secrets Regularly

```bash
# Via Admin Console
# Clients → it-mcp-server → Credentials → Regenerate secret

# Update .env file with new secret
# Restart IT-MCP server
```

### 2. Use Short Token Lifespans

Recommended settings:

- Access token lifespan: 1 hour (3600s)
- Refresh token lifespan: 8 hours (28800s)
- SSO session idle: 30 minutes (1800s)
- SSO session max: 10 hours (36000s)

### 3. Enable Audit Logging in Keycloak

1. Go to **Realm settings** → **Events**
2. Enable **Login events**
3. Enable **Admin events**
4. Set retention: 90 days

### 4. Monitor Failed Logins

```bash
# Query Keycloak events
curl -s "https://acdev.host:8080/admin/realms/mcp-agents/events?type=LOGIN_ERROR" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  | jq
```

### 5. Use HTTPS Only

Never use HTTP in production. Always use HTTPS with valid certificates.

---

## Role-to-Capability Mapping Reference

| Keycloak Role     | IT-MCP Capability | Description                  |
| ----------------- | ----------------- | ---------------------------- |
| `local-shell`     | local-shell       | Local command execution      |
| `local-sudo`      | local-sudo        | Elevated privileges          |
| `macos-wireless`  | macos-wireless    | macOS wireless diagnostics   |
| `ssh-linux`       | ssh-linux         | SSH to Linux servers         |
| `ssh-mac`         | ssh-mac           | SSH to macOS servers         |
| `winrm`           | winrm             | Windows PowerShell remoting  |
| `system-modify`   | system-modify     | System configuration changes |
| `service-control` | service-control   | Service management           |
| `firewall-admin`  | firewall-admin    | Firewall rule management     |
| `remote-exec`     | remote-exec       | Remote command execution     |

---

## Next Steps

After Keycloak configuration:

1. ✅ Keycloak realm created
2. ✅ Client configured
3. ✅ Roles/capabilities defined
4. ✅ Service account configured
5. ⏳ Implement JWT extraction in IT-MCP
6. ⏳ Test with real JWT tokens
7. ⏳ Deploy to production

---

**Setup Complete** - Keycloak is ready for IT-MCP integration

**Reference**: This guide corresponds to `src/services/keycloakAuth.ts` implementation
