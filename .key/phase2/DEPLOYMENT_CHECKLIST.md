# VMI03 Security Gateway - Deployment Checklist

## Pre-Deployment Checklist

### Server Prerequisites

- [ ] VMI03 accessible via SSH (154.26.158.31)
- [ ] Root access configured
- [ ] SSH key-based authentication working
- [ ] Minimum 2GB RAM, 20GB disk available
- [ ] Ubuntu 20.04+ or Debian 10+ installed
- [ ] Internet connectivity verified
- [ ] System up to date (`apt-get update && apt-get upgrade`)

### Network Prerequisites

- [ ] VMI01 PostgreSQL accessible on port 5432 from VMI03
- [ ] Firewall rules allow outbound connections
- [ ] DNS resolution working
- [ ] NTP time synchronization configured
- [ ] Ports 51820-51822 available for WireGuard

### Prepare Deployment Files

- [ ] Download/clone phase2 directory
- [ ] Review configuration files
- [ ] Customize as needed (optional)
- [ ] Transfer to VMI03: `scp -r phase2 root@154.26.158.31:/opt/`

---

## Deployment Steps

### Step 1: Transfer Files to VMI03

```bash
# From your local machine
cd /Users/alex/Projects/MCP\ Bundle/.key/
scp -r phase2 root@154.26.158.31:/opt/
```

**Verify**:

```bash
ssh root@154.26.158.31 "ls -la /opt/phase2"
```

- [ ] Files transferred successfully
- [ ] All scripts are executable (deploy-_.sh, _.sh)

---

### Step 2: Execute Master Deployment

```bash
# SSH to VMI03
ssh root@154.26.158.31

# Navigate to deployment directory
cd /opt/phase2

# Run deployment script
bash deploy-phase2.sh
```

**Expected output**:

```
================================================
   VMI03 Security Gateway Deployment
   Phase 2: Complete Infrastructure Setup
================================================
...
[INFO] Starting Phase 2 deployment...
[INFO] Step 0: Updating system packages...
[INFO] Step 1: Deploying WireGuard VPN tunnels...
[INFO] Step 2: Deploying Keycloak Identity Management...
[INFO] Step 3: Deploying PiHole DNS and Suricata IDS/IPS...
[INFO] Step 4: Deploying Postfix mail server...
[INFO] Step 5: Final system configuration...
...
================================================
  Phase 2 Deployment Complete!
================================================
```

**Deployment checklist**:

- [ ] System packages updated
- [ ] WireGuard tunnels created
- [ ] Keycloak container running
- [ ] PiHole container running
- [ ] Suricata service active
- [ ] Postfix service active
- [ ] Firewall configured
- [ ] No errors in deployment log

**Duration**: 15-20 minutes

---

### Step 3: Verify Services

```bash
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
ls -la /var/log/suricata/

# Check Postfix
systemctl status postfix
mailq
```

**Verification checklist**:

- [ ] All 3 WireGuard interfaces up (wg-root, wg-mcp, wg-red)
- [ ] Keycloak container running and healthy
- [ ] PiHole container running and resolving DNS
- [ ] Suricata service active and monitoring
- [ ] Postfix service active
- [ ] All systemd services enabled for auto-start

---

### Step 4: Download Client Configurations

```bash
# From your local machine
mkdir -p ~/wireguard-clients
scp -r root@154.26.158.31:/etc/wireguard/clients/* ~/wireguard-clients/

# Verify downloads
ls -la ~/wireguard-clients/
```

**Files to download**:

- [ ] root-tunnel-macbook.conf
- [ ] root-tunnel-mobile.conf
- [ ] root-tunnel-mobile-qr.png
- [ ] mcp-tunnel-agent.conf (if using MCP agents)
- [ ] red-tunnel-guest.conf
- [ ] red-tunnel-guest-qr.png

**SECURITY WARNING**:

- These files contain private keys
- Never send via unencrypted email
- Delete from server after secure distribution
- Store securely (password manager, encrypted storage)

---

## Post-Deployment Configuration

### Task 1: Configure VPN Clients

#### macOS/Linux Client

```bash
# Install WireGuard
# macOS: brew install wireguard-tools
# Linux: apt-get install wireguard

# Copy configuration
sudo cp root-tunnel-macbook.conf /etc/wireguard/wg-root.conf

# Start tunnel
sudo wg-quick up wg-root

# Verify connection
ping 10.100.0.1
ssh root@46.250.243.123
```

**Verification**:

