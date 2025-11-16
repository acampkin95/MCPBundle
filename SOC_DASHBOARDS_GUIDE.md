# SOC Unified Dashboards - Access Guide

**Last Updated**: 2025-11-14
**Status**: ✅ **DEPLOYED & OPERATIONAL**

---

## 📊 Overview

The MCP infrastructure includes **TWO unified dashboards** that provide centralized access to all SOC components with Keycloak authentication:

1. **ACDev SOC Hub v2** - Production unified SOC dashboard (HTML/JS)
2. **MCP Admin Panel** - Next.js dashboard for MCP mesh monitoring

---

## 🛡️ Dashboard #1: ACDev SOC Hub v2

**Purpose**: Unified Security Operations Center dashboard integrating all SOC components
**Status**: ✅ **DEPLOYED ON VMI03**
**Technology**: Advanced HTML5/JS with real-time updates

### 📍 Access URLs

**HTTP** (Port 80):
```
http://soc.acdev.host/ or http://154.26.158.31/
http://soc.acdev.host/
```

**HTTPS** (Port 9443):
```
https://154.26.158.31:9443/
https://soc.acdev.host:9443/
```

### 🔐 Authentication Methods

The dashboard supports **three authentication methods**:

1. **Passkey/Biometric** (`authenticateWithPasskey()`)
   - WebAuthn-based authentication
   - Fingerprint, Face ID, Windows Hello
   - Most secure option

2. **2FA/TOTP Code** (`showTOTPInput()`)
   - 6-digit time-based one-time password
   - Google Authenticator, Authy compatible
   - 6 separate input fields for OTP

3. **SSO Login** (`authenticateWithSSO()`)
   - Keycloak Single Sign-On integration
   - Enterprise authentication
   - Centralized user management

### 🗂️ Dashboard Structure

**Location**: `/var/www/soc/` on VMI03

**Files**:
```
/var/www/soc/
├── index.html          # Main dashboard (27KB)
├── css/
│   └── style-v2.css    # Advanced styling with glass morphism
├── js/
│   └── auth-v2.js      # Multi-factor authentication logic
├── api/
│   └── index.php       # Backend API (5.2KB)
└── img/                # Dashboard graphics
```

### 🔌 Integrated Components

The SOC Hub v2 dashboard provides unified access to:

1. **Wazuh** (Security Monitoring)
   - Agent status
   - Security alerts
   - Compliance monitoring

2. **Elasticsearch** (SIEM)
   - Log aggregation
   - Full-text search
   - Security event analysis

3. **TheHive** (Incident Response)
   - Case management
   - Investigation tracking
   - Alert correlation

4. **CrowdSec** (Threat Intelligence)
   - Banned IPs
   - Attack scenarios
   - Community threat feeds

5. **Grafana** (Visualization)
   - Custom dashboards
   - Real-time metrics
   - Performance monitoring

6. **Prometheus** (Metrics)
   - Infrastructure monitoring
   - Service health
   - Alert rules

### 🌐 Nginx Configuration

**HTTP Server** (Port 80):
```nginx
server {
    listen 80;
    server_name _;
    root /var/www/soc;
    index index.html index.php;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        try_files $uri $uri/ /api/index.php?$query_string;
    }
}
```

**HTTPS Server** (Port 9443):
```nginx
server {
    listen 9443 ssl http2;
    server_name _;

    ssl_certificate /etc/letsencrypt/live/acdev.host/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/acdev.host/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /var/www/soc;
    index index.html index.php;
}
```

### 📦 Dashboard Features

**Advanced UI/UX**:
- ✅ Glass morphism design
- ✅ Real-time Socket.io updates
- ✅ Chart.js & ApexCharts visualizations
- ✅ Font Awesome icons
- ✅ Responsive mobile design
- ✅ Session token management

**Security**:
- ✅ Keycloak SSO integration
- ✅ WebAuthn/Passkey support
- ✅ 2FA TOTP verification
- ✅ Session expiry tracking
- ✅ Secure token storage

**Functionality**:
- ✅ Multi-service integration
- ✅ Live data aggregation
- ✅ Interactive dashboards
- ✅ Alert management
- ✅ Incident tracking

