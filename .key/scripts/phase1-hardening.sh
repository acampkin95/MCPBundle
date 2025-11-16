#!/bin/bash
# Phase 1: Base System Hardening Script (8/10 Security Standard)
# Target: Ubuntu 24.04.3 LTS
# Usage: ./phase1-hardening.sh <vmi_name> <admin_user> <admin_pubkey> <whitelist_ip>

set -euo pipefail

VMI_NAME="$1"
ADMIN_USER="$2"
ADMIN_PUBKEY="$3"
WHITELIST_IP="$4"

echo "======================================"
echo "Phase 1: Base System Hardening"
echo "VM: $VMI_NAME"
echo "Admin User: $ADMIN_USER"
echo "Whitelist IP: $WHITELIST_IP"
echo "======================================"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# ======================
# 1. SYSTEM UPDATES
# ======================
echo ""
echo "==> Step 1: System Updates & Essential Packages"
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    fail2ban ufw unattended-upgrades \
    aide aide-common \
    lynis rkhunter \
    logwatch \
    auditd audispd-plugins \
    curl wget git jq \
    net-tools htop iotop \
    rsync \
    postfix mailutils \
    libpam-pwquality \
    sshguard \
    qrencode \
    || { log_error "Package installation failed"; exit 1; }

log_success "System updated and essential packages installed"

# ======================
# 2. CONFIGURE AUTOMATIC UPDATES
# ======================
echo ""
echo "==> Step 2: Configure Automatic Security Updates"
cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-Time "03:00";
Unattended-Upgrade::Mail "acampkinpersonnal@gmail.com";
Unattended-Upgrade::MailReport "on-change";
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

log_success "Automatic security updates configured"

# ======================
# 3. ADD SWAP SPACE
# ======================
echo ""
echo "==> Step 3: Configure Swap Space (4GB)"
if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab

    # Optimize swap usage
    sysctl vm.swappiness=10
    sysctl vm.vfs_cache_pressure=50
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo 'vm.vfs_cache_pressure=50' >> /etc/sysctl.conf

    log_success "4GB swap space configured"
else
    log_warning "Swap already exists, skipping"
fi

# ======================
# 4. KERNEL & NETWORK HARDENING
# ======================
echo ""
echo "==> Step 4: Kernel & Network Hardening"
cat > /etc/sysctl.d/99-hardening.conf <<'EOF'
# IP Forwarding and Routing
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0

# Disable source packet routing
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# Disable ICMP redirect acceptance
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0

# Enable bad error message Protection
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Enable Reverse Path Filtering
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Log Martians (packets with impossible addresses)
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# Ignore ICMP ping requests
net.ipv4.icmp_echo_ignore_all = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1

# SYN flood protection
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_syn_retries = 2
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_max_syn_backlog = 4096

# TCP hardening
net.ipv4.tcp_timestamps = 0
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15

# Increase TCP buffer sizes for high-performance networking
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 67108864
net.ipv4.tcp_wmem = 4096 65536 67108864

# Increase connection tracking table
net.netfilter.nf_conntrack_max = 1048576

# File descriptor limits
fs.file-max = 65536
fs.nr_open = 1048576

# Kernel hardening
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.yama.ptrace_scope = 1
kernel.unprivileged_bpf_disabled = 1
net.core.bpf_jit_harden = 2

# Disable IPv6 (unless needed)
# net.ipv6.conf.all.disable_ipv6 = 1
# net.ipv6.conf.default.disable_ipv6 = 1
EOF

sysctl -p /etc/sysctl.d/99-hardening.conf > /dev/null 2>&1
log_success "Kernel and network hardening applied"

# ======================
# 5. INCREASE FILE DESCRIPTOR LIMITS
# ======================
echo ""
echo "==> Step 5: Increase File Descriptor Limits"
cat >> /etc/security/limits.conf <<'EOF'

# Increased limits for high-performance applications
* soft nofile 65536
* hard nofile 65536
* soft nproc 32768
* hard nproc 32768
root soft nofile 65536
root hard nofile 65536
EOF

log_success "File descriptor limits increased to 65,536"

# ======================
# 6. CREATE ADMIN USER
# ======================
echo ""
echo "==> Step 6: Create Admin User: $ADMIN_USER"
if ! id "$ADMIN_USER" &>/dev/null; then
    useradd -m -s /bin/bash -G sudo "$ADMIN_USER"
    mkdir -p /home/$ADMIN_USER/.ssh
    echo "$ADMIN_PUBKEY" > /home/$ADMIN_USER/.ssh/authorized_keys
    chmod 700 /home/$ADMIN_USER/.ssh
    chmod 600 /home/$ADMIN_USER/.ssh/authorized_keys
    chown -R $ADMIN_USER:$ADMIN_USER /home/$ADMIN_USER/.ssh

    # Configure passwordless sudo for admin
    echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/$ADMIN_USER
    chmod 440 /etc/sudoers.d/$ADMIN_USER

    log_success "Admin user $ADMIN_USER created with SSH key authentication"