- [ ] VPN tunnel connected
- [ ] Can ping 10.100.0.1
- [ ] Can SSH to VMI01 (46.250.243.123)
- [ ] Can SSH to VMI02D (46.250.241.70)
- [ ] Internet still works (split tunnel)

#### Mobile Client (iOS/Android)

```bash
# 1. Install WireGuard app from App Store/Play Store
# 2. Open app → Add Tunnel → Create from QR code
# 3. Scan root-tunnel-mobile-qr.png
# 4. Name: "Root Tunnel"
# 5. Activate tunnel
```

**Verification**:

- [ ] VPN tunnel connected
- [ ] Can access http://10.100.0.1:8080 (Keycloak)
- [ ] Internet still works

---

### Task 2: Initial Keycloak Configuration

**Connect via Root VPN first!**

```bash
# Get admin password
ssh root@154.26.158.31 "cat /opt/keycloak/.env | grep KEYCLOAK_ADMIN_PASSWORD"
```

**Steps**:

1. [ ] Connect to Root VPN tunnel
2. [ ] Navigate to http://10.100.0.1:8080/admin
3. [ ] Login as alex.campkin with password from .env
4. [ ] Configure TOTP (MFA):
   - Install authenticator app (Google Authenticator, Authy, 1Password)
   - Scan QR code
   - Enter verification code
   - Save backup codes securely
5. [ ] Change admin password to strong, unique password
6. [ ] Review realm settings (acdev-infrastructure)
7. [ ] Verify service accounts exist (dev-admin, data-admin, sec-admin)
8. [ ] Test OAuth2 client creation (optional)

**Service Account Passwords**:

```bash
ssh root@154.26.158.31 "cat /opt/keycloak/service-accounts.txt"
```

- [ ] Document service account passwords
- [ ] Store securely
- [ ] Plan to rotate within 30 days

---

### Task 3: Configure PiHole

**Connect via Root VPN first!**

```bash
# Get web password
ssh root@154.26.158.31 "cat /opt/pihole/.env | grep PIHOLE_WEB_PASSWORD"
```

**Steps**:

1. [ ] Connect to Root VPN tunnel
2. [ ] Navigate to http://10.102.0.1/admin
3. [ ] Login with password from .env
4. [ ] Review blocklists (Settings → Blocklists)
5. [ ] Add custom blocklists if desired
6. [ ] Update gravity (Tools → Update Gravity)
7. [ ] Review DNS settings
8. [ ] Test DNS resolution from Red tunnel client

**Custom blocklists** (optional):

- [ ] https://dbl.oisd.nl/ (comprehensive)
- [ ] https://raw.githubusercontent.com/hagezi/dns-blocklists/main/hosts/pro.txt (privacy)

---

### Task 4: Test Mail Delivery

```bash
# SSH to VMI03
ssh root@154.26.158.31

# Run mail test
cd /opt/phase2/postfix
bash test-mail.sh
```

**Verification**:

- [ ] Test script runs without errors
- [ ] Check email (acampkinpersonnal@gmail.com)
- [ ] Received test emails (may be in spam initially)
- [ ] Mail queue empty (`mailq`)

**If mail not received**:

- [ ] Check spam folder
- [ ] Review /var/log/mail.log for errors
- [ ] Consider configuring SMTP relay (see Postfix docs)

---

### Task 5: Monitor Suricata Alerts

```bash
# SSH to VMI03
ssh root@154.26.158.31

# Monitor alerts in real-time
tail -f /var/log/suricata/fast.log

# Generate test traffic (from Red tunnel client)
# Should trigger alerts
```

**Initial alerts**:

- [ ] Suricata generating alerts
- [ ] Alerts logged to /var/log/suricata/fast.log
- [ ] Alerts forwarded to VMI01 syslog (verify on VMI01)

---

## Security Hardening (Recommended)

### Change Default Passwords

- [ ] Keycloak admin password (already done in Task 2)
- [ ] Keycloak service account passwords
- [ ] PiHole web password
- [ ] Update any default passwords in configs

### Configure MFA

- [ ] Keycloak admin account (already done in Task 2)
- [ ] All infrastructure admin accounts
- [ ] Document MFA setup for all users

### Review Firewall Rules

```bash
# SSH to VMI03
ufw status verbose
iptables -L -n -v
```

- [ ] Only necessary ports open
- [ ] SSH rate limiting enabled
- [ ] VPN ports accessible
- [ ] Services restricted to VPN access

### Set Up Log Monitoring

```bash
# Configure log forwarding to VMI01
# Already configured, verify:
grep "46.250.243.123" /etc/rsyslog.conf
```

