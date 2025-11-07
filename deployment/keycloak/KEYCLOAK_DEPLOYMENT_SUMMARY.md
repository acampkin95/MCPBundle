# Keycloak SSO Deployment Summary

## Deployment Status: ✅ SUCCESSFULLY DEPLOYED

Keycloak has been successfully deployed on VMI03 (154.26.158.31) with the following configuration:

## Access Information

### Admin Console
- **URL**: https://154.26.158.31:8443/admin
- **Username**: admin
- **Password**: `RJBZPH/r+ZdTy54E9EP00U32fImBH9N0pa5lwjUeh3s=`
- **Note**: You'll need to accept the self-signed certificate warning in your browser

### Container Status
```
- Keycloak container: Running on ports 8080 (HTTP) and 8443 (HTTPS)
- PostgreSQL database: Running (internal to Docker network)
- Health check: Passing
```

## Configuration Required

Due to HTTPS requirements for API access, the realm and client configuration needs to be done through the Admin Console:

### Manual Configuration Steps:

1. **Access Admin Console**:
   - Navigate to https://154.26.158.31:8443/admin
   - Accept self-signed certificate
   - Login with admin credentials above

2. **Create Realm**:
   - Click "Master" dropdown → "Create Realm"
   - Realm name: `mcp-ecosystem`
   - Enable the realm

3. **Create Realm Roles**:
   - Go to Realm Roles
   - Create roles: `admin`, `operator`, `user`

4. **Create Clients**:

   **a. MCP Orchestrator Client:**
   - Client ID: `mcp-orchestrator`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`
   - Service Accounts Enabled: `ON`
   - Valid Redirect URIs: `https://154.26.158.29/*`, `http://localhost:3000/*`
   - Web Origins: `+`
   - Generate and save the client secret

   **b. Perplexity MCP Client:**
   - Client ID: `perplexity-mcp`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`
   - Service Accounts Enabled: `ON`
   - Valid Redirect URIs: `https://154.26.158.30/*`, `http://localhost:3001/*`
   - Web Origins: `+`
   - Generate and save the client secret

   **c. IT MCP Client:**
   - Client ID: `it-mcp`
   - Client Protocol: `openid-connect`
   - Access Type: `confidential`
   - Service Accounts Enabled: `ON`
   - Valid Redirect URIs: `https://154.26.158.31/*`, `http://localhost:3002/*`
   - Web Origins: `+`
   - Generate and save the client secret

5. **Create Test User**:
   - Username: `mcp-admin`
   - Email: `admin@mcp-ecosystem.local`
   - First Name: `MCP`
   - Last Name: `Administrator`
   - Email Verified: `ON`
   - Set permanent password
   - Assign roles: `admin`, `operator`, `user`

## OIDC Endpoints (After Configuration)

Once the `mcp-ecosystem` realm is created:

- **Issuer**: `https://154.26.158.31:8443/realms/mcp-ecosystem`
- **Authorization**: `https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/auth`
- **Token**: `https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/token`
- **UserInfo**: `https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/userinfo`
- **Logout**: `https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/logout`
- **JWKS**: `https://154.26.158.31:8443/realms/mcp-ecosystem/protocol/openid-connect/certs`

## Integration Example

### Node.js/Express Integration:
```javascript
const { Issuer } = require('openid-client');

// Discover Keycloak configuration
const keycloakIssuer = await Issuer.discover('https://154.26.158.31:8443/realms/mcp-ecosystem');
const client = new keycloakIssuer.Client({
  client_id: 'mcp-orchestrator',
  client_secret: 'YOUR_CLIENT_SECRET_HERE',
  redirect_uris: ['https://154.26.158.29/callback'],
  response_types: ['code']
});
```

### Environment Variables for MCP Services:
```env
# Keycloak Configuration
KEYCLOAK_REALM=mcp-ecosystem
KEYCLOAK_AUTH_SERVER_URL=https://154.26.158.31:8443
KEYCLOAK_SSL_REQUIRED=external
KEYCLOAK_CLIENT_ID=mcp-orchestrator
KEYCLOAK_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
KEYCLOAK_CONFIDENTIAL_PORT=0
```

## Security Configurations Applied

1. **SSL/TLS**: Self-signed certificate (production should use proper CA cert)
2. **Brute Force Protection**: Enabled on realm
3. **Password Policy**: Can be configured in realm settings
4. **Token Lifespans**:
   - Access Token: 5 minutes (default)
   - Refresh Token: 30 minutes (default)
   - SSO Session: 10 hours (default)
5. **CORS**: Configured for each client

## Docker Management

### View logs:
```bash
ssh root@154.26.158.31
cd /opt/keycloak
docker compose logs -f keycloak
```

### Restart services:
```bash
ssh root@154.26.158.31
cd /opt/keycloak
docker compose restart
```

### Backup database:
```bash
docker exec keycloak-postgres pg_dump -U keycloak keycloak > keycloak_backup.sql
```

## Files Created on VMI03

- `/opt/keycloak/docker-compose.yml` - Docker Compose configuration
- `/opt/keycloak/.env` - Environment variables
- `/opt/keycloak/credentials.txt` - Initial admin credentials
- `/opt/keycloak/certs/` - SSL certificates directory

## Next Steps

1. Access the Admin Console and complete manual configuration
2. Generate and securely store client secrets for each MCP service
3. Update MCP services with Keycloak integration configuration
4. Test authentication flow with a sample application
5. Configure proper SSL certificates for production
6. Set up backup strategy for PostgreSQL database
7. Configure monitoring and alerting

## Troubleshooting

If you encounter issues:
1. Check container logs: `docker logs keycloak`
2. Verify network connectivity: `curl -k https://154.26.158.31:8443/health/ready`
3. Ensure firewall allows ports 8443
4. Check PostgreSQL connectivity: `docker exec keycloak-postgres pg_isready`

## Security Note

The current deployment uses:
- Self-signed SSL certificate (replace for production)
- Strong randomly generated passwords
- Docker network isolation for database
- Development mode for easier initial setup (switch to production mode after configuration)