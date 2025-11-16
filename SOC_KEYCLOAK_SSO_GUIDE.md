# SOC Keycloak SSO Integration Guide

**Last Updated**: 2025-11-14
**Keycloak Server**: https://acdev.host:8443/
**Realm**: mcp-agents

---

## ✅ Yes! All SOC Components Support Keycloak SSO

### Current Status

| Component | Native SSO | Via Proxy | Status |
|-----------|-----------|-----------|--------|
| SOC Dashboard | ✅ Yes | - | ✅ Already configured |
| Grafana | ✅ Yes | - | 🔄 Can enable |
| TheHive | ✅ Yes | - | 🔄 Can enable |
| Wazuh Dashboard | ✅ Yes (SAML) | - | 🔄 Can enable |
| Elasticsearch | ✅ Yes (OIDC) | - | 🔄 Requires X-Pack |
| Prometheus | - | ✅ oauth2-proxy | 🔄 Can enable |
| SOC Hub MCP | - | ✅ oauth2-proxy | 🔄 Can enable |

---

## 🔑 Required Keycloak Clients

Create these clients in Keycloak Admin Console:

### 1. soc-hub (Already Exists)
```
Client ID: soc-hub
Access Type: Public
Valid Redirect URIs: http://soc.acdev.host/*, https://soc.acdev.host:9443/*
Web Origins: http://soc.acdev.host, https://soc.acdev.host:9443
```

### 2. grafana
```
Client ID: grafana
Access Type: Confidential
Standard Flow Enabled: ON
Valid Redirect URIs: http://soc.acdev.host:3000/*
Root URL: http://soc.acdev.host:3000
```

**Mappers** (optional for role-based access):
- Add built-in mapper: client roles
- Add audience mapper for 'grafana'

### 3. thehive
```
Client ID: thehive
Access Type: Confidential
Standard Flow Enabled: ON
Valid Redirect URIs: http://soc.acdev.host:9000/*, http://soc.acdev.host:9000/api/ssoLogin
Root URL: http://soc.acdev.host:9000
```

### 4. elasticsearch
```
Client ID: elasticsearch
Access Type: Confidential
Standard Flow Enabled: ON
Valid Redirect URIs: http://soc.acdev.host:9200/*
Root URL: http://soc.acdev.host:9200
```

### 5. prometheus
```
Client ID: prometheus
Access Type: Confidential
Standard Flow Enabled: ON
Valid Redirect URIs: http://soc.acdev.host:9091/oauth2/callback
Root URL: http://soc.acdev.host:9091
```

### 6. wazuh (if Wazuh Dashboard deployed)
```
Client ID: wazuh
Access Type: Confidential
Standard Flow Enabled: ON
Valid Redirect URIs: https://soc.acdev.host/*, https://soc.acdev.host:443/*
Root URL: https://soc.acdev.host
```

---

## 🚀 Automated Setup

**Script Location**: `deployment/soc/setup-keycloak-sso.sh`

**Prerequisites**:
1. Access to Keycloak admin console
2. Create all required clients (above)
3. Note down client secrets for each

**Run Setup**:
```bash
# Copy script to VMI03
scp deployment/soc/setup-keycloak-sso.sh root@154.26.158.31:/tmp/

# SSH to VMI03
ssh root@154.26.158.31

# Run setup
chmod +x /tmp/setup-keycloak-sso.sh
/tmp/setup-keycloak-sso.sh
```

**The script will**:
1. ✅ Configure Grafana OAuth2
2. ✅ Configure TheHive OAuth2
3. ✅ Install and configure oauth2-proxy for Prometheus
4. ✅ Update Nginx configuration
5. ✅ Restart all services

---

## 🎯 Manual Configuration (If Preferred)

### Grafana OAuth Configuration

**Edit**: `/etc/grafana/grafana.ini`

```ini
[auth.generic_oauth]
enabled = true
name = Keycloak
allow_sign_up = true
client_id = grafana
client_secret = YOUR_GRAFANA_CLIENT_SECRET
scopes = openid email profile
auth_url = https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/auth
token_url = https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/token
api_url = https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/userinfo
role_attribute_path = contains(roles[*], 'admin') && 'Admin' || contains(roles[*], 'editor') && 'Editor' || 'Viewer'

[server]
root_url = http://soc.acdev.host:3000
```

**Restart**:
```bash
systemctl restart grafana-server
```

**Test**:
- Open http://soc.acdev.host:3000
- Click "Sign in with Keycloak" button
- Redirects to Keycloak login
- Returns to Grafana after authentication

---

### TheHive OAuth Configuration

**Create**: `/opt/thehive/oauth.conf`

