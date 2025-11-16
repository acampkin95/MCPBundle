# SOC Infrastructure - Complete Credentials Reference

**Last Updated**: 2025-11-14
**Server**: VMI03 (154.26.158.31 / soc.acdev.host)
**Status**: ✅ Credentials Retrieved & Documented

---

## 🔐 Quick Access Dashboard

### SOC Unified Dashboard (ACDev SOC Hub v2)

**Primary Access URLs**:
- **HTTP**: http://soc.acdev.host/ or http://154.26.158.31/
- **HTTPS**: https://soc.acdev.host:9443/ or https://154.26.158.31:9443/

**Authentication**: Keycloak SSO (see Keycloak section below)

**Supported Methods**:
1. **Passkey/Biometric** - WebAuthn (Face ID, fingerprint, YubiKey)
2. **2FA TOTP** - Google Authenticator, Authy (6-digit code)
3. **SSO Login** - Keycloak Single Sign-On

---

## 📊 Component Credentials

### 1. Grafana Dashboards ✅ WORKING

**Access URL**: http://soc.acdev.host:3000 or http://154.26.158.31:3000

**Credentials**:
```
Username: admin
Password: GrafanaAdmin2024!
```

**Status**: ✅ **VERIFIED WORKING**

**Features**:
- Custom SOC dashboards
- Elasticsearch data source
- Prometheus metrics
- Real-time alerting

**First Login**:
1. Navigate to http://soc.acdev.host:3000
2. Enter admin / GrafanaAdmin2024!
3. Dashboard loads immediately

---

### 2. TheHive Incident Response 🔄 FIRST-TIME SETUP REQUIRED

**Access URL**: http://soc.acdev.host:9000 or http://154.26.158.31:9000

**Status**: ⚠️ **First-time setup required via web UI**

**Current State**:
- TheHive 5.2.16-1 is running
- No admin user created yet
- Must use web UI for first-time setup

**Initial Setup Instructions**:

1. **Open TheHive Web UI**:
   ```
   http://soc.acdev.host:9000
   ```

2. **First-Time Setup Wizard**:
   - TheHive will detect it's a fresh installation
   - You'll be prompted to create the first admin user

3. **Recommended Admin Credentials** (you choose during setup):
   ```
   Login: admin@acdev.host
   Name: Admin User
   Password: TheHiveAdmin2024!
   Profile: admin
   Organization: acdev
   ```

4. **After Creating Admin**:
   - Login with your new credentials
   - Go to: Admin → Users → Your Profile
   - Create API Key:
     - Name: `SOC Hub MCP`
     - Permissions: Full Access
     - Copy the generated key

5. **Update SOC Hub MCP** (optional):
   ```bash
   ssh root@154.26.158.31
   nano /opt/mcp/services/soc-hub-mcp/.env
   # Update: THEHIVE_API_KEY=<your_generated_key>
   ```

**Secret Key** (for reference):
```
0e32fe7060592b9122c8b487219779c6b3c7597c9b70c64003d5fad9a4665f07
```

---

### 3. Elasticsearch SIEM ✅ NO AUTHENTICATION REQUIRED

**Access URL**: http://soc.acdev.host:9200 or http://154.26.158.31:9200

**Credentials**: ❌ **NONE REQUIRED** (authentication disabled)

**Status**: ✅ **FULLY ACCESSIBLE**

**Configuration**:
```
xpack.security.enabled: false
```

**Usage**:
```bash
# Cluster info
curl http://soc.acdev.host:9200

# List indices
curl http://soc.acdev.host:9200/_cat/indices?v

# Search all security events
curl -X GET "http://soc.acdev.host:9200/_search?pretty" \
  -H 'Content-Type: application/json' \
  -d '{"query": {"match_all": {}}}'
```

**Note**: Production deployments should enable authentication. For now, it's accessible for easy integration.

---

### 4. Wazuh Security Manager 🔄 API CREDENTIALS NEEDED

**Access URL**: https://soc.acdev.host:55000 (API)

**Status**: ⚠️ **API user needs to be created**

**Current State**:
- Wazuh Manager 4.x running
- No API users configured
- SQLite RBAC database exists but empty

**Option 1: Access via Wazuh Dashboard (Recommended)**

TheWazuh Dashboard might be accessible if deployed. Check:
```
https://soc.acdev.host/
https://soc.acdev.host:443/
```

If available:
1. Login to Wazuh Dashboard
2. Go to: Settings → API Configuration
3. Create API user
4. Use those credentials

**Option 2: Direct API User Creation**

Since the API requires authentication to create users (chicken-egg problem), you can:

1. **Use Wazuh CLI** (if available):
   ```bash
   ssh root@154.26.158.31
   /var/ossec/bin/wazuh-control info
   ```

