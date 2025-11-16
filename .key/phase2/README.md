# Phase 2: VMI03 Security Gateway - Complete Configuration

## Overview

This directory contains production-ready configuration files and deployment scripts for VMI03 Security Gateway (154.26.158.31). The gateway provides secure VPN access, identity management, DNS filtering, and intrusion detection for the ACDev infrastructure.

---

## Architecture

```
VMI03 Security Gateway (154.26.158.31)
├── WireGuard VPN (3 Tunnels)
│   ├── Root Tunnel (51820) - Admin access, split tunnel
│   ├── MCP Tunnel (51821) - MCP agents, split tunnel
│   └── Red Tunnel (51822) - Guests, full tunnel + security
│
├── Keycloak Identity Management (8080)
│   ├── OAuth2/OIDC provider
│   ├── User/group management
│   ├── Service accounts
│   └── MFA enforcement
│
├── PiHole DNS Filtering (53)
│   ├── Ad/malware blocking
│   ├── Custom DNS entries
│   └── DNSSEC validation
│
├── Suricata IDS/IPS
│   ├── Network monitoring
│   ├── Threat detection
│   └── Alert forwarding
│
└── Postfix Mail Server (25)
    ├── System alerts
    └── Notification delivery
```

---

## Quick Start

### Prerequisites

- Root access to VMI03 (154.26.158.31)
- PostgreSQL database on VMI01 (46.250.243.123) accessible from VMI03
- SSH key-based authentication configured
- Minimum 2GB RAM, 20GB disk space

### One-Command Deployment

```bash
# SCP this entire directory to VMI03
scp -r phase2 root@154.26.158.31:/opt/

# SSH to VMI03 and run master deployment script
ssh root@154.26.158.31
cd /opt/phase2
chmod +x deploy-phase2.sh
bash deploy-phase2.sh
```

The deployment script will:

1. Update system packages
2. Deploy WireGuard (3 tunnels)
3. Deploy Keycloak
4. Deploy PiHole + Suricata
5. Deploy Postfix
6. Configure firewall
7. Generate deployment summary

### Expected Duration

- Total deployment time: ~15-20 minutes
- WireGuard: 3-5 minutes
- Keycloak: 5-7 minutes (includes database setup)
- PiHole + Suricata: 5-7 minutes
- Postfix: 2-3 minutes

---

## Directory Structure

```
phase2/
├── deploy-phase2.sh              # Master deployment script
├── README.md                     # This file
├── TROUBLESHOOTING.md           # Complete troubleshooting guide
├── SECURITY.md                  # Security considerations
│
├── wireguard/                   # WireGuard VPN configuration
│   ├── server-configs/
│   │   ├── wg-root.conf        # Root tunnel server config
│   │   ├── wg-mcp.conf         # MCP tunnel server config
│   │   └── wg-red.conf         # Red tunnel server config
│   ├── client-configs/
│   │   ├── root-tunnel-macbook.conf    # MacBook client
│   │   ├── root-tunnel-mobile.conf     # Mobile client
│   │   ├── mcp-tunnel-agent.conf       # MCP agent client
│   │   └── red-tunnel-guest.conf       # Guest client
│   ├── systemd/
│   │   └── wg-quick@.service   # Systemd service template
│   └── deploy-wireguard.sh     # WireGuard deployment script
│
├── keycloak/                    # Keycloak identity management
│   ├── docker-compose.yml      # Docker Compose configuration
│   ├── realm-config.json       # Realm import configuration
│   ├── init-keycloak.sh        # Keycloak deployment script
│   ├── .env.example            # Environment variables template
│   └── KEYCLOAK_GUIDE.md       # Comprehensive admin guide
│
├── pihole/                      # PiHole DNS + Suricata IDS/IPS
│   ├── docker-compose.yml      # Docker Compose configuration
│   ├── custom-dns.list         # Custom DNS entries
│   ├── suricata/
│   │   └── suricata.yaml       # Suricata configuration
│   ├── deploy-pihole.sh        # PiHole deployment script
│   └── dpi-ssl-setup.sh        # Optional DPI-SSL setup
│
└── postfix/                     # Postfix mail server
    ├── main.cf                  # Postfix configuration
    ├── install-postfix.sh       # Postfix deployment script
    └── test-mail.sh             # Mail delivery test script
```

---

## Component Details

### 1. WireGuard VPN

**Three isolated tunnels for different security levels:**

#### Root Tunnel (10.100.0.0/24, Port 51820)

- **Purpose**: Full administrative access to all VMs
- **Network**: Split tunnel (only admin endpoints routed)
- **Clients**: MacBook, mobile devices
- **Features**: SSH, VNC, RSync, PostgreSQL, Redis, Grafana
- **Security**: High (MFA required, pre-authorized devices)

#### MCP Tunnel (10.101.0.0/24, Port 51821)