- [ ] Logs forwarding to VMI01
- [ ] VMI01 receiving logs
- [ ] Consider setting up alerting (email/SMS)

### Configure Backups

```bash
# Set up automated backups
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

scp $BACKUP_FILE root@46.250.243.123:/backups/vmi03/

find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE"
EOF

chmod +x /usr/local/bin/backup-phase2.sh

# Schedule daily backup
echo "0 2 * * * /usr/local/bin/backup-phase2.sh" | crontab -
```

- [ ] Backup script created
- [ ] Cron job scheduled
- [ ] Test backup manually
- [ ] Verify backup on VMI01

---

## Testing & Validation

### Test 1: Root Tunnel Connectivity

**From Root tunnel client**:

```bash
# Verify VPN connection
ping 10.100.0.1

# Test SSH to all VMs
ssh root@46.250.243.123  # VMI01
ssh root@46.250.241.70   # VMI02D
ssh root@154.26.158.31   # VMI03

# Test services
curl http://10.100.0.1:8080  # Keycloak
curl http://10.102.0.1/admin  # PiHole (should work from Root tunnel)

# Verify split tunnel (internet should work)
curl https://google.com
traceroute 8.8.8.8  # Should NOT go through VPN
```

- [ ] All tests passed
- [ ] Services accessible
- [ ] Split tunnel working

### Test 2: MCP Tunnel Connectivity

**From MCP tunnel client**:

```bash
# Verify VPN connection
ping 10.101.0.1

# Test VMI01 access
ssh root@46.250.243.123
nc -zv 46.250.243.123 5432  # PostgreSQL

# Test Perplexity API access (should work)
curl -I https://api.perplexity.ai

# Verify VMI02D not accessible (should fail)
ping 46.250.241.70  # Should timeout or fail
```

- [ ] MCP tunnel connected
- [ ] VMI01 accessible
- [ ] Perplexity API accessible
- [ ] Other endpoints blocked (security)

### Test 3: Red Tunnel Security

**From Red tunnel client**:

```bash
# Verify VPN connection
ping 10.102.0.1

# Test DNS
dig @10.102.0.1 example.com
nslookup google.com 10.102.0.1

# Verify LAN blocking (should all fail)
ping 192.168.1.1
ping 10.0.0.1
ping 172.16.0.1

# Verify internet access (should work)
curl https://google.com

# Test ad blocking
curl http://doubleclick.net  # Should be blocked
```

- [ ] Red tunnel connected
- [ ] DNS working (PiHole)
- [ ] LAN access blocked
- [ ] Internet access works (full tunnel)
- [ ] Ad blocking active

### Test 4: Keycloak OAuth2

```bash
# Test OAuth2 token endpoint
curl -X POST http://10.100.0.1:8080/realms/acdev-infrastructure/protocol/openid-connect/token \
  -d "client_id=wireguard-dynamic" \
  -d "client_secret=CLIENT_SECRET" \
  -d "grant_type=client_credentials"

# Should return access token
```

- [ ] OAuth2 endpoint responding
- [ ] Token generation working
- [ ] Client authentication working

### Test 5: Suricata Detection

```bash
# From Red tunnel client, trigger test alert
curl http://testmyids.com

# On VMI03, check for alert
ssh root@154.26.158.31 "tail -100 /var/log/suricata/fast.log | grep testmyids"
```

- [ ] Test alert triggered
- [ ] Alert logged to fast.log
- [ ] Alert contains correct information

### Test 6: Mail Delivery

```bash
# From VMI03
ssh root@154.26.158.31
echo "Test from deployment checklist" | mail -s "VMI03 Test" root

# Check email
```

- [ ] Email delivered
- [ ] Email forwarded to acampkinpersonnal@gmail.com
- [ ] Email not in spam (or moved to inbox)

---

## Final Verification

### Service Status

```bash
# Run comprehensive status check
ssh root@154.26.158.31 "/usr/local/bin/vmi03-status.sh"

# Or create if not exists:
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
docker ps --filter name=keycloak --format "  Status: {{.Status}}"
echo
echo "PiHole:"
docker ps --filter name=pihole --format "  Status: {{.Status}}"
echo
echo "Suricata:"
systemctl is-active suricata && echo "  Status: ACTIVE" || echo "  Status: INACTIVE"
echo
echo "Postfix:"
systemctl is-active postfix && echo "  Status: ACTIVE" || echo "  Status: INACTIVE"
echo
df -h / | tail -1
free -h | grep Mem
EOF

chmod +x /usr/local/bin/vmi03-status.sh
/usr/local/bin/vmi03-status.sh
```

