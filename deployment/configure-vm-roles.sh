#!/bin/bash
################################################################################
# MCP Ecosystem - VM Role Configuration Script
#
# Configures each VM for its specific role:
# - VMI01: High-performance database and MCP entry point
# - VMI02D: 1TB storage hub with hot standby database
# - VMI03: Orchestrator, monitoring, and external gateway
################################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
warn() { echo -e "${YELLOW}[$(date +'%H:%M:%S')] WARNING:${NC} $1"; }
info() { echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $1"; }

################################################################################
# VMI01: High-Performance Configuration
################################################################################

configure_vmi01_performance() {
    log "=== Configuring VMI01 for High Performance ==="

    cat << 'EOF' | ssh -i .keys/mcp-deployment-ed25519 root@46.250.243.123 'bash -s'
#!/bin/bash
set -euo pipefail

echo "[VMI01] Installing performance tools..."
apt-get install -y -qq sysstat iotop htop

echo "[VMI01] Configuring kernel parameters for performance..."
cat >> /etc/sysctl.d/99-mcp-performance.conf << 'SYSCTL'
# Network performance
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 67108864
net.ipv4.tcp_wmem = 4096 65536 67108864
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq

# PostgreSQL tuning
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
vm.overcommit_memory = 2
vm.overcommit_ratio = 80

# File system
fs.file-max = 2097152
fs.aio-max-nr = 1048576

# Shared memory for PostgreSQL
kernel.shmmax = 17179869184
kernel.shmall = 4194304
SYSCTL

sysctl -p /etc/sysctl.d/99-mcp-performance.conf

echo "[VMI01] Configuring I/O scheduler for SSD..."
# Set deadline scheduler for SSDs
for disk in /sys/block/sd*/queue/scheduler; do
    echo deadline > "$disk" 2>/dev/null || true
done

# Make persistent
cat >> /etc/udev/rules.d/60-scheduler.rules << 'UDEV'
ACTION=="add|change", KERNEL=="sd[a-z]", ATTR{queue/scheduler}="deadline"
UDEV

echo "[VMI01] Creating Redis configuration (2GB cache)..."
mkdir -p /etc/redis
cat > /etc/redis/redis.conf << 'REDIS'
# Redis configuration for MCP caching
bind 127.0.0.1 10.0.0.1
port 6379
protected-mode yes
tcp-backlog 511
timeout 300
tcp-keepalive 300

# Memory
maxmemory 2gb
maxmemory-policy allkeys-lru

# Persistence (AOF for durability)
appendonly yes
appendfsync everysec
auto-aof-rewrite-percentage 100
auto-aof-rewrite-min-size 64mb

# Performance
save 900 1
save 300 10
save 60 10000
stop-writes-on-bgsave-error yes
rdbcompression yes
rdbchecksum yes

# Limits
maxclients 10000
REDIS

echo "[VMI01] Creating directory structure..."
mkdir -p /opt/mcp/{services,logs,config,cache}
mkdir -p /var/lib/postgresql/16/main
mkdir -p /var/log/mcp

echo "[VMI01] High-performance configuration complete ✓"
EOF

    log "VMI01 performance configuration complete ✓"
}

################################################################################
# VMI02D: Storage Hub Configuration
################################################################################

configure_vmi02d_storage() {
    log "=== Configuring VMI02D as Storage Hub (1TB) ==="

    cat << 'EOF' | ssh -i .keys/mcp-deployment-ed25519 root@46.250.241.70 'bash -s'
#!/bin/bash
set -euo pipefail

echo "[VMI02D] Installing storage management tools..."
apt-get install -y -qq lvm2 nfs-kernel-server rsync zfs-dkms zfsutils-linux

echo "[VMI02D] Creating storage directory structure..."
mkdir -p /mnt/storage/{media,nextcloud,backups,logs,offload}
mkdir -p /mnt/storage/backups/{database,configs,snapshots}

# Plex directories
mkdir -p /mnt/storage/media/{movies,tv,music,photos}
chown -R 1000:1000 /mnt/storage/media

# Nextcloud directories
mkdir -p /mnt/storage/nextcloud/{data,config,apps}
chown -R 33:33 /mnt/storage/nextcloud

# Backup directories
mkdir -p /mnt/storage/backups/database/{pgbackrest,dumps,wal-archive}
mkdir -p /mnt/storage/backups/configs

# Log archive directories
mkdir -p /mnt/storage/logs/{mcp,postgresql,system,audit}

# Offload storage for VMI01
mkdir -p /mnt/storage/offload/{large-objects,temp,archive}

echo "[VMI02D] Configuring NFS exports for VMI01 access..."
cat >> /etc/exports << 'NFS'
# VMI01 can mount storage for offloading
/mnt/storage/offload 10.0.0.1(rw,sync,no_subtree_check,no_root_squash)
/mnt/storage/backups 10.0.0.1(ro,sync,no_subtree_check)
NFS

# Don't restart NFS yet (no clients configured)
exportfs -ra

echo "[VMI02D] Configuring kernel parameters for storage..."
cat >> /etc/sysctl.d/99-mcp-storage.conf << 'SYSCTL'
# Storage optimization
vm.swappiness = 1
vm.dirty_ratio = 40
vm.dirty_background_ratio = 10

# File system
fs.file-max = 2097152

# Network (for NFS)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
SYSCTL

sysctl -p /etc/sysctl.d/99-mcp-storage.conf

echo "[VMI02D] Configuring I/O scheduler for storage workload..."
for disk in /sys/block/sd*/queue/scheduler; do
    echo cfq > "$disk" 2>/dev/null || true
done

echo "[VMI02D] Creating backup retention policy script..."
cat > /usr/local/bin/cleanup-old-backups.sh << 'CLEANUP'
#!/bin/bash
# GFS Backup Retention Policy
# Daily (Son): 7 days
# Weekly (Father): 4 weeks
# Monthly (Grandfather): 12 months

BACKUP_ROOT="/mnt/storage/backups"

# Clean up daily backups older than 7 days
find "$BACKUP_ROOT/database/dumps" -name "daily-*" -mtime +7 -delete

# Clean up weekly backups older than 4 weeks
find "$BACKUP_ROOT/database/dumps" -name "weekly-*" -mtime +28 -delete

# Clean up monthly backups older than 12 months
find "$BACKUP_ROOT/database/dumps" -name "monthly-*" -mtime +365 -delete

echo "Backup cleanup completed: $(date)"
CLEANUP

chmod +x /usr/local/bin/cleanup-old-backups.sh

# Schedule cleanup daily at 2 AM
echo "0 2 * * * root /usr/local/bin/cleanup-old-backups.sh >> /var/log/backup-cleanup.log 2>&1" > /etc/cron.d/backup-cleanup

echo "[VMI02D] Creating PostgreSQL hot standby configuration..."
mkdir -p /etc/postgresql/16/standby
cat > /etc/postgresql/16/standby/recovery.conf << 'STANDBY'
# Hot standby configuration
standby_mode = on
primary_conninfo = 'host=10.0.0.1 port=5432 user=replicator password=REPLICATION_PASSWORD_PLACEHOLDER'
primary_slot_name = 'standby_slot'
restore_command = 'cp /mnt/storage/backups/database/wal-archive/%f %p'
archive_cleanup_command = 'pg_archivecleanup /mnt/storage/backups/database/wal-archive %r'
STANDBY

echo "[VMI02D] Storage hub configuration complete ✓"
EOF

    log "VMI02D storage configuration complete ✓"
}

################################################################################
# VMI03: Orchestrator Configuration
################################################################################

configure_vmi03_orchestrator() {
    log "=== Configuring VMI03 as Orchestrator ==="

    cat << 'EOF' | ssh -i .keys/mcp-deployment-ed25519 root@154.26.158.31 'bash -s'
#!/bin/bash
set -euo pipefail

echo "[VMI03] Installing orchestration tools..."
apt-get install -y -qq haproxy prometheus grafana wireguard-tools

echo "[VMI03] Creating directory structure..."
mkdir -p /opt/mcp/{haproxy,prometheus,grafana,wireguard,dashboard}
mkdir -p /etc/haproxy/certs

echo "[VMI03] Configuring HAProxy load balancer..."
cat > /etc/haproxy/haproxy.cfg << 'HAPROXY'
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon
    maxconn 4096

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect 5000
    timeout client  50000
    timeout server  50000

# Stats interface
listen stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 30s
    stats auth admin:mcp-ha-stats-2024

# MCP Orchestrator
frontend mcp_orchestrator_front
    bind *:3000
    default_backend mcp_orchestrator_back

backend mcp_orchestrator_back
    balance roundrobin
    server vmi01 10.0.0.1:3000 check

# Perplexity MCP
frontend perplexity_mcp_front
    bind *:3001
    default_backend perplexity_mcp_back

backend perplexity_mcp_back
    balance roundrobin
    server vmi01 10.0.0.1:3001 check

# IT-MCP
frontend it_mcp_front
    bind *:3002
    default_backend it_mcp_back

backend it_mcp_back
    balance roundrobin
    server vmi01 10.0.0.1:3002 check

# Cloudflare MCP
frontend cloudflare_mcp_front
    bind *:3003
    default_backend cloudflare_mcp_back

backend cloudflare_mcp_back
    balance roundrobin
    server vmi01 10.0.0.1:3003 check

# PostgreSQL (primary)
listen postgres_primary
    bind *:5432
    mode tcp
    option pgsql-check user postgres
    server vmi01 10.0.0.1:5432 check

# PostgreSQL (standby - read-only)
listen postgres_standby
    bind *:5433
    mode tcp
    option pgsql-check user postgres
    server vmi02d 10.0.0.2:5432 check
HAPROXY

echo "[VMI03] Configuring firewall rules..."
cat > /etc/iptables/rules.v4 << 'IPTABLES'
*filter
:INPUT DROP [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [0:0]

# Loopback
-A INPUT -i lo -j ACCEPT

# Established connections
-A INPUT -m state --state RELATED,ESTABLISHED -j ACCEPT

# SSH (restrict to known IPs in production)
-A INPUT -p tcp --dport 22 -j ACCEPT

# HAProxy stats
-A INPUT -p tcp --dport 8404 -s 10.0.0.0/22 -j ACCEPT

# MCP services
-A INPUT -p tcp --dport 3000:3003 -j ACCEPT

# PostgreSQL proxies
-A INPUT -p tcp --dport 5432 -j ACCEPT
-A INPUT -p tcp --dport 5433 -j ACCEPT

# Prometheus
-A INPUT -p tcp --dport 9090 -s 10.0.0.0/22 -j ACCEPT

# Grafana
-A INPUT -p tcp --dport 3004 -j ACCEPT

# WireGuard
-A INPUT -p udp --dport 51820 -j ACCEPT

# ICMP (ping)
-A INPUT -p icmp -j ACCEPT

# Private LAN (trust all from DC-LAN)
-A INPUT -s 10.0.0.0/22 -j ACCEPT

COMMIT
IPTABLES

echo "[VMI03] Orchestrator configuration complete ✓"
EOF

    log "VMI03 orchestrator configuration complete ✓"
}

################################################################################
# Main Execution
################################################################################

main() {
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  MCP Ecosystem - VM Role Configuration                    ║"
    log "╚════════════════════════════════════════════════════════════╝"

    info "This script will configure each VM for its specific role:"
    info "  • VMI01: High-performance database and MCP entry point"
    info "  • VMI02D: 1TB storage hub with hot standby"
    info "  • VMI03: Orchestrator and external gateway"
    echo ""

    read -p "Proceed with configuration? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy]es$ ]]; then
        warn "Configuration cancelled"
        exit 0
    fi

    configure_vmi01_performance
    configure_vmi02d_storage
    configure_vmi03_orchestrator

    log ""
    log "╔════════════════════════════════════════════════════════════╗"
    log "║  VM role configuration completed successfully!            ║"
    log "╚════════════════════════════════════════════════════════════╝"
}

main "$@"