---

## 🔧 Dashboard #2: MCP Admin Panel

**Purpose**: Next.js dashboard for Cloudflare MCP heartbeat monitoring and mesh registry
**Status**: ✅ **READY TO DEPLOY**
**Technology**: Next.js 14 + NextAuth + Keycloak

### 📍 Deployment Location

**Development**: `release_dev/admin-panel/`
**Production Target**: Port 3100 (not yet deployed to VMI03)

### 🔐 Authentication

**Keycloak Integration**:
- Middleware enforces authentication on **all routes**
- Uses NextAuth.js for session management
- JWT-based token validation
- Automatic token refresh

### 📋 Features

**Key Pages**:
1. **Dashboard** (`/`)
   - `GET /panel/overview` - Mesh stats + credential fingerprints
   - `GET /panel/structured-thoughts` - Timeline/diagnostics feed
   - Server-side rendering for security

2. **API Proxy** (`/api/panel`)
   - Proxies Cloudflare MCP endpoints
   - Browser-friendly access
   - Single endpoint for all panel data

**CLI Tools**:
```bash
# Snapshot current mesh state
npm run panel:snapshot

# Lint/test
npm run test
```

### 🚀 Deployment Steps (Optional)

```bash
# 1. Navigate to admin panel directory
cd release_dev/admin-panel

# 2. Create production environment file
cp .env.example .env.local

# 3. Configure environment variables
cat > .env.local << 'EOF'
# Cloudflare MCP API
PANEL_API_BASE_URL=http://46.250.243.123:3003

# NextAuth
AUTH_SECRET=<generate-with-openssl-rand-hex-32>

# Keycloak
KEYCLOAK_BASE_URL=https://acdev.host:8443
KEYCLOAK_REALM=mcp-agents
KEYCLOAK_CLIENT_ID=admin-panel
KEYCLOAK_CLIENT_SECRET=<from-keycloak-client>
EOF

# 4. Build for production
npm install
npm run build

# 5. Deploy to VMI03
rsync -avz .next/ package.json root@154.26.158.31:/opt/admin-panel/

# 6. Install systemd service
scp systemd/admin-panel.service root@154.26.158.31:/etc/systemd/system/
ssh root@154.26.158.31 'systemctl enable admin-panel && systemctl start admin-panel'
```

---

## 🔑 Keycloak Configuration

### Required Keycloak Clients

**For SOC Hub v2**:
- **Client ID**: `soc-hub`
- **Access Type**: Public (browser-based)
- **Valid Redirect URIs**: `http://soc.acdev.host/ or http://154.26.158.31/*`, `https://soc.acdev.host:9443/*`
- **Web Origins**: `http://154.26.158.31`, `https://acdev.host:9443`

**For MCP Admin Panel**:
- **Client ID**: `admin-panel`
- **Access Type**: Confidential
- **Valid Redirect URIs**: `http://154.26.158.31:3100/*`
- **Client Secret**: Generated by Keycloak

### Keycloak URLs

**External Access**:
```
https://acdev.host:8443/
```

**Admin Console**:
```
https://acdev.host:8443/admin/
```

**Realm**: `mcp-agents` (or your configured realm)

---

## 🧪 Testing Dashboard Access

### Test SOC Hub v2

```bash
# Test HTTP access
curl -I http://soc.acdev.host/ or http://154.26.158.31/

# Test HTTPS access (skip cert verification for self-signed)
curl -Ik https://154.26.158.31:9443/

# Check dashboard loads
curl -s http://soc.acdev.host/ or http://154.26.158.31/ | grep "ACDev SOC Hub"
```

### Test API Endpoint

```bash
# Test PHP API
curl -s http://soc.acdev.host/ or http://154.26.158.31/api/ | head -20
```

### Test from Browser

1. **Open browser**: http://soc.acdev.host/ or http://154.26.158.31/ or https://soc.acdev.host:9443/
2. **Wait for authentication screen**
3. **Choose authentication method**:
   - Click "SSO Login" for Keycloak
   - Click "Passkey/Biometric" for WebAuthn
   - Click "2FA Code" for TOTP
4. **After authentication**: Dashboard loads with live SOC data