- **Purpose**: MCP agent communication
- **Network**: Split tunnel (VMI01 + Perplexity API only)
- **Clients**: MCP agents, developer machines
- **Features**: MCP protocol, database access, Keycloak OAuth
- **Security**: High (service accounts only)

#### Red Tunnel (10.102.0.0/24, Port 51822)

- **Purpose**: Guest VPN with enhanced security
- **Network**: Full tunnel (all traffic through VPN)
- **Clients**: Guest devices
- **Features**: PiHole DNS, Suricata IDS/IPS, no LAN access
- **Security**: Maximum (full monitoring, traffic filtering)

**Deployment**:

```bash
cd /opt/phase2/wireguard
bash deploy-wireguard.sh
```

**Client Setup**:

```bash
# Client configs generated in: /etc/wireguard/clients/
# QR codes for mobile: /etc/wireguard/clients/*-qr.png

# Download configs securely
scp root@154.26.158.31:/etc/wireguard/clients/root-macbook.conf .

# Import to WireGuard client
# macOS: WireGuard app → Import from file
# Mobile: Scan QR code
```

### 2. Keycloak Identity Management

**Centralized authentication and authorization:**

- **URL**: http://154.26.158.31:8080 (or http://10.100.0.1:8080 via VPN)
- **Realm**: acdev-infrastructure
- **Admin User**: alex.campkin (MFA required)
- **Database**: PostgreSQL on VMI01

**Features**:

- OAuth2/OIDC provider
- User/group management
- Service accounts (dev-admin, data-admin, sec-admin)
- MFA enforcement (TOTP)
- Pre-configured clients (WireGuard, MCP, NextCloud, Plex)

**Deployment**:

```bash
cd /opt/phase2/keycloak
cp .env.example .env
# Edit .env with passwords
bash init-keycloak.sh
```

**Access**:

```bash
# Get admin password
cat /opt/keycloak/.env | grep KEYCLOAK_ADMIN_PASSWORD

# Access admin console
# Via Root VPN: http://10.100.0.1:8080/admin
# Direct: http://154.26.158.31:8080/admin
```

**Documentation**: See [KEYCLOAK_GUIDE.md](keycloak/KEYCLOAK_GUIDE.md)

### 3. PiHole DNS + Suricata IDS/IPS

**DNS filtering and network security:**

- **DNS**: 10.102.0.1 (Red Tunnel clients)
- **Web UI**: http://10.102.0.1/admin (Root Tunnel only)
- **Upstream DNS**: Cloudflare DoH (1.1.1.1), Quad9 (9.9.9.9)

**Features**:

- Ad/malware/phishing blocking
- Custom DNS entries for acdev.host
- DNSSEC validation
- Query logging (7 days)
- Suricata IDS/IPS monitoring
- Alert forwarding to VMI01

**Blocklists**:

- Steven Black unified hosts
- Malware Domains
- Disconnect.me tracking/ads
- Phishing Army blocklist

**Deployment**:

```bash
cd /opt/phase2/pihole
bash deploy-pihole.sh
```

**Access**:

```bash
# Get web password
cat /opt/pihole/.env | grep PIHOLE_WEB_PASSWORD

# Access web UI (via Root VPN)
# http://10.102.0.1/admin
```

**Optional DPI-SSL**:

```bash
# For advanced threat detection
bash dpi-ssl-setup.sh
# WARNING: Causes certificate warnings
```

### 4. Postfix Mail Server

**System alerts and notifications:**

- **Hostname**: vmi03.acdev.host
- **Forward To**: acampkinpersonnal@gmail.com
- **Config**: /etc/postfix/main.cf

**Features**:

- Local mail delivery
- External mail relay
- Alert formatting
- Log forwarding

**Deployment**:

```bash
cd /opt/phase2/postfix
bash install-postfix.sh
```

**Testing**:

```bash
bash test-mail.sh
# Sends 3 test emails to verify delivery
```

---

## Post-Deployment Steps

### 1. Download Client Configurations

```bash
# From your local machine
scp -r root@154.26.158.31:/etc/wireguard/clients/ ./wireguard-clients/

# Securely distribute to authorized users
# NEVER send private keys via unencrypted channels
```

### 2. Configure VPN Clients

**macOS/Linux**:

```bash
# Install WireGuard
brew install wireguard-tools  # macOS
apt-get install wireguard     # Linux

# Import configuration
wg-quick up root-tunnel-macbook

# Or use WireGuard GUI app
```

**iOS/Android**:

```
1. Install WireGuard app from App Store/Play Store
2. Scan QR code from: /etc/wireguard/clients/*-qr.png
3. Activate tunnel
```

### 3. Keycloak Initial Configuration

