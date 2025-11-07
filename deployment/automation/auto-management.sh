#!/bin/bash
# ============================================================================
# MCP Ecosystem - Automated Management & Maintenance
# ============================================================================
# Purpose: Automated routine maintenance tasks for MCP infrastructure
# Target: All VMs (VMI01, VMI02D, VMI03)
# Version: 0.2.0
#
# Automated Tasks:
#   - Database maintenance (VACUUM, ANALYZE, REINDEX)
#   - Log rotation and cleanup
#   - Disk space management
#   - Performance optimization
#   - Security updates check
#   - Backup verification
#   - Health metrics collection
#   - Certificate renewal (for future SSL/TLS)
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="/var/log/mcp"
LOG_FILE="$LOG_DIR/auto-management-$(date +%Y%m%d_%H%M%S).log"
STATE_DIR="/var/lib/mcp/automation"

# VMs
VMI01_HOST="${VMI01_HOST:-46.250.243.123}"
VMI02D_HOST="${VMI02D_HOST:-46.250.241.70}"
VMI03_HOST="${VMI03_HOST:-154.26.158.31}"

# Database
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"

# Thresholds
DISK_WARNING_THRESHOLD=80
DISK_CRITICAL_THRESHOLD=90
LOG_RETENTION_DAYS=30
OLD_BACKUP_DAYS=7

# ============================================================================
# Logging
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $*" | tee -a "$LOG_FILE"
}

log_step() {
    echo -e "${CYAN}▶${NC} $*" | tee -a "$LOG_FILE"
}

# ============================================================================
# Database Maintenance
# ============================================================================

