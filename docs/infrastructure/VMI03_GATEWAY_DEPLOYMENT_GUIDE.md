# VMI03 Gateway Deployment Guide

## Overview

This guide provides complete instructions for deploying production-ready Keycloak and HAProxy services on VMI03 (154.26.158.31), establishing it as the security and load balancing gateway for the MCP ecosystem.

**Generated:** November 8, 2025
**Target Server:** VMI03 (154.26.158.31)
**Architecture Role:** Gateway - Security, SSO, Load Balancing

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Pre-Deployment Checklist](#pre-deployment-checklist)
3. [Deployment Sequence](#deployment-sequence)
4. [Keycloak Deployment](#keycloak-deployment)
5. [HAProxy Deployment](#haproxy-deployment)
6. [Post-Deployment Configuration](#post-deployment-configuration)
7. [Security Hardening](#security-hardening)
8. [Monitoring and Maintenance](#monitoring-and-maintenance)
9. [Troubleshooting](#troubleshooting)
10. [Rollback Procedures](#rollback-procedures)

---

## Architecture Overview

### VMI03 Gateway Services

```
VMI03 (154.26.158.31) - Security Gateway
├── HAProxy (Load Balancer)
│   ├── Port 80  → HTTPS redirect
│   ├── Port 443 → SSL termination & routing
│   └── Port 8404 → Stats interface
│
├── Keycloak (SSO/Authentication)
│   ├── Port 8080  → HTTP (internal)
│   └── Port 8443  → HTTPS (external)
│
├── Grafana (Local Monitoring)
│   └── Port 3000 → Metrics dashboard
│
└── WireGuard VPN (10.0.52.0/24)
    └── Secure mesh to VMI01/VMI02D
```

### Traffic Flow

```
Internet → HAProxy :443 (SSL termination)
                    ↓
        ┌──────────────────────┐
        │   Route by SNI/Path  │
        └──────────────────────┘
                    ↓
    ┌───────────────┴───────────────┐
    ↓                               ↓
Backend Services              Local Services
VMI01:3000-3002              VMI03:8080 (Keycloak)
VMI02D:443,32400             VMI03:3000 (Grafana)
```

---

## Pre-Deployment Checklist

### System Requirements

- [ ] **Server Access:** SSH access to VMI03 as root
- [ ] **System Resources:**
  - Minimum 4GB RAM (8GB recommended)
  - 20GB free disk space
  - 2+ CPU cores
- [ ] **Network:**
  - Ports 80, 443, 8080, 8443, 8404 available
  - Connectivity to VMI01 (46.250.243.123)
  - Connectivity to VMI02D (46.250.241.70)
  - WireGuard VPN configured (10.0.52.1)

### Dependencies

- [ ] Ubuntu 20.04+ or Debian 11+
- [ ] PostgreSQL accessible (local or VMI01)
- [ ] DNS records configured (if using Let's Encrypt)
- [ ] Firewall rules prepared (UFW recommended)

### Pre-Deployment Backup

```bash
# Backup existing configurations if present
mkdir -p /root/vmi03-backup-$(date +%Y%m%d)

# Backup Docker Keycloak (if exists)
[ -d /opt/keycloak ] && cp -r /opt/keycloak /root/vmi03-backup-$(date +%Y%m%d)/

# Backup HAProxy (if exists)
[ -f /etc/haproxy/haproxy.cfg ] && cp /etc/haproxy/haproxy.cfg /root/vmi03-backup-$(date +%Y%m%d)/

# Backup firewall rules
ufw status numbered > /root/vmi03-backup-$(date +%Y%m%d)/ufw-rules.txt
```

---

## Deployment Sequence

### Recommended Order

1. **Deploy Keycloak** (Foundation for authentication)
2. **Configure Keycloak Realms** (Set up SSO)
3. **Deploy HAProxy** (Gateway and routing)
4. **Configure DNS** (Point domains to VMI03)
5. **Security Hardening** (Firewall, rate limits)
6. **Integration Testing** (Verify all services)

**Estimated Total Time:** 60-90 minutes

---

## Keycloak Deployment

### Script Location

```bash
/Users/alex/Projects/MCP Bundle/deployment/keycloak/deploy-native-keycloak.sh
```

### Deployment Options

#### Option 1: Using VMI01 PostgreSQL (Recommended)

```bash
# Copy script to VMI03
scp deployment/keycloak/deploy-native-keycloak.sh root@154.26.158.31:/root/

# SSH to VMI03
ssh root@154.26.158.31

# Run deployment (will connect to VMI01 PostgreSQL)
cd /root
chmod +x deploy-native-keycloak.sh
./deploy-native-keycloak.sh
```

#### Option 2: Using Local PostgreSQL

```bash
# Set environment variable for local database
export USE_LOCAL_DB=true

# Run deployment
./deploy-native-keycloak.sh
```

#### Option 3: With Let's Encrypt SSL

```bash
# Configure for Let's Encrypt
export USE_LETSENCRYPT=true
export DOMAIN_NAME="keycloak.yourdomain.com"

# Run deployment
./deploy-native-keycloak.sh
```

### What the Script Does

1. **Pre-flight Checks**
   - Validates system resources
   - Checks database connectivity
   - Verifies port availability

2. **Docker Migration** (if applicable)
   - Detects existing Docker Keycloak
   - Exports realm configurations
   - Backs up Docker setup
   - Stops Docker containers

3. **Installation**
   - Installs OpenJDK 17
   - Downloads Keycloak 23.x
   - Creates system user and directories
   - Extracts and configures Keycloak

4. **SSL Configuration**
   - Generates self-signed certificate (default)
   - OR obtains Let's Encrypt certificate
   - Configures PKCS12 keystore
   - Sets up DH parameters

5. **Database Setup**
   - Creates `keycloak` database
   - Creates `keycloak` user
   - Configures connection pooling
   - Tests connectivity

6. **Keycloak Configuration**
   - Creates `keycloak.conf`
   - Configures database connection
   - Sets up logging and metrics
   - Enables features (token exchange, etc.)

7. **Systemd Service**
   - Creates `keycloak.service`
   - Sets resource limits
   - Configures auto-restart
   - Enables on boot

8. **Realm Configuration**
   - Creates `mcp-agents` realm
   - Configures clients:
     - `server-mcp-agent`
     - `nextcloud-sso`
     - `web-hosting-platform`
     - `vpn-invite-system`
     - `grafana-sso`
   - Generates client secrets

9. **Health Monitoring**
   - Creates health check script
   - Sets up cron monitoring
   - Configures logging

### Post-Deployment Verification

```bash
# Check service status
systemctl status keycloak

# Check health endpoint
curl -k https://localhost:8443/health/ready

# View logs
journalctl -u keycloak -f

# Access admin console
# URL: https://154.26.158.31:8443
# Credentials in: /opt/keycloak/credentials.txt
```

### Keycloak Credentials

Location: `/opt/keycloak/credentials.txt`

```bash
# View credentials
cat /opt/keycloak/credentials.txt

# Also symlinked to
cat /root/keycloak-credentials.txt
```

---

## HAProxy Deployment

### Script Location

```bash
/Users/alex/Projects/MCP Bundle/deployment/ha/deploy-haproxy.sh
```

### Deployment Options

#### Option 1: Basic Deployment (Self-Signed SSL)

```bash
# Copy script to VMI03
scp deployment/ha/deploy-haproxy.sh root@154.26.158.31:/root/

# SSH to VMI03
ssh root@154.26.158.31

# Run deployment
cd /root
chmod +x deploy-haproxy.sh
./deploy-haproxy.sh
```

#### Option 2: With Let's Encrypt

```bash
# Configure domains
export USE_LETSENCRYPT=true
export DOMAIN_NAME="mcp.yourdomain.com"
export SSL_DOMAINS="keycloak.yourdomain.com,grafana.yourdomain.com,nextcloud.yourdomain.com"

# Run deployment
./deploy-haproxy.sh
```

#### Option 3: Custom Rate Limits

```bash
# Adjust rate limits
export RATE_LIMIT_CONNECTIONS=2000
export RATE_LIMIT_REQUESTS=200

# Run deployment
./deploy-haproxy.sh
```

### What the Script Does

1. **Pre-flight Checks**
   - Validates system resources
   - Checks port availability
   - Tests backend connectivity

2. **HAProxy Installation**
   - Adds HAProxy 2.8+ PPA
   - Installs HAProxy
   - Installs dependencies (certbot, ssl-cert, etc.)

3. **SSL Configuration**
   - Generates self-signed certificate (default)
   - OR obtains Let's Encrypt certificates
   - Creates PKCS12 keystores
   - Generates DH parameters (2048-bit)

4. **Error Pages**
   - Creates custom 502, 503 error pages
   - Professional HTML templates
   - Consistent branding

5. **HAProxy Configuration**
   - HTTP to HTTPS redirect
   - SSL termination
   - SNI-based routing
   - Path-based routing
   - Backend health checks
   - Connection pooling
   - Rate limiting

6. **Backend Configuration**
   - MCP Orchestrator (VMI01:3000)
   - Perplexity MCP (VMI01:3001)
   - IT-MCP (VMI01:3002)
   - Keycloak (VMI03:8080)
   - Grafana (VMI03:3000)
   - NextCloud (VMI02D:443)
   - Plex (VMI02D:32400)

7. **Security Features**
   - TLS 1.2+ only (TLS 1.3 preferred)
   - Strong cipher suites
   - HSTS headers
   - CSP headers
   - X-Frame-Options
   - IP-based rate limiting

8. **SSL Management**
   - Creates renewal script
   - Sets up weekly cron job
   - Auto-reload on renewal

9. **Health Monitoring**
   - Creates health check script
   - 5-minute cron monitoring
   - Auto-restart on failure

10. **Firewall Configuration**
    - UFW rules for ports 80, 443, 8404
    - Enables firewall

### Post-Deployment Verification

```bash
# Check service status
systemctl status haproxy

# Validate configuration
haproxy -c -f /etc/haproxy/haproxy.cfg

# View logs
journalctl -u haproxy -f

# Test HTTPS
curl -k https://localhost:443

# Access stats page
# URL: https://154.26.158.31:8404/stats
# Credentials in: /root/haproxy-configuration.txt
```

### HAProxy Configuration

Location: `/root/haproxy-configuration.txt`

```bash
# View configuration
cat /root/haproxy-configuration.txt

# View stats password
grep "Password:" /root/haproxy-configuration.txt
```

---

## Post-Deployment Configuration

### DNS Configuration

Configure these DNS records to point to VMI03:

```dns
# A Records (point to 154.26.158.31)
mcp.yourdomain.com              IN A    154.26.158.31
keycloak.yourdomain.com         IN A    154.26.158.31
grafana.yourdomain.com          IN A    154.26.158.31
nextcloud.yourdomain.com        IN A    154.26.158.31
cloud.yourdomain.com            IN A    154.26.158.31
plex.yourdomain.com             IN A    154.26.158.31

# Optional: Wildcard
*.mcp.yourdomain.com            IN A    154.26.158.31
```

### Application Integration

#### 1. Configure NextCloud SSO

```bash
# In NextCloud (VMI02D), install OIDC plugin
# Configure:
#   - Provider URL: https://keycloak.yourdomain.com:8443/realms/mcp-agents
#   - Client ID: nextcloud-sso
#   - Client Secret: (from /opt/keycloak/conf/client-secrets.txt)
```

#### 2. Configure Grafana SSO

```bash
# Edit Grafana config (/etc/grafana/grafana.ini)
[auth.generic_oauth]
enabled = true
name = Keycloak
allow_sign_up = true
client_id = grafana-sso
client_secret = <from client-secrets.txt>
scopes = openid email profile
auth_url = https://keycloak.yourdomain.com:8443/realms/mcp-agents/protocol/openid-connect/auth
token_url = https://keycloak.yourdomain.com:8443/realms/mcp-agents/protocol/openid-connect/token
api_url = https://keycloak.yourdomain.com:8443/realms/mcp-agents/protocol/openid-connect/userinfo

# Restart Grafana
systemctl restart grafana-server
```

#### 3. Configure MCP Services

Update MCP service configurations to use HAProxy endpoints:

```bash
# Instead of direct VMI01 access:
# OLD: http://46.250.243.123:3000
# NEW: https://mcp.yourdomain.com/api/orchestrator

# Update environment variables
MCP_ORCHESTRATOR_URL=https://mcp.yourdomain.com/api/orchestrator
PERPLEXITY_MCP_URL=https://mcp.yourdomain.com/api/perplexity
IT_MCP_URL=https://mcp.yourdomain.com/api/itmcp
```

---

## Security Hardening

### Firewall Rules (UFW)

```bash
# Allow SSH (if not already)
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow HAProxy stats (restrict to admin IPs)
ufw allow from 203.0.113.0/24 to any port 8404 proto tcp

# Allow Keycloak admin (restrict to admin IPs)
ufw allow from 203.0.113.0/24 to any port 8443 proto tcp

# Deny all other incoming
ufw default deny incoming
ufw default allow outgoing

# Enable firewall
ufw enable
```

### Fail2Ban Configuration

```bash
# Install Fail2Ban
apt-get install -y fail2ban

# Create HAProxy jail
cat > /etc/fail2ban/jail.d/haproxy.conf <<EOF
[haproxy]
enabled = true
port = http,https
filter = haproxy
logpath = /var/log/haproxy.log
maxretry = 10
findtime = 600
bantime = 3600
EOF

# Create Keycloak jail
cat > /etc/fail2ban/jail.d/keycloak.conf <<EOF
[keycloak]
enabled = true
port = 8080,8443
filter = keycloak
logpath = /var/lib/keycloak/log/keycloak.log
maxretry = 5
findtime = 600
bantime = 3600
EOF

# Restart Fail2Ban
systemctl restart fail2ban
```

### IP Whitelisting

```bash
# Edit HAProxy config to restrict admin access
# In /etc/haproxy/haproxy.cfg, add to stats frontend:

frontend stats_frontend
    bind *:8404 ssl crt /etc/haproxy/certs/default.pem

    # ACL for admin IPs
    acl admin_ip src 203.0.113.0/24 198.51.100.0/24

    # Deny non-admin IPs
    http-request deny unless admin_ip

    default_backend stats_backend

# Reload HAProxy
systemctl reload haproxy
```

---

## Monitoring and Maintenance

### Health Checks

```bash
# Manual health checks
/usr/local/bin/keycloak-health-check.sh
/usr/local/bin/haproxy-health-check.sh

# View health logs
tail -f /var/log/mcp/keycloak-health.log
tail -f /var/log/mcp/haproxy-health.log
```

### Service Monitoring

```bash
# Check all services
systemctl status keycloak haproxy grafana-server

# View logs in real-time
journalctl -u keycloak -u haproxy -f

# Check HAProxy stats
curl -u admin:password https://localhost:8404/stats
```

### SSL Certificate Renewal

```bash
# Manual renewal (Let's Encrypt)
/usr/local/bin/haproxy-ssl-renew.sh

# Test renewal (dry run)
certbot renew --dry-run

# Check certificate expiry
openssl x509 -in /etc/haproxy/certs/mcp.yourdomain.com.pem -noout -dates
```

### Backup Procedures

```bash
# Create backup script
cat > /usr/local/bin/vmi03-backup.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/root/backups/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# Backup Keycloak
systemctl stop keycloak
tar -czf "$BACKUP_DIR/keycloak-data.tar.gz" /var/lib/keycloak/
cp /opt/keycloak/conf/keycloak.conf "$BACKUP_DIR/"
cp /opt/keycloak/credentials.txt "$BACKUP_DIR/"
systemctl start keycloak

# Backup HAProxy
cp /etc/haproxy/haproxy.cfg "$BACKUP_DIR/"
cp -r /etc/haproxy/certs "$BACKUP_DIR/"

# Backup database (if local)
if systemctl is-active postgresql; then
    sudo -u postgres pg_dump keycloak > "$BACKUP_DIR/keycloak-db.sql"
fi

echo "Backup completed: $BACKUP_DIR"
EOF

chmod +x /usr/local/bin/vmi03-backup.sh

# Schedule daily backups
echo "0 2 * * * root /usr/local/bin/vmi03-backup.sh >> /var/log/mcp/backups.log 2>&1" > /etc/cron.d/vmi03-backup
```

### Performance Monitoring

```bash
# HAProxy stats API
echo "show stat" | socat stdio /run/haproxy/admin.sock

# Backend server health
echo "show servers state" | socat stdio /run/haproxy/admin.sock

# Connection stats
echo "show info" | socat stdio /run/haproxy/admin.sock | grep Conn

# Keycloak metrics
curl -k https://localhost:8443/metrics
```

---

## Troubleshooting

### Keycloak Issues

#### Service Won't Start

```bash
# Check logs
journalctl -u keycloak -n 100 --no-pager

# Common issues:
# 1. Database connectivity
PGPASSWORD=<password> psql -h <db_host> -U keycloak -d keycloak -c "SELECT 1;"

# 2. Port conflicts
netstat -tuln | grep 8080

# 3. Java memory
# Edit /etc/systemd/system/keycloak.service
# Increase: JAVA_OPTS=-Xms1g -Xmx4g
systemctl daemon-reload
systemctl restart keycloak
```

#### Can't Access Admin Console

```bash
# Check if running
systemctl status keycloak

# Test locally
curl -k https://localhost:8443/health/ready

# Check firewall
ufw status | grep 8443

# Check credentials
cat /opt/keycloak/credentials.txt
```

#### Realm Import Failed

```bash
# Manual import
su - keycloak
cd /opt/keycloak
bin/kc.sh import --file /path/to/realm.json --override true

# Check for errors
tail -f /var/lib/keycloak/log/keycloak.log
```

### HAProxy Issues

#### Backend Servers Down

```bash
# Check backend status
echo "show servers state" | socat stdio /run/haproxy/admin.sock

# Test backend connectivity
curl -k https://46.250.243.123:3000/health

# Enable debug mode
# Edit /etc/haproxy/haproxy.cfg
global
    log 127.0.0.1 local0 debug

# Reload and check logs
systemctl reload haproxy
tail -f /var/log/haproxy.log
```

#### SSL Certificate Issues

```bash
# Check certificate validity
openssl x509 -in /etc/haproxy/certs/default.pem -noout -text

# Test SSL handshake
openssl s_client -connect localhost:443 -servername mcp.yourdomain.com

# Regenerate certificate
cd /etc/haproxy/certs
openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
    -keyout new.key -out new.crt \
    -subj "/CN=mcp.yourdomain.com"
cat new.crt new.key > default.pem
systemctl reload haproxy
```

#### High Load / Performance Issues

```bash
# Check connection stats
echo "show stat" | socat stdio /run/haproxy/admin.sock | column -t

# Increase connection limits
# Edit /etc/haproxy/haproxy.cfg
global
    maxconn 4000  # Increase from 1000

# Increase system limits
echo "net.ipv4.ip_local_port_range = 1024 65535" >> /etc/sysctl.conf
echo "net.core.somaxconn = 4096" >> /etc/sysctl.conf
sysctl -p

# Reload HAProxy
systemctl reload haproxy
```

---

## Rollback Procedures

### Rollback Keycloak

```bash
# Stop native Keycloak
systemctl stop keycloak
systemctl disable keycloak

# Restore Docker Keycloak
if [ -d /opt/keycloak.backup ]; then
    mv /opt/keycloak /opt/keycloak.native
    mv /opt/keycloak.backup /opt/keycloak
    cd /opt/keycloak
    docker compose up -d
fi

# Verify
docker ps | grep keycloak
```

### Rollback HAProxy

```bash
# Restore previous configuration
if [ -f /etc/haproxy/haproxy.cfg.backup.* ]; then
    LATEST_BACKUP=$(ls -t /etc/haproxy/haproxy.cfg.backup.* | head -1)
    cp "$LATEST_BACKUP" /etc/haproxy/haproxy.cfg
    systemctl reload haproxy
fi

# Verify
haproxy -c -f /etc/haproxy/haproxy.cfg
systemctl status haproxy
```

### Complete System Restore

```bash
# Restore from backup
RESTORE_DATE="20251108"  # Adjust to backup date
BACKUP_DIR="/root/vmi03-backup-$RESTORE_DATE"

# Stop services
systemctl stop keycloak haproxy

# Restore Keycloak
tar -xzf "$BACKUP_DIR/keycloak-data.tar.gz" -C /
cp "$BACKUP_DIR/keycloak.conf" /opt/keycloak/conf/

# Restore HAProxy
cp "$BACKUP_DIR/haproxy.cfg" /etc/haproxy/
cp -r "$BACKUP_DIR/certs" /etc/haproxy/

# Restore database (if local)
if [ -f "$BACKUP_DIR/keycloak-db.sql" ]; then
    sudo -u postgres psql -d keycloak < "$BACKUP_DIR/keycloak-db.sql"
fi

# Start services
systemctl start keycloak haproxy

# Verify
systemctl status keycloak haproxy
```

---

## Quick Reference

### Important Files

| Component            | File/Directory                         | Purpose                    |
| -------------------- | -------------------------------------- | -------------------------- |
| Keycloak Config      | `/opt/keycloak/conf/keycloak.conf`     | Main configuration         |
| Keycloak Data        | `/var/lib/keycloak/`                   | Runtime data and logs      |
| Keycloak Service     | `/etc/systemd/system/keycloak.service` | Systemd unit               |
| Keycloak Credentials | `/opt/keycloak/credentials.txt`        | Admin password and secrets |
| HAProxy Config       | `/etc/haproxy/haproxy.cfg`             | Main configuration         |
| HAProxy Certs        | `/etc/haproxy/certs/`                  | SSL certificates           |
| HAProxy Stats        | `/root/haproxy-configuration.txt`      | Stats password             |
| Health Checks        | `/usr/local/bin/*-health-check.sh`     | Monitoring scripts         |
| Logs                 | `/var/log/mcp/`                        | Centralized MCP logs       |

### Common Commands

```bash
# Keycloak
systemctl status keycloak
systemctl restart keycloak
journalctl -u keycloak -f
curl -k https://localhost:8443/health/ready

# HAProxy
systemctl status haproxy
systemctl reload haproxy  # Reload config without downtime
haproxy -c -f /etc/haproxy/haproxy.cfg  # Validate config
journalctl -u haproxy -f
echo "show stat" | socat stdio /run/haproxy/admin.sock

# Health Checks
/usr/local/bin/keycloak-health-check.sh
/usr/local/bin/haproxy-health-check.sh

# Backups
/usr/local/bin/vmi03-backup.sh
```

### Access URLs

| Service        | URL                                | Credentials                       |
| -------------- | ---------------------------------- | --------------------------------- |
| Keycloak Admin | `https://154.26.158.31:8443`       | `/opt/keycloak/credentials.txt`   |
| HAProxy Stats  | `https://154.26.158.31:8404/stats` | `/root/haproxy-configuration.txt` |
| Grafana        | `https://grafana.yourdomain.com`   | Existing Grafana creds            |
| NextCloud      | `https://nextcloud.yourdomain.com` | Existing NextCloud creds          |

---

## Support and Documentation

### Deployment Logs

```bash
# View deployment logs
ls -lh /var/log/mcp/*deployment*.log

# Latest Keycloak deployment
tail -f /var/log/mcp/keycloak-deployment-*.log | tail -1

# Latest HAProxy deployment
tail -f /var/log/mcp/haproxy-deployment-*.log | tail -1
```

### Official Documentation

- **Keycloak:** https://www.keycloak.org/documentation
- **HAProxy:** https://www.haproxy.org/documentation.html
- **Let's Encrypt:** https://letsencrypt.org/docs/

### MCP Ecosystem Documentation

- **Workflow Guide:** `release_dev/shared/docs/WORKFLOW_QUICKSTART.md`
- **Architecture:** `CLAUDE.md`
- **Deployment Guide:** `DEPLOYMENT_GUIDE_COMPLETE.md`

---

## Changelog

### Version 1.0 (November 8, 2025)

- Initial deployment guide
- Native Keycloak deployment script
- HAProxy deployment script
- Complete troubleshooting procedures
- Security hardening guidelines

---

**End of VMI03 Gateway Deployment Guide**
