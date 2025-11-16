# SOC Keycloak SSO Deployment - Complete Guide

**Date**: 2025-11-14
**Status**: 🔄 **READY FOR MANUAL COMPLETION**
**Automated Script**: Prepared and ready at `/tmp/deploy-keycloak-sso-complete.sh` on VMI03

---

## ✅ What's Been Completed

### 1. Credentials Generated

**Your Admin Account**:
```
Username: acampkin
Password: =London22!
Email: alex@acdev.host
Role: Full Administrator
```

**AI Service Account** (AI/Automation Only):
```
Username: AIService
Password: kjYPf2D5cdO+POqV8+LR
Email: ai@acdev.host
Role: Full Administrator
Purpose: Automated AI/MCP access only
```

### 2. Keycloak Admin Access

```
URL: https://acdev.host:8443/admin/
Admin Username: admin
Admin Password: RJBZPH/r+ZdTy54E9EP00U32fImBH9N0pa5lwjUeh3s=
Realm: mcp-agents
```

### 3. Documentation Created

- ✅ `SOC_CREDENTIALS.md` - Complete credentials reference
- ✅ `SOC_KEYCLOAK_SSO_GUIDE.md` - Comprehensive SSO integration guide
- ✅ `deployment/soc/deploy-keycloak-sso-complete.sh` - Automated deployment script
- ✅ `deployment/soc/setup-keycloak-sso.sh` - Alternative setup script
- ✅ This file - Complete deployment guide

---

## 🚀 Manual Setup Instructions (30-45 minutes)

Since the automated script had connectivity issues with Keycloak (container showing "unhealthy" status), here's the manual approach:

### Step 1: Verify Keycloak is Healthy

```bash
ssh root@154.26.158.31

# Check Keycloak container
docker ps | grep keycloak
# Should show: Up (healthy)

# If unhealthy, restart Keycloak
cd /opt/keycloak
docker-compose restart keycloak

# Wait 30 seconds, check again
docker ps | grep keycloak
```

### Step 2: Create Keycloak Users via Web UI

1. **Login to Keycloak**:
   - Open: https://acdev.host:8443/admin/
   - Username: `admin`
   - Password: `RJBZPH/r+ZdTy54E9EP00U32fImBH9N0pa5lwjUeh3s=`

2. **Select Realm**: Click "master" dropdown → Select "mcp-agents"

3. **Create acampkin User**:
   - Left menu → Users → Add user
   - Username: `acampkin`
   - Email: `alex@acdev.host`
   - First Name: `Alex`
   - Last Name: `Campkin`
   - Email Verified: ✅ ON
   - Click "Create"

   **Set Password**:
   - Go to "Credentials" tab
   - Set password: `=London22!`
   - Temporary: ❌ OFF
   - Click "Set Password"

   **Assign Admin Role**:
   - Go to "Role mapping" tab
   - Click "Assign role"
   - Filter by: "Filter by clients"
   - Find and select "admin" role
   - Click "Assign"

4. **Create AIService User** (same steps):
   - Username: `AIService`
   - Email: `ai@acdev.host`
   - First Name: `AI`
   - Last Name: `Service`
   - Email Verified: ✅ ON
   - Password: `kjYPf2D5cdO+POqV8+LR`
   - Temporary: ❌ OFF
   - Assign "admin" role

### Step 3: Create Keycloak Clients

**For each client below, follow these steps:**

#### 3.1 Grafana Client

1. Left menu → Clients → Create client
2. **General Settings**:
   - Client type: OpenID Connect
   - Client ID: `grafana`
   - Name: `Grafana SOC Dashboard`
   - Click "Next"

3. **Capability config**:
   - Client authentication: ✅ ON (Confidential)
   - Authorization: ❌ OFF
   - Standard flow: ✅ ON
   - Direct access grants: ✅ ON
   - Click "Next"

4. **Login settings**:
   - Root URL: `http://soc.acdev.host:3000`
   - Valid redirect URIs: `http://soc.acdev.host:3000/*`
   - Web origins: `http://soc.acdev.host:3000`
   - Click "Save"