```conf
auth {
  providers: [
    {name: session}
    {name: basic, realm: thehive}
    {name: local}
    {name: key}
    {
      name: oauth2
      clientId: thehive
      clientSecret: "YOUR_THEHIVE_CLIENT_SECRET"
      redirectUri: "http://soc.acdev.host:9000/api/ssoLogin"
      responseType: "code"
      grantType: "authorization_code"
      authorizationUrl: "https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/auth"
      tokenUrl: "https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/token"
      userUrl: "https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/userinfo"
      scope: ["openid", "email", "profile"]
      userOrganisation: "acdev"
    }
  ]
}
```

**Add to main config**: `/opt/thehive/application.conf`

```conf
include "/opt/thehive/oauth.conf"
```

**Restart**:
```bash
cd /opt/thehive && docker-compose restart thehive
```

**Test**:
- Open http://soc.acdev.host:9000
- Click "SSO Login" button
- Keycloak authentication
- Returns to TheHive

---

### Prometheus OAuth via oauth2-proxy

**Install oauth2-proxy**:
```bash
wget https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.5.1/oauth2-proxy-v7.5.1.linux-amd64.tar.gz
tar -xzf oauth2-proxy-v7.5.1.linux-amd64.tar.gz
mv oauth2-proxy-v7.5.1.linux-amd64/oauth2-proxy /usr/local/bin/
```

**Create config**: `/etc/oauth2-proxy-prometheus.cfg`

```ini
provider = "keycloak-oidc"
client_id = "prometheus"
client_secret = "YOUR_PROMETHEUS_CLIENT_SECRET"
redirect_url = "http://soc.acdev.host:9091/oauth2/callback"
oidc_issuer_url = "https://acdev.host:8443/realms/mcp-agents"
email_domains = ["*"]
cookie_secret = "GENERATE_WITH_OPENSSL_RAND_BASE64_32"
cookie_secure = false
upstreams = ["http://127.0.0.1:9090"]
http_address = "0.0.0.0:9091"
skip_provider_button = false
```

**Generate cookie secret**:
```bash
openssl rand -base64 32 | tr -d '\n'
```

**Create systemd service**: `/etc/systemd/system/oauth2-proxy-prometheus.service`

```ini
[Unit]
Description=OAuth2 Proxy for Prometheus
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/oauth2-proxy --config /etc/oauth2-proxy-prometheus.cfg
Restart=always

[Install]
WantedBy=multi-user.target
```

**Start service**:
```bash
systemctl daemon-reload
systemctl enable oauth2-proxy-prometheus
systemctl start oauth2-proxy-prometheus
```

**Update Nginx** (add to `/etc/nginx/sites-available/default`):
```nginx
server {
    listen 9091;
    server_name soc.acdev.host 154.26.158.31;

    location / {
        proxy_pass http://127.0.0.1:9091;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Reload Nginx**:
```bash
nginx -t && systemctl reload nginx
```

**Test**:
- Open http://soc.acdev.host:9091
- Redirects to Keycloak automatically
- After login, shows Prometheus

---

### Elasticsearch OIDC (Advanced)

**Requires enabling X-Pack Security** (currently disabled).

**Warning**: Enabling X-Pack security will require authentication for all Elasticsearch access, which will break current integrations.

**Configuration** (`/etc/elasticsearch/elasticsearch.yml`):

```yaml
xpack.security.enabled: true
xpack.security.authc.realms.oidc.keycloak:
  order: 2
  rp.client_id: "elasticsearch"
  rp.client_secret: "YOUR_ELASTICSEARCH_CLIENT_SECRET"
  rp.redirect_uri: "http://soc.acdev.host:9200/api/security/oidc/callback"
  op.issuer: "https://acdev.host:8443/realms/mcp-agents"
  op.authorization_endpoint: "https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/auth"
  op.token_endpoint: "https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/token"
  op.userinfo_endpoint: "https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/userinfo"
  op.endsession_endpoint: "https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/logout"
  op.jwkset_path: "https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/certs"
  claims.principal: preferred_username
  claims.groups: groups
```

**Important**: This will require updating SOC Hub MCP and all services to use Elasticsearch authentication.

---

## 🎯 After SSO Setup - Access URLs

All services accessible via Keycloak SSO:

```
SOC Dashboard:     http://soc.acdev.host/          ✅ Already SSO
Grafana:           http://soc.acdev.host:3000      🔄 After setup
TheHive:           http://soc.acdev.host:9000      🔄 After setup
Prometheus:        http://soc.acdev.host:9091      🔄 After setup (new port)
Elasticsearch:     http://soc.acdev.host:9200      ⚠️  Requires X-Pack
Wazuh Dashboard:   https://soc.acdev.host/         🔄 If dashboard deployed
```

---

## 🔒 Benefits of Unified SSO

**Single Login**:
- Login once to Keycloak
- Access all SOC tools
- No password management per tool

**Centralized User Management**:
- Add/remove users in Keycloak only
- Automatic access to all tools
- Group-based role assignment

**Enhanced Security**:
- Multi-factor authentication (MFA)
- Session management
- Audit logging centralized

**Compliance**:
- Single audit trail
- Password policy enforcement
- Access reviews simplified

---

## 🧪 Testing SSO Integration

### Test Grafana SSO
```bash
# 1. Open Grafana
open http://soc.acdev.host:3000

