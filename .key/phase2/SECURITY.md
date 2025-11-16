# Security Considerations - VMI03 Security Gateway

## Overview

VMI03 serves as the security gateway for the entire ACDev infrastructure. This document outlines security considerations, best practices, and hardening recommendations.

---

## Threat Model

### Protected Assets

1. **WireGuard VPN Tunnels**: Secure access to infrastructure
2. **Keycloak Identity Server**: Authentication/authorization for all services
3. **PiHole DNS**: DNS filtering and privacy
4. **Suricata IDS/IPS**: Network threat detection
5. **Internal Network Access**: Protection of VMI01 and VMI02D

### Threat Actors

1. **External Attackers**: Internet-based attacks on public services
2. **Compromised Clients**: Infected devices connecting via VPN
3. **Guest Users**: Untrusted users on Red tunnel
4. **Malicious Insiders**: Rogue users with legitimate access

### Attack Vectors

1. **Network**: DDoS, port scanning, exploitation of exposed services
2. **Authentication**: Brute force, credential stuffing, session hijacking
3. **VPN**: Unauthorized access attempts, man-in-the-middle
4. **DNS**: DNS poisoning, DNS tunneling, data exfiltration
5. **Application**: OAuth2 misconfiguration, XSS, CSRF

---

## Security Architecture

### Network Segmentation

```
Internet
    │
    ├─[Firewall]─ VMI03 Public Interface (154.26.158.31)
    │                │
    │                ├─ WireGuard Root Tunnel (10.100.0.0/24)
    │                │   └─ Admin Access Only
    │                │
    │                ├─ WireGuard MCP Tunnel (10.101.0.0/24)
    │                │   └─ MCP + Perplexity API Only
    │                │
    │                └─ WireGuard Red Tunnel (10.102.0.0/24)
    │                    └─ Full Tunnel + PiHole DNS
    │                        └─ Suricata IDS/IPS
    │
    └─ Backend Network
        ├─ VMI01 (46.250.243.123)
        └─ VMI02D (46.250.241.70)
```

### Defense in Depth Layers

1. **Network Layer**: Firewall, network segmentation, WireGuard encryption
2. **Transport Layer**: TLS/SSL, encrypted VPN tunnels
3. **Application Layer**: OAuth2, authentication, authorization
4. **Detection Layer**: Suricata IDS/IPS, PiHole logging
5. **Logging Layer**: Centralized logging to VMI01

---

## WireGuard Security

### Tunnel-Specific Security Policies

#### Root Tunnel (10.100.0.0/24)

- **Purpose**: Full administrative access
- **Security Level**: HIGH
- **Access Control**: Pre-authorized devices only
- **Key Rotation**: Every 90 days
- **MFA Required**: Yes (Keycloak)
- **Monitoring**: Full traffic logging
- **IP Restrictions**: Static IPs only

**Hardening**:

```bash
# Enforce key rotation
cat >> /etc/cron.monthly/rotate-root-keys <<'EOF'
#!/bin/bash
# Rotate WireGuard keys every 90 days
# Generate new keys
wg genkey | tee /etc/wireguard/keys/root/server.key.new | wg pubkey > /etc/wireguard/keys/root/server.pub.new
# Backup old keys
mv /etc/wireguard/keys/root/server.key /etc/wireguard/keys/root/server.key.$(date +%Y%m%d)
mv /etc/wireguard/keys/root/server.pub /etc/wireguard/keys/root/server.pub.$(date +%Y%m%d)
# Apply new keys
mv /etc/wireguard/keys/root/server.key.new /etc/wireguard/keys/root/server.key
mv /etc/wireguard/keys/root/server.pub.new /etc/wireguard/keys/root/server.pub
# Notify admin
echo "WireGuard Root tunnel keys rotated. Update client configs." | mail -s "Key Rotation Required" root
EOF
chmod +x /etc/cron.monthly/rotate-root-keys
```

#### MCP Tunnel (10.101.0.0/24)