**All services should show ACTIVE/Running**:

- [ ] WireGuard Root: ACTIVE
- [ ] WireGuard MCP: ACTIVE
- [ ] WireGuard Red: ACTIVE
- [ ] Keycloak: Running
- [ ] PiHole: Running
- [ ] Suricata: ACTIVE
- [ ] Postfix: ACTIVE

### Client Connectivity

- [ ] Root tunnel client can connect and access all VMs
- [ ] MCP tunnel client can connect and access VMI01
- [ ] Red tunnel client can connect with full tunnel security
- [ ] All clients can disconnect/reconnect successfully

### Security Posture

- [ ] MFA enabled for admin accounts
- [ ] Service account passwords rotated from defaults
- [ ] Firewall properly configured
- [ ] LAN access blocked on Red tunnel
- [ ] Suricata monitoring active
- [ ] PiHole filtering active
- [ ] Logs forwarding to VMI01

### Documentation

- [ ] Deployment summary saved: /root/phase2-deployment-summary.txt
- [ ] Passwords documented securely
- [ ] Client configurations distributed
- [ ] Admin accounts configured
- [ ] Backup procedures documented

---

## Troubleshooting Common Issues

### Issue: WireGuard Won't Start

**Solution**:

```bash
# Check logs
journalctl -u wg-quick@wg-root -n 50

# Verify config
wg-quick up wg-root

# Common fixes
modprobe wireguard
sysctl -w net.ipv4.ip_forward=1
ufw allow 51820/udp
```

### Issue: Keycloak Database Connection Failed

**Solution**:

```bash
# Test PostgreSQL connectivity
nc -zv 46.250.243.123 5432

# Verify database exists on VMI01
ssh root@46.250.243.123 "su - postgres -c 'psql -l | grep keycloak'"

# Check credentials
cat /opt/keycloak/.env
```

### Issue: PiHole DNS Not Resolving

**Solution**:

```bash
# Check container
docker ps | grep pihole
docker logs pihole

# Test directly
docker exec pihole dig example.com @127.0.0.1

# Restart container
cd /opt/pihole
docker-compose restart pihole
```

### Issue: Mail Not Delivering

**Solution**:

```bash
# Check queue
mailq

# Check logs
tail -f /var/log/mail.log

# Test locally
echo "test" | mail -s "test" root

# Consider SMTP relay if direct delivery fails
# See: /opt/phase2/postfix/main.cf
```

For complete troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## Deployment Complete!

### Next Steps

1. **Document Everything**:
   - [ ] Save passwords to password manager
   - [ ] Document network topology
   - [ ] Create runbook for common tasks

2. **Set Up Monitoring**:
   - [ ] Configure alerting for service failures
   - [ ] Set up log analysis
   - [ ] Monitor resource usage

3. **Schedule Maintenance**:
   - [ ] Weekly: Review logs, update software
   - [ ] Monthly: Rotate passwords, audit access
   - [ ] Quarterly: Security audit, key rotation

4. **User Onboarding**:
   - [ ] Create VPN client configs for additional users
   - [ ] Set up Keycloak accounts
   - [ ] Document access procedures

### Deployment Summary

**Server**: VMI03 (154.26.158.31)
**Deployment Date**: **\*\***\_\_\_**\*\***
**Deployed By**: **\*\***\_\_\_**\*\***

**Services Deployed**:

- [x] WireGuard VPN (3 tunnels)
- [x] Keycloak Identity Management
- [x] PiHole DNS + Suricata IDS/IPS
- [x] Postfix Mail Server

**Access Information**:

- Root VPN: 10.100.0.0/24 (Port 51820)
- MCP VPN: 10.101.0.0/24 (Port 51821)
- Red VPN: 10.102.0.0/24 (Port 51822)
- Keycloak: http://10.100.0.1:8080
- PiHole: http://10.102.0.1/admin

**Critical Files**:

- Client configs: /etc/wireguard/clients/
- Keycloak passwords: /opt/keycloak/.env
- Service accounts: /opt/keycloak/service-accounts.txt
- PiHole password: /opt/pihole/.env
- Deployment log: /var/log/phase2-deployment.log

---

**Deployment Status**: ☐ In Progress ☐ Complete ☐ Issues

**Notes**:

---

---

---

**Sign-off**: **\*\***\_\_\_**\*\*** Date: **\*\***\_\_\_**\*\***