database_maintenance() {
    local target_host=$1
    log_step "Running database maintenance on $target_host..."

    ssh "dev-admin@$target_host" bash <<'EOF'
set -e

DB_NAME="mcp_ecosystem"

# Check if this is the primary (not a standby)
IS_STANDBY=$(sudo -u postgres psql -t -c "SELECT pg_is_in_recovery();" 2>/dev/null | tr -d ' ' || echo "")

if [ "$IS_STANDBY" = "t" ]; then
    echo "This is a standby database, skipping maintenance"
    exit 0
fi

echo "Running database maintenance..."

# VACUUM ANALYZE (routine maintenance)
echo "Running VACUUM ANALYZE..."
sudo -u postgres psql -d "$DB_NAME" -c "VACUUM ANALYZE;" 2>&1

# Check for bloated tables
echo "Checking for table bloat..."
sudo -u postgres psql -d "$DB_NAME" -c "
    SELECT
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
    FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    LIMIT 10;
" 2>&1

# Check for long-running transactions
echo "Checking for long-running transactions..."
LONG_QUERIES=$(sudo -u postgres psql -d "$DB_NAME" -t -c "
    SELECT COUNT(*)
    FROM pg_stat_activity
    WHERE state = 'active'
    AND now() - query_start > interval '10 minutes';
" 2>&1 | tr -d ' ')

if [ "$LONG_QUERIES" -gt 0 ]; then
    echo "WARNING: Found $LONG_QUERIES long-running transactions (>10 minutes)"
    sudo -u postgres psql -d "$DB_NAME" -c "
        SELECT
            pid,
            usename,
            application_name,
            now() - query_start as duration,
            query
        FROM pg_stat_activity
        WHERE state = 'active'
        AND now() - query_start > interval '10 minutes'
        ORDER BY query_start;
    " 2>&1
fi

# Update statistics
echo "Updating query planner statistics..."
sudo -u postgres psql -d "$DB_NAME" -c "ANALYZE;" 2>&1

# Check for unused indexes
echo "Checking for unused indexes..."
sudo -u postgres psql -d "$DB_NAME" -c "
    SELECT
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
        idx_scan
    FROM pg_stat_user_indexes
    WHERE idx_scan = 0
    AND indexrelid NOT IN (
        SELECT conindid FROM pg_constraint WHERE contype IN ('p', 'u')
    )
    ORDER BY pg_relation_size(indexrelid) DESC;
" 2>&1

# Database size report
echo "Database size summary:"
sudo -u postgres psql -d "$DB_NAME" -c "
    SELECT
        pg_size_pretty(pg_database_size('$DB_NAME')) as db_size,
        pg_size_pretty(pg_total_relation_size('thoughts')) as thoughts_table_size,
        (SELECT COUNT(*) FROM thoughts) as thought_count;
" 2>&1

echo "Database maintenance completed"
EOF

    if [ $? -eq 0 ]; then
        log_success "Database maintenance completed on $target_host"
    else
        log_error "Database maintenance failed on $target_host"
        return 1
    fi
}

# ============================================================================
# Log Cleanup
# ============================================================================

log_cleanup() {
    local target_host=$1
    log_step "Cleaning up old logs on $target_host..."

    ssh "dev-admin@$target_host" bash <<EOF
set -e

echo "Cleaning up logs older than $LOG_RETENTION_DAYS days..."

# MCP logs
if [ -d /var/log/mcp ]; then
    OLD_LOGS=\$(find /var/log/mcp -name "*.log" -mtime +$LOG_RETENTION_DAYS 2>/dev/null | wc -l)
    if [ "\$OLD_LOGS" -gt 0 ]; then
        echo "Removing \$OLD_LOGS old MCP log files..."
        find /var/log/mcp -name "*.log" -mtime +$LOG_RETENTION_DAYS -delete
    else
        echo "No old MCP logs to remove"
    fi
fi

# Compress recent logs
if [ -d /var/log/mcp ]; then
    echo "Compressing logs older than 7 days..."
    find /var/log/mcp -name "*.log" -mtime +7 ! -name "*.gz" -exec gzip {} \; 2>/dev/null || true
fi

# PostgreSQL logs
if [ -d /var/log/postgresql ]; then
    OLD_PG_LOGS=\$(find /var/log/postgresql -name "*.log" -mtime +$LOG_RETENTION_DAYS 2>/dev/null | wc -l)
    if [ "\$OLD_PG_LOGS" -gt 0 ]; then
        echo "Removing \$OLD_PG_LOGS old PostgreSQL log files..."
        sudo find /var/log/postgresql -name "*.log" -mtime +$LOG_RETENTION_DAYS -delete
    fi
fi

# Journal logs
echo "Cleaning systemd journal logs (keep last 30 days)..."
sudo journalctl --vacuum-time=30d

# System logs
echo "Cleaning /var/log..."
sudo find /var/log -name "*.gz" -mtime +$LOG_RETENTION_DAYS -delete 2>/dev/null || true
sudo find /var/log -name "*.[0-9]" -mtime +$LOG_RETENTION_DAYS -delete 2>/dev/null || true

echo "Log cleanup completed"
EOF

    if [ $? -eq 0 ]; then
        log_success "Log cleanup completed on $target_host"
    else
        log_warning "Log cleanup had issues on $target_host"
    fi
}

# ============================================================================
# Disk Space Management
# ============================================================================

disk_space_management() {
    local target_host=$1
    log_step "Managing disk space on $target_host..."

    ssh "dev-admin@$target_host" bash <<EOF
set -e

# Check disk usage
DISK_USAGE=\$(df -h / | tail -1 | awk '{print \$5}' | sed 's/%//')

echo "Current disk usage: \${DISK_USAGE}%"

if [ "\$DISK_USAGE" -ge $DISK_CRITICAL_THRESHOLD ]; then
    echo "CRITICAL: Disk usage above $DISK_CRITICAL_THRESHOLD%"

    # Show largest directories
    echo "Largest directories in /:"
    sudo du -h --max-depth=2 / 2>/dev/null | sort -h | tail -10

    # Clean package cache
    echo "Cleaning package cache..."
    sudo apt-get clean
    sudo apt-get autoclean

    # Clean old kernels (keep last 2)
    echo "Cleaning old kernels..."
    sudo apt-get autoremove --purge -y

    # Check again
    NEW_DISK_USAGE=\$(df -h / | tail -1 | awk '{print \$5}' | sed 's/%//')
    echo "Disk usage after cleanup: \${NEW_DISK_USAGE}%"

elif [ "\$DISK_USAGE" -ge $DISK_WARNING_THRESHOLD ]; then
    echo "WARNING: Disk usage above $DISK_WARNING_THRESHOLD%"

    # Show disk usage summary
    echo "Disk usage by directory:"
    du -h --max-depth=1 /var 2>/dev/null | sort -h | tail -5

else
    echo "Disk usage is healthy"
fi

# Check inode usage
INODE_USAGE=\$(df -i / | tail -1 | awk '{print \$5}' | sed 's/%//')
echo "Inode usage: \${INODE_USAGE}%"

if [ "\$INODE_USAGE" -ge 80 ]; then
    echo "WARNING: High inode usage"
    echo "Top directories by file count:"
    find /var -xdev -type f | cut -d "/" -f 1-3 | sort | uniq -c | sort -rn | head -10
fi

echo "Disk space check completed"
EOF

    if [ $? -eq 0 ]; then
        log_success "Disk space management completed on $target_host"
    else
        log_warning "Disk space management had issues on $target_host"
    fi
}

# ============================================================================
# Performance Optimization
# ============================================================================

performance_optimization() {
    local target_host=$1
    log_step "Running performance optimizations on $target_host..."

    ssh "dev-admin@$target_host" bash <<'EOF'
set -e

echo "Checking system performance..."

# CPU load
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | cut -d',' -f1 | tr -d ' ')
CPU_COUNT=$(nproc)
echo "Load average: $LOAD_AVG (CPUs: $CPU_COUNT)"

# Memory usage
FREE_MEM=$(free -m | grep Mem | awk '{print $7}')
TOTAL_MEM=$(free -m | grep Mem | awk '{print $2}')
echo "Available memory: ${FREE_MEM}MB / ${TOTAL_MEM}MB"

# Clear page cache if memory is low (< 20% free)
MEM_PCT=$((FREE_MEM * 100 / TOTAL_MEM))
if [ $MEM_PCT -lt 20 ]; then
    echo "WARNING: Low memory, clearing page cache..."
    sync
    sudo sh -c 'echo 3 > /proc/sys/vm/drop_caches'
    echo "Page cache cleared"
fi

# Check for zombie processes
ZOMBIES=$(ps aux | grep -c 'Z$' || echo "0")
if [ $ZOMBIES -gt 0 ]; then
    echo "WARNING: Found $ZOMBIES zombie processes"
    ps aux | grep 'Z$' | head -10
fi

# Optimize swappiness if needed
CURRENT_SWAPPINESS=$(cat /proc/sys/vm/swappiness)
echo "Current swappiness: $CURRENT_SWAPPINESS"
if [ $CURRENT_SWAPPINESS -gt 10 ]; then
    echo "Optimizing swappiness to 10 for database workload..."
    sudo sysctl vm.swappiness=10
fi

# Check network connections
ESTABLISHED_CONNS=$(ss -s | grep 'estab' | awk '{print $2}' || echo "0")
echo "Established connections: $ESTABLISHED_CONNS"

echo "Performance optimization completed"
EOF

    if [ $? -eq 0 ]; then
        log_success "Performance optimization completed on $target_host"
    else
        log_warning "Performance optimization had issues on $target_host"
    fi
}