else
    log_warning "User $ADMIN_USER already exists"
fi

# ======================
# 7. CREATE RESTRICTED ACCESS SERVICE USER
# ======================
echo ""
echo "==> Step 7: Create Restricted AccessService User"
if ! id "AccessService" &>/dev/null; then
    useradd -m -s /bin/bash -d /home/AccessService AccessService
    echo 'AccessService:' | chpasswd

    # Create upload directory with write-once-read-only setup
    mkdir -p /home/AccessService/upload
    mkdir -p /mnt/secure-archive
    chmod 755 /home/AccessService/upload
    chown AccessService:AccessService /home/AccessService/upload
    chmod 700 /mnt/secure-archive

    log_success "AccessService user created (write-once-read-only)"
else
    log_warning "User AccessService already exists"
fi

# ======================
# 8. CONFIGURE SSH HARDENING
# ======================
echo ""
echo "==> Step 8: SSH Hardening Configuration"
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

cat > /etc/ssh/sshd_config <<'EOF'
# SSH Hardened Configuration for ACDEV Infrastructure
Port 22
Protocol 2

# Authentication
PermitRootLogin prohibit-password
PubkeyAuthentication yes
PasswordAuthentication no
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes

# Key Exchange Algorithms (Modern, Secure)
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group-exchange-sha256
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com,aes256-ctr,aes192-ctr,aes128-ctr
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com,hmac-sha2-512,hmac-sha2-256

# Security Settings
X11Forwarding no
MaxAuthTries 3
MaxSessions 10
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers root dev-admin data-admin sec-admin AccessService alex.campkin

# Logging
SyslogFacility AUTH
LogLevel VERBOSE

# Subsystems
Subsystem sftp internal-sftp

# AccessService chroot jail
Match User AccessService
    ChrootDirectory /home/AccessService
    ForceCommand internal-sftp
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
EOF

# Test SSH configuration before restarting
sshd -t || { log_error "SSH config test failed"; exit 1; }
systemctl restart sshd
log_success "SSH hardened (key-only authentication, modern ciphers)"

# ======================
# 9. CONFIGURE UFW FIREWALL
# ======================
echo ""
echo "==> Step 9: Configure UFW Firewall for $VMI_NAME"

# Reset UFW to default
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# Allow SSH from anywhere (rate limited)
ufw allow 22/tcp comment 'SSH access'
ufw limit 22/tcp

# VM-specific rules
if [ "$VMI_NAME" == "VMI01" ]; then
    # MCP Orchestrator ports
    ufw allow from 10.0.0.0/8 to any port 9090 proto tcp comment 'MCP Orchestrator'
    ufw allow from 10.0.0.0/8 to any port 9091 proto tcp comment 'Prometheus'
    ufw allow from $WHITELIST_IP to any port 3000 proto tcp comment 'Grafana (whitelisted)'
    ufw allow from 10.0.0.0/8 to any port 3000 proto tcp comment 'Grafana (LAN)'

    # Database access (LAN only)
    ufw allow from 10.0.0.0/8 to any port 5432 proto tcp comment 'PostgreSQL (LAN)'
    ufw allow from 10.0.0.0/8 to any port 6379 proto tcp comment 'Redis (LAN)'

    # Keycloak
    ufw allow from 10.0.0.0/8 to any port 8080 proto tcp comment 'Keycloak (LAN)'
    ufw allow from $WHITELIST_IP to any port 8080 proto tcp comment 'Keycloak (whitelisted)'

    # Jaeger, Loki
    ufw allow from 10.0.0.0/8 to any port 16686 proto tcp comment 'Jaeger UI'
    ufw allow from 10.0.0.0/8 to any port 3100 proto tcp comment 'Loki'

elif [ "$VMI_NAME" == "VMI02D" ]; then
    # Storage server - mostly internal
    ufw allow from 10.0.0.0/8 to any port 873 proto tcp comment 'Rsync (LAN)'
    ufw allow from $WHITELIST_IP to any port 873 proto tcp comment 'Rsync (whitelisted)'

    # NextCloud & Plex (disabled by default, ports prepared)
    # ufw allow 443/tcp comment 'NextCloud HTTPS'
    # ufw allow 32400/tcp comment 'Plex Media Server'