- **Purpose**: MCP agent communication
- **Security Level**: HIGH
- **Access Control**: Service accounts only
- **Network Isolation**: VMI01 + Perplexity API only
- **Rate Limiting**: Yes
- **API Key Authentication**: Required

**Hardening**:

```bash
# Rate limiting with iptables
iptables -A INPUT -i wg-mcp -p tcp --dport 5432 -m conntrack --ctstate NEW -m recent --set
iptables -A INPUT -i wg-mcp -p tcp --dport 5432 -m conntrack --ctstate NEW -m recent --update --seconds 60 --hitcount 20 -j DROP

# Log excessive connections
iptables -A INPUT -i wg-mcp -m conntrack --ctstate NEW -m recent --update --seconds 60 --hitcount 50 -j LOG --log-prefix "MCP_FLOOD: "
```

#### Red Tunnel (10.102.0.0/24)

- **Purpose**: Guest VPN with enhanced security
- **Security Level**: MAXIMUM
- **Access Control**: Open enrollment with monitoring
- **Network Isolation**: No LAN access, full tunnel
- **DNS Filtering**: PiHole with malware/phishing blocks
- **IDS/IPS**: Suricata monitoring all traffic
- **DPI**: Optional SSL/TLS inspection

**Hardening**:

```bash
# Strict iptables rules for Red tunnel
# Block all RFC1918 private networks
iptables -I FORWARD 1 -i wg-red -d 10.0.0.0/8 -j DROP
iptables -I FORWARD 2 -i wg-red -d 172.16.0.0/12 -j DROP
iptables -I FORWARD 3 -i wg-red -d 192.168.0.0/16 -j DROP
iptables -I FORWARD 4 -i wg-red -d 169.254.0.0/16 -j DROP
iptables -I FORWARD 5 -i wg-red -d 127.0.0.0/8 -j DROP

# Block localhost
iptables -I FORWARD 6 -i wg-red -d 154.26.158.31/32 -j DROP

# Allow ONLY DNS to PiHole
iptables -I INPUT 1 -i wg-red -p udp --dport 53 -j ACCEPT
iptables -I INPUT 2 -i wg-red -p tcp --dport 53 -j ACCEPT

# Drop everything else to server
iptables -A INPUT -i wg-red -j DROP

# Log dropped packets
iptables -I FORWARD 1 -i wg-red -m limit --limit 10/min -j LOG --log-prefix "RED_TUNNEL_BLOCK: "
```

### WireGuard Key Management

**Private Key Protection**:

```bash
# Secure key storage
chmod 600 /etc/wireguard/*.conf
chmod 600 /etc/wireguard/keys/*/*.key
chown root:root /etc/wireguard/keys/*/*.key

# Disable core dumps (prevent key exposure)
echo "* hard core 0" >> /etc/security/limits.conf
```

**Preshared Key (PSK) Usage**:

- All peers MUST use PSK for post-quantum security
- PSK rotation every 180 days
- PSK generated with cryptographically secure RNG

**Client Key Distribution**:

```bash
# Never send keys via unencrypted email
# Use secure channels:
# 1. Physical transfer (USB)
# 2. Encrypted email (PGP)
# 3. Secure file sharing (NextCloud with encryption)
# 4. QR code scanning (mobile only)

# Example secure transfer
gpg --encrypt --recipient alex.campkin@acdev.host /etc/wireguard/clients/root-macbook.conf
# Send encrypted file
```

---

## Keycloak Security

### Authentication Security

**Password Policy**:

```json
{
  "minimumLength": 14,
  "requireUpperCase": true,
  "requireLowerCase": true,
  "requireDigits": true,
  "requireSpecialChars": true,
  "notUsername": true,
  "passwordHistory": 5,
  "expiryDays": 90
}
```

**MFA Enforcement**:

- TOTP required for all admin accounts
- WebAuthn/FIDO2 recommended for high-security accounts
- Backup codes mandatory (stored securely)

**Brute Force Protection**:

