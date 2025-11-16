# Security Hardening Guide

This document outlines security best practices for deploying SERVER-MCP in production environments.

## Table of Contents

- [System User Configuration](#system-user-configuration)
- [Sudo Access Control](#sudo-access-control)
- [Secret Management](#secret-management)
- [Network Security](#network-security)
- [File System Permissions](#file-system-permissions)
- [Systemd Security Features](#systemd-security-features)
- [Monitoring & Audit Trail](#monitoring--audit-trail)

---

## System User Configuration

### Create Dedicated Service User

```bash
# Create non-login service user
sudo useradd -r -s /bin/false -d /opt/server-mcp -c "SERVER-MCP Agent" mcp-agent

# Set ownership
sudo chown -R mcp-agent:mcp-agent /opt/server-mcp
```

**Security Rationale**:

- `-r`: System user (UID < 1000)
- `-s /bin/false`: No interactive login
- `-d /opt/server-mcp`: Home directory for application
- Non-privileged user prevents privilege escalation

---

## Sudo Access Control

### Minimal Sudoers Configuration

Create `/etc/sudoers.d/server-mcp` with **specific commands only**:

```bash
# SERVER-MCP sudoers configuration
# Edit with: sudo visudo -f /etc/sudoers.d/server-mcp

# Service management (systemctl)
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl status *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart postgresql
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart redis
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart nginx
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/systemctl reload nginx

# Database backups
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/pg_dump *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/pg_dumpall *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/redis-cli BGSAVE

# Docker operations (if needed)
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker ps *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker inspect *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker logs *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/docker restart *

# NGINX configuration testing
mcp-agent ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t
mcp-agent ALL=(ALL) NOPASSWD: /usr/sbin/nginx -T

# Package management (read-only)
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/apt list *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/dpkg -l *

# System metrics (read-only)
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/journalctl *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/netstat *
mcp-agent ALL=(ALL) NOPASSWD: /usr/bin/ss *
```

**Verify sudoers syntax**:

```bash
sudo visudo -c -f /etc/sudoers.d/server-mcp
```

**Security Notes**:

- L **NEVER** use `mcp-agent ALL=(ALL) NOPASSWD: ALL`
-  Whitelist specific commands only
-  Use absolute paths (e.g., `/usr/bin/systemctl` not `systemctl`)
-  Limit wildcards (e.g., `systemctl status *` not `systemctl *`)

---

## Secret Management

### Option 1: Systemd Credentials (Recommended)

```bash
# Encrypt secrets with systemd-creds
echo -n "your_postgres_password" | sudo systemd-creds encrypt - /etc/credstore/postgres_password
echo -n "your_redis_password" | sudo systemd-creds encrypt - /etc/credstore/redis_password
echo -n "your_keycloak_secret" | sudo systemd-creds encrypt - /etc/credstore/keycloak_secret

# Set restrictive permissions
sudo chmod 600 /etc/credstore/*
sudo chown root:root /etc/credstore/*
```

Update `systemd/server-mcp.service`:

```ini
[Service]
LoadCredential=postgres_password:/etc/credstore/postgres_password
LoadCredential=redis_password:/etc/credstore/redis_password
LoadCredential=keycloak_secret:/etc/credstore/keycloak_secret
```

Access in code (already implemented):

```typescript
const password = process.env.CREDENTIALS_DIRECTORY
  ? fs.readFileSync(`${process.env.CREDENTIALS_DIRECTORY}/postgres_password`, 'utf8')
  : process.env.POSTGRES_PASSWORD;
```

### Option 2: Encrypted .env File

```bash
# Install age (encryption tool)
sudo apt install age

# Generate key
age-keygen -o /etc/server-mcp/encryption.key
sudo chmod 400 /etc/server-mcp/encryption.key
sudo chown mcp-agent:mcp-agent /etc/server-mcp/encryption.key

# Encrypt .env
age -r $(age-keygen -y /etc/server-mcp/encryption.key) \
  /etc/server-mcp/server-mcp.env > /etc/server-mcp/server-mcp.env.age

# Decrypt on startup (add to ExecStartPre in systemd)
age -d -i /etc/server-mcp/encryption.key \
  /etc/server-mcp/server-mcp.env.age > /run/server-mcp/server-mcp.env
```

### Option 3: HashiCorp Vault

For enterprise deployments, integrate with Vault:

```bash
# Install Vault client
sudo apt install vault

# Authenticate and fetch secrets on startup
ExecStartPre=/usr/local/bin/fetch-secrets.sh
```

---

## Network Security

### Firewall Rules (UFW)

```bash
# Enable firewall
sudo ufw enable

# Allow SSH (adjust port if non-standard)
sudo ufw allow 22/tcp

# Allow PostgreSQL (localhost only - already bound to 127.0.0.1)
# No external access needed

# Allow Redis (localhost only - already bound to 127.0.0.1)
# No external access needed

# Allow NGINX (if serving HTTP/HTTPS)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny all other inbound by default
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Verify rules
sudo ufw status verbose
```

### PostgreSQL Security

```bash
# Edit /etc/postgresql/*/main/pg_hba.conf
# Allow only localhost connections
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256

# Deny all other hosts
sudo systemctl restart postgresql
```

### Redis Security

```bash
# Edit /etc/redis/redis.conf
bind 127.0.0.1 ::1
protected-mode yes
requirepass your_strong_redis_password_here
maxmemory 512mb
maxmemory-policy allkeys-lru

sudo systemctl restart redis
```

---

## File System Permissions

### Directory Structure and Permissions

```bash
# Application directory
sudo chown -R mcp-agent:mcp-agent /opt/server-mcp
sudo chmod -R 750 /opt/server-mcp

# Backup directory
sudo mkdir -p /var/backups/server-mcp
sudo chown mcp-agent:mcp-agent /var/backups/server-mcp
sudo chmod 750 /var/backups/server-mcp

# Log directory
sudo mkdir -p /var/log/server-mcp
sudo chown mcp-agent:mcp-agent /var/log/server-mcp
sudo chmod 750 /var/log/server-mcp

# Data directory (SQLite databases)
sudo mkdir -p /var/lib/server-mcp
sudo chown mcp-agent:mcp-agent /var/lib/server-mcp
sudo chmod 700 /var/lib/server-mcp

# Configuration directory
sudo mkdir -p /etc/server-mcp
sudo chown root:mcp-agent /etc/server-mcp
sudo chmod 750 /etc/server-mcp

# .env file (secrets)
sudo chmod 640 /etc/server-mcp/server-mcp.env
sudo chown root:mcp-agent /etc/server-mcp/server-mcp.env
```

### SELinux/AppArmor (Ubuntu)

For Ubuntu with AppArmor:

```bash
# Create AppArmor profile
sudo nano /etc/apparmor.d/opt.server-mcp.dist.index
```

```
#include <tunables/global>

/opt/server-mcp/dist/index.js {
  #include <abstractions/base>
  #include <abstractions/nameservice>

  capability setuid,
  capability setgid,
  capability dac_override,

  /opt/server-mcp/** r,
  /opt/server-mcp/dist/** r,
  /var/lib/server-mcp/** rw,
  /var/log/server-mcp/** rw,
  /var/backups/server-mcp/** rw,
  /etc/server-mcp/** r,

  /usr/bin/node ix,
  /usr/bin/systemctl rix,
  /usr/bin/pg_dump rix,
  /usr/bin/docker rix,

  deny /proc/sys/kernel/** w,
  deny /sys/kernel/** w,
}
```

```bash
# Load profile
sudo apparmor_parser -r /etc/apparmor.d/opt.server-mcp.dist.index
sudo aa-enforce /opt/server-mcp/dist/index.js
```

---

## Systemd Security Features

The provided `systemd/server-mcp.service` includes extensive hardening:

### Security Directives Explained

```ini
[Service]
# Prevent privilege escalation
NoNewPrivileges=true

# Isolate /tmp
PrivateTmp=true

# Read-only root filesystem (with specific write paths)
ProtectSystem=strict
ReadWritePaths=/opt/server-mcp /var/log/server-mcp /var/backups/server-mcp

# Hide /home directories
ProtectHome=true

# Protect kernel from modification
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Restrict network protocols
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

# Prevent namespace creation
RestrictNamespaces=true

# No realtime scheduling
RestrictRealtime=true

# Prevent SUID/SGID bits
RestrictSUIDSGID=true

# Lock personality (prevent architecture changes)
LockPersonality=true

# System call filtering
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources
```

### Verify Security Features

```bash
# Check systemd security analysis
sudo systemd-analyze security server-mcp.service

# Should show score < 5.0 (lower is better)
```

---

## Monitoring & Audit Trail

### Audit Logging

Enable audit logging for all sudo commands:

```bash
# Edit /etc/audit/rules.d/server-mcp.rules
-w /usr/bin/sudo -p x -k sudo_execution
-w /usr/bin/systemctl -p x -k systemctl_execution
-w /usr/bin/pg_dump -p x -k backup_execution

# Reload audit rules
sudo augenrules --load
```

### Log Aggregation

SERVER-MCP logs to systemd journal:

```bash
# Real-time monitoring
sudo journalctl -u server-mcp -f

# Filter by priority
sudo journalctl -u server-mcp -p err -f

# Export logs to persistent storage
sudo journalctl -u server-mcp -o json > /var/log/server-mcp/journal-export.json
```

### Intrusion Detection

Install and configure AIDE (Advanced Intrusion Detection Environment):

```bash
# Install AIDE
sudo apt install aide

# Initialize database
sudo aideinit

# Add SERVER-MCP to monitored paths
echo "/opt/server-mcp R" | sudo tee -a /etc/aide/aide.conf
echo "/etc/server-mcp R" | sudo tee -a /etc/aide/aide.conf

# Run daily checks
sudo crontab -e
# Add: 0 4 * * * /usr/bin/aide --check | mail -s "AIDE Report" admin@example.com
```

---

## Security Checklist

Before deploying to production, verify:

- [ ] Service user created with no login shell
- [ ] Sudoers configured with minimal specific commands
- [ ] Secrets stored in systemd credentials or encrypted .env
- [ ] Firewall configured (UFW or iptables)
- [ ] PostgreSQL bound to localhost only
- [ ] Redis protected mode enabled with password
- [ ] File permissions set correctly (750 for dirs, 640 for config)
- [ ] Systemd service file includes all security directives
- [ ] AppArmor/SELinux profile created and enforced
- [ ] Audit logging enabled for sudo commands
- [ ] Log aggregation configured (journald + external)
- [ ] AIDE or similar IDS installed
- [ ] Regular security updates enabled (`unattended-upgrades`)
- [ ] SSH key-only authentication (password auth disabled)
- [ ] fail2ban configured for SSH brute-force protection

---

## Incident Response

### If Compromise is Suspected

1. **Isolate the system**:

   ```bash
   sudo systemctl stop server-mcp
   sudo ufw deny from any
   ```

2. **Collect forensics**:

   ```bash
   sudo journalctl -u server-mcp --no-pager > /tmp/server-mcp-logs.txt
   sudo last -f /var/log/wtmp > /tmp/login-history.txt
   sudo ausearch -k sudo_execution > /tmp/sudo-audit.txt
   ```

3. **Revoke credentials**:
   - Rotate all database passwords
   - Regenerate Keycloak client secrets
   - Invalidate JWT tokens in Keycloak

4. **Restore from backup**:
   ```bash
   sudo systemctl stop server-mcp
   sudo rm -rf /opt/server-mcp
   sudo tar -xzf /var/backups/server-mcp-YYYYMMDD.tar.gz -C /opt
   sudo systemctl start server-mcp
   ```

---

## References

- [systemd Security Features](https://www.freedesktop.org/software/systemd/man/systemd.exec.html#Security)
- [Ubuntu Server Security Guide](https://ubuntu.com/server/docs/security-introduction)
- [PostgreSQL Security Best Practices](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html)
- [Redis Security Guide](https://redis.io/topics/security)

---

**Last Updated**: November 2025
**Maintainer**: SERVER-MCP Team