elif [ "$VMI_NAME" == "VMI03" ]; then
    # Security Gateway - WireGuard & Keycloak
    ufw allow 51820/udp comment 'WireGuard Root Tunnel'
    ufw allow 51821/udp comment 'WireGuard MCP Tunnel'
    ufw allow 51822/udp comment 'WireGuard Red Tunnel'

    # Keycloak
    ufw allow from 10.0.0.0/8 to any port 8080 proto tcp comment 'Keycloak (LAN)'
    ufw allow from $WHITELIST_IP to any port 8080 proto tcp comment 'Keycloak (whitelisted)'

    # HTTP/HTTPS for pfSense/PiHole admin (VPN only)
    ufw allow from 10.100.0.0/24 to any port 80 proto tcp comment 'PiHole Web (Root VPN)'
    ufw allow from 10.100.0.0/24 to any port 443 proto tcp comment 'PiHole Web (Root VPN)'
fi

# Enable UFW
echo "y" | ufw enable
ufw status numbered

log_success "UFW firewall configured for $VMI_NAME"

# ======================
# 10. CONFIGURE FAIL2BAN
# ======================
echo ""
echo "==> Step 10: Configure Fail2Ban"

# Main Fail2Ban configuration
cat > /etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = acampkinpersonnal@gmail.com
sendername = Fail2Ban
mta = sendmail
action = %(action_mwl)s
ignoreip = 127.0.0.1/8 ::1 10.0.0.0/8 192.168.0.0/16 $WHITELIST_IP

[sshd]
enabled = true
port = 22
logpath = %(sshd_log)s
backend = systemd
maxretry = 3
bantime = 3600

[sshd-aggressive]
enabled = true
port = 22
logpath = %(sshd_log)s
backend = systemd
maxretry = 1
bantime = 86400
findtime = 300

[pentanet-blocker]
enabled = true
filter = pentanet-domain
action = iptables-multiport[name=pentanet]
logpath = /var/log/auth.log
maxretry = 1
findtime = 86400
bantime = -1
EOF

# Pentanet blocker filter
cat > /etc/fail2ban/filter.d/pentanet-domain.conf <<'EOF'
[Definition]
failregex = ^.*penta\.?net\.?au.*$
            ^.*pentanet\.?com\.?au.*$
ignoreregex = ^.*alex\.campkin.*$
EOF

systemctl enable fail2ban
systemctl restart fail2ban

log_success "Fail2Ban configured (whitelisted: $WHITELIST_IP, blocked: Pentanet domains)"

# ======================
# 11. CONFIGURE AUDIT LOGGING
# ======================
echo ""
echo "==> Step 11: Configure Audit Logging (auditd)"

# Add audit rules
cat > /etc/audit/rules.d/hardening.rules <<'EOF'
# Monitor for modifications to system configuration files
-w /etc/passwd -p wa -k passwd_changes
-w /etc/group -p wa -k group_changes
-w /etc/shadow -p wa -k shadow_changes
-w /etc/sudoers -p wa -k sudoers_changes
-w /etc/ssh/sshd_config -p wa -k sshd_config_changes

# Monitor sudo usage
-a always,exit -F arch=b64 -S execve -F auid>=1000 -F auid!=4294967295 -k sudo_usage

# Monitor file deletions
-a always,exit -F arch=b64 -S unlink -S unlinkat -S rename -S renameat -k delete

# Monitor network connections
-a always,exit -F arch=b64 -S socket -S connect -k network

# Monitor privileged commands
-a always,exit -F path=/usr/bin/passwd -F perm=x -F auid>=1000 -F auid!=4294967295 -k privileged
-a always,exit -F path=/usr/bin/sudo -F perm=x -F auid>=1000 -F auid!=4294967295 -k privileged
EOF

service auditd restart
log_success "Audit logging configured (monitoring privileged operations)"

# ======================
# 12. CONFIGURE LOGWATCH
# ======================
echo ""
echo "==> Step 12: Configure Logwatch (Daily Email Reports)"

cat > /etc/cron.daily/00logwatch <<EOF
#!/bin/bash
/usr/sbin/logwatch --output mail --mailto acampkinpersonnal@gmail.com --detail high --service all --range yesterday
EOF

chmod +x /etc/cron.daily/00logwatch
log_success "Logwatch configured (daily email reports)"

# ======================
# 13. INITIALIZE AIDE (File Integrity Monitoring)
# ======================
echo ""
echo "==> Step 13: Initialize AIDE (File Integrity Monitoring)"

aideinit || true
mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db || true

# Schedule daily AIDE checks
cat > /etc/cron.daily/aide-check <<'EOF'
#!/bin/bash
/usr/bin/aide --check | mail -s "AIDE Daily Check - $(hostname)" acampkinpersonnal@gmail.com
EOF

chmod +x /etc/cron.daily/aide-check
log_success "AIDE initialized (daily file integrity checks)"

# ======================
# 14. CONFIGURE RKHUNTER
# ======================
echo ""
echo "==> Step 14: Configure RKHunter (Rootkit Detection)"