2. **Use Wazuh Indexer** (if deployed with dashboard):
   ```bash
   # Check if wazuh-indexer is running
   systemctl status wazuh-indexer
   ```

3. **Modify SQLite Database Directly** (advanced):
   ```bash
   sqlite3 /var/ossec/api/configuration/security/rbac.db
   # Insert user record (requires password hashing)
   ```

**Temporary Workaround**:
- SOC Hub MCP uses Elasticsearch for all alert data
- Wazuh API is optional - same data available via Elasticsearch
- Can skip Wazuh API configuration initially

---

### 5. Prometheus Metrics ✅ NO AUTHENTICATION

**Access URL**: http://soc.acdev.host:9090 or http://154.26.158.31:9090

**Credentials**: ❌ **NONE REQUIRED**

**Status**: ✅ **FULLY ACCESSIBLE**

**Usage**:
```bash
# Health check
curl http://soc.acdev.host:9090/-/healthy

# Query metrics
curl 'http://soc.acdev.host:9090/api/v1/query?query=up'

# View targets
curl http://soc.acdev.host:9090/api/v1/targets
```

---

### 6. CrowdSec Threat Intelligence ❌ NOT INSTALLED

**Status**: ❌ **NOT INSTALLED ON VMI03**

**Investigation Results**:
- No `crowdsec` binary found
- No `cscli` command available
- Not installed via apt/dpkg
- Service not present

**Options**:

**A) Install CrowdSec** (recommended if you need it):
```bash
ssh root@154.26.158.31

# Install CrowdSec
curl -s https://install.crowdsec.net | sudo bash

# Install firewall bouncer
apt install crowdsec-firewall-bouncer-iptables

# Check status
systemctl status crowdsec
cscli version

# Update SOC Hub MCP (works automatically once installed)
```

**B) Remove from Documentation** (if not needed):
- Update SOC Hub MCP to remove CrowdSec integration
- Remove from dashboard UI

**Note**: SOC Hub MCP currently lists CrowdSec as a component, but it's not operational since the service isn't installed.

---

## 🔑 Keycloak SSO Integration

**Keycloak Server**: VMI01 (46.250.243.123)

**Access URLs**:
- **External**: https://acdev.host:8443/
- **Admin Console**: https://acdev.host:8443/admin/
- **Realm**: `mcp-agents`

**Admin Credentials** (from VMI01 deployment):
```
Username: admin
Password: (Check VMI01 Keycloak deployment docs)
```

**Keycloak Clients for SOC**:

### Client: `soc-hub` (Public)
**Purpose**: SOC Dashboard web authentication

**Configuration**:
- **Client ID**: `soc-hub`
- **Access Type**: Public (browser-based)
- **Valid Redirect URIs**:
  - `http://soc.acdev.host/*`
  - `http://154.26.158.31/*`
  - `https://soc.acdev.host:9443/*`
- **Web Origins**:
  - `http://soc.acdev.host`
  - `https://soc.acdev.host:9443`

### Client: `admin-panel` (Confidential)
**Purpose**: MCP Admin Panel (if deployed)

**Configuration**:
- **Client ID**: `admin-panel`
- **Access Type**: Confidential
- **Valid Redirect URIs**: `http://soc.acdev.host:3100/*`
- **Client Secret**: Generated by Keycloak (retrieve from admin console)

---

## 🔗 Complete URL Reference

### Production SOC URLs (soc.acdev.host)

| Service | URL | Port | Auth Required | Status |
|---------|-----|------|---------------|--------|
| **SOC Dashboard** | http://soc.acdev.host/ | 80 | Keycloak SSO | ✅ Working |
| **SOC Dashboard (SSL)** | https://soc.acdev.host:9443/ | 9443 | Keycloak SSO | ✅ Working |
| **Grafana** | http://soc.acdev.host:3000 | 3000 | admin / GrafanaAdmin2024! | ✅ Working |
| **TheHive** | http://soc.acdev.host:9000 | 9000 | Create on first visit | 🔄 Setup Required |
| **Elasticsearch** | http://soc.acdev.host:9200 | 9200 | None | ✅ Working |
| **Prometheus** | http://soc.acdev.host:9090 | 9090 | None | ✅ Working |
| **Wazuh API** | https://soc.acdev.host:55000 | 55000 | Create via dashboard | 🔄 Setup Required |
| **SOC Hub MCP API** | http://soc.acdev.host:3200 | 3200 | None | ✅ Working |

### Alternative IPs (154.26.158.31)

All services are also accessible via IP: http://154.26.158.31:<port>

---

## 🛠️ Quick Setup Guide

### Step 1: Access Grafana (Working Now)