5. **Get Client Secret**:
   - Go to "Credentials" tab
   - Copy the "Client secret" value
   - **Save this**: `GRAFANA_SECRET=<paste_secret_here>`

#### 3.2 TheHive Client

Same steps as Grafana, but use:
- Client ID: `thehive`
- Root URL: `http://soc.acdev.host:9000`
- Valid redirect URIs: `http://soc.acdev.host:9000/*` AND `http://soc.acdev.host:9000/api/ssoLogin`
- Web origins: `http://soc.acdev.host:9000`
- **Save secret**: `THEHIVE_SECRET=<paste_secret_here>`

#### 3.3 Prometheus Client

Same steps, but use:
- Client ID: `prometheus`
- Root URL: `http://soc.acdev.host:9091`
- Valid redirect URIs: `http://soc.acdev.host:9091/oauth2/callback`
- Web origins: `http://soc.acdev.host:9091`
- **Save secret**: `PROMETHEUS_SECRET=<paste_secret_here>`

---

### Step 4: Configure Grafana OAuth

```bash
ssh root@154.26.158.31

# Backup original config
cp /etc/grafana/grafana.ini /etc/grafana/grafana.ini.backup

# Add OAuth config (replace YOUR_GRAFANA_SECRET with actual secret from Step 3.1)
cat >> /etc/grafana/grafana.ini << 'EOF'

# Keycloak SSO Configuration
[auth.generic_oauth]
enabled = true
name = Keycloak
allow_sign_up = true
auto_login = false
client_id = grafana
client_secret = YOUR_GRAFANA_SECRET
scopes = openid email profile
auth_url = https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/auth
token_url = https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/token
api_url = https://acdev.host:8443/realms/mcp-agents/protocol/openid-connect/userinfo
role_attribute_path = contains(roles[*], 'admin') && 'Admin' || 'Viewer'

[server]
root_url = http://soc.acdev.host:3000
EOF

# Restart Grafana
systemctl restart grafana-server

# Check status
systemctl status grafana-server
```

**Test**:
- Open: http://soc.acdev.host:3000
- Should see "Sign in with Keycloak" button
- Click it → redirects to Keycloak
- Login with acampkin / =London22!
- Should return to Grafana dashboard

---

### Step 5: Configure TheHive OAuth

```bash
ssh root@154.26.158.31

# Create OAuth config (replace YOUR_THEHIVE_SECRET with actual secret from Step 3.2)
cat > /opt/thehive/oauth.conf << 'EOF'
# Keycloak SSO Configuration
auth {
  providers: [
    {name: session}
    {name: basic, realm: thehive}
    {name: local}
    {name: key}
    {
      name: oauth2
      clientId: thehive
      clientSecret: "YOUR_THEHIVE_SECRET"
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
EOF

# Add include to main config if not already there
if ! grep -q "oauth.conf" /opt/thehive/application.conf; then
    echo 'include "/opt/thehive/oauth.conf"' >> /opt/thehive/application.conf
fi

# Restart TheHive
cd /opt/thehive && docker-compose restart thehive

# Check logs
docker logs thehive | tail -20
```

**Test**:
- Open: http://soc.acdev.host:9000
- Should see "SSO Login" button
- Click it → Keycloak authentication
- Login with acampkin / =London22!
- Creates TheHive user and returns to dashboard

---

### Step 6: Configure Prometheus with oauth2-proxy