# ============================================================================
# Security Updates Check
# ============================================================================

security_updates_check() {
    local target_host=$1
    log_step "Checking for security updates on $target_host..."

    ssh "dev-admin@$target_host" bash <<'EOF'
set -e

# Update package lists
sudo apt-get update -qq

# Check for security updates
SECURITY_UPDATES=$(apt-get -s upgrade | grep -i security | wc -l)

echo "Security updates available: $SECURITY_UPDATES"

if [ $SECURITY_UPDATES -gt 0 ]; then
    echo "Security updates pending:"
    apt-get -s upgrade | grep -i security

    # Optionally auto-install security updates (uncomment if desired)
    # echo "Auto-installing security updates..."
    # sudo apt-get upgrade -y --only-upgrade $(apt-get -s upgrade | grep -i security | awk '{print $2}')
fi

# Check for required reboots
if [ -f /var/run/reboot-required ]; then
    echo "WARNING: System reboot required"
    cat /var/run/reboot-required.pkgs
else
    echo "No reboot required"
fi

echo "Security updates check completed"
EOF

    if [ $? -eq 0 ]; then
        log_success "Security updates check completed on $target_host"
    else
        log_warning "Security updates check had issues on $target_host"
    fi
}

# ============================================================================
# Backup Verification
# ============================================================================