```bash
# Open browser
open http://soc.acdev.host:3000

# Login
Username: admin
Password: GrafanaAdmin2024!

# Success! You're in.
```

### Step 2: Setup TheHive (5 minutes)

```bash
# Open browser
open http://soc.acdev.host:9000

# Create first admin user in web UI
Login: admin@acdev.host
Password: TheHiveAdmin2024!

# After login:
# Go to: Profile → API Keys → Create
# Name: SOC Hub MCP
# Copy key → Update /opt/mcp/services/soc-hub-mcp/.env
```

### Step 3: Access Elasticsearch (Working Now)

```bash
# Test from terminal
curl http://soc.acdev.host:9200

# Or open in browser
open http://soc.acdev.host:9200
```

### Step 4: Access SOC Dashboard

```bash
# Open SOC unified dashboard
open http://soc.acdev.host/

# Choose authentication:
# - SSO Login (Keycloak)
# - Passkey/Biometric
# - 2FA TOTP
```

### Step 5: (Optional) Setup Wazuh API

TheHive and Elasticsearch provide all security data needed. Wazuh API is optional.

If you need it:
1. Check for Wazuh Dashboard: https://soc.acdev.host/
2. Create API user via dashboard
3. Update SOC Hub MCP .env

---

## 📋 SOC Hub MCP Configuration

**Location**: `/opt/mcp/services/soc-hub-mcp/.env` on VMI03

**Current Configuration**:
```bash
SERVER_MODE=both
PORT=3200

# WAZUH - Optional (Elasticsearch provides same data)
WAZUH_API_URL=https://soc.acdev.host:55000
WAZUH_API_USER=wazuh
WAZUH_API_PASSWORD=wazuh  # Needs update after API user creation
WAZUH_VERIFY_SSL=false

# ELASTICSEARCH - Working ✅
ELASTICSEARCH_URL=http://soc.acdev.host:9200
ELASTICSEARCH_USER=
ELASTICSEARCH_PASSWORD=

# THEHIVE - Update after first-time setup
THEHIVE_URL=http://soc.acdev.host:9000
THEHIVE_API_KEY=  # Generate from web UI

# Other
ALLOWED_ORIGINS=http://soc.acdev.host:3200,http://localhost:3200,https://acdev.host
LOG_LEVEL=info
NODE_ENV=production
```

---

## ✅ Working Now (No Setup Required)

1. **Elasticsearch** - http://soc.acdev.host:9200 (all security logs)
2. **Grafana** - http://soc.acdev.host:3000 (admin / GrafanaAdmin2024!)
3. **Prometheus** - http://soc.acdev.host:9090 (metrics)
4. **SOC Hub MCP** - http://soc.acdev.host:3200 (8 tools via API)
5. **SOC Dashboard** - http://soc.acdev.host/ (Keycloak SSO)

---

## 🔄 Requires First-Time Setup (5-10 min)

1. **TheHive** - Create admin user via web UI
2. **Wazuh API** - Create API user (optional - Elasticsearch has same data)
3. **CrowdSec** - Install if needed (optional threat intel)

---

## 🎯 Priority Setup Order

**Immediate**:
1. ✅ Grafana (already working)
2. ✅ Elasticsearch (already working)
3. ✅ SOC Dashboard (already working)

**Next 5 minutes**:
4. 🔄 TheHive (open web UI, create admin)

**Optional**:
5. ⚠️ Wazuh API (only if you need agent management)
6. ⚠️ CrowdSec (only if you need threat intel)

---

## 🔐 Password Security Notes

**Current Passwords**:
- Grafana: GrafanaAdmin2024!
- TheHive: (You create during setup - recommend: TheHiveAdmin2024!)
- Elasticsearch: No password (auth disabled)
- Prometheus: No password

**Recommendations**:
1. Change Grafana password after first login
2. Enable Elasticsearch authentication for production
3. Use strong passwords (20+ chars) for TheHive
4. Store passwords in password manager
5. Enable 2FA on Keycloak for SOC dashboard access

---

## 🚀 Test All Services

```bash
# Grafana
curl -u admin:GrafanaAdmin2024! http://soc.acdev.host:3000/api/health

# Elasticsearch
curl http://soc.acdev.host:9200

# Prometheus
curl http://soc.acdev.host:9090/-/healthy

# TheHive (after setup)
curl -H "Authorization: Bearer YOUR_API_KEY" http://soc.acdev.host:9000/api/v1/status

# SOC Hub MCP
curl http://soc.acdev.host:3200/api/health

# SOC Dashboard
curl -I http://soc.acdev.host/
```

---

## 📞 Support & Troubleshooting

### Can't Login to Grafana

