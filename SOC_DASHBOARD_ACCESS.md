# SOC Dashboard - Access Guide

**Last Updated**: 2025-11-14
**Status**: ✅ DEPLOYED & OPERATIONAL
**Server**: VMI03 (154.26.158.31 / soc.acdev.host)

---

## ✅ Dashboard is Now Live!

The SOC Dashboard has been successfully deployed to VMI03.

### 🌐 Access URLs

**HTTP Access** (Port 9080):
```
http://soc.acdev.host:9080/
http://154.26.158.31:9080/
```

**HTTPS Access** (Port 9443):
```
https://soc.acdev.host:9443/
https://154.26.158.31:9443/
```

**Admin Route**:
```
http://soc.acdev.host:9080/admin
https://soc.acdev.host:9443/admin
```

---

## 📊 What's in the Dashboard

The SOC Dashboard provides unified access to:

### Direct Links to SOC Components

| Component | Port | URL |
|-----------|------|-----|
| **Grafana** | 3000 | http://soc.acdev.host:3000 |
| **TheHive** | 9000 | http://soc.acdev.host:9000 |
| **Elasticsearch** | 9200 | http://soc.acdev.host:9200 |
| **Prometheus** | 9090 | http://soc.acdev.host:9090 |
| **Wazuh API** | 55000 | https://soc.acdev.host:55000 |
| **SOC Hub MCP API** | 3200 | http://soc.acdev.host:3200 |
| **Keycloak SSO** | 8443 | https://acdev.host:8443/admin/ |

### Quick Reference Information

- Grafana credentials
- Keycloak admin access
- Links to documentation
- Keycloak SSO integration status

---

## 🔒 Authentication

### Current State

The dashboard is accessible without authentication on ports 9080/9443.

### SOC Component Credentials

**Grafana**:
- Username: `admin`
- Password: `GrafanaAdmin2024!`
- URL: http://soc.acdev.host:3000

**Keycloak Admin**:
- Username: `admin`
- Password: (see /opt/keycloak/credentials.txt on VMI03)
- URL: https://acdev.host:8443/admin/

**TheHive**:
- First-time setup required
- Access http://soc.acdev.host:9000

**Elasticsearch**:
- No authentication (LAN/VPN access only)
- URL: http://soc.acdev.host:9200

---

## 🔧 Technical Details

### Server Configuration

- **Location**: `/var/www/soc/` on VMI03
- **Web Server**: nginx/1.24.0
- **SSL Certificate**: LetsEncrypt (acdev.host)
- **HTTP/2**: Enabled on HTTPS

### Nginx Configuration

File: `/etc/nginx/sites-available/soc-final.conf`
- HTTP Server: Port 9080
- HTTPS Server: Port 9443
- PHP Support: Enabled (php8.3-fpm)
- API Endpoint: `/api`

### Port Information

**Why ports 9080/9443?**

The SOC infrastructure uses non-standard ports to avoid conflicts:
- Port 80/443: Reserved for other services
- Port 9080/9443: SOC Dashboard
- Port 8080: CrowdSec
- Port 8443: Keycloak

---

## 🚀 Next Steps

### For Immediate Access

1. Open your browser
2. Navigate to: **https://soc.acdev.host:9443/**
3. Accept the SSL certificate warning (if prompted)
4. Click on any component to access it directly

### For Enhanced Security (Keycloak SSO)

See **SOC_KEYCLOAK_SSO_GUIDE.md** for instructions on:
- Creating Keycloak users
- Configuring Grafana SSO
- Configuring TheHive SSO
- Setting up Prometheus with oauth2-proxy

#### Automated SSO Setup

Run the automated deployment script:
```bash
ssh root@154.26.158.31
/tmp/deploy-keycloak-sso-complete.sh
```

This will:
- Create Keycloak clients (grafana, thehive, prometheus)
- Create users: `acampkin` and `AIService`
- Configure OAuth2 for all components
- Set up oauth2-proxy for Prometheus

---

## 🛠️ Troubleshooting

### Dashboard Not Loading

1. **Check nginx status**:
   ```bash
   systemctl status nginx
   ```

2. **Verify ports are listening**:
   ```bash
   ss -tlnp | grep -E ":(9080|9443)"
   ```

3. **Check nginx logs**:
   ```bash
   tail -f /var/log/nginx/error.log
   ```

### SSL Certificate Warnings

The current SSL certificate is for `acdev.host` from LetsEncrypt. This is valid and secure.

If you see warnings:
- This is normal for self-signed certificates
- Click "Advanced" → "Proceed to site"
- Or add the certificate to your browser's trusted certificates

### Cannot Access from External Network

The SOC Dashboard is accessible on the public internet at 154.26.158.31:9080/9443.

If you cannot access:
1. Check UFW firewall rules
2. Verify ports 9080 and 9443 are allowed
3. Check if your network blocks these ports

---

## 📝 Related Documentation

- **SOC_CREDENTIALS.md** - All SOC component credentials
- **SOC_KEYCLOAK_SSO_GUIDE.md** - Complete Keycloak SSO setup
- **SOC_DASHBOARDS_GUIDE.md** - Dashboard authentication methods
- **deployment/soc/deploy-keycloak-sso-complete.sh** - Automated SSO setup script

---

## ✅ Summary

**The dashboard is live and working!**

- ✅ Dashboard deployed to /var/www/soc/
- ✅ Nginx configured and running
- ✅ SSL certificate installed
- ✅ All ports tested and working
- ✅ Dashboard accessible at https://soc.acdev.host:9443/

**You tried**: https://soc.acdev.host/admin (port 443)
**You should use**: https://soc.acdev.host:9443/admin (port 9443)

---

**Need Help?** See SOC_CREDENTIALS.md for all access information.