```yaml
# Configured in realm-config.json
bruteForceProtected: true
permanentLockout: false
maxFailureWaitSeconds: 900 # 15 minutes
minimumQuickLoginWaitSeconds: 60
quickLoginCheckMilliSeconds: 1000
maxDeltaTimeSeconds: 43200 # 12 hours
failureFactor: 5
```

### OAuth2/OIDC Security

**Client Configuration**:

- Use confidential clients (not public)
- Rotate client secrets every 90 days
- Strict redirect URI validation
- Short-lived access tokens (5 minutes)
- Refresh tokens with rotation

**Token Security**:

```bash
# Access token lifespan: 5 minutes
# Refresh token: 30 days max, rotate on use
# Session timeout: 30 minutes idle
# Max session: 10 hours

# Example token validation
curl -X POST http://154.26.158.31:8080/realms/acdev-infrastructure/protocol/openid-connect/token/introspect \
  -d "client_id=your-client" \
  -d "client_secret=your-secret" \
  -d "token=ACCESS_TOKEN"
```

### Session Management

**Session Security**:

- SameSite cookies: Strict
- Secure flag: Always (HTTPS only)
- HttpOnly flag: Yes
- Session fixation protection: Enabled

**Logout**:

- Front-channel logout: Enabled
- Back-channel logout: Enabled
- Revoke refresh tokens on logout

---

## PiHole & DNS Security

### DNS Filtering

**Blocklists (Production)**:

```bash
# Malware & phishing
https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
https://mirror1.malwaredomains.com/files/justdomains
https://phishing.army/download/phishing_army_blocklist_extended.txt

# Tracking & ads
https://s3.amazonaws.com/lists.disconnect.me/simple_tracking.txt
https://s3.amazonaws.com/lists.disconnect.me/simple_ad.txt

# Crypto mining
https://zerodot1.gitlab.io/CoinBlockerLists/hosts_browser

# Ransomware
https://ransomwaretracker.abuse.ch/downloads/RW_DOMBL.txt
```

**DNSSEC Validation**:

```bash
# Enable DNSSEC in PiHole
docker exec pihole pihole -a dnssec on

# Verify DNSSEC
dig +dnssec example.com @10.102.0.1
# Should show: ad flag (authenticated data)
```

**DNS over HTTPS (DoH)**:

```bash
# Unbound configuration for encrypted upstream DNS
forward-zone:
    name: "."
    forward-tls-upstream: yes
    forward-addr: 1.1.1.1@853#cloudflare-dns.com
    forward-addr: 1.0.0.1@853#cloudflare-dns.com
    forward-addr: 9.9.9.9@853#dns.quad9.net
```

### Query Logging Security

**Privacy Considerations**:

- Log retention: 7 days only
- No query content logging
- Anonymize client IPs after 24 hours
- GDPR compliance

**Log Protection**:

```bash
# Secure log files
chmod 600 /var/log/pihole/*.log
chown root:root /var/log/pihole/*.log

# Encrypted backup
tar -czf - /var/log/pihole/*.log | gpg --encrypt --recipient admin@acdev.host > pihole-logs-$(date +%Y%m%d).tar.gz.gpg
```

---

## Suricata IDS/IPS

### Rule Sets

**Production Rule Sets**:

```bash
# Emerging Threats Open
suricata-update enable-source et/open

# Emerging Threats Pro (if licensed)
# suricata-update enable-source et/pro

# OISF Traffic ID
suricata-update enable-source oisf/trafficid

# Custom rules
# /var/lib/suricata/rules/local.rules
```

**Custom Rules for Infrastructure**:

```bash
# /var/lib/suricata/rules/local.rules

# Detect WireGuard port scanning
alert udp any any -> 154.26.158.31 51820:51822 (msg:"WireGuard Port Scan Detected"; threshold: type both, track by_src, count 10, seconds 60; sid:1000001; rev:1;)

# Detect excessive DNS queries (potential DNS tunneling)
alert dns any any -> 10.102.0.1 53 (msg:"Potential DNS Tunneling"; threshold: type both, track by_src, count 100, seconds 60; sid:1000002; rev:1;)

# Detect OAuth2 brute force
alert http any any -> any 8080 (msg:"Keycloak Brute Force Attempt"; content:"POST"; http_uri; content:"/token"; http_uri; threshold: type both, track by_src, count 20, seconds 60; sid:1000003; rev:1;)

# Detect large data transfers (potential exfiltration)
alert tcp any any -> any any (msg:"Large Data Transfer Detected"; flow:established; threshold: type threshold, track by_src, count 1, seconds 60; byte_test:8,>,104857600,0,relative; sid:1000004; rev:1;)
```

### Alert Management

**Alert Priorities**:

1. **Critical**: Immediate action required (malware, exploit attempts)
2. **High**: Investigation required (suspicious activity)
3. **Medium**: Monitoring required (policy violations)
4. **Low**: Informational (normal but logged)

**Alert Forwarding**:

```bash
# Forward to VMI01 syslog
# /etc/rsyslog.conf
local5.* @@46.250.243.123:514

# Set up alerting (example with mail)
cat > /usr/local/bin/suricata-alert.sh <<'EOF'
#!/bin/bash
# Send email on critical Suricata alerts
tail -F /var/log/suricata/fast.log | while read line; do
    if echo "$line" | grep -q "\[Priority: 1\]"; then
        echo "$line" | mail -s "[CRITICAL] Suricata Alert on VMI03" root
    fi
done
EOF
chmod +x /usr/local/bin/suricata-alert.sh

# Run as systemd service
cat > /etc/systemd/system/suricata-alerting.service <<'EOF'
[Unit]
Description=Suricata Critical Alert Notification
After=suricata.service
Requires=suricata.service

[Service]
Type=simple
ExecStart=/usr/local/bin/suricata-alert.sh
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl enable suricata-alerting
systemctl start suricata-alerting
```

---

## Firewall Hardening

### UFW Base Configuration

```bash
# Default policies
ufw default deny incoming
ufw default allow outgoing
ufw default deny routed

# Allow SSH (consider changing port)
ufw allow 22/tcp

# WireGuard
ufw allow 51820/udp comment 'WireGuard Root'
ufw allow 51821/udp comment 'WireGuard MCP'
ufw allow 51822/udp comment 'WireGuard Red'

# Keycloak (only from VPN)
ufw allow from 10.100.0.0/24 to any port 8080 comment 'Keycloak'

# Rate limiting SSH
ufw limit 22/tcp comment 'SSH rate limit'

# Enable logging
ufw logging on
ufw logging high

# Enable
ufw enable
```

### Advanced iptables Rules

```bash
# Drop invalid packets
iptables -A INPUT -m conntrack --ctstate INVALID -j DROP

# SYN flood protection
iptables -A INPUT -p tcp --syn -m connlimit --connlimit-above 20 --connlimit-mask 32 -j DROP
iptables -A INPUT -p tcp --syn -m limit --limit 1/s --limit-burst 3 -j ACCEPT
iptables -A INPUT -p tcp --syn -j DROP

# Port scanning detection
iptables -N port-scanning
iptables -A port-scanning -p tcp --tcp-flags SYN,ACK,FIN,RST RST -m limit --limit 1/s --limit-burst 2 -j RETURN
iptables -A port-scanning -j DROP

# ICMP rate limiting
iptables -A INPUT -p icmp --icmp-type echo-request -m limit --limit 1/s --limit-burst 2 -j ACCEPT
iptables -A INPUT -p icmp --icmp-type echo-request -j DROP

# Log and drop martian packets
iptables -A INPUT -s 0.0.0.0/8 -j DROP
iptables -A INPUT -s 127.0.0.0/8 ! -i lo -j DROP
iptables -A INPUT -s 169.254.0.0/16 -j DROP
iptables -A INPUT -s 224.0.0.0/4 -j DROP
iptables -A INPUT -d 224.0.0.0/4 -j DROP
iptables -A INPUT -s 240.0.0.0/5 -j DROP

# Save rules
iptables-save > /etc/iptables/rules.v4
```