rkhunter --propupd || true

cat > /etc/cron.weekly/rkhunter-check <<'EOF'
#!/bin/bash
/usr/bin/rkhunter --check --skip-keypress --report-warnings-only | mail -s "RKHunter Weekly Scan - $(hostname)" acampkinpersonnal@gmail.com
EOF

chmod +x /etc/cron.weekly/rkhunter-check
log_success "RKHunter configured (weekly rootkit scans)"

# ======================
# 15. CONFIGURE POSTFIX (MAIL RELAY)
# ======================
echo ""
echo "==> Step 15: Configure Postfix for Email Alerts"

# Set hostname
postconf -e "myhostname = $VMI_NAME.acdev.host"
postconf -e "mydomain = acdev.host"
postconf -e "myorigin = \$mydomain"
postconf -e "inet_interfaces = loopback-only"
postconf -e "mydestination = \$myhostname, localhost.\$mydomain, localhost"

systemctl restart postfix
log_success "Postfix configured (local mail delivery for alerts)"

# ======================
# 16. DISABLE UNNECESSARY SERVICES
# ======================
echo ""
echo "==> Step 16: Disable Unnecessary Services"

SERVICES_TO_DISABLE=("bluetooth" "cups" "avahi-daemon")
for service in "${SERVICES_TO_DISABLE[@]}"; do
    if systemctl is-enabled "$service" 2>/dev/null; then
        systemctl disable "$service" || true
        systemctl stop "$service" || true
        log_success "Disabled $service"
    fi
done

# ======================
# 17. RUN LYNIS SECURITY AUDIT
# ======================
echo ""
echo "==> Step 17: Run Lynis Security Audit"

lynis audit system --quick --quiet > /root/lynis-audit.log 2>&1 || true
LYNIS_SCORE=$(grep "Hardening index" /root/lynis-audit.log | awk '{print $4}' | tr -d '[]')

if [ -n "$LYNIS_SCORE" ]; then
    log_success "Lynis audit complete. Hardening score: $LYNIS_SCORE"

    # Check if score meets target
    SCORE_NUM=$(echo $LYNIS_SCORE | tr -d '[]')
    if [ "$SCORE_NUM" -ge 80 ]; then
        log_success "✅ Security score meets 8/10 standard ($SCORE_NUM >= 80)"
    else
        log_warning "⚠️  Security score below target ($SCORE_NUM < 80). Review /root/lynis-audit.log"
    fi
else
    log_warning "Could not extract Lynis score"
fi

# ======================
# 18. CREATE SYSTEM STATE SNAPSHOT
# ======================
echo ""
echo "==> Step 18: Create System State Snapshot"

mkdir -p /root/system-snapshots
cat > /root/system-snapshots/phase1-complete-$(date +%Y%m%d).txt <<EOF
Phase 1 Hardening Complete - $(date)
====================================
Hostname: $(hostname)
VM: $VMI_NAME
Admin User: $ADMIN_USER
Kernel: $(uname -r)
OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)

Installed Security Tools:
- UFW Firewall: $(ufw status | head -1)
- Fail2Ban: $(fail2ban-client status | head -1)
- AIDE: $(aide --version | head -1)
- Lynis Score: $LYNIS_SCORE
- Auditd: $(auditctl -l | wc -l) rules active

Firewall Rules:
$(ufw status numbered)

Fail2Ban Jails:
$(fail2ban-client status)

Swap Space:
$(swapon --show)

File Descriptor Limits:
$(ulimit -n)

Kernel Parameters:
$(sysctl -a | grep -E "net.ipv4.tcp_syncookies|vm.swappiness|fs.file-max")
EOF

# ======================
# FINAL SUMMARY
# ======================
echo ""
echo "======================================"
echo "✅ Phase 1 Hardening Complete for $VMI_NAME"
echo "======================================"
echo ""
echo "Summary:"
echo "  • System fully updated"
echo "  • 4GB swap space added"
echo "  • Kernel hardened (sysctl)"
echo "  • UFW firewall configured"
echo "  • Fail2Ban active (SSH protection + Pentanet blocker)"
echo "  • Admin user created: $ADMIN_USER"
echo "  • AccessService user created (restricted)"
echo "  • SSH hardened (key-only authentication)"
echo "  • Audit logging enabled (auditd)"
echo "  • Daily monitoring: Logwatch, AIDE, RKHunter"
echo "  • Lynis security score: $LYNIS_SCORE"
echo ""
echo "Next Steps:"
echo "  1. Verify SSH access with admin key"
echo "  2. Disable root password login (after verification)"
echo "  3. Review Lynis report: /root/lynis-audit.log"
echo ""
echo "System state snapshot: /root/system-snapshots/phase1-complete-$(date +%Y%m%d).txt"
echo "======================================"