---

## 📊 Dashboard Components Access

Once authenticated, the SOC Hub dashboard provides direct links to:

### Security Monitoring

**Wazuh Dashboard**:
```
https://154.26.158.31:55000/
```

**Elasticsearch**:
```
http://154.26.158.31:9200/
```

### Incident Management

**TheHive**:
```
http://154.26.158.31:9000/
```

### Threat Intelligence

**CrowdSec** (CLI):
```bash
ssh root@154.26.158.31 'cscli decisions list'
```

### Monitoring

**Grafana**:
```
http://154.26.158.31:3000/
```

**Prometheus**:
```
http://154.26.158.31:9090/
```

---

## 🔧 Troubleshooting

### Dashboard Not Loading

**Issue**: White screen or loading forever

**Solutions**:
1. Check nginx is running: `systemctl status nginx`
2. Verify dashboard files exist: `ls -la /var/www/soc/`
3. Check nginx error log: `tail -50 /var/log/nginx/error.log`
4. Test direct file access: `curl http://localhost/index.html`

### Authentication Failing

**Issue**: Keycloak redirects fail or SSO button doesn't work

**Solutions**:
1. Verify Keycloak is running: `systemctl status keycloak` (if systemd) or `docker ps | grep keycloak`
2. Check Keycloak client configuration in admin console
3. Verify redirect URIs match exactly
4. Check browser console for JavaScript errors
5. Clear browser cookies and try again

### API Errors

**Issue**: Dashboard loads but no data appears

**Solutions**:
1. Check PHP-FPM is running: `systemctl status php8.3-fpm`
2. Verify API endpoint: `curl http://localhost/api/`
3. Check PHP error log: `tail -50 /var/log/php8.3-fpm.log`
4. Verify backend services (Elasticsearch, Wazuh) are accessible

### SSL/HTTPS Issues

**Issue**: Certificate errors on port 9443

**Solutions**:
1. Check certificate files exist:
   ```bash
   ls -la /etc/letsencrypt/live/acdev.host/
   ```
2. Renew certificates if expired:
   ```bash
   certbot renew
   systemctl reload nginx
   ```
3. For testing, use HTTP (port 80) instead

---

## 📁 Important Files & Locations

### VMI03 (Production)

**SOC Dashboard**:
- Dashboard: `/var/www/soc/`
- Nginx Config: `/etc/nginx/sites-enabled/default`
- SSL Certs: `/etc/letsencrypt/live/acdev.host/`
- PHP API: `/var/www/soc/api/index.php`

**Logs**:
- Nginx Access: `/var/log/nginx/access.log`
- Nginx Error: `/var/log/nginx/error.log`
- PHP-FPM: `/var/log/php8.3-fpm.log`

### Local (Development)

**Admin Panel Source**:
- Code: `/Users/alex/Projects/MCP Bundle/release_dev/admin-panel/`
- Config: `.env.example`
- Service File: `systemd/admin-panel.service`

---

## 🎯 Summary

### ✅ ACDev SOC Hub v2 (Deployed)
- **Access**: http://soc.acdev.host/ or http://154.26.158.31/ or https://soc.acdev.host:9443/
- **Auth**: Keycloak SSO + Passkey + 2FA
- **Components**: Wazuh, Elasticsearch, TheHive, CrowdSec, Grafana, Prometheus
- **Features**: Real-time monitoring, advanced visualizations, glass morphism UI

### 📋 MCP Admin Panel (Ready to Deploy)
- **Access**: Port 3100 (not yet deployed)
- **Auth**: Keycloak via NextAuth
- **Components**: Cloudflare MCP heartbeat, mesh registry, structured thinking
- **Features**: Mesh monitoring, credential management, agent status

Both dashboards provide **centralized, authenticated access** to the entire SOC and MCP infrastructure with modern, user-friendly interfaces.

---

**Need Help?**
- SOC Dashboard Issues: Check `/var/log/nginx/error.log`
- Keycloak Problems: Access admin console at https://acdev.host:8443/admin/
- General Questions: See `deployment/soc/README.md`

**Last Updated**: 2025-11-14
**Deployed By**: Claude Code
**Status**: Production Ready ✅