---

## System Hardening

### SSH Hardening

```bash
# /etc/ssh/sshd_config
Port 22  # Consider changing
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
X11Forwarding no
MaxAuthTries 3
MaxSessions 2
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers root@10.100.0.0/24 root@46.250.243.123  # Restrict by IP
UsePAM yes
UseDNS no

# Restart SSH
systemctl restart sshd
```

### Kernel Hardening

```bash
# /etc/sysctl.conf

# IP forwarding (required for VPN)
net.ipv4.ip_forward = 1

# Disable IPv6 if not needed
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1

# Protect against SYN flood
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_syn_retries = 5

# IP spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0

# Ignore ICMP ping
# net.ipv4.icmp_echo_ignore_all = 1  # Optional

# Log suspicious packets
net.ipv4.conf.all.log_martians = 1

# Disable source packet routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0

# Apply
sysctl -p
```

### File System Security

```bash
# Secure /tmp
# /etc/fstab
tmpfs /tmp tmpfs defaults,noexec,nosuid,nodev 0 0

# Remount /tmp
mount -o remount /tmp

# Secure shared memory
tmpfs /run/shm tmpfs defaults,noexec,nosuid,nodev 0 0
```

---

## Monitoring & Auditing

### Log Centralization

All logs forwarded to VMI01:

- WireGuard: journalctl
- Keycloak: Docker logs
- PiHole: Docker logs + query logs
- Suricata: fast.log, eve.json
- Postfix: mail.log
- System: syslog

### Log Retention

- Local: 7 days
- Remote (VMI01): 30 days
- Archive: 365 days (compressed, encrypted)

### Audit Logging

```bash
# Install auditd
apt-get install -y auditd

# Configure audit rules
cat >> /etc/audit/rules.d/audit.rules <<'EOF'
# Log all commands by root
-a exit,always -F arch=b64 -F euid=0 -S execve -k root_commands

# Log changes to system configuration
-w /etc/wireguard/ -p wa -k wireguard_config
-w /etc/postfix/ -p wa -k postfix_config
-w /etc/suricata/ -p wa -k suricata_config

# Log changes to critical files
-w /etc/passwd -p wa -k passwd_changes
-w /etc/shadow -p wa -k shadow_changes
-w /etc/sudoers -p wa -k sudoers_changes

# Log network configuration changes
-w /etc/network/ -p wa -k network_config
-a always,exit -F arch=b64 -S sethostname -S setdomainname -k network_changes

# Log time changes
-a always,exit -F arch=b64 -S adjtimex -S settimeofday -k time_change
EOF

# Restart auditd
systemctl restart auditd
```

---

## Incident Response

### Detection

1. **Suricata Alerts**: Real-time threat detection
2. **Log Analysis**: Anomaly detection in centralized logs
3. **Performance Monitoring**: Unusual CPU/network usage
4. **Failed Authentication**: Brute force attempts

### Response Playbook

**1. Confirm Incident**:

```bash
# Check Suricata alerts
tail -f /var/log/suricata/fast.log | grep "Priority: 1"

# Check failed logins
journalctl -u sshd | grep "Failed"
docker logs keycloak | grep "Failed login"

# Check network connections
netstat -tulpn
ss -tupn
```

**2. Contain Threat**:

```bash
# Block malicious IP immediately
iptables -I INPUT -s MALICIOUS_IP -j DROP

# Disconnect compromised client from VPN
wg set wg-red peer CLIENT_PUBLIC_KEY remove

# Disable compromised user account
docker exec keycloak /opt/keycloak/bin/kcadm.sh update users/USER_ID -r acdev-infrastructure -s enabled=false
```

**3. Investigate**:

```bash
# Collect evidence
mkdir -p /root/incident-$(date +%Y%m%d-%H%M%S)
cd /root/incident-*

# Capture logs
journalctl --since "1 hour ago" > system.log
docker logs keycloak --since 1h > keycloak.log
docker logs pihole --since 1h > pihole.log
tail -1000 /var/log/suricata/fast.log > suricata.log

# Network state
netstat -tupn > netstat.txt
iptables -L -n -v > iptables.txt
wg show > wireguard.txt

# Process list
ps auxf > processes.txt
top -b -n 1 > top.txt

# Hash evidence
sha256sum * > checksums.txt
```

**4. Eradicate**:

```bash
# Update rules/signatures
suricata-update

# Patch systems
apt-get update && apt-get upgrade

# Rotate compromised credentials
# See key rotation procedures above
```

**5. Recover**:

```bash
# Restore from backups if needed
# Verify system integrity
# Re-enable services

# Test functionality
bash /opt/phase2/postfix/test-mail.sh  # Test mail
dig @10.102.0.1 example.com  # Test DNS
curl http://localhost:8080  # Test Keycloak
```

**6. Document**:

- Timeline of events
- Root cause analysis
- Actions taken
- Lessons learned
- Remediation plan

---

## Backup & Recovery

### Critical Data

1. **WireGuard Keys**: /etc/wireguard/
2. **Keycloak Database**: keycloak DB on VMI01
3. **PiHole Configuration**: /opt/pihole/etc-pihole/
4. **Suricata Rules**: /var/lib/suricata/rules/
5. **Configurations**: /etc/

### Backup Script

```bash
#!/bin/bash
# /usr/local/bin/backup-phase2.sh

BACKUP_DIR="/backups/phase2"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/vmi03-backup-$DATE.tar.gz"

mkdir -p $BACKUP_DIR

# Create backup
tar -czf $BACKUP_FILE \
    /etc/wireguard \
    /opt/keycloak \
    /opt/pihole/etc-pihole \
    /etc/suricata \
    /etc/postfix \
    /var/lib/suricata/rules

# Encrypt backup
gpg --encrypt --recipient admin@acdev.host $BACKUP_FILE
rm $BACKUP_FILE

# Transfer to VMI01
scp $BACKUP_FILE.gpg root@46.250.243.123:/backups/vmi03/

# Cleanup old backups (keep 7 days)
find $BACKUP_DIR -name "*.gpg" -mtime +7 -delete

echo "Backup completed: $BACKUP_FILE.gpg"
```

**Schedule**:

```bash
# Daily backup at 2 AM
0 2 * * * /usr/local/bin/backup-phase2.sh
```

---

## Compliance & Privacy

### GDPR Compliance

- **Data Minimization**: Log only necessary information
- **Retention**: 7 days local, 30 days remote
- **Encryption**: All data encrypted in transit and at rest
- **Access Control**: Role-based access
- **Right to Erasure**: Procedure for data deletion

### Data Protection

**Encrypted Communications**:

- WireGuard: ChaCha20-Poly1305
- Keycloak: TLS 1.2+ (production)
- DNS: DNS over TLS upstream

**Key Management**:

- Keys generated with /dev/urandom
- Keys stored with 600 permissions
- Keys rotated regularly
- PSK for post-quantum security

---

## Security Checklist

### Daily

- [ ] Review Suricata alerts
- [ ] Check failed authentication attempts
- [ ] Monitor disk space
- [ ] Verify backups completed

### Weekly

- [ ] Review PiHole blocked queries
- [ ] Analyze top DNS queries
- [ ] Check for software updates
- [ ] Review firewall logs

### Monthly

- [ ] Rotate service account passwords
- [ ] Review user access
- [ ] Update blocklists
- [ ] Test disaster recovery

### Quarterly

- [ ] Rotate WireGuard keys
- [ ] Security audit
- [ ] Penetration testing
- [ ] Update documentation

---

**Document Version**: 1.0
**Last Updated**: 2025-01-06
**Next Review**: 2025-04-06
**Owner**: Alex Campkin