**Test**:
```bash
curl -u admin:GrafanaAdmin2024! http://soc.acdev.host:3000/api/health
```

If fails:
```bash
ssh root@154.26.158.31
# Check Grafana config
cat /etc/grafana/grafana.ini | grep admin_password

# Restart Grafana
systemctl restart grafana-server
```

### TheHive Not Loading

**Test**:
```bash
curl http://soc.acdev.host:9000
```

If fails:
```bash
ssh root@154.26.158.31
docker ps | grep thehive
docker logs thehive
```

### Elasticsearch Not Responding

**Test**:
```bash
curl http://soc.acdev.host:9200
```

If fails:
```bash
ssh root@154.26.158.31
systemctl status elasticsearch
journalctl -u elasticsearch -n 50
```

---

## 📁 Credential Storage Locations

**VMI03**:
```
/etc/grafana/grafana.ini              # Grafana password
/opt/thehive/application.conf         # TheHive secret key
/opt/thehive/docker-compose.yml       # TheHive secret (same)
/var/ossec/api/configuration/security/rbac.db  # Wazuh users (SQLite)
/opt/mcp/services/soc-hub-mcp/.env    # SOC Hub MCP config
```

**Local**:
```
/Users/alex/Projects/MCP Bundle/SOC_CREDENTIALS.md  # This file
```

---

**Document Version**: 1.0
**Last Updated**: 2025-11-14
**Maintained By**: Claude Code
**Status**: Credentials Retrieved ✅

---

## 🎉 Summary

**Working Now**:
- ✅ Grafana (admin / GrafanaAdmin2024!)
- ✅ Elasticsearch (no auth)
- ✅ Prometheus (no auth)
- ✅ SOC Dashboard (Keycloak SSO)
- ✅ SOC Hub MCP (HTTP API)

**Setup Required** (5-10 min total):
- 🔄 TheHive (web UI first-time setup)
- 🔄 Wazuh API (optional - only if needed)
- ❌ CrowdSec (not installed - optional)

**All services accessible via**:
- Domain: http://soc.acdev.host:<port>
- IP: http://154.26.158.31:<port>

---

## 🔐 Keycloak SSO Admin Accounts

**Created**: 2025-11-14
**Realm**: mcp-agents
**Server**: https://acdev.host:8443/

### 1. Alex Campkin (Primary Admin)

```
Username: acampkin
Password: =London22!
Email: alex@acdev.host
First Name: Alex
Last Name: Campkin
Role: Full Administrator
Purpose: Primary SOC administration account
```

**Access**:
- Keycloak Admin Console: https://acdev.host:8443/admin/
- All SOC services via SSO

**Permissions**:
- ✅ Full Keycloak realm administration
- ✅ User management
- ✅ Client configuration
- ✅ All SOC component access

---

### 2. AIService (AI/Automation Account)

```
Username: AIService
Password: kjYPf2D5cdO+POqV8+LR
Email: ai@acdev.host
First Name: AI
Last Name: Service
Role: Full Administrator
Purpose: Automated AI/MCP access only
```

**Access**:
- All SOC services via SSO
- Programmatic API access
- MCP integrations

**Permissions**:
- ✅ Full administrative access
- ✅ API access to all services
- ✅ Automated monitoring and management

**Security Notes**:
- 🔒 20-character secure passphrase
- 🤖 For AI/automation use only
- 📝 Logged for audit purposes
- ⚠️ Do not use for manual access

---

## 🎯 SSO-Enabled Services

After Keycloak SSO deployment, these services use centralized authentication:

| Service | URL | Auth Method | Status |
|---------|-----|-------------|--------|
| **Grafana** | http://soc.acdev.host:3000 | Keycloak SSO | 🔄 Deploying |
| **TheHive** | http://soc.acdev.host:9000 | Keycloak SSO | 🔄 Deploying |
| **Prometheus** | http://soc.acdev.host:9091 | Keycloak SSO | 🔄 Deploying |
| **Elasticsearch** | http://soc.acdev.host:9200 | LAN/VPN only | ✅ No SSO (by design) |

---

## 🔒 Elasticsearch Security Model

**Access Control**: LAN/VPN Restriction Only

```
URL: http://soc.acdev.host:9200
Authentication: None (disabled)
Access: Restricted to:
  - 10.0.0.x (VPN network)
  - Internal LAN
  - VMI03 localhost
```

**Rationale**:
- No SSO configured per security requirements
- Access controlled at network layer
- Firewall rules restrict external access
- Intended for internal/automated access only

**Firewall Configuration**:
```bash
# Allow only VPN and local access
ufw allow from 10.0.0.0/24 to any port 9200
ufw allow from 127.0.0.1 to any port 9200
ufw deny 9200
```

