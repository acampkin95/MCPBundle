# Claude Agent Prompts - Complete 3-VM Infrastructure Deployment

## 27 Specialized Agents Across 6 Phases

**Target Infrastructure:**

- **VMI01** (46.250.243.123): Dev Server + PostgreSQL + MCP Bundle
- **VMI02D** (46.250.241.70): Storage Server (NextCloud + Plex)
- **VMI03** (154.26.158.31): Security Gateway (WireGuard + Keycloak + pfSense)

**Deployment Strategy:** Parallel execution where possible to minimize deployment time

**Estimated Total Time:** 15-18 hours (with parallel agents)

---

## 📋 Quick Reference: Agent Execution Order

| Phase   | Agents | Parallel Group          | Dependencies     |
| ------- | ------ | ----------------------- | ---------------- |
| Phase 1 | 1-6    | Groups 1-2 (6 parallel) | None             |
| Phase 2 | 7-10   | Groups 3-4 (4 parallel) | Phase 1 complete |
| Phase 3 | 11-13  | Group 5 (3 parallel)    | Phase 2 complete |
| Phase 4 | 14-18  | Groups 6-7 (5 parallel) | Phase 3 complete |
| Phase 5 | 19-24  | Groups 8-9 (6 parallel) | Phase 4 complete |
| Phase 6 | 25-27  | Sequential              | Phase 5 complete |

---

# PHASE 1: Base Infrastructure & Security Foundation

## ⏱️ Duration: 2-3 hours | 🔄 Parallel: 6 agents simultaneously

### Parallel Group 1: System Hardening (Run agents 1-3 simultaneously)

---

## 🤖 Agent 1: VMI01-Hardening-Agent

**Role:** security-pro:security-auditor
**Target:** VMI01 (46.250.243.123)
**Duration:** ~45 minutes

```
You are the security hardening specialist for VMI01 (Dev Server). Your mission is to transform this fresh Ubuntu system into a hardened, production-ready server following NIST and CIS benchmarks.

**Server Details:**
- Host: 46.250.243.123
- Hostname: ACDEV-VMI01
- OS: Ubuntu 24.04 LTS
- Role: Development Server + PostgreSQL + MCP Bundle

**Tasks to Complete:**

1. **SSH Key Deployment**
   - Create user: `dev-admin` with sudo privileges
   - Copy public key from: `/Users/alex/Projects/MCP Bundle/deployment/keys/dev-admin_id_ed25519.pub`
   - Set up authorized_keys for dev-admin
   - Test SSH key authentication

2. **Restricted User Creation**
   - Create user: `AccessService`
   - Password: ``
   - Home directory: `/home/AccessService` (restricted permissions)
   - Shell: `/bin/rbash` (restricted bash)
   - No sudo privileges
   - Cannot view /etc configs
   - Cannot change settings

3. **System Updates & Security**
   - Update package lists: `apt update`
   - Upgrade all packages: `apt upgrade -y`
   - Install security tools: fail2ban, ufw, unattended-upgrades, auditd
   - Enable automatic security updates
   - Configure apt to only auto-install security patches

4. **UFW Firewall Configuration**
   - Enable UFW
   - Default deny incoming, allow outgoing
   - Allow SSH (port 22) from anywhere (will be restricted later via WireGuard)
   - Allow PostgreSQL (5432) from VMI02D (46.250.241.70) and VMI03 (154.26.158.31)
   - Allow Redis (6379) from localhost only
   - Allow HTTP/HTTPS (80, 443) for future NGINX
   - Allow RSync (873) from LAN subnet

5. **SSH Hardening**
   - Edit /etc/ssh/sshd_config:
     - PasswordAuthentication no
     - PermitRootLogin prohibit-password
     - PubkeyAuthentication yes
     - Port 22 (keep standard for now)
     - MaxAuthTries 3
     - LoginGraceTime 30
   - Restart SSH service
   - Verify SSH still works with keys BEFORE closing session

6. **Fail2Ban Configuration**
   - Enable sshd jail
   - Set ban time: 1 hour
   - Max retry: 3 attempts
   - Find time: 10 minutes
   - Whitelist: localhost, LAN subnet
   - Start and enable fail2ban

7. **Audit Logging**
   - Install and enable auditd
   - Configure audit rules for:
     - /etc/passwd, /etc/shadow modifications
     - sudo command execution
     - Network configuration changes
   - Ensure audit logs are rotated

8. **Security Hardening Checklist**
   - Disable unnecessary services
   - Set correct file permissions on /etc/ssh
   - Configure /etc/security/limits.conf
   - Enable kernel security features (ASLR, etc.)
   - Configure sysctl for network security

**Validation:**
- SSH works with dev-admin key
- AccessService user can SSH but cannot sudo
- UFW is active with correct rules
- Fail2Ban is running
- Security updates are automatic
- No password authentication allowed

**Output Required:**
- Summary report of all changes made
- List of enabled firewall rules
- Fail2Ban status and active jails
- Security audit score (your assessment)
- Any warnings or issues encountered

**IMPORTANT SAFETY:**
- Test SSH key auth BEFORE disabling password auth
- Keep current root session open while testing
- Document all changes in /var/log/hardening.log
```

---

## 🤖 Agent 2: VMI02D-Hardening-Agent

**Role:** security-pro:security-auditor
**Target:** VMI02D (46.250.241.70)
**Duration:** ~45 minutes

```
You are the security hardening specialist for VMI02D (Storage Server). This server will host NextCloud and Plex, requires storage optimization and AppArmor protection.

**Server Details:**
- Host: 46.250.241.70
- Hostname: ACDEV-VMI02D
- OS: Ubuntu 24.04 LTS
- Role: Storage Server (NextCloud + Plex - both disabled by default)
- Storage: 968GB available

**Tasks to Complete:**

1. **SSH Key Deployment**
   - Create user: `data-admin` with sudo privileges
   - Copy public key from: `/Users/alex/Projects/MCP Bundle/deployment/keys/data-admin_id_ed25519.pub`
   - Set up authorized_keys for data-admin
   - Test SSH key authentication

2. **Restricted User Creation**
   - Create user: `AccessService`
   - Password: ``
   - Restricted shell and permissions (same as VMI01)
   - No sudo, no config access

3. **System Updates & Storage Optimization**
   - Update and upgrade all packages
   - Install: fail2ban, ufw, smartmontools, lvm2
   - Enable SMART monitoring for disk health
   - Configure automatic SMART checks
   - Set up storage monitoring alerts

4. **UFW Firewall Configuration**
   - Default deny incoming, allow outgoing
   - Allow SSH (22) from anywhere initially
   - Prepare for NextCloud (ports 80, 443) - don't open yet
   - Prepare for Plex (32400) - don't open yet
   - Allow RSync (873) from VMI01 and VMI03
   - Allow SMB/NFS if needed later (document, don't enable)

5. **SSH Hardening** (same as VMI01)
   - Disable password authentication
   - Limit root login
   - Configure security settings

6. **Fail2Ban Configuration**
   - SSH jail
   - Prepare NextCloud jail (for later)
   - Aggressive ban settings due to storage sensitivity

7. **AppArmor Configuration**
   - Verify AppArmor is enabled
   - Create profiles for:
     - /var/www/nextcloud (prepare for future)
     - /opt/plexmediaserver (prepare for future)
   - Set to enforce mode
   - Test profile loading

8. **Storage Security**
   - Set restrictive permissions on storage directories
   - Create encrypted backup location
   - Configure filesystem ACLs
   - Set up quota management (if needed)

**Validation:**
- SSH works with data-admin key
- Storage health monitoring active
- AppArmor profiles loaded
- UFW configured correctly
- Disk monitoring alerts working

**Output Required:**
- Security hardening report
- Storage health status
- AppArmor profile list
- Firewall rules
- Recommendations for NextCloud/Plex security
```

---

## 🤖 Agent 3: VMI03-Hardening-Agent

**Role:** security-pro:security-auditor
**Target:** VMI03 (154.26.158.31)
**Duration:** ~45 minutes

```
You are the security hardening specialist for VMI03 (Security Gateway). This is the MOST CRITICAL server - it will protect all other infrastructure. Maximum security required.

**Server Details:**
- Host: 154.26.158.31
- Hostname: ACDEV-VMI03
- OS: Ubuntu 24.04 LTS
- Role: Security Gateway (WireGuard + Keycloak + pfSense + Pi-Hole + IDS/IPS)

**Tasks to Complete:**

1. **SSH Key Deployment**
   - Create user: `sec-admin` with sudo privileges
   - Copy public key from: `/Users/alex/Projects/MCP Bundle/deployment/keys/sec-admin_id_ed25519.pub`
   - Set up authorized_keys for sec-admin
   - Test SSH key authentication

2. **Restricted User Creation**
   - Create user: `AccessService`
   - Password: ``
   - Heavily restricted (more than other servers)
   - Chroot jail environment
   - Audit all AccessService actions

3. **System Updates & Gateway Preparation**
   - Update and upgrade all packages
   - Install: fail2ban, ufw, iptables-persistent, nftables, tcpdump
   - Install IDS tools: snort or suricata (prepare for later config)
   - Install network tools: wireguard-tools, iptraf-ng, nethogs

4. **Advanced Firewall Configuration**
   - UFW for basic rules
   - iptables for advanced rules
   - Default DROP all incoming
   - Default ACCEPT outgoing (with restrictions)
   - Allow SSH (22) from anywhere initially
   - Prepare WireGuard ports (51820, 51821, 51822)
   - Prepare Keycloak (8080, 8443)
   - Enable IP forwarding: `net.ipv4.ip_forward=1`
   - Enable NAT for VPN clients

5. **SSH Super-Hardening**
   - Disable password auth
   - Root login ONLY from WireGuard IPs (will configure later)
   - Change SSH port to 2222 (keep 22 for now)
   - Two-factor authentication prep
   - SSH login alerts via email

6. **Fail2Ban Advanced Configuration**
   - Multiple jails: SSH, Nginx, Keycloak
   - Pentanet blocking rules
   - Aggressive ban: 3 attempts = 24 hour ban
   - Ban notification emails

7. **Network Security**
   - Enable syncookies
   - Disable ICMP redirects
   - Enable reverse path filtering
   - Disable source routing
   - Configure conntrack for connection tracking

8. **IDS/IPS Preparation**
   - Install Suricata
   - Download threat intelligence feeds
   - Configure basic ruleset
   - Enable logging to /var/log/suricata/
   - Don't start yet (will configure in Phase 4)

9. **Pentanet Blocking**
   - Create iptables rule to DROP all connections from:
     - Hostnames containing "penta.net.au" or "pentanet.com.au"
   - Block based on reverse DNS lookup
   - Allow exception: alex.campkin@*

**Validation:**
- SSH works with sec-admin key
- IP forwarding enabled
- IDS tools installed
- Firewall rules correct
- Pentanet blocking active
- Network security kernel parameters set

**Output Required:**
- Security hardening report (8/10 or higher)
- Network configuration summary
- Firewall rules export
- IDS readiness check
- Security recommendations for Phase 4
```

---

### Parallel Group 2: Monitoring Foundation (Run agents 4-6 simultaneously)

---

## 🤖 Agent 4: VMI01-Monitoring-Setup

**Role:** devops-automation:cloud-architect
**Target:** VMI01 (46.250.243.123)
**Duration:** ~30 minutes