```bash
ssh root@154.26.158.31

# Install oauth2-proxy if not present
if ! command -v oauth2-proxy &> /dev/null; then
    wget https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.5.1/oauth2-proxy-v7.5.1.linux-amd64.tar.gz
    tar -xzf oauth2-proxy-v7.5.1.linux-amd64.tar.gz
    mv oauth2-proxy-v7.5.1.linux-amd64/oauth2-proxy /usr/local/bin/
    rm -rf oauth2-proxy-v7.5.1*
fi

# Generate cookie secret
COOKIE_SECRET=$(openssl rand -base64 32 | tr -d '\n')

# Create oauth2-proxy config (replace YOUR_PROMETHEUS_SECRET with actual secret from Step 3.3)
cat > /etc/oauth2-proxy-prometheus.cfg << EOF
provider = "keycloak-oidc"
client_id = "prometheus"
client_secret = "YOUR_PROMETHEUS_SECRET"
redirect_url = "http://soc.acdev.host:9091/oauth2/callback"
oidc_issuer_url = "https://acdev.host:8443/realms/mcp-agents"
email_domains = ["*"]
cookie_secret = "$COOKIE_SECRET"
cookie_secure = false
upstreams = ["http://127.0.0.1:9090"]
http_address = "0.0.0.0:9091"
skip_provider_button = false
EOF

# Create systemd service
cat > /etc/systemd/system/oauth2-proxy-prometheus.service << 'SVCEOF'
[Unit]
Description=OAuth2 Proxy for Prometheus
After=network.target prometheus.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/oauth2-proxy --config /etc/oauth2-proxy-prometheus.cfg
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

# Start service
systemctl daemon-reload
systemctl enable oauth2-proxy-prometheus
systemctl start oauth2-proxy-prometheus

# Check status
systemctl status oauth2-proxy-prometheus
```

**Update Nginx**:
```bash
# Add Prometheus proxy config
cat >> /etc/nginx/sites-available/default << 'NGINXEOF'

# Prometheus with OAuth2 Proxy
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
NGINXEOF

# Test and reload nginx
nginx -t && systemctl reload nginx
```

**Test**:
- Open: http://soc.acdev.host:9091
- Automatically redirects to Keycloak
- Login with acampkin / =London22!
- Returns to Prometheus dashboard

---

### Step 7: Configure Elasticsearch Firewall (LAN/VPN Only)

**Elasticsearch will NOT use SSO** - restricted to LAN/VPN access only.

```bash
ssh root@154.26.158.31

# Configure UFW firewall
ufw allow from 10.0.0.0/24 to any port 9200 comment 'Elasticsearch VPN access'
ufw allow from 127.0.0.1 to any port 9200 comment 'Elasticsearch localhost'
ufw deny 9200 comment 'Elasticsearch deny public'

# Reload firewall
ufw reload

# Verify rules
ufw status numbered | grep 9200
```

---

## 🧪 Testing All SSO Integrations

### Test Grafana SSO
```bash
# Open browser
open http://soc.acdev.host:3000

# Should see "Sign in with Keycloak" button
# Click → Keycloak login → acampkin / =London22!
# Returns to Grafana
```

### Test TheHive SSO
```bash
# Open browser
open http://soc.acdev.host:9000

# Should see "SSO Login" button
# Click → Keycloak login → acampkin / =London22!
# Creates user, returns to TheHive
```

### Test Prometheus SSO
```bash
# Open browser
open http://soc.acdev.host:9091

# Auto-redirects to Keycloak
# Login → acampkin / =London22!
# Returns to Prometheus
```

### Test AIService Account
```bash
# Test with AIService credentials
# Same as above, but use: AIService / kjYPf2D5cdO+POqV8+LR
```

---

## 📋 Complete Credentials Summary

### Keycloak Users

**1. acampkin (Primary Admin)**
- Username: `acampkin`
- Password: `=London22!`
- Email: alex@acdev.host
- Access: All SOC services via SSO

**2. AIService (AI/Automation)**
- Username: `AIService`
- Password: `kjYPf2D5cdO+POqV8+LR`
- Email: ai@acdev.host
- Access: All SOC services via SSO (for automation only)

### Keycloak Admin

- URL: https://acdev.host:8443/admin/
- Username: `admin`
- Password: `RJBZPH/r+ZdTy54E9EP00U32fImBH9N0pa5lwjUeh3s=`
- Realm: `mcp-agents`

### Service Access URLs (After SSO Setup)