```bash
# 1. Connect to Root VPN
# 2. Access: http://10.100.0.1:8080/admin
# 3. Login with alex.campkin
# 4. Configure TOTP (scan with authenticator app)
# 5. Change admin password
# 6. Review realm settings
# 7. Configure SMTP (optional)
```

### 4. Verify Services

```bash
# SSH to VMI03
ssh root@154.26.158.31

# Check WireGuard
wg show
systemctl status wg-quick@wg-root
systemctl status wg-quick@wg-mcp
systemctl status wg-quick@wg-red

# Check Keycloak
docker ps | grep keycloak
curl http://localhost:8080

# Check PiHole
docker ps | grep pihole
dig @10.102.0.1 example.com

# Check Suricata
systemctl status suricata
tail -f /var/log/suricata/fast.log

# Check Postfix
systemctl status postfix
mailq
```

### 5. Test Connectivity

```bash
# From client connected to Root VPN:
ping 10.100.0.1
ssh root@46.250.243.123  # VMI01
ssh root@46.250.241.70   # VMI02D

# From client connected to Red VPN:
ping 10.102.0.1
dig @10.102.0.1 example.com
# Try to access 192.168.x.x (should fail - LAN blocked)
```

---

## Maintenance

### Daily Tasks

```bash
# Review Suricata alerts
tail -f /var/log/suricata/fast.log

# Check failed authentication
docker logs keycloak | grep "Failed"
journalctl -u sshd | grep "Failed"

# Monitor disk space
df -h
docker system df
```

### Weekly Tasks

```bash
# Update PiHole gravity
docker exec pihole pihole -g

# Review DNS queries
# Access: http://10.102.0.1/admin

# Check for updates
apt-get update
apt-get list --upgradable
```

### Monthly Tasks

```bash
# Rotate service account passwords
# See: /opt/keycloak/service-accounts.txt

# Update Suricata rules
suricata-update

# Review user access
# Keycloak admin console

# Test backups
# Verify backup in /backups/
```

### Quarterly Tasks

```bash
# Rotate WireGuard keys
# See: SECURITY.md

# Security audit
# Review firewall rules, user access, logs

# Update documentation
```

---

## Backup & Recovery

### Automated Backups

```bash
# Create backup script
cat > /usr/local/bin/backup-phase2.sh <<'EOF'
#!/bin/bash
BACKUP_DIR="/backups/phase2"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/vmi03-backup-$DATE.tar.gz"

mkdir -p $BACKUP_DIR

tar -czf $BACKUP_FILE \
    /etc/wireguard \
    /opt/keycloak \
    /opt/pihole/etc-pihole \
    /etc/suricata \
    /etc/postfix

# Transfer to VMI01
scp $BACKUP_FILE root@46.250.243.123:/backups/vmi03/

# Cleanup old backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
EOF

chmod +x /usr/local/bin/backup-phase2.sh

# Schedule daily backup
echo "0 2 * * * /usr/local/bin/backup-phase2.sh" | crontab -
```

### Manual Backup

```bash
# Create backup
cd /opt/phase2
tar -czf /root/phase2-backup-$(date +%Y%m%d).tar.gz \
    /etc/wireguard \
    /opt/keycloak \
    /opt/pihole \
    /etc/suricata \
    /etc/postfix

# Download backup
scp root@154.26.158.31:/root/phase2-backup-*.tar.gz .
```

### Restore

```bash
# Stop services
systemctl stop wg-quick@wg-*
systemctl stop suricata
systemctl stop postfix
docker-compose -f /opt/keycloak/docker-compose.yml down
docker-compose -f /opt/pihole/docker-compose.yml down

# Restore from backup
tar -xzf phase2-backup-YYYYMMDD.tar.gz -C /

# Restart services
cd /opt/phase2
bash deploy-phase2.sh
```

---

## Troubleshooting

For comprehensive troubleshooting information, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

**Common Issues**:

| Issue                   | Quick Fix                                                  |
| ----------------------- | ---------------------------------------------------------- |
| WireGuard won't start   | `systemctl restart wg-quick@wg-root`                       |
| Can't connect to VPN    | Check firewall: `ufw allow 51820/udp`                      |
| Keycloak not accessible | Verify Docker: `docker ps \| grep keycloak`                |
| PiHole DNS not working  | Test: `dig @10.102.0.1 example.com`                        |
| Suricata not running    | Check config: `suricata -T -c /etc/suricata/suricata.yaml` |
| Mail not delivered      | Check queue: `mailq`, logs: `tail -f /var/log/mail.log`    |

**Get Help**:

```bash
# Collect logs for support
journalctl -u wg-quick@wg-root -n 100 > wg-root.log
docker logs keycloak --tail 100 > keycloak.log
docker logs pihole --tail 100 > pihole.log
tail -100 /var/log/suricata/fast.log > suricata.log
tail -100 /var/log/mail.log > postfix.log

# Send logs to: acampkinpersonnal@gmail.com
```