```
Set up comprehensive monitoring foundation for VMI01 (Dev Server). This server runs critical MCP infrastructure and PostgreSQL.

**Tasks:**

1. **PM2 Installation & Configuration**
   - Install PM2 globally: `npm install -g pm2`
   - Configure PM2 startup: `pm2 startup systemd`
   - Create PM2 ecosystem config at: `/opt/mcp/pm2.ecosystem.config.js`
   - Prepare for: MCP-Orchestrator, Perplexity-MCP, IT-MCP services

2. **Node Exporter (Prometheus)**
   - Install Node Exporter for Prometheus metrics
   - Configure to export system metrics on port 9100
   - Create systemd service
   - Enable and start service

3. **Log Aggregation Prep**
   - Install rsyslog
   - Configure centralized logging to /var/log/mcp/
   - Create log rotation config (weekly, keep 4 weeks)
   - Set up JSON structured logging

4. **Health Check Scripts**
   - Create `/opt/mcp/scripts/health-check.sh`:
     - Check PostgreSQL status
     - Check Redis status
     - Check disk space (alert if >85%)
     - Check memory usage (alert if >90%)
     - Check CPU load (alert if 5-min load >4.0)
   - Make executable
   - Add to cron: every 5 minutes

5. **Alert Script**
   - Create `/opt/mcp/scripts/send-alert.sh`
   - Configure to send emails to: acampkinpersonnal@gmail.com
   - Test email sending works
   - Create alert templates

**Output:** Monitoring status report + health check test results
```

---

## 🤖 Agent 5: VMI02D-Monitoring-Setup

**Role:** devops-automation:cloud-architect
**Target:** VMI02D (46.250.241.70)
**Duration:** ~30 minutes

```
Set up storage-focused monitoring for VMI02D. Storage health and capacity monitoring is CRITICAL.

**Tasks:**

1. **Storage Monitoring Tools**
   - Install: smartmontools, lvm2, sysstat
   - Configure SMART checks every 6 hours
   - Enable smartd daemon with email alerts

2. **Disk Health Monitoring**
   - Create `/opt/storage/scripts/disk-health.sh`:
     - Run SMART tests
     - Check for bad sectors
     - Check disk temperature
     - Alert if any issues
   - Add to cron: every 6 hours

3. **Capacity Monitoring**
   - Create `/opt/storage/scripts/capacity-check.sh`:
     - Check all mount points
     - Alert if any >85% full
     - Predict days until full based on growth rate
     - Log capacity trends

4. **Backup Verification**
   - Create `/opt/storage/scripts/verify-backups.sh`:
     - Check last backup timestamp
     - Verify backup integrity
     - Alert if backups older than 25 hours

5. **Service Monitoring (NextCloud/Plex)**
   - Create service check scripts (even though disabled)
   - Monitor ports 80, 443, 32400 (should be closed)
   - Alert if services start unexpectedly

**Output:** Storage monitoring report + SMART test results
```

---

## 🤖 Agent 6: VMI03-Monitoring-Setup

**Role:** security-pro:incident-responder
**Target:** VMI03 (154.26.158.31)
**Duration:** ~30 minutes

```
Set up security-focused monitoring for VMI03 (Security Gateway). Network traffic analysis and VPN monitoring.

**Tasks:**

1. **Network Monitoring Tools**
   - Install: iftop, iptraf-ng, nethogs, vnstat
   - Configure vnstat for bandwidth tracking
   - Set up network statistics database

2. **Traffic Analysis Preparation**
   - Install tcpdump
   - Create `/opt/security/scripts/traffic-analysis.sh`:
     - Monitor unusual traffic patterns
     - Detect port scans
     - Log connection attempts
     - Track bandwidth by service

3. **Security Monitoring Framework**
   - Install: aide (file integrity monitoring)
   - Initialize AIDE database
   - Create integrity check cron job (daily)

4. **VPN Connection Tracking**
   - Create `/opt/security/scripts/vpn-monitor.sh`:
     - Track active WireGuard connections (when configured)
     - Log connection/disconnection events
     - Monitor VPN bandwidth usage
     - Alert on connection failures

5. **Failed Login Monitoring**
   - Create `/opt/security/scripts/auth-monitor.sh`:
     - Parse /var/log/auth.log
     - Detect brute force attempts
     - Alert on Pentanet connection attempts
     - Track successful/failed logins

6. **IDS Log Monitoring**
   - Prepare Suricata log parsing
   - Create alert triggers for critical events
   - Set up log rotation

**Output:** Security monitoring status + network baseline
```

---

# PHASE 2: Core Services Deployment

## ⏱️ Duration: 3-4 hours | 🔄 Parallel: 4 agents simultaneously

### Parallel Group 3: Database & Caching (Run agents 7-8 simultaneously)

---

## 🤖 Agent 7: PostgreSQL-Deployment-Agent

**Role:** supabase-toolkit:data-engineer
**Target:** VMI01 (46.250.243.123)
**Duration:** ~90 minutes

````
Deploy and optimize PostgreSQL 16 for the MCP Ecosystem. The schema is ALREADY deployed (from previous work), but you need to verify, optimize, and configure remote access.

**Background:**
The `mcp_ecosystem` database exists on VMI01 with full schema (97 indexes, 16 tables, 3 partitioned tables, 5 triggers, 49 functions). Credentials:
- User: mcp_admin
- Password:
- Database: mcp_ecosystem

**Tasks:**

1. **PostgreSQL Status Verification**
   - Verify PostgreSQL 16 is installed and running
   - Check database `mcp_ecosystem` exists
   - Verify all tables are present (should be 16 core + partitions)
   - Run: `SELECT count(*) FROM pg_tables WHERE schemaname='public';`

2. **Performance Tuning**
   - Edit /etc/postgresql/16/main/postgresql.conf:
     - shared_buffers = 2GB (adjust based on available RAM)
     - effective_cache_size = 6GB
     - maintenance_work_mem = 512MB
     - checkpoint_completion_target = 0.9
     - wal_buffers = 16MB
     - default_statistics_target = 100
     - random_page_cost = 1.1 (for SSD)
     - effective_io_concurrency = 200
     - work_mem = 64MB
     - max_connections = 100

3. **Remote Access Configuration**
   - Edit /etc/postgresql/16/main/postgresql.conf:
     - listen_addresses = '*'
   - Edit /etc/postgresql/16/main/pg_hba.conf:
     - Add: `host mcp_ecosystem mcp_admin 46.250.241.70/32 scram-sha-256`
     - Add: `host mcp_ecosystem mcp_admin 154.26.158.31/32 scram-sha-256`
     - Add: `host mcp_ecosystem mcp_agent 0.0.0.0/0 scram-sha-256` (for distributed agents)
   - Restart PostgreSQL

4. **Backup Configuration**
   - Create backup directory: /var/backups/postgresql/
   - Create backup script: /opt/mcp/scripts/postgres-backup.sh
   - Add to cron: daily at 2 AM
   - Test backup works: `pg_dump -U mcp_admin -d mcp_ecosystem -Fc -f /tmp/test_backup.dump`
   - Verify restore: `pg_restore --list /tmp/test_backup.dump`

5. **Partition Management**
   - Check existing partitions:
     ```sql
     SELECT tablename FROM pg_tables
     WHERE tablename LIKE '%_2025_%' OR tablename LIKE '%_2026_%'
     ORDER BY tablename;
     ```
   - Create January 2026 partitions (if not exists):
     - agent_heartbeats_2026_01
     - audit_log_2026_01
     - system_metrics_2026_01

6. **Database Validation**
   - Run diagnostic queries:
     ```sql
     -- Check all functions exist
     SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace;

     -- Test get_least_loaded_agent function
     SELECT get_least_loaded_agent(ARRAY['postgres-admin']);

     -- Check indexes
     SELECT count(*) FROM pg_indexes WHERE schemaname = 'public';

     -- Verify triggers
     SELECT count(*) FROM pg_trigger WHERE tgisinternal = false;
     ```

7. **Security Hardening**
   - Ensure password encryption is scram-sha-256
   - Create read-only role if not exists
   - Verify SSL is enabled
   - Configure connection limits per role

8. **Monitoring Setup**
   - Enable pg_stat_statements extension
   - Configure slow query logging (>100ms)
   - Set up connection pooling prep (PgBouncer consideration)

**Validation:**
- Remote connection works from VMI02D and VMI03
- Backups run successfully
- Performance tuning applied
- All schema objects present
- Partitions created for 2026

**Output:**
- PostgreSQL configuration report
- Backup test results
- Schema validation report
- Performance baseline metrics
````

---

## 🤖 Agent 8: Redis-Deployment-Agent

**Role:** devops-automation:cloud-architect
**Target:** VMI01 (46.250.243.123)
**Duration:** ~45 minutes

```
Deploy and configure Redis 7 for MCP workload: caching, pub/sub, and command queue.

**Tasks:**

1. **Redis Installation**
   - Install Redis 7: `apt install redis-server -y`
   - Verify version: `redis-server --version`

2. **Redis Configuration**
   - Edit /etc/redis/redis.conf:
     - bind 127.0.0.1 ::1 (localhost only for security)
     - port 6379
     - requirepass <generate strong password>
     - maxmemory 2gb
     - maxmemory-policy allkeys-lru
     - save 900 1
     - save 300 10
     - save 60 10000
     - appendonly yes
     - appendfsync everysec

3. **Persistence Configuration**
   - Enable both RDB and AOF
   - Configure AOF rewrite settings
   - Set up backup for RDB and AOF files

4. **Performance Tuning**
   - Disable transparent huge pages
   - Set vm.overcommit_memory = 1 in /etc/sysctl.conf
   - Configure somaxconn
   - Optimize kernel parameters

5. **Security**
   - Generate strong Redis password
   - Save to: /opt/mcp/credentials/redis-password.txt
   - Set file permissions: 600, owner root
   - Configure Redis to rename dangerous commands:
     - FLUSHDB → FLUSH_DB_DANGEROUS
     - FLUSHALL → FLUSH_ALL_DANGEROUS
     - KEYS → KEYS_DANGEROUS

6. **Monitoring**
   - Enable Redis slow log
   - Configure monitoring with redis-cli --stat
   - Create health check script
   - Test: `redis-cli -a <password> ping` → Should return PONG

7. **Backup Strategy**
   - Create backup script for RDB and AOF
   - Schedule backups
   - Test restore procedure

**Validation:**
- Redis is running
- Password authentication works
- Persistence enabled (both RDB and AOF)
- Memory limits set
- Backups configured

**Output:**
- Redis configuration summary
- Password stored securely
- Performance baseline
- Backup test results
```

---

### Parallel Group 4: Storage Services (Run agents 9-10 simultaneously)

---

## 🤖 Agent 9: NextCloud-Deployment-Agent

**Role:** nextjs-vercel-pro:fullstack-developer
**Target:** VMI02D (46.250.241.70)
**Duration:** ~90 minutes

````
Install NextCloud on VMI02D but keep it DISABLED by default. Prepare for future activation with all security measures in place.

**IMPORTANT:** NextCloud should be installed but NOT started. Create control scripts to enable/disable easily.

**Tasks:**

1. **Prerequisites Installation**
   - Install Apache2 or Nginx (recommend Nginx)
   - Install PHP 8.2 and required extensions:
     - php-fpm, php-mysql, php-gd, php-curl, php-zip
     - php-xml, php-mbstring, php-intl, php-bcmath, php-gmp
   - Install MariaDB or use PostgreSQL from VMI01
   - Install Redis (local instance for NextCloud caching)

2. **NextCloud Installation**
   - Download latest NextCloud (version 28+)
   - Extract to: /var/www/nextcloud
   - Set correct permissions:
     - Owner: www-data:www-data
     - Directories: 750
     - Files: 640

3. **Database Setup**
   - Option A: Local MariaDB instance for NextCloud
   - Option B: Remote PostgreSQL on VMI01 (recommended)
   - Create database: nextcloud
   - Create user: nextcloud_user with strong password

4. **NextCloud Configuration**
   - Run installation wizard (CLI):
     ```bash
     sudo -u www-data php occ maintenance:install \
       --database="pgsql" \
       --database-host="46.250.243.123" \
       --database-name="nextcloud" \
       --database-user="nextcloud_user" \
       --database-pass="<password>" \
       --admin-user="admin" \
       --admin-pass="<strong password>" \
       --data-dir="/var/www/nextcloud/data"
     ```

5. **Security Hardening**
   - Configure config.php:
     - Set trusted_domains
     - Enable HTTPS only
     - Configure Redis for file locking and caching
     - Set strong session timeout
   - Create .htaccess rules
   - Configure HSTS headers