# 2. Should see "Sign in with Keycloak" button
# 3. Click button → Keycloak login page
# 4. Enter Keycloak credentials
# 5. Redirected back to Grafana dashboard
```

### Test TheHive SSO
```bash
# 1. Open TheHive
open http://soc.acdev.host:9000

# 2. Should see "SSO Login" button alongside local login
# 3. Click "SSO Login" → Keycloak authentication
# 4. Return to TheHive with user profile created
```

### Test Prometheus via oauth2-proxy
```bash
# 1. Open Prometheus (new port!)
open http://soc.acdev.host:9091

# 2. Automatically redirects to Keycloak
# 3. Login with Keycloak credentials
# 4. Redirected to Prometheus dashboard
```

---

## 🛠️ Troubleshooting

### Grafana: "Failed to connect to OAuth provider"

**Check**:
```bash
# Test Keycloak OIDC endpoint
curl https://acdev.host:8443/realms/mcp-agents/.well-known/openid-configuration

# Check Grafana logs
journalctl -u grafana-server -n 50

# Verify client secret is correct
# Verify redirect URI matches in Keycloak client config
```

### TheHive: "SSO Login button not appearing"

**Check**:
```bash
# Verify oauth.conf is included
grep "include" /opt/thehive/application.conf

# Check TheHive logs
docker logs thehive | tail -50

# Restart TheHive
cd /opt/thehive && docker-compose restart thehive
```

### oauth2-proxy: "Error authenticating with provider"

**Check**:
```bash
# Check oauth2-proxy is running
systemctl status oauth2-proxy-prometheus

# View logs
journalctl -u oauth2-proxy-prometheus -n 50

# Test OIDC discovery
curl https://acdev.host:8443/realms/mcp-agents/.well-known/openid-configuration

# Verify client secret and cookie secret are set correctly
```

---

## 📊 SSO Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    User Browser                         │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┴────────────┐
          │                         │
          v                         v
┌─────────────────┐      ┌──────────────────────┐
│  SOC Dashboard  │      │   Keycloak SSO       │
│  (Native SSO)   │◄────►│  acdev.host:8443     │
└─────────────────┘      │                      │
                         │  - User Management    │
┌─────────────────┐      │  - MFA               │
│    Grafana      │◄────►│  - Session Control   │
│  (Native OAuth) │      │  - Audit Logs        │
└─────────────────┘      └──────────────────────┘
                                  ▲
┌─────────────────┐              │
│    TheHive      │──────────────┘
│  (Native OAuth) │
└─────────────────┘

┌─────────────────┐      ┌──────────────────────┐
│   Prometheus    │◄────►│   oauth2-proxy       │
│  (via proxy)    │      │  (Keycloak OIDC)     │
└─────────────────┘      └──────────────────────┘
                                  ▲
┌─────────────────┐              │
│ Elasticsearch   │──────────────┘
│  (via proxy)    │     (if X-Pack enabled)
└─────────────────┘
```

---

## 📝 Summary

**All SOC components CAN use Keycloak SSO**:

| Component | Method | Effort |
|-----------|--------|--------|
| SOC Dashboard | Native | ✅ Done |
| Grafana | Native OAuth | 🟡 10 min |
| TheHive | Native OAuth | 🟡 10 min |
| Prometheus | oauth2-proxy | 🟡 15 min |
| Elasticsearch | Native OIDC | 🔴 30 min + breaking change |
| Wazuh | Native SAML/OIDC | 🟡 15 min (if dashboard deployed) |

**Recommended Approach**:
1. ✅ Start with Grafana (easy native support)
2. ✅ Add TheHive (easy native support)
3. ✅ Add Prometheus via oauth2-proxy
4. ⚠️  Skip Elasticsearch for now (requires enabling auth, breaking change)
5. 🔄 Add Wazuh if dashboard is deployed

**Total Setup Time**: ~30-45 minutes for Grafana + TheHive + Prometheus

---

**Document Version**: 1.0
**Last Updated**: 2025-11-14
**Maintained By**: Claude Code