---

## Security

For detailed security considerations, see [SECURITY.md](SECURITY.md).

**Key Security Features**:

- WireGuard encryption (ChaCha20-Poly1305)
- Keycloak MFA (TOTP)
- PiHole malware/phishing blocking
- Suricata IDS/IPS monitoring
- Network segmentation (3 isolated tunnels)
- Firewall hardening (UFW + iptables)
- Log centralization to VMI01
- Automated backups

**Best Practices**:

1. Change all default passwords immediately
2. Enable MFA for all admin accounts
3. Rotate keys/passwords regularly
4. Review logs daily
5. Keep systems updated
6. Test backups monthly

---

## Monitoring

### Service Health

```bash
# All-in-one status check
cat > /usr/local/bin/vmi03-status.sh <<'EOF'
#!/bin/bash
echo "=== VMI03 Security Gateway Status ==="
echo
echo "WireGuard Tunnels:"
systemctl is-active wg-quick@wg-root && echo "  Root: ACTIVE" || echo "  Root: INACTIVE"
systemctl is-active wg-quick@wg-mcp && echo "  MCP: ACTIVE" || echo "  MCP: INACTIVE"
systemctl is-active wg-quick@wg-red && echo "  Red: ACTIVE" || echo "  Red: INACTIVE"
echo
echo "Keycloak:"
docker ps --filter name=keycloak --format "  Status: {{.Status}}" || echo "  NOT RUNNING"
echo
echo "PiHole:"
docker ps --filter name=pihole --format "  Status: {{.Status}}" || echo "  NOT RUNNING"
echo
echo "Suricata:"
systemctl is-active suricata && echo "  Status: ACTIVE" || echo "  Status: INACTIVE"
echo
echo "Postfix:"
systemctl is-active postfix && echo "  Status: ACTIVE" || echo "  Status: INACTIVE"
echo
echo "Disk Usage:"
df -h / | tail -1 | awk '{print "  " $1 ": " $5 " used (" $3 "/" $2 ")"}'
echo
echo "Memory Usage:"
free -h | grep Mem | awk '{print "  " $3 "/" $2 " used (" int($3/$2*100) "%)"}'
EOF

chmod +x /usr/local/bin/vmi03-status.sh

# Run status check
/usr/local/bin/vmi03-status.sh
```

### Alerting

```bash
# Email on critical events
cat > /etc/cron.hourly/check-services <<'EOF'
#!/bin/bash
FAILURES=""

# Check services
for service in wg-quick@wg-root wg-quick@wg-mcp wg-quick@wg-red suricata postfix; do
    if ! systemctl is-active --quiet $service; then
        FAILURES="$FAILURES\n- $service is DOWN"
    fi
done

# Check Docker containers
for container in keycloak pihole; do
    if ! docker ps | grep -q $container; then
        FAILURES="$FAILURES\n- $container container is NOT RUNNING"
    fi
done

# Send alert if failures
if [ -n "$FAILURES" ]; then
    echo -e "Service Failures Detected:\n$FAILURES" | mail -s "[ALERT] VMI03 Service Failures" root
fi
EOF

chmod +x /etc/cron.hourly/check-services
```

---

## Upgrading

### Update System Packages

```bash
apt-get update
apt-get upgrade
apt-get dist-upgrade
reboot
```

### Update Keycloak

```bash
cd /opt/keycloak

# Backup database first
ssh root@46.250.243.123 "su - postgres -c 'pg_dump keycloak > /backups/keycloak-pre-upgrade.sql'"

# Update image version in docker-compose.yml
vim docker-compose.yml
# Change: image: quay.io/keycloak/keycloak:26.1.1
# To: image: quay.io/keycloak/keycloak:NEW_VERSION

# Pull new image
docker-compose pull

# Restart with new version
docker-compose down
docker-compose up -d

# Verify
docker logs -f keycloak
```

### Update PiHole

```bash
# Update container
docker exec pihole pihole -up

# Or pull latest image
cd /opt/pihole
docker-compose pull
docker-compose down
docker-compose up -d
```

### Update Suricata Rules

```bash
suricata-update
systemctl restart suricata
```

---

## Additional Resources

- [WireGuard Documentation](https://www.wireguard.com/)
- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [PiHole Documentation](https://docs.pi-hole.net/)
- [Suricata Documentation](https://suricata.readthedocs.io/)
- [Postfix Documentation](http://www.postfix.org/documentation.html)

---

## Support

**Contact**: Alex Campkin
**Email**: acampkinpersonnal@gmail.com

**Issue Reporting**:

1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Review service logs
3. Collect logs using collection script
4. Email logs with description of issue

---

## License

Internal use only - ACDev Infrastructure

---

**Document Version**: 1.0
**Last Updated**: 2025-01-06
**Deployment Target**: VMI03 (154.26.158.31)