6. **Service Control Scripts**
   - Create `/opt/nextcloud/enable-nextcloud.sh`:
     - Start nginx/apache
     - Start php-fpm
     - Open firewall ports 80, 443
     - Enable systemd services
   - Create `/opt/nextcloud/disable-nextcloud.sh`:
     - Stop nginx/apache
     - Stop php-fpm
     - Close firewall ports
     - Disable systemd services
   - Make both executable
   - **RUN disable-nextcloud.sh to ensure it's off**

7. **SSL/TLS Preparation**
   - Generate self-signed certificate (for now)
   - Prepare for Let's Encrypt (certbot) later
   - Configure Nginx for HTTPS

8. **Backup Configuration**
   - Create NextCloud backup script
   - Backup: database, data directory, config
   - Test backup and restore

**Validation:**
- NextCloud is installed but NOT running
- Services are disabled
- Firewall ports are CLOSED
- Control scripts work
- Database connection tested

**Output:**
- NextCloud installation report
- Control script locations
- Admin credentials (secure storage)
- Future activation instructions
````

---

## 🤖 Agent 10: Plex-Deployment-Agent

**Role:** devops-automation:cloud-architect
**Target:** VMI02D (46.250.241.70)
**Duration:** ~60 minutes

````
Install Plex Media Server on VMI02D but keep it DISABLED. Prepare for future media library management.

**IMPORTANT:** Plex should be installed but NOT started. Create control scripts for easy enable/disable.

**Tasks:**

1. **Plex Installation**
   - Add Plex repository:
     ```bash
     curl https://downloads.plex.tv/plex-keys/PlexSign.key | sudo apt-key add -
     echo "deb https://downloads.plex.tv/repo/deb public main" | sudo tee /etc/apt/sources.list.d/plexmediaserver.list
     ```
   - Install: `apt update && apt install plexmediaserver -y`

2. **Plex Configuration**
   - Create media directories:
     - /media/movies
     - /media/tv
     - /media/music
   - Set permissions: plex:plex
   - Configure Plex to use these directories

3. **Network Configuration**
   - Plex uses port 32400
   - Configure to bind to localhost only (initially)
   - Prepare for LAN-only access (future)

4. **Service Control Scripts**
   - Create `/opt/plex/enable-plex.sh`:
     - Start plexmediaserver service
     - Open firewall port 32400 (LAN only)
     - Enable systemd service
   - Create `/opt/plex/disable-plex.sh`:
     - Stop plexmediaserver service
     - Close firewall port
     - Disable systemd service
   - **RUN disable-plex.sh immediately**

5. **Security Configuration**
   - Disable remote access (Plex.tv)
   - Configure LAN-only mode
   - Set up Plex authentication
   - Restrict to specific networks

6. **Hardware Transcoding**
   - Check for GPU availability
   - Configure hardware acceleration if available
   - Test transcoding capabilities

7. **Backup Configuration**
   - Backup Plex database: /var/lib/plexmediaserver/Library/Application Support/Plex Media Server/
   - Create backup script
   - Schedule automatic backups

**Validation:**
- Plex is installed but NOT running
- Service is disabled
- Port 32400 is CLOSED
- Control scripts work
- Media directories created

**Output:**
- Plex installation report
- Control script locations
- Configuration summary
- Security settings documented
````

---

# PHASE 3: MCP Ecosystem Integration

## ⏱️ Duration: 2-3 hours | 🔄 Parallel: 3 agents simultaneously

### Parallel Group 5: MCP Services (Run agents 11-13 simultaneously)

---

## 🤖 Agent 11: MCP-Orchestrator-Deployment

**Role:** mcp-architect
**Target:** VMI01 (46.250.243.123)
**Duration:** ~60 minutes

````
Deploy MCP-Orchestrator from the release_dev directory. This is the central command orchestration service.

**Source Code:** /Users/alex/Projects/MCP Bundle/release_dev/mcp-orchestrator/

**Tasks:**

1. **Code Deployment**
   - Copy MCP-Orchestrator code to: /opt/mcp-orchestrator/
   - Set ownership: mcp-orchestrator:mcp-orchestrator (create user if needed)
   - Install dependencies: `cd /opt/mcp-orchestrator && npm install --production`

2. **Environment Configuration**
   - Create /opt/mcp-orchestrator/.env:
     ```env
     POSTGRES_CONNECTION_STRING=postgresql://mcp_admin:@localhost:5432/mcp_ecosystem
     REDIS_URL=redis://<password>@localhost:6379
     KEYCLOAK_SERVER_URL=https://auth.acdev.host:8080
     KEYCLOAK_REALM=mcp-ecosystem
     KEYCLOAK_CLIENT_ID=mcp-orchestrator
     KEYCLOAK_CLIENT_SECRET=<to be configured in Phase 4>
     SERVER_MCP_ID=vmi01.acdev.host
     SERVER_MCP_PORT=9090
     LOG_LEVEL=info
     NODE_ENV=production
     ```

3. **Build Application**
   - Run build if needed: `npm run build`
   - Verify compiled files exist

4. **Systemd Service**
   - Create /etc/systemd/system/mcp-orchestrator.service:
     ```ini
     [Unit]
     Description=MCP Orchestrator Service
     After=network.target postgresql.service redis.service

     [Service]
     Type=simple
     User=mcp-orchestrator
     WorkingDirectory=/opt/mcp-orchestrator
     ExecStart=/usr/bin/node dist/index.js
     Restart=always
     RestartSec=10
     Environment=NODE_ENV=production

     [Install]
     WantedBy=multi-user.target
     ```
   - Reload systemd: `systemctl daemon-reload`
   - Enable: `systemctl enable mcp-orchestrator`
   - **Don't start yet** (wait for Keycloak in Phase 4)

5. **Health Check Endpoint**
   - Verify health endpoint will be available at: http://localhost:9090/health
   - Create monitoring script
   - Add to system monitoring

6. **Database Registration**
   - Register orchestrator as an agent in mcp_agents table:
     ```sql
     INSERT INTO mcp_agents (agent_id, agent_name, agent_type, capabilities, hostname, ip_address, status)
     VALUES ('orchestrator-vmi01', 'MCP Orchestrator VMI01', 'orchestrator',
             ARRAY['command-dispatch', 'agent-management', 'policy-enforcement'],
             'vmi01.acdev.host', '46.250.243.123'::inet, 'online');
     ```

**Validation:**
- Code deployed correctly
- Dependencies installed
- Systemd service created (but not started)
- Database connection string correct
- Health check endpoint prepared

**Output:**
- Deployment report
- Service status
- Configuration summary
````

---

## 🤖 Agent 12: Perplexity-MCP-Deployment

**Role:** mcp-architect
**Target:** VMI01 (46.250.243.123)
**Duration:** ~60 minutes

````
Deploy Perplexity-MCP from release_dev directory. This provides business intelligence and research via Perplexity API.

**Source Code:** /Users/alex/Projects/MCP Bundle/release_dev/perplexity-mcp/

**Tasks:**

1. **Code Deployment**
   - Copy Perplexity-MCP code to: /opt/perplexity-mcp/
   - Set ownership: perplexity-mcp:perplexity-mcp (create user)
   - Install dependencies: `npm install --production`

2. **API Key Configuration**
   - **IMPORTANT:** You need to provide the Perplexity API key
   - Get from: https://perplexity.ai/settings/api
   - Store securely in: /opt/mcp/credentials/perplexity-api-key.txt

3. **Environment Configuration**
   - Create /opt/perplexity-mcp/.env:
     ```env
     PERPLEXITY_API_KEY=pplx-<YOUR_KEY>
     DATABASE_URL=postgresql://mcp_admin:@localhost:5432/mcp_ecosystem
     MCP_MODE=acdev
     REDIS_URL=redis://<password>@localhost:6379
     KEYCLOAK_URL=https://auth.acdev.host:8080/auth
     KEYCLOAK_REALM=mcp-ecosystem
     KEYCLOAK_CLIENT_ID=perplexity-mcp-server
     KEYCLOAK_CLIENT_SECRET=<to be configured in Phase 4>
     RBAC_ENABLED=true
     LOG_LEVEL=info
     NODE_ENV=production
     DAILY_AUTO_APPROVAL_USD=1.00
     WEEKLY_BUDGET_USD=8.00
     ```

4. **Build Application**
   - Build if needed: `npm run build`
   - Verify dist/ directory

5. **Systemd Service**
   - Create /etc/systemd/system/perplexity-mcp.service
   - Configure to run on stdio (for MCP protocol)
   - Auto-restart on failure
   - Enable but don't start yet

6. **Budget Limits Configuration**
   - Verify budget limits in .env
   - Create budget tracking in database
   - Set up cost alerts

7. **Database Registration**
   - Register Perplexity-MCP as agent:
     ```sql
     INSERT INTO mcp_agents (agent_id, agent_name, agent_type, capabilities, hostname, status)
     VALUES ('perplexity-mcp-vmi01', 'Perplexity MCP VMI01', 'mcp-server',
             ARRAY['web-search', 'research', 'business-intelligence'],
             'vmi01.acdev.host', 'online');
     ```

**Validation:**
- Code deployed
- API key configured
- Budget limits set
- Service created (not started)
- Database registration successful

**Output:**
- Deployment report
- API connectivity test
- Budget configuration
- Service status
````

---

## 🤖 Agent 13: IT-MCP-Deployment

**Role:** mcp-architect
**Target:** VMI01 (46.250.243.123)
**Duration:** ~45 minutes

````
Deploy IT-MCP (ITJSST-MCP) server instance for cross-platform diagnostics on VMI01.

**Source Code:** /Users/alex/Projects/MCP Bundle/release_dev/itjsst-mcp/

**Tasks:**

1. **Code Deployment**
   - Copy IT-MCP code to: /opt/it-mcp/
   - Set ownership: it-mcp:it-mcp
   - Install dependencies: `npm install --production`

2. **Environment Configuration**
   - Create /opt/it-mcp/.env:
     ```env
     IT_MCP_ALLOW_SUDO=true
     IT_MCP_LOG_LEVEL=info
     IT_MCP_CAPTURE_DIR=/var/log/it-mcp/captures
     POSTGRES_URL=postgresql://mcp_admin:@localhost:5432/mcp_ecosystem
     IT_MCP_REGISTRY_URL=http://localhost:9090/api/v1
     IT_MCP_SERVER_ID=vmi01-server
     KEYCLOAK_SERVER_URL=https://auth.acdev.host:8080
     KEYCLOAK_REALM=mcp-ecosystem
     KEYCLOAK_CLIENT_ID=it-mcp-server
     KEYCLOAK_CLIENT_SECRET=<to be configured>
     ```

3. **Build Application**
   - Build: `npm run build`
   - Verify tools are compiled

4. **Systemd Service**
   - Create service file
   - Configure stdio mode
   - Enable but don't start

5. **Capability Registration**
   - Register IT-MCP capabilities in database:
     ```sql
     INSERT INTO mcp_agents (agent_id, agent_name, agent_type, capabilities, hostname, platform, status)
     VALUES ('it-mcp-vmi01', 'IT-MCP Server VMI01', 'server',
             ARRAY['local-shell', 'system-diagnostics', 'file-operations', 'process-management'],
             'vmi01.acdev.host', 'ubuntu-server', 'online');
     ```

6. **Diagnostic Tools Setup**
   - Verify all diagnostic tools are available
   - Test: CPU info, memory info, disk info
   - Create diagnostic baseline

**Validation:**
- Code deployed
- Tools working
- Sudo access configured
- Service created
- Database registration successful

**Output:**
- Deployment report
- Diagnostic capabilities list
- Service status
````

---

# PHASE 4: Security Gateway & VPN Infrastructure

## ⏱️ Duration: 4-5 hours | 🔄 Parallel: Groups 6-7

### Parallel Group 6: WireGuard VPN Tunnels (Run agents 14-16 simultaneously)