```
Grafana:      http://soc.acdev.host:3000  (Keycloak SSO)
TheHive:      http://soc.acdev.host:9000  (Keycloak SSO)
Prometheus:   http://soc.acdev.host:9091  (Keycloak SSO)
Elasticsearch: http://soc.acdev.host:9200  (LAN/VPN only, no SSO)
```

---

## 🔒 Elasticsearch Security Note

**Elasticsearch is intentionally NOT configured for SSO** per your requirements:

- Access: LAN/VPN only (10.0.0.0/24)
- No authentication required
- Firewall rules restrict public access
- Accessible only from:
  - VPN network (10.0.0.x)
  - VMI03 localhost (127.0.0.1)
  - Internal LAN

---

## 📁 Files Created

### On VMI03

```
/tmp/deploy-keycloak-sso-complete.sh  # Automated deployment script (prepared)
/root/soc-keycloak-credentials.txt    # Will be created after successful deployment
/etc/grafana/grafana.ini               # Grafana config (update manually)
/opt/thehive/oauth.conf                # TheHive OAuth config (create manually)
/etc/oauth2-proxy-prometheus.cfg       # Prometheus proxy config (create manually)
```

### Local Documentation

```
/Users/alex/Projects/MCP Bundle/
├── SOC_CREDENTIALS.md                 # Complete credentials reference
├── SOC_KEYCLOAK_SSO_GUIDE.md         # Comprehensive SSO guide
├── SOC_SSO_DEPLOYMENT_COMPLETE.md    # This file
├── SOC_QUICK_REFERENCE.md            # Quick reference card
└── deployment/soc/
    ├── deploy-keycloak-sso-complete.sh  # Automated script
    └── setup-keycloak-sso.sh           # Alternative setup script
```

---

## ⚠️ Important Notes

1. **Keycloak Health**: If Keycloak container shows "unhealthy", restart it before proceeding:
   ```bash
   cd /opt/keycloak && docker-compose restart keycloak
   ```

2. **Client Secrets**: Keep your client secrets secure. They're needed for the service configs.

3. **Testing Order**: Test Grafana first (easiest), then TheHive, then Prometheus.

4. **AIService Account**: The AIService account is for automated/AI use only. Document its usage for audit purposes.

5. **Elasticsearch**: Remains accessible without SSO but restricted to VPN/LAN by firewall rules.

---

## 🎯 Estimated Time

- **Keycloak User Creation**: 10 minutes
- **Client Creation**: 15 minutes
- **Service Configuration**: 20 minutes
- **Testing**: 10 minutes
- **Total**: 45-60 minutes

---

## 📞 Troubleshooting

### Keycloak Not Accessible

```bash
ssh root@154.26.158.31
docker ps | grep keycloak
# If unhealthy: docker-compose restart keycloak
curl -Ik https://acdev.host:8443/
```

### SSO Button Not Appearing

- Clear browser cache
- Check service logs (grafana, thehive, oauth2-proxy)
- Verify client secrets are correct
- Ensure redirect URIs match exactly in Keycloak

### Authentication Fails

- Verify user exists in Keycloak mcp-agents realm
- Check user has correct roles assigned
- Verify client is in correct realm
- Check service logs for detailed error messages

---

## ✅ Completion Checklist

- [ ] Keycloak container healthy
- [ ] acampkin user created in Keycloak
- [ ] AIService user created in Keycloak
- [ ] Grafana client created with secret saved
- [ ] TheHive client created with secret saved
- [ ] Prometheus client created with secret saved
- [ ] Grafana OAuth configured and tested
- [ ] TheHive OAuth configured and tested
- [ ] Prometheus oauth2-proxy configured and tested
- [ ] Elasticsearch firewall rules configured
- [ ] All services tested with acampkin account
- [ ] AIService account tested
- [ ] Credentials documented and secured

---

**Status**: Ready for manual completion
**Last Updated**: 2025-11-14
**Created By**: Claude Code

All credentials generated and documented. Follow the manual steps above to complete the SSO integration.