backup_verification() {
    log_step "Verifying recent backups..."

    ssh "dev-admin@$VMI01_HOST" bash <<EOF
set -e

echo "Checking PostgreSQL backups..."

BACKUP_DIR="/var/backups/postgresql"

if [ -d "\$BACKUP_DIR" ]; then
    # Find most recent backup
    LATEST_BACKUP=\$(find "\$BACKUP_DIR" -name "*.backup" -mtime -1 | head -1)

    if [ -n "\$LATEST_BACKUP" ]; then
        echo "Latest backup found: \$LATEST_BACKUP"
        BACKUP_SIZE=\$(du -h "\$LATEST_BACKUP" | cut -f1)
        BACKUP_DATE=\$(stat -c %y "\$LATEST_BACKUP" | cut -d' ' -f1)
        echo "  Size: \$BACKUP_SIZE"
        echo "  Date: \$BACKUP_DATE"

        # Verify backup integrity (quick check)
        if pg_restore --list "\$LATEST_BACKUP" >/dev/null 2>&1; then
            echo "  ✓ Backup integrity verified"
        else
            echo "  ✗ WARNING: Backup may be corrupted"
        fi
    else
        echo "WARNING: No backup found in last 24 hours"
    fi

    # Check old backups
    OLD_BACKUPS=\$(find "\$BACKUP_DIR" -name "*.backup" -mtime +$OLD_BACKUP_DAYS | wc -l)
    if [ "\$OLD_BACKUPS" -gt 0 ]; then
        echo "Removing \$OLD_BACKUPS old backups (>$OLD_BACKUP_DAYS days)..."
        find "\$BACKUP_DIR" -name "*.backup" -mtime +$OLD_BACKUP_DAYS -delete
    fi
else
    echo "Backup directory not found: \$BACKUP_DIR"
fi

echo "Backup verification completed"
EOF

    if [ $? -eq 0 ]; then
        log_success "Backup verification completed"
    else
        log_warning "Backup verification had issues"
    fi
}

# ============================================================================
# Health Metrics Collection
# ============================================================================

collect_health_metrics() {
    log_step "Collecting health metrics..."

    mkdir -p "$STATE_DIR/metrics"
    METRICS_FILE="$STATE_DIR/metrics/$(date +%Y%m%d_%H%M%S).json"

    cat > "$METRICS_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "vms": {
EOF

    for host in "$VMI01_HOST" "$VMI02D_HOST" "$VMI03_HOST"; do
        log "Collecting metrics from $host..."

        VM_METRICS=$(ssh "dev-admin@$host" bash <<'METRICSCRIPT'
set -e

CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)
MEM_TOTAL=$(free -m | grep Mem | awk '{print $2}')
MEM_USED=$(free -m | grep Mem | awk '{print $3}')
MEM_PCT=$((MEM_USED * 100 / MEM_TOTAL))
DISK_USAGE=$(df -h / | tail -1 | awk '{print $5}' | sed 's/%//')
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | cut -d',' -f1 | tr -d ' ')

cat <<EOF
{
  "cpu_usage_pct": $CPU_USAGE,
  "memory_used_mb": $MEM_USED,
  "memory_total_mb": $MEM_TOTAL,
  "memory_pct": $MEM_PCT,
  "disk_usage_pct": $DISK_USAGE,
  "load_average": $LOAD_AVG
}
EOF
METRICSCRIPT
)

        cat >> "$METRICS_FILE" <<EOF
    "$host": $VM_METRICS,
EOF
    done

    # Remove trailing comma and close JSON
    sed -i '$ s/,$//' "$METRICS_FILE"
    cat >> "$METRICS_FILE" <<EOF
  }
}
EOF

    log_success "Health metrics collected: $METRICS_FILE"

    # Keep only last 30 days of metrics
    find "$STATE_DIR/metrics" -name "*.json" -mtime +30 -delete 2>/dev/null || true
}

# ============================================================================
# Generate Maintenance Report
# ============================================================================