---

## 🤖 Agent 14: WireGuard-Root-Tunnel-Setup

**Role:** devops-automation:cloud-architect
**Target:** All 3 VMs (VMI01, VMI02D, VMI03)
**Duration:** ~60 minutes

````
You are the network security specialist establishing the Root VPN tunnel (port 51820) connecting all three infrastructure VMs. This is the primary secure backbone for all infrastructure communication.

**Tunnel Purpose:** Root Infrastructure Communication
**Port:** 51820 (UDP)
**Network:** 10.0.50.0/24
**Authentication:** Ed25519 keys + PSK

**Server Details:**
- **VMI01** (46.250.243.123): 10.0.50.1/24 - Hub (PostgreSQL, Redis, MCP)
- **VMI02D** (46.250.241.70): 10.0.50.2/24 - Storage
- **VMI03** (154.26.158.31): 10.0.50.3/24 - Security Gateway

**Tasks to Complete:**

1. **Install WireGuard on All VMs**
   ```bash
   sudo apt update
   sudo apt install wireguard wireguard-tools -y
````

2. **Generate Keypairs for Each VM**

   ```bash
   # On each VM
   wg genkey | tee /etc/wireguard/root_privatekey | wg pubkey > /etc/wireguard/root_publickey
   wg genpsk > /etc/wireguard/root_psk
   chmod 600 /etc/wireguard/root_*
   ```

3. **Configure VMI01 (Hub Server)**
   Create `/etc/wireguard/wg-root.conf`:

   ```ini
   [Interface]
   Address = 10.0.50.1/24
   ListenPort = 51820
   PrivateKey = <VMI01_PRIVATE_KEY>

   # Firewall rules
   PostUp = iptables -A FORWARD -i wg-root -j ACCEPT
   PostUp = iptables -A FORWARD -o wg-root -j ACCEPT
   PostDown = iptables -D FORWARD -i wg-root -j ACCEPT
   PostDown = iptables -D FORWARD -o wg-root -j ACCEPT

   # VMI02D peer
   [Peer]
   PublicKey = <VMI02D_PUBLIC_KEY>
   PresharedKey = <SHARED_PSK>
   AllowedIPs = 10.0.50.2/32
   PersistentKeepalive = 25

   # VMI03 peer
   [Peer]
   PublicKey = <VMI03_PUBLIC_KEY>
   PresharedKey = <SHARED_PSK>
   AllowedIPs = 10.0.50.3/32
   PersistentKeepalive = 25
   ```

4. **Configure VMI02D (Storage Server)**
   Create `/etc/wireguard/wg-root.conf`:

   ```ini
   [Interface]
   Address = 10.0.50.2/24
   PrivateKey = <VMI02D_PRIVATE_KEY>

   # VMI01 peer (hub)
   [Peer]
   PublicKey = <VMI01_PUBLIC_KEY>
   PresharedKey = <SHARED_PSK>
   Endpoint = 46.250.243.123:51820
   AllowedIPs = 10.0.50.0/24
   PersistentKeepalive = 25
   ```

5. **Configure VMI03 (Security Gateway)**
   Create `/etc/wireguard/wg-root.conf`:

   ```ini
   [Interface]
   Address = 10.0.50.3/24
   PrivateKey = <VMI03_PRIVATE_KEY>

   # VMI01 peer (hub)
   [Peer]
   PublicKey = <VMI01_PUBLIC_KEY>
   PresharedKey = <SHARED_PSK>
   Endpoint = 46.250.243.123:51820
   AllowedIPs = 10.0.50.0/24
   PersistentKeepalive = 25
   ```

6. **UFW Firewall Rules**
   On all VMs:

   ```bash
   sudo ufw allow 51820/udp comment 'WireGuard Root Tunnel'
   ```

7. **Enable and Start WireGuard**
   On all VMs:

   ```bash
   sudo systemctl enable wg-quick@wg-root
   sudo systemctl start wg-quick@wg-root
   ```

8. **Verify Connectivity**

   ```bash
   # From VMI01
   ping -c 3 10.0.50.2  # Ping VMI02D
   ping -c 3 10.0.50.3  # Ping VMI03

   # From VMI02D
   ping -c 3 10.0.50.1  # Ping VMI01

   # From VMI03
   ping -c 3 10.0.50.1  # Ping VMI01
   ```

9. **Security Validation**

   ```bash
   # Check tunnel status on each VM
   sudo wg show wg-root

   # Verify encryption
   sudo tcpdump -i wg-root -c 10
   ```

10. **Documentation**
    - Save all keys to secure vault
    - Document IP assignments
    - Create network topology diagram
    - Record MTU settings (typically 1420)

**Validation:**

- All 3 VMs can ping each other via 10.0.50.x addresses
- WireGuard interface `wg-root` is up on all VMs
- Handshakes are recent (< 2 minutes)
- UFW allows port 51820/udp
- No plaintext traffic visible (tcpdump verification)
- `systemctl status wg-quick@wg-root` shows active on all VMs

**Output Required:**

- Network topology diagram showing 10.0.50.x assignments
- Public keys for all VMs (for documentation)
- Connectivity test results
- Handshake timestamps
- Any connection issues and resolutions

**SECURITY NOTES:**

- NEVER share private keys in logs or output
- Use PSK (preshared keys) for additional quantum resistance
- Verify all keys are chmod 600
- Test connectivity before closing external SSH sessions

```

---

## 🤖 Agent 15: WireGuard-MCP-Tunnel-Setup

**Role:** devops-automation:cloud-architect
**Target:** VMI01 & VMI03
**Duration:** ~45 minutes

```

You are configuring the dedicated MCP tunnel (port 51821) for secure MCP protocol communication between VMI01 and VMI03, isolated from root infrastructure traffic.

**Tunnel Purpose:** MCP Inter-Service Communication
**Port:** 51821 (UDP)
**Network:** 10.0.51.0/24
**Participants:** VMI01 (MCP servers) ↔ VMI03 (Gateway/Proxy)

**Network Assignment:**

- **VMI01**: 10.0.51.1/24 (MCP Hub)
- **VMI03**: 10.0.51.3/24 (MCP Gateway)

**Tasks to Complete:**

1. **Generate Keypairs**
   On VMI01 and VMI03:

   ```bash
   wg genkey | tee /etc/wireguard/mcp_privatekey | wg pubkey > /etc/wireguard/mcp_publickey
   wg genpsk > /etc/wireguard/mcp_psk
   chmod 600 /etc/wireguard/mcp_*
   ```

2. **Configure VMI01 (MCP Hub)**
   Create `/etc/wireguard/wg-mcp.conf`:

   ```ini
   [Interface]
   Address = 10.0.51.1/24
   ListenPort = 51821
   PrivateKey = <VMI01_MCP_PRIVATE_KEY>

   # MTU optimization for MCP traffic
   MTU = 1420

   # Firewall rules for MCP traffic
   PostUp = iptables -A INPUT -i wg-mcp -p tcp --dport 3000:3002 -j ACCEPT
   PostUp = iptables -A FORWARD -i wg-mcp -j ACCEPT
   PostDown = iptables -D INPUT -i wg-mcp -p tcp --dport 3000:3002 -j ACCEPT
   PostDown = iptables -D FORWARD -i wg-mcp -j ACCEPT

   # VMI03 peer
   [Peer]
   PublicKey = <VMI03_MCP_PUBLIC_KEY>
   PresharedKey = <MCP_PSK>
   AllowedIPs = 10.0.51.3/32
   PersistentKeepalive = 25
   ```

3. **Configure VMI03 (MCP Gateway)**
   Create `/etc/wireguard/wg-mcp.conf`:

   ```ini
   [Interface]
   Address = 10.0.51.3/24
   PrivateKey = <VMI03_MCP_PRIVATE_KEY>
   MTU = 1420

   # VMI01 peer (MCP hub)
   [Peer]
   PublicKey = <VMI01_MCP_PUBLIC_KEY>
   PresharedKey = <MCP_PSK>
   Endpoint = 46.250.243.123:51821
   AllowedIPs = 10.0.51.1/32
   PersistentKeepalive = 25
   ```

4. **UFW Configuration**
   On VMI01:

   ```bash
   sudo ufw allow 51821/udp comment 'WireGuard MCP Tunnel'
   sudo ufw allow from 10.0.51.0/24 to any port 3000:3002 proto tcp comment 'MCP Services via tunnel'
   ```

   On VMI03:

   ```bash
   sudo ufw allow 51821/udp comment 'WireGuard MCP Tunnel'
   ```

5. **Enable MCP Tunnel**
   On both VMs:

   ```bash
   sudo systemctl enable wg-quick@wg-mcp
   sudo systemctl start wg-quick@wg-mcp
   ```

6. **MCP Service Access Verification**
   From VMI03:

   ```bash
   # Test MCP orchestrator (port 3000)
   curl -v http://10.0.51.1:3000/health

   # Test Perplexity MCP (port 3001)
   curl -v http://10.0.51.1:3001/health

   # Test IT-MCP (port 3002)
   curl -v http://10.0.51.1:3002/health
   ```

7. **QoS Configuration (Optional)**
   On VMI01 (prioritize MCP traffic):

   ```bash
   sudo tc qdisc add dev wg-mcp root fq_codel
   ```

8. **Update MCP Service Configuration**
   Update MCP services on VMI01 to bind to tunnel interface:
   ```bash
   # Edit each MCP service .env file
   # Add: BIND_ADDRESS=10.0.51.1
   ```

**Validation:**

- MCP tunnel established (wg show wg-mcp)
- VMI03 can reach all MCP services on 10.0.51.1:3000-3002
- Handshakes are active
- No packet loss (ping test)
- MTU properly set (1420)
- iptables rules active

**Output Required:**

- Tunnel status report
- MCP service connectivity test results
- Bandwidth test results (iperf3 if available)
- Latency measurements
- Configuration summary

**SECURITY NOTES:**

- MCP tunnel isolated from root tunnel traffic
- Only MCP ports (3000-3002) accessible via tunnel
- All MCP traffic encrypted in transit
- PSK provides post-quantum security layer

```

---

## 🤖 Agent 16: WireGuard-Red-Tunnel-Setup

**Role:** devops-automation:cloud-architect
**Target:** VMI02D & VMI03
**Duration:** ~45 minutes

```

You are establishing the Red tunnel (port 51822) for secure media streaming and storage access between VMI02D (storage) and VMI03 (gateway). This tunnel handles high-bandwidth traffic.

**Tunnel Purpose:** Media/Storage Communication (NextCloud, Plex)
**Port:** 51822 (UDP)
**Network:** 10.0.52.0/24
**Participants:** VMI02D (Storage) ↔ VMI03 (Gateway)

**Network Assignment:**

- **VMI02D**: 10.0.52.2/24 (Storage Server)
- **VMI03**: 10.0.52.3/24 (Gateway)

**Tasks to Complete:**

1. **Generate Keypairs**
   On VMI02D and VMI03:

   ```bash
   wg genkey | tee /etc/wireguard/red_privatekey | wg pubkey > /etc/wireguard/red_publickey
   wg genpsk > /etc/wireguard/red_psk
   chmod 600 /etc/wireguard/red_*
   ```

2. **Configure VMI02D (Storage Hub)**
   Create `/etc/wireguard/wg-red.conf`:

   ```ini
   [Interface]
   Address = 10.0.52.2/24
   ListenPort = 51822
   PrivateKey = <VMI02D_RED_PRIVATE_KEY>

   # Optimized MTU for streaming
   MTU = 1500

   # Firewall rules for media services
   PostUp = iptables -A INPUT -i wg-red -p tcp -m multiport --dports 80,443,32400 -j ACCEPT
   PostUp = iptables -A FORWARD -i wg-red -j ACCEPT
   PostDown = iptables -D INPUT -i wg-red -p tcp -m multiport --dports 80,443,32400 -j ACCEPT
   PostDown = iptables -D FORWARD -i wg-red -j ACCEPT

   # VMI03 peer
   [Peer]
   PublicKey = <VMI03_RED_PUBLIC_KEY>
   PresharedKey = <RED_PSK>
   AllowedIPs = 10.0.52.3/32
   PersistentKeepalive = 25
   ```

3. **Configure VMI03 (Gateway)**
   Create `/etc/wireguard/wg-red.conf`:

   ```ini
   [Interface]
   Address = 10.0.52.3/24
   PrivateKey = <VMI03_RED_PRIVATE_KEY>
   MTU = 1500

   # VMI02D peer
   [Peer]
   PublicKey = <VMI02D_RED_PUBLIC_KEY>
   PresharedKey = <RED_PSK>
   Endpoint = 46.250.241.70:51822
   AllowedIPs = 10.0.52.2/32
   PersistentKeepalive = 25
   ```

4. **UFW Configuration**
   On VMI02D:

   ```bash
   sudo ufw allow 51822/udp comment 'WireGuard Red Tunnel'
   sudo ufw allow from 10.0.52.0/24 to any port 80 proto tcp comment 'NextCloud HTTP'
   sudo ufw allow from 10.0.52.0/24 to any port 443 proto tcp comment 'NextCloud HTTPS'
   sudo ufw allow from 10.0.52.0/24 to any port 32400 proto tcp comment 'Plex'
   ```

   On VMI03:

   ```bash
   sudo ufw allow 51822/udp comment 'WireGuard Red Tunnel'
   ```

5. **Enable Red Tunnel**
   On both VMs:

   ```bash
   sudo systemctl enable wg-quick@wg-red
   sudo systemctl start wg-quick@wg-red
   ```

6. **Bandwidth Optimization**
   On VMI02D (optimize for streaming):

   ```bash
   # TCP tuning for high-bandwidth transfers
   sudo sysctl -w net.core.rmem_max=134217728
   sudo sysctl -w net.core.wmem_max=134217728
   sudo sysctl -w net.ipv4.tcp_rmem='4096 87380 67108864'
   sudo sysctl -w net.ipv4.tcp_wmem='4096 65536 67108864'

   # Make permanent
   echo "net.core.rmem_max=134217728" | sudo tee -a /etc/sysctl.conf
   echo "net.core.wmem_max=134217728" | sudo tee -a /etc/sysctl.conf
   ```

7. **Storage Service Connectivity Test**
   From VMI03:

   ```bash
   # Test NextCloud (when deployed)
   curl -I http://10.0.52.2:80
   curl -I https://10.0.52.2:443

   # Test Plex (when deployed)
   curl -I http://10.0.52.2:32400/web
   ```

8. **Bandwidth Testing**

   ```bash
   # Install iperf3 on both VMs
   sudo apt install iperf3 -y

   # On VMI02D
   iperf3 -s -B 10.0.52.2

   # On VMI03
   iperf3 -c 10.0.52.2 -t 30 -i 5
   ```

9. **Prepare Service Binding**
   Document configuration for future NextCloud/Plex deployment:
   ```bash
   # NextCloud: bind to 10.0.52.2
   # Plex: bind to 10.0.52.2
   # This ensures media traffic stays on Red tunnel
   ```

**Validation:**

- Red tunnel established (wg show wg-red)
- VMI03 can reach VMI02D on 10.0.52.2
- Bandwidth >= 500 Mbps (iperf3 test)
- Latency < 10ms (ping test)
- MTU 1500 (optimized for streaming)
- Handshakes active

**Output Required:**

- Tunnel status report
- iperf3 bandwidth test results
- Latency measurements (mtr or ping)
- TCP optimization settings
- Configuration summary

**NOTES:**

- Red tunnel optimized for high-bandwidth media streaming
- MTU set to 1500 (higher than other tunnels) for throughput
- TCP optimizations applied for large file transfers
- Services (NextCloud, Plex) currently disabled - tunnel ready for future use

```

---

### Parallel Group 7: Security Services (Run agents 17-18 simultaneously)

---

## 🤖 Agent 17: Keycloak-SSO-Deployment

**Role:** security-pro:security-auditor
**Target:** VMI03 (154.26.158.31)
**Duration:** ~90 minutes

```

You are the identity and access management specialist deploying Keycloak SSO on VMI03 to provide centralized authentication for all MCP services and infrastructure components.

**Deployment Target:** VMI03 (Security Gateway)
**Port:** 8080 (HTTP), 8443 (HTTPS)
**Database:** PostgreSQL 16 (local on VMI03)
**Realm:** mcp-ecosystem

**Tasks to Complete:**

1. **PostgreSQL Installation for Keycloak**

   ```bash
   sudo apt install postgresql-16 postgresql-contrib -y
   sudo systemctl enable postgresql
   sudo systemctl start postgresql
   ```

2. **Create Keycloak Database**

   ```bash
   sudo -u postgres psql <<EOF
   CREATE DATABASE keycloak;
   CREATE USER keycloak_admin WITH PASSWORD 'CHANGE_ME_SECURE_PASSWORD';
   GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak_admin;
   \q
   EOF
   ```

3. **Install Java 21 (Required for Keycloak)**

   ```bash
   sudo apt install openjdk-21-jdk -y
   java -version  # Verify installation
   ```

4. **Download and Install Keycloak**

   ```bash
   cd /opt
   sudo wget https://github.com/keycloak/keycloak/releases/download/23.0.3/keycloak-23.0.3.tar.gz
   sudo tar -xzf keycloak-23.0.3.tar.gz
   sudo mv keycloak-23.0.3 keycloak
   sudo chown -R keycloak:keycloak /opt/keycloak
   ```

5. **Create Keycloak User**

   ```bash
   sudo useradd -r -s /bin/false -d /opt/keycloak keycloak
   sudo chown -R keycloak:keycloak /opt/keycloak
   ```

6. **Configure Keycloak Database**
   Create `/opt/keycloak/conf/keycloak.conf`:

   ```properties
   # Database
   db=postgres
   db-username=keycloak_admin
   db-password=CHANGE_ME_SECURE_PASSWORD
   db-url=jdbc:postgresql://localhost:5432/keycloak

   # Hostname
   hostname=auth.acdev.host
   hostname-strict=false
   http-enabled=true
   https-port=8443

   # Admin console
   http-port=8080

   # Logging
   log-level=INFO
   log-file=/var/log/keycloak/keycloak.log
   ```

7. **Create Admin User**

   ```bash
   cd /opt/keycloak
   sudo -u keycloak bin/kc.sh bootstrap-admin \
     --username admin \
     --password 'SecureAdminPassword123!' \
     --realm master
   ```

8. **Build Keycloak (Optimized)**

   ```bash
   cd /opt/keycloak
   sudo -u keycloak bin/kc.sh build \
     --db=postgres \
     --features=token-exchange,admin-fine-grained-authz
   ```

9. **Create Systemd Service**
   Create `/etc/systemd/system/keycloak.service`:

   ```ini
   [Unit]
   Description=Keycloak SSO Server
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=keycloak
   Group=keycloak
   Environment="JAVA_OPTS=-Xms512m -Xmx2048m"
   WorkingDirectory=/opt/keycloak
   ExecStart=/opt/keycloak/bin/kc.sh start --optimized
   StandardOutput=journal
   StandardError=journal
   Restart=on-failure
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

10. **UFW Configuration**

    ```bash
    sudo ufw allow 8080/tcp comment 'Keycloak HTTP'
    sudo ufw allow 8443/tcp comment 'Keycloak HTTPS'
    sudo ufw allow from 10.0.51.0/24 to any port 8080 comment 'Keycloak from MCP tunnel'
    ```

11. **Start Keycloak**

    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable keycloak
    sudo systemctl start keycloak

    # Wait for startup (takes ~30 seconds)
    sleep 30
    ```

12. **Create MCP Realm**

    ```bash
    # Access admin console: http://154.26.158.31:8080
    # Login with admin credentials

    # Create realm: mcp-ecosystem
    # Configure:
    #   - Display name: "MCP Ecosystem"
    #   - Enabled: true
    #   - User registration: disabled (admin-created only)
    #   - Email as username: false
    ```

13. **Create MCP Clients**
    For each MCP service, create OIDC client:

    **Client: mcp-orchestrator**
    - Client ID: `mcp-orchestrator`
    - Protocol: openid-connect
    - Access Type: confidential
    - Valid Redirect URIs: `http://10.0.51.1:3000/*`
    - Web Origins: `http://10.0.51.1:3000`

    **Client: perplexity-mcp**
    - Client ID: `perplexity-mcp`
    - Protocol: openid-connect
    - Access Type: confidential
    - Valid Redirect URIs: `http://10.0.51.1:3001/*`

    **Client: it-mcp**
    - Client ID: `it-mcp`
    - Protocol: openid-connect
    - Access Type: confidential
    - Valid Redirect URIs: `http://10.0.51.1:3002/*`

14. **Create User Roles**

    ```
    Roles to create in mcp-ecosystem realm:
    - mcp-admin: Full administrative access
    - mcp-user: Standard user access
    - mcp-developer: Development and testing access
    - mcp-readonly: Read-only access
    ```

15. **Create Test Users**

    ```
    User: dev-admin
    - Email: dev@acdev.host
    - Password: SetTemporaryPassword (force change on first login)
    - Role: mcp-admin

    User: test-user
    - Email: test@acdev.host
    - Password: TestPassword123
    - Role: mcp-user
    ```

16. **Configure Password Policies**
    Realm Settings > Authentication > Password Policy:
    - Minimum length: 12 characters
    - Require uppercase
    - Require lowercase
    - Require digits
    - Require special characters
    - Not recently used: 3
    - Expire password: 90 days

17. **Enable 2FA (TOTP)**
    Authentication > Flows:
    - Duplicate "Browser" flow
    - Add "OTP Form" to flow
    - Set as required for admin role

**Validation:**

- Keycloak accessible at http://154.26.158.31:8080
- Admin console login works
- MCP-ecosystem realm created
- All 3 MCP clients configured with secrets
- Test users can authenticate
- Roles properly assigned
- Password policies enforced

**Output Required:**

- Keycloak admin credentials (secure storage)
- Client secrets for all 3 MCP services
- Realm export (JSON backup)
- User list with roles
- Integration endpoints:
  - Authorization: http://auth.acdev.host:8080/realms/mcp-ecosystem/protocol/openid-connect/auth
  - Token: http://auth.acdev.host:8080/realms/mcp-ecosystem/protocol/openid-connect/token
  - Userinfo: http://auth.acdev.host:8080/realms/mcp-ecosystem/protocol/openid-connect/userinfo

**SECURITY NOTES:**