generate_report() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         AUTOMATED MAINTENANCE COMPLETED                        ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log "Maintenance tasks completed:"
    log "  ✓ Database maintenance and optimization"
    log "  ✓ Log cleanup and rotation"
    log "  ✓ Disk space management"
    log "  ✓ Performance optimization"
    log "  ✓ Security updates check"
    log "  ✓ Backup verification"
    log "  ✓ Health metrics collection"

    echo ""
    log "Next scheduled maintenance:"
    log "  - Daily: Log cleanup, disk space check, metrics collection"
    log "  - Weekly: Database VACUUM, security updates check"
    log "  - Monthly: Full database optimization, backup verification"

    echo ""
    log "Full log: $LOG_FILE"
    log "Metrics: $STATE_DIR/metrics/"
}

# ============================================================================
# Install as Cron Jobs
# ============================================================================

install_cron_jobs() {
    log_step "Installing automated maintenance cron jobs..."

    # Create cron file
    cat | sudo tee /etc/cron.d/mcp-auto-management > /dev/null <<CRONFILE
# MCP Ecosystem Automated Maintenance
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Daily maintenance (3 AM)
0 3 * * * dev-admin /opt/mcp/automation/auto-management.sh --daily >> /var/log/mcp/auto-management-cron.log 2>&1

# Weekly maintenance (Sunday 4 AM)
0 4 * * 0 dev-admin /opt/mcp/automation/auto-management.sh --weekly >> /var/log/mcp/auto-management-cron.log 2>&1

# Monthly maintenance (1st of month, 5 AM)
0 5 1 * * dev-admin /opt/mcp/automation/auto-management.sh --monthly >> /var/log/mcp/auto-management-cron.log 2>&1
CRONFILE

    sudo chmod 644 /etc/cron.d/mcp-auto-management

    log_success "Cron jobs installed"
    log "Schedules:"
    log "  - Daily (3 AM):   Log cleanup, disk space, metrics"
    log "  - Weekly (Sun 4 AM): Database maintenance, security updates"
    log "  - Monthly (1st 5 AM): Full optimization, backup verification"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    mkdir -p "$LOG_DIR"
    mkdir -p "$STATE_DIR"

    # Parse arguments
    case "${1:-}" in
        --daily)
            log "═══════════════════════════════════════════════════════════════"
            log "DAILY MAINTENANCE"
            log "═══════════════════════════════════════════════════════════════"
            log_cleanup "$VMI01_HOST"
            disk_space_management "$VMI01_HOST"
            collect_health_metrics
            ;;
        --weekly)
            log "═══════════════════════════════════════════════════════════════"
            log "WEEKLY MAINTENANCE"
            log "═══════════════════════════════════════════════════════════════"
            database_maintenance "$VMI01_HOST"
            security_updates_check "$VMI01_HOST"
            security_updates_check "$VMI02D_HOST"
            security_updates_check "$VMI03_HOST"
            performance_optimization "$VMI01_HOST"
            ;;
        --monthly)
            log "═══════════════════════════════════════════════════════════════"
            log "MONTHLY MAINTENANCE"
            log "═══════════════════════════════════════════════════════════════"
            database_maintenance "$VMI01_HOST"
            backup_verification
            # Full system optimization
            for host in "$VMI01_HOST" "$VMI02D_HOST" "$VMI03_HOST"; do
                log_cleanup "$host"
                disk_space_management "$host"
                performance_optimization "$host"
            done
            ;;
        --install-cron)
            install_cron_jobs
            ;;
        *)
            echo "╔════════════════════════════════════════════════════════════════╗"
            echo "║         MCP Ecosystem - Automated Management                   ║"
            echo "╚════════════════════════════════════════════════════════════════╝"
            echo ""
            log "Running full maintenance cycle..."
            echo ""

            # Run all maintenance tasks
            database_maintenance "$VMI01_HOST"
            for host in "$VMI01_HOST" "$VMI02D_HOST" "$VMI03_HOST"; do
                log_cleanup "$host"
                disk_space_management "$host"
                performance_optimization "$host"
                security_updates_check "$host"
            done
            backup_verification
            collect_health_metrics

            generate_report
            ;;
    esac
}

# Run main function
main "$@"