- HTTPS should be configured in production (Let's Encrypt)
- Admin console access restricted to VPN only
- Regular realm exports for backup
- Audit logging enabled
- Session timeout: 15 minutes idle

```

---

## 🤖 Agent 18: pfSense-PiHole-Integration

**Role:** security-pro:security-auditor
**Target:** VMI03 (154.26.158.31)
**Duration:** ~60 minutes

```

You are the network security specialist configuring pfSense firewall rules and Pi-Hole DNS filtering for the MCP ecosystem, blocking Pentanet (100.64.0.0/10) and malicious domains.

**Target:** VMI03 (Security Gateway)
**Purpose:** Advanced firewall + DNS-based ad/tracker blocking
**Pentanet Block:** 100.64.0.0/10 (CGNAT range)

**Tasks to Complete:**

1. **Install Pi-Hole**

   ```bash
   curl -sSL https://install.pi-hole.net | sudo bash

   # Configuration during install:
   # - Interface: eth0
   # - Upstream DNS: Cloudflare (1.1.1.1)
   # - Block lists: Yes (default lists)
   # - Web interface: Yes
   # - Web server: lighttpd
   # - Logging: On
   ```

2. **Configure Pi-Hole**

   ```bash
   # Set admin password
   sudo pihole -a -p 'SecurePiHolePassword123!'

   # Web interface: http://154.26.158.31/admin
   ```

3. **Add Custom Block Lists**
   Settings > Blocklists > Add:

   ```
   # Malware domains
   https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-hosts.txt

   # Tracking domains
   https://raw.githubusercontent.com/crazy-max/WindowsSpyBlocker/master/data/hosts/spy.txt

   # Cryptomining
   https://zerodot1.gitlab.io/CoinBlockerLists/hosts_browser
   ```

4. **Pentanet Blocking (100.64.0.0/10)**
   Create `/etc/pihole/custom-blocks.conf`:

   ```
   # Block Pentanet CGNAT range
   address=/100.64.0.0/10/0.0.0.0
   ```

   Add to Pi-Hole:

   ```bash
   echo "conf-file=/etc/pihole/custom-blocks.conf" | sudo tee -a /etc/dnsmasq.d/99-custom.conf
   sudo pihole restartdns
   ```

5. **Install UFW and Configure pfSense-like Rules**

   ```bash
   sudo apt install ufw -y

   # Default policies
   sudo ufw default deny incoming
   sudo ufw default allow outgoing

   # Allow SSH (from anywhere for now, will restrict via WireGuard later)
   sudo ufw allow 22/tcp comment 'SSH'

   # Allow WireGuard tunnels
   sudo ufw allow 51820/udp comment 'WireGuard Root'
   sudo ufw allow 51821/udp comment 'WireGuard MCP'
   sudo ufw allow 51822/udp comment 'WireGuard Red'

   # Allow Keycloak
   sudo ufw allow from 10.0.51.0/24 to any port 8080 comment 'Keycloak from MCP tunnel'
   sudo ufw allow 8443/tcp comment 'Keycloak HTTPS'

   # Allow Pi-Hole web interface (restricted)
   sudo ufw allow from 10.0.50.0/24 to any port 80 comment 'Pi-Hole from root tunnel'

   # Allow DNS (Pi-Hole)
   sudo ufw allow from 10.0.50.0/24 to any port 53 proto udp comment 'DNS from root tunnel'
   sudo ufw allow from 10.0.50.0/24 to any port 53 proto tcp comment 'DNS from root tunnel'

   # Block Pentanet CGNAT range explicitly
   sudo ufw deny from 100.64.0.0/10 comment 'Block Pentanet CGNAT'
   sudo ufw deny to 100.64.0.0/10 comment 'Block Pentanet CGNAT'

   # Enable UFW
   sudo ufw --force enable
   ```

6. **Configure iptables for Advanced Filtering**
   Create `/etc/iptables/pentanet-block.rules`:

   ```bash
   #!/bin/bash

   # Drop all traffic from/to Pentanet CGNAT range
   iptables -I INPUT -s 100.64.0.0/10 -j DROP
   iptables -I OUTPUT -d 100.64.0.0/10 -j DROP
   iptables -I FORWARD -s 100.64.0.0/10 -j DROP
   iptables -I FORWARD -d 100.64.0.0/10 -j DROP

   # Log blocked Pentanet attempts
   iptables -I INPUT -s 100.64.0.0/10 -j LOG --log-prefix "PENTANET-BLOCK-IN: "
   iptables -I OUTPUT -d 100.64.0.0/10 -j LOG --log-prefix "PENTANET-BLOCK-OUT: "
   ```

   Make persistent:

   ```bash
   sudo chmod +x /etc/iptables/pentanet-block.rules
   echo "/etc/iptables/pentanet-block.rules" | sudo tee -a /etc/rc.local
   ```

7. **Configure DNS on All VMs**
   Update DNS on VMI01, VMI02D, VMI03 to use Pi-Hole:

   `/etc/resolv.conf`:

   ```
   nameserver 10.0.50.3  # Pi-Hole via root tunnel
   nameserver 1.1.1.1    # Fallback
   ```

   Make immutable:

   ```bash
   sudo chattr +i /etc/resolv.conf
   ```

8. **Device Whitelisting (IP-based)**
   Create `/etc/ufw/before.rules` section:

   ```bash
   # Whitelisted devices (add your devices)
   -A ufw-before-input -s 192.168.1.100 -j ACCEPT -m comment --comment "Admin Laptop"
   -A ufw-before-input -s 192.168.1.101 -j ACCEPT -m comment --comment "Dev Workstation"
   ```

9. **Enable IP Forwarding**

   ```bash
   sudo sysctl -w net.ipv4.ip_forward=1
   echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
   ```

10. **Configure Logging**

    ```bash
    # UFW logging
    sudo ufw logging medium

    # Pi-Hole query logging
    pihole -l on

    # Create log rotation
    sudo tee /etc/logrotate.d/firewall <<EOF
    /var/log/ufw.log {
        daily
        rotate 14
        compress
        delaycompress
        missingok
        notifempty
    }
    EOF
    ```

11. **Fail2Ban for Pi-Hole Web Interface**
    Create `/etc/fail2ban/jail.local`:

    ```ini
    [pihole-web]
    enabled = true
    port = http,https
    filter = pihole-web
    logpath = /var/log/lighttpd/error.log
    maxretry = 3
    bantime = 3600
    ```

    Create filter `/etc/fail2ban/filter.d/pihole-web.conf`:

    ```ini
    [Definition]
    failregex = ^.* authentication failed for user .* from <HOST>$
    ignoreregex =
    ```

12. **Test Pentanet Blocking**

    ```bash
    # Should fail/timeout
    ping -c 3 100.64.0.1
    curl --connect-timeout 5 http://100.64.0.1

    # Check logs
    sudo grep "PENTANET-BLOCK" /var/log/kern.log
    ```

13. **Test DNS Filtering**

    ```bash
    # Should be blocked by Pi-Hole
    nslookup ads.google.com 10.0.50.3
    nslookup doubleclick.net 10.0.50.3

    # Should work
    nslookup google.com 10.0.50.3
    ```

**Validation:**

- Pi-Hole web interface accessible at http://10.0.50.3/admin
- Pentanet range (100.64.0.0/10) completely blocked
- UFW rules active and correct
- DNS queries being filtered by Pi-Hole
- All VMs using Pi-Hole as DNS
- Keycloak accessible through firewall
- WireGuard tunnels allowed
- Device whitelist functional
- Logging enabled and working

**Output Required:**

- Pi-Hole admin password (secure storage)
- UFW status output (`sudo ufw status verbose`)
- iptables rules (`sudo iptables -L -n -v`)
- Pentanet block test results
- DNS filtering test results
- Pi-Hole statistics (queries blocked)
- Firewall rule documentation

**SECURITY NOTES:**

- Pi-Hole web interface only accessible via VPN tunnels
- Pentanet blocking at multiple layers (UFW + iptables)
- Device whitelisting recommended for SSH access
- Regular blocklist updates scheduled
- Query logging for security auditing

```

---

# PHASE 5: Monitoring, Compliance & Backup Infrastructure
## ⏱️ Duration: 5-6 hours | 🔄 Parallel: Groups 8-9

### Parallel Group 8: Monitoring Stack (Run agents 19-21 simultaneously)

---

## 🤖 Agent 19: Prometheus-Deployment

**Role:** performance-optimizer:performance-engineer
**Target:** VMI01 (46.250.243.123)
**Duration:** ~60 minutes

```

You are the observability specialist deploying Prometheus for metrics collection across all infrastructure components and MCP services.

**Target:** VMI01 (Dev Server)
**Port:** 9090 (Prometheus), 9100 (Node Exporter)
**Retention:** 30 days
**Scrape Interval:** 15 seconds

**Tasks to Complete:**

1. **Install Prometheus**

   ```bash
   cd /tmp
   wget https://github.com/prometheus/prometheus/releases/download/v2.48.0/prometheus-2.48.0.linux-amd64.tar.gz
   tar -xzf prometheus-2.48.0.linux-amd64.tar.gz
   sudo mv prometheus-2.48.0.linux-amd64 /opt/prometheus
   sudo useradd --no-create-home --shell /bin/false prometheus
   sudo chown -R prometheus:prometheus /opt/prometheus
   ```

2. **Create Prometheus Directories**

   ```bash
   sudo mkdir -p /etc/prometheus /var/lib/prometheus
   sudo chown prometheus:prometheus /etc/prometheus /var/lib/prometheus
   ```

3. **Configure Prometheus**
   Create `/etc/prometheus/prometheus.yml`:

   ```yaml
   global:
     scrape_interval: 15s
     evaluation_interval: 15s
     external_labels:
       cluster: 'mcp-ecosystem'
       environment: 'production'

   # Alertmanager configuration
   alerting:
     alertmanagers:
       - static_configs:
           - targets: ['localhost:9093']

   # Load alerting rules
   rule_files:
     - '/etc/prometheus/rules/*.yml'

   # Scrape configurations
   scrape_configs:
     # Prometheus itself
     - job_name: 'prometheus'
       static_configs:
         - targets: ['localhost:9090']

     # Node Exporter - VMI01
     - job_name: 'node-vmi01'
       static_configs:
         - targets: ['localhost:9100']
           labels:
             instance: 'vmi01'
             role: 'dev-database'

     # Node Exporter - VMI02D (via root tunnel)
     - job_name: 'node-vmi02d'
       static_configs:
         - targets: ['10.0.50.2:9100']
           labels:
             instance: 'vmi02d'
             role: 'storage'

     # Node Exporter - VMI03 (via root tunnel)
     - job_name: 'node-vmi03'
       static_configs:
         - targets: ['10.0.50.3:9100']
           labels:
             instance: 'vmi03'
             role: 'security-gateway'

     # PostgreSQL Exporter
     - job_name: 'postgresql'
       static_configs:
         - targets: ['localhost:9187']

     # Redis Exporter
     - job_name: 'redis'
       static_configs:
         - targets: ['localhost:9121']

     # MCP Services
     - job_name: 'mcp-orchestrator'
       static_configs:
         - targets: ['localhost:3000']
       metrics_path: '/metrics'

     - job_name: 'perplexity-mcp'
       static_configs:
         - targets: ['localhost:3001']
       metrics_path: '/metrics'

     - job_name: 'it-mcp'
       static_configs:
         - targets: ['localhost:3002']
       metrics_path: '/metrics'
   ```

4. **Install Node Exporter on All VMs**
   Run on VMI01, VMI02D, VMI03:

   ```bash
   cd /tmp
   wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
   tar -xzf node_exporter-1.7.0.linux-amd64.tar.gz
   sudo mv node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/
   sudo useradd --no-create-home --shell /bin/false node_exporter
   ```

5. **Create Node Exporter Systemd Service**
   On all VMs, create `/etc/systemd/system/node_exporter.service`:

   ```ini
   [Unit]
   Description=Node Exporter
   After=network.target

   [Service]
   User=node_exporter
   Group=node_exporter
   Type=simple
   ExecStart=/usr/local/bin/node_exporter
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

   Enable and start:

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable node_exporter
   sudo systemctl start node_exporter
   ```

6. **Install PostgreSQL Exporter**
   On VMI01:

   ```bash
   cd /tmp
   wget https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz
   tar -xzf postgres_exporter-0.15.0.linux-amd64.tar.gz
   sudo mv postgres_exporter-0.15.0.linux-amd64/postgres_exporter /usr/local/bin/
   ```

   Create `/etc/systemd/system/postgres_exporter.service`:

   ```ini
   [Unit]
   Description=PostgreSQL Exporter
   After=network.target postgresql.service

   [Service]
   User=postgres
   Environment="DATA_SOURCE_NAME=postgresql://mcp_admin:@localhost:5432/mcp_ecosystem?sslmode=disable"
   ExecStart=/usr/local/bin/postgres_exporter
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

7. **Install Redis Exporter**
   On VMI01:

   ```bash
   cd /tmp
   wget https://github.com/oliver006/redis_exporter/releases/download/v1.55.0/redis_exporter-v1.55.0.linux-amd64.tar.gz
   tar -xzf redis_exporter-v1.55.0.linux-amd64.tar.gz
   sudo mv redis_exporter-v1.55.0.linux-amd64/redis_exporter /usr/local/bin/
   ```

   Create `/etc/systemd/system/redis_exporter.service`:

   ```ini
   [Unit]
   Description=Redis Exporter
   After=network.target redis.service

   [Service]
   User=redis
   ExecStart=/usr/local/bin/redis_exporter --redis.addr=localhost:6379
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

8. **Create Alert Rules**
   Create `/etc/prometheus/rules/alerts.yml`:

   ```yaml
   groups:
     - name: infrastructure
       interval: 30s
       rules:
         - alert: InstanceDown
           expr: up == 0
           for: 5m
           labels:
             severity: critical
           annotations:
             summary: 'Instance {{ $labels.instance }} down'
             description: '{{ $labels.job }} has been down for more than 5 minutes'

         - alert: HighCPU
           expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
           for: 10m
           labels:
             severity: warning
           annotations:
             summary: 'High CPU on {{ $labels.instance }}'
             description: 'CPU usage is {{ $value }}%'

         - alert: HighMemory
           expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100 > 85
           for: 5m
           labels:
             severity: warning
           annotations:
             summary: 'High memory on {{ $labels.instance }}'
             description: 'Memory usage is {{ $value }}%'

         - alert: DiskSpaceLow
           expr: (node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 15
           for: 5m
           labels:
             severity: critical
           annotations:
             summary: 'Low disk space on {{ $labels.instance }}'
             description: 'Disk {{ $labels.mountpoint }} has {{ $value }}% free'

     - name: databases
       interval: 30s
       rules:
         - alert: PostgreSQLDown
           expr: pg_up == 0
           for: 1m
           labels:
             severity: critical
           annotations:
             summary: 'PostgreSQL is down'

         - alert: PostgreSQLTooManyConnections
           expr: sum by(datname) (pg_stat_database_numbackends) / pg_settings_max_connections * 100 > 80
           for: 5m
           labels:
             severity: warning
           annotations:
             summary: 'PostgreSQL too many connections'

         - alert: RedisDown
           expr: redis_up == 0
           for: 1m
           labels:
             severity: critical
             annotations:
               summary: 'Redis is down'
   ```

9. **UFW Configuration**

   ```bash
   sudo ufw allow 9090/tcp comment 'Prometheus'
   sudo ufw allow from 10.0.50.0/24 to any port 9100 comment 'Node Exporter'
   ```

10. **Create Prometheus Systemd Service**
    Create `/etc/systemd/system/prometheus.service`:

    ```ini
    [Unit]
    Description=Prometheus
    After=network.target

    [Service]
    User=prometheus
    Group=prometheus
    Type=simple
    ExecStart=/opt/prometheus/prometheus \
      --config.file=/etc/prometheus/prometheus.yml \
      --storage.tsdb.path=/var/lib/prometheus/ \
      --storage.tsdb.retention.time=30d \
      --web.console.templates=/opt/prometheus/consoles \
      --web.console.libraries=/opt/prometheus/console_libraries \
      --web.listen-address=:9090
    Restart=always

    [Install]
    WantedBy=multi-user.target
    ```

11. **Start Prometheus**

    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable prometheus postgres_exporter redis_exporter
    sudo systemctl start prometheus postgres_exporter redis_exporter
    ```

12. **Verify Metrics Collection**

    ```bash
    # Check Prometheus targets
    curl http://localhost:9090/api/v1/targets | jq

    # Query sample metrics
    curl 'http://localhost:9090/api/v1/query?query=up' | jq
    ```

**Validation:**

- Prometheus accessible at http://46.250.243.123:9090
- All 3 VMs reporting metrics (node_exporter)
- PostgreSQL metrics available
- Redis metrics available
- MCP service metrics available
- Alert rules loaded
- No scrape errors in targets page

**Output Required:**

- Prometheus web UI URL
- List of active targets with status
- Sample PromQL queries for MCP metrics
- Alert rules summary
- Retention and storage configuration

**NOTES:**

- Prometheus data stored in /var/lib/prometheus (30 day retention)
- Alert rules evaluated every 30 seconds
- Metrics scraped every 15 seconds
- All exporters accessible via root tunnel

```

---

## 🤖 Agent 20: Grafana-Dashboard-Setup

**Role:** performance-optimizer:performance-engineer
**Target:** VMI01 (46.250.243.123)
**Duration:** ~75 minutes

```

You are the visualization specialist deploying Grafana and creating comprehensive dashboards for monitoring the MCP ecosystem infrastructure and services.

**Target:** VMI01 (Dev Server)
**Port:** 3500 (avoiding conflicts with MCP services on 3000-3002)
**Prometheus:** localhost:9090

**Tasks to Complete:**

1. **Install Grafana**

   ```bash
   sudo apt-get install -y software-properties-common
   sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
   wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
   sudo apt-get update
   sudo apt-get install grafana -y
   ```

2. **Configure Grafana**
   Edit `/etc/grafana/grafana.ini`:

   ```ini
   [server]
   http_port = 3500
   domain = vmi01.acdev.host
   root_url = http://vmi01.acdev.host:3500

   [security]
   admin_user = admin
   admin_password = ChangeMe_SecureGrafanaPassword
   disable_gravatar = true

   [auth]
   disable_login_form = false

   [auth.anonymous]
   enabled = false

   [snapshots]
   external_enabled = false

   [log]
   mode = console file
   level = info
   ```

3. **UFW Configuration**

   ```bash
   sudo ufw allow 3500/tcp comment 'Grafana'
   ```

4. **Start Grafana**

   ```bash
   sudo systemctl enable grafana-server
   sudo systemctl start grafana-server
   ```

5. **Add Prometheus Data Source**
   Via Grafana UI (http://46.250.243.123:3500):
   - Login with admin credentials
   - Configuration > Data Sources > Add data source
   - Select Prometheus
   - URL: http://localhost:9090
   - Access: Server (default)
   - Save & Test

6. **Create MCP Ecosystem Overview Dashboard**
   Dashboard includes:

   **Row 1: Infrastructure Overview**
   - Panel: VM Status (up metric)
   - Panel: Total CPU Usage across VMs
   - Panel: Total Memory Usage across VMs
   - Panel: Total Disk Usage across VMs

   **Row 2: Network & Tunnels**
   - Panel: WireGuard Handshakes (root, mcp, red tunnels)
   - Panel: Network Traffic (bytes in/out)
   - Panel: Packet Loss
   - Panel: Latency between VMs

   **Row 3: Database Metrics**
   - Panel: PostgreSQL Connections
   - Panel: PostgreSQL Transaction Rate
   - Panel: PostgreSQL Query Duration (p95, p99)
   - Panel: Database Size Growth
   - Panel: Cache Hit Ratio

   **Row 4: Redis Metrics**
   - Panel: Redis Connected Clients
   - Panel: Redis Memory Usage
   - Panel: Redis Commands/sec
   - Panel: Redis Hit Rate

   **Row 5: MCP Services**
   - Panel: MCP Service Status (up/down)
   - Panel: Request Rate per Service
   - Panel: Response Time per Service
   - Panel: Error Rate per Service

7. **Create Structured Thought Dashboard**
   Dashboard includes:

   **Row 1: Thought Metrics**
   - Panel: Total Thoughts Created (counter)
   - Panel: Thoughts per Hour (rate)
   - Panel: Thoughts by Stage (breakdown)
   - Panel: Average Quality Score

   **Row 2: Branch Analytics**
   - Panel: Active Branches
   - Panel: Branch Health Distribution
   - Panel: Branch Depth Distribution
   - Panel: Stagnant Branches Alert

   **Row 3: Feedback Signals**
   - Panel: Feedback Signals by Type
   - Panel: High Severity Signals
   - Panel: Feedback Signal Rate

   **Row 4: Sync & Performance**
   - Panel: Thought Sync Queue Size
   - Panel: Sync Operations per Minute
   - Panel: Database Write Latency
   - Panel: Search Query Performance

8. **Create Security Dashboard**
   Dashboard includes:

   **Row 1: Firewall & Authentication**
   - Panel: UFW Blocked Connections
   - Panel: Fail2Ban Active Bans
   - Panel: SSH Failed Login Attempts
   - Panel: Keycloak Authentication Failures

   **Row 2: Pi-Hole & DNS**
   - Panel: DNS Queries Blocked
   - Panel: Top Blocked Domains
   - Panel: Pentanet Block Attempts
   - Panel: DNS Query Types

   **Row 3: Certificate & Tunnel Security**
   - Panel: SSL Certificate Expiry
   - Panel: WireGuard Peer Connection Status
   - Panel: Unusual Port Activity
   - Panel: Failed SSH Key Attempts

9. **Create System Resources Dashboard**
   Dashboard includes:

   **Per-VM Breakdown (VMI01, VMI02D, VMI03):**
   - CPU Usage (per core)
   - Memory Usage (used/available/cached)
   - Disk I/O (read/write ops)
   - Network I/O (bandwidth)
   - Load Average (1m, 5m, 15m)
   - Open File Descriptors
   - Process Count

10. **Configure Alerting**
    Settings > Alerting > Notification channels:

    Create channel: "MCP-Ops-Email"
    - Type: Email
    - Addresses: ops@acdev.host
    - Send test notification

    Create alerts for:
    - Any VM down for > 5 minutes
    - CPU > 90% for > 10 minutes
    - Memory > 95% for > 5 minutes
    - Disk space < 10%
    - PostgreSQL down
    - Redis down
    - Any MCP service down > 2 minutes

11. **Install Dashboard Plugins**

    ```bash
    sudo grafana-cli plugins install grafana-piechart-panel
    sudo grafana-cli plugins install grafana-worldmap-panel
    sudo systemctl restart grafana-server
    ```

12. **Create Dashboard Playlists**
    Dashboards > Playlists > New Playlist:

    "MCP Operations Rotation" (30 second intervals):
    1. MCP Ecosystem Overview
    2. Structured Thought Dashboard
    3. Security Dashboard
    4. System Resources Dashboard

13. **Configure Dashboard Variables**
    For reusable dashboards:

    ```
    Variable: $vm
    Query: label_values(up, instance)
    Type: Query
    Multi-value: Yes

    Variable: $service
    Query: label_values(up{job=~"mcp.*"}, job)
    Type: Query
    Multi-value: Yes
    ```

14. **Export Dashboards**

    ```bash
    # Export each dashboard as JSON for version control
    mkdir -p /opt/grafana/dashboards
    # Manual export via UI: Share > Export > Save to file
    ```

15. **Set Up Anonymous Read-Only Dashboard**
    For NOC/status displays:
    Edit `/etc/grafana/grafana.ini`:
    ```ini
    [auth.anonymous]
    enabled = true
    org_name = Main Org.
    org_role = Viewer
    ```

**Validation:**

- Grafana accessible at http://46.250.243.123:3500
- Prometheus data source connected
- All 4 dashboards created and populated with data
- Alerts configured and tested
- Dashboard variables working
- Playlists functional
- Email notifications working

**Output Required:**

- Grafana admin credentials (secure storage)
- Dashboard URLs for each created dashboard
- Screenshot of MCP Ecosystem Overview dashboard
- List of configured alerts with thresholds
- Dashboard JSON exports (for backup)

**Sample PromQL Queries for MCP Dashboards:**

```promql
# Total thoughts created
sum(postgres_pg_stat_database_tup_inserted{datname="mcp_ecosystem"})

# Thoughts per hour
rate(postgres_pg_stat_database_tup_inserted{datname="mcp_ecosystem"}[1h]) * 3600

# MCP service request rate
sum(rate(http_requests_total{job=~"mcp.*"}[5m])) by (job)

# Database connections by service
pg_stat_database_numbackends{datname="mcp_ecosystem"}

# Redis memory usage
redis_memory_used_bytes / redis_memory_max_bytes * 100
```

**NOTES:**

- Dashboards automatically refresh every 30 seconds
- Historical data available for 30 days (Prometheus retention)
- Use template variables for multi-VM/service views
- Dashboard snapshots disabled for security

```

---

## 🤖 Agent 21: ELK-Stack-Deployment

**Role:** performance-optimizer:performance-engineer
**Target:** VMI01 (46.250.243.123)
**Duration:** ~90 minutes

```

You are the logging infrastructure specialist deploying Elasticsearch, Logstash, and Kibana (ELK Stack) for centralized log aggregation and analysis across all MCP infrastructure and services.

**Target:** VMI01 (Dev Server)
**Ports:**

- Elasticsearch: 9200 (HTTP), 9300 (Transport)
- Logstash: 5044 (Beats), 9600 (API)
- Kibana: 5601 (Web UI)

**Log Sources:**

- All 3 VMs (syslog, auth, firewall)
- PostgreSQL query logs
- Redis logs
- MCP services (orchestrator, perplexity, IT-MCP)
- NGINX access/error logs
- Keycloak audit logs
- Pi-Hole query logs

**Tasks to Complete:**

1. **Install Java (Required for ELK)**

   ```bash
   sudo apt install openjdk-11-jdk -y
   java -version
   ```

2. **Install Elasticsearch**

   ```bash
   wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo gpg --dearmor -o /usr/share/keyrings/elasticsearch-keyring.gpg
   echo "deb [signed-by=/usr/share/keyrings/elasticsearch-keyring.gpg] https://artifacts.elastic.co/packages/8.x/apt stable main" | sudo tee /etc/apt/sources.list.d/elastic-8.x.list
   sudo apt update
   sudo apt install elasticsearch -y
   ```

3. **Configure Elasticsearch**
   Edit `/etc/elasticsearch/elasticsearch.yml`:

   ```yaml
   cluster.name: mcp-ecosystem-logs
   node.name: vmi01-es-node
   path.data: /var/lib/elasticsearch
   path.logs: /var/log/elasticsearch
   network.host: localhost
   http.port: 9200
   discovery.type: single-node

   # Security (basic auth)
   xpack.security.enabled: true
   xpack.security.enrollment.enabled: true

   # Performance
   bootstrap.memory_lock: true
   ```

4. **Configure Elasticsearch JVM Heap**
   Edit `/etc/elasticsearch/jvm.options.d/heap.options`:

   ```
   # Use 2GB for heap (adjust based on available RAM)
   -Xms2g
   -Xmx2g
   ```

5. **Enable and Start Elasticsearch**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable elasticsearch
   sudo systemctl start elasticsearch

   # Wait for Elasticsearch to start (~30 seconds)
   sleep 30
   ```

6. **Set Elasticsearch Password**

   ```bash
   sudo /usr/share/elasticsearch/bin/elasticsearch-reset-password -u elastic -i
   # Set password: ElasticSearchSecure123!

   # Save password for later use
   echo "elastic:ElasticSearchSecure123!" | sudo tee /etc/elasticsearch/credentials.txt
   sudo chmod 600 /etc/elasticsearch/credentials.txt
   ```

7. **Verify Elasticsearch**

   ```bash
   curl -u elastic:ElasticSearchSecure123! http://localhost:9200
   ```

8. **Install Logstash**

   ```bash
   sudo apt install logstash -y
   ```

9. **Configure Logstash Pipeline**
   Create `/etc/logstash/conf.d/mcp-pipeline.conf`:

   ```ruby
   input {
     # Beats input (for Filebeat from all VMs)
     beats {
       port => 5044
     }

     # Direct syslog
     syslog {
       port => 5514
       type => "syslog"
     }
   }

   filter {
     # Parse MCP service logs (JSON format)
     if [fields][service] =~ "mcp" {
       json {
         source => "message"
       }
       mutate {
         add_field => { "[@metadata][index]" => "mcp-services" }
       }
     }

     # Parse PostgreSQL logs
     if [fields][service] == "postgresql" {
       grok {
         match => { "message" => "%{TIMESTAMP_ISO8601:timestamp} \[%{NUMBER:pid}\] %{WORD:user}@%{WORD:database} %{WORD:level}: %{GREEDYDATA:query}" }
       }
       mutate {
         add_field => { "[@metadata][index]" => "postgres-logs" }
       }
     }

     # Parse auth logs (SSH attempts, etc.)
     if [fields][service] == "auth" {
       grok {
         match => { "message" => "%{SYSLOGTIMESTAMP:timestamp} %{HOSTNAME:hostname} %{WORD:process}(?:\[%{POSINT:pid}\])?: %{GREEDYDATA:message}" }
       }
       mutate {
         add_field => { "[@metadata][index]" => "auth-logs" }
       }
     }

     # Parse Pi-Hole logs
     if [fields][service] == "pihole" {
       grok {
         match => { "message" => "^%{TIMESTAMP_ISO8601:timestamp} (?<action>query|blocked)\[%{WORD:query_type}\] %{HOSTNAME:domain} from %{IP:client_ip}" }
       }
       mutate {
         add_field => { "[@metadata][index]" => "pihole-logs" }
       }
     }

     # GeoIP enrichment for external IPs
     if [source_ip] {
       geoip {
         source => "source_ip"
         target => "geoip"
       }
     }

     # Add timestamp
     date {
       match => [ "timestamp", "ISO8601", "MMM dd HH:mm:ss" ]
       target => "@timestamp"
     }
   }

   output {
     elasticsearch {
       hosts => ["localhost:9200"]
       user => "elastic"
       password => "ElasticSearchSecure123!"
       index => "%{[@metadata][index]}-%{+YYYY.MM.dd}"
     }

     # Debug output (remove in production)
     stdout {
       codec => rubydebug
     }
   }
   ```

10. **Enable and Start Logstash**

    ```bash
    sudo systemctl enable logstash
    sudo systemctl start logstash
    ```

11. **Install Kibana**

    ```bash
    sudo apt install kibana -y
    ```

12. **Configure Kibana**
    Edit `/etc/kibana/kibana.yml`:

    ```yaml
    server.port: 5601
    server.host: '0.0.0.0'
    server.name: 'vmi01-kibana'
    elasticsearch.hosts: ['http://localhost:9200']
    elasticsearch.username: 'elastic'
    elasticsearch.password: 'ElasticSearchSecure123!'
    kibana.index: '.kibana'
    logging.dest: /var/log/kibana/kibana.log
    ```

13. **Enable and Start Kibana**

    ```bash
    sudo systemctl enable kibana
    sudo systemctl start kibana

    # Wait for Kibana to start (~60 seconds)
    sleep 60
    ```

14. **Install Filebeat on All VMs**
    Run on VMI01, VMI02D, VMI03:

    ```bash
    sudo apt install filebeat -y
    ```

15. **Configure Filebeat on Each VM**
    Edit `/etc/filebeat/filebeat.yml` on each VM:

    ```yaml
    filebeat.inputs:
      # System logs
      - type: log
        enabled: true
        paths:
          - /var/log/syslog
          - /var/log/auth.log
        fields:
          service: system
          hostname: ${HOSTNAME}

      # MCP service logs (VMI01 only)
      - type: log
        enabled: true
        paths:
          - /var/log/mcp/*.log
        fields:
          service: mcp
          hostname: vmi01

      # PostgreSQL logs (VMI01 only)
      - type: log
        enabled: true
        paths:
          - /var/log/postgresql/postgresql-*.log
        fields:
          service: postgresql
          hostname: vmi01

      # Pi-Hole logs (VMI03 only)
      - type: log
        enabled: true
        paths:
          - /var/log/pihole.log
        fields:
          service: pihole
          hostname: vmi03

    output.logstash:
      hosts: ['10.0.50.1:5044'] # Logstash on VMI01 via root tunnel

    processors:
      - add_host_metadata:
          when.not.contains.tags: forwarded
      - add_cloud_metadata: ~
    ```

16. **Enable Filebeat on All VMs**

    ```bash
    sudo filebeat modules enable system
    sudo filebeat setup
    sudo systemctl enable filebeat
    sudo systemctl start filebeat
    ```

17. **UFW Configuration**
    On VMI01:

    ```bash
    sudo ufw allow 5601/tcp comment 'Kibana'
    sudo ufw allow from 10.0.50.0/24 to any port 5044 comment 'Logstash Beats'
    sudo ufw allow from 10.0.50.0/24 to any port 9200 comment 'Elasticsearch'
    ```

18. **Create Kibana Index Patterns**
    Access Kibana at http://46.250.243.123:5601:
    - Stack Management > Index Patterns
    - Create pattern: `mcp-services-*` (Time field: @timestamp)
    - Create pattern: `postgres-logs-*` (Time field: @timestamp)
    - Create pattern: `auth-logs-*` (Time field: @timestamp)
    - Create pattern: `pihole-logs-*` (Time field: @timestamp)

19. **Create Kibana Dashboards**

    **Dashboard: MCP Service Logs**
    - Visualization: Log stream (real-time)
    - Visualization: Error rate by service
    - Visualization: Top log levels
    - Visualization: Request/response time distribution

    **Dashboard: Security Events**
    - Visualization: SSH failed login attempts (by IP)
    - Visualization: UFW blocked connections
    - Visualization: Pentanet block attempts
    - Visualization: Keycloak auth failures
    - Visualization: GeoIP map of attackers

    **Dashboard: Pi-Hole Analytics**
    - Visualization: DNS queries over time
    - Visualization: Top blocked domains
    - Visualization: Query types distribution
    - Visualization: Top client IPs

    **Dashboard: Database Query Analysis**
    - Visualization: Slow queries (> 1s)
    - Visualization: Most frequent queries
    - Visualization: Query duration histogram
    - Visualization: Deadlocks and errors

20. **Configure Log Retention**
    Create ILM policy for log rotation:

    ```bash
    curl -X PUT "localhost:9200/_ilm/policy/mcp-logs-policy" -H 'Content-Type: application/json' -u elastic:ElasticSearchSecure123! -d'
    {
      "policy": {
        "phases": {
          "hot": {
            "actions": {
              "rollover": {
                "max_size": "50GB",
                "max_age": "7d"
              }
            }
          },
          "delete": {
            "min_age": "30d",
            "actions": {
              "delete": {}
            }
          }
        }
      }
    }'
    ```

21. **Set Up Alerts in Kibana**
    Stack Management > Alerts and Actions:

    Alert: High Error Rate
    - Trigger: errors > 100 in 5 minutes
    - Action: Email notification

    Alert: Failed SSH Attempts
    - Trigger: failed_ssh > 10 in 1 minute
    - Action: Email notification

    Alert: Database Slow Queries
    - Trigger: query_duration > 5s
    - Action: Log to Slack/Email

**Validation:**

- Elasticsearch responding at http://localhost:9200
- Logstash receiving logs on port 5044
- Kibana accessible at http://46.250.243.123:5601
- Filebeat running on all 3 VMs
- Logs flowing from all VMs to Elasticsearch
- Index patterns created for all log sources
- Dashboards populated with data
- Alerts configured and tested

**Output Required:**

- Elasticsearch credentials (secure storage)
- Kibana URL and credentials
- List of index patterns created
- Dashboard URLs
- Sample queries for each log source
- Log retention policy summary

**Sample Kibana Queries:**

```
# Failed SSH attempts in last hour
failed AND ssh AND @timestamp:[now-1h TO now]

# MCP errors by service
service:mcp AND level:error | stats count() by fields.service

# Pentanet blocks
message:"PENTANET-BLOCK"

# Slow PostgreSQL queries
service:postgresql AND query_duration:>1000

# Top blocked domains (Pi-Hole)
service:pihole AND action:blocked | stats count() by domain | sort count desc | limit 10
```

**NOTES:**

- ELK stack requires significant resources (4GB+ RAM recommended)
- Logs retained for 30 days, then automatically deleted
- Index lifecycle management (ILM) prevents disk space issues
- All log shipping encrypted via WireGuard tunnels
- Kibana should be behind HTTPS in production (NGINX proxy)

```

---

(Due to length, continuing in separate response with Agents 22-27...)
```
