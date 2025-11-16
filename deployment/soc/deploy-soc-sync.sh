#!/bin/bash
################################################################################
# deploy-soc-sync.sh - Deploy nightly SOC synchronization and reporting
#
# Usage: ./deploy-soc-sync.sh [VMI01|VMI02D|VMI03|all]
#
# Security: Automated nightly tasks for threat intelligence updates, backup
#           verification, log rotation, and multi-channel reporting
################################################################################

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/soc-sync-deploy.log"

# VM Configuration
readonly VMI01_IP="46.250.243.123"
readonly VMI02D_IP="46.250.241.70"
readonly VMI03_IP="154.26.158.31"

################################################################################
# Logging Functions
################################################################################

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "${LOG_FILE}" >&2
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*" | tee -a "${LOG_FILE}"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $*" | tee -a "${LOG_FILE}"
}

################################################################################
# Error Handling
################################################################################

cleanup_on_error() {
    local exit_code=$?
    if [[ ${exit_code} -ne 0 ]]; then
        log_error "Deployment failed with exit code ${exit_code}"
        log_warn "Check logs at ${LOG_FILE}"
    fi
}

trap cleanup_on_error EXIT

################################################################################
# Validation Functions
################################################################################

validate_host() {
    local host=$1
    if [[ ! "${host}" =~ ^(VMI01|VMI02D|VMI03|all)$ ]]; then
        log_error "Invalid host: ${host}. Must be VMI01, VMI02D, VMI03, or all"
        return 1
    fi
    return 0
}

check_ssh_access() {
    local ip=$1
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "root@${ip}" "echo 'SSH OK'" &>/dev/null; then
        log_error "Cannot SSH to root@${ip}. Check SSH keys and access."
        return 1
    fi
    log "SSH access verified for ${ip}"
    return 0
}

################################################################################
# SOC Sync Deployment
################################################################################

deploy_soc_sync() {
    local ip=$1
    local hostname=$2

    log_info "Deploying SOC sync scripts to ${hostname} (${ip})"

    ssh "root@${ip}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

echo "=== Deploying SOC Sync Scripts ==="

# Create SOC directory structure
mkdir -p /opt/soc/{logs,reports,exports,config}
chmod 755 /opt/soc

# Create SOC configuration file
cat > /opt/soc/config.yaml <<'EOF'
# SOC Configuration

# Notification channels
notifications:
  email:
    enabled: false
    smtp_server: localhost
    smtp_port: 25
    from: soc@mcp.local
    to: admin@mcp.local

  nextcloud:
    enabled: false
    webhook_url: https://cloud.example.com/index.php/apps/spreed/api/v1/webhook/xyz

  slack:
    enabled: false
    webhook_url: https://hooks.slack.com/services/XXX

  telegram:
    enabled: false
    bot_token: YOUR_BOT_TOKEN
    chat_id: YOUR_CHAT_ID

# Backup configuration
backups:
  directory: /opt/mcp/backups
  retention_days: 30
  verify_hashes: true

# Threat feed updates
threat_feeds:
  suricata: true
  crowdsec: true
  wazuh: true

# Report generation
reports:
  daily: true
  weekly: true
  monthly: true
  format: json
EOF

chmod 600 /opt/soc/config.yaml

# Create main SOC sync script
cat > /opt/soc/soc_sync.sh <<'EOF'
#!/bin/bash
################################################################################
# soc_sync.sh - Nightly SOC synchronization and maintenance
################################################################################

set -euo pipefail

# Configuration
readonly LOG_FILE="/opt/soc/logs/soc_sync_$(date +%Y%m%d).log"
readonly REPORT_FILE="/opt/soc/reports/soc_report_$(date +%Y%m%d).json"
readonly CONFIG_FILE="/opt/soc/config.yaml"

# Ensure log directory exists
mkdir -p /opt/soc/logs /opt/soc/reports /opt/soc/exports

# Logging functions
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $*" | tee -a "${LOG_FILE}" >&2
}

# Start sync
log "=== SOC Nightly Sync Started ==="

# Initialize report
cat > "${REPORT_FILE}" <<REPORT
{
  "timestamp": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "sync_tasks": {
REPORT

################################################################################
# 1. Update Threat Feeds
################################################################################

log "Updating threat intelligence feeds..."

SURICATA_STATUS="success"
CROWDSEC_STATUS="success"
WAZUH_STATUS="success"

# Update Suricata rules
if command -v suricata-update &>/dev/null; then
    if suricata-update -o /var/lib/suricata/rules 2>&1 | tee -a "${LOG_FILE}"; then
        log "✓ Suricata rules updated"
        # Reload Suricata
        if systemctl is-active --quiet suricata; then
            systemctl reload suricata || log_error "Failed to reload Suricata"
        fi
    else
        log_error "Failed to update Suricata rules"
        SURICATA_STATUS="failed"
    fi
fi

# Update CrowdSec hub
if command -v cscli &>/dev/null; then
    if cscli hub update 2>&1 | tee -a "${LOG_FILE}"; then
        log "✓ CrowdSec hub updated"
        cscli hub upgrade 2>&1 | tee -a "${LOG_FILE}" || true
    else
        log_error "Failed to update CrowdSec hub"
        CROWDSEC_STATUS="failed"
    fi
fi

# Reload Wazuh
if command -v /var/ossec/bin/wazuh-control &>/dev/null; then
    if /var/ossec/bin/wazuh-control reload 2>&1 | tee -a "${LOG_FILE}"; then
        log "✓ Wazuh reloaded"
    else
        log_error "Failed to reload Wazuh"
        WAZUH_STATUS="failed"
    fi
fi

################################################################################
# 2. Export Security Decisions
################################################################################

log "Exporting security decisions and banlists..."

EXPORT_STATUS="success"

# Export CrowdSec decisions
if command -v cscli &>/dev/null; then
    if cscli decisions export -o json > /opt/soc/exports/crowdsec_banlist_$(date +%Y%m%d).json 2>&1; then
        log "✓ CrowdSec banlist exported"
    else
        log_error "Failed to export CrowdSec banlist"
        EXPORT_STATUS="failed"
    fi
fi

# Export Suricata stats
if [[ -f /var/log/suricata/eve.json ]]; then
    tail -10000 /var/log/suricata/eve.json | \
        jq -s '[.[] | select(.event_type == "alert")] | group_by(.alert.signature) |
               map({signature: .[0].alert.signature, count: length}) |
               sort_by(-.count) | .[0:20]' \
        > /opt/soc/exports/suricata_top_alerts_$(date +%Y%m%d).json 2>/dev/null || true
fi

################################################################################
# 3. Backup Verification
################################################################################

log "Verifying backups..."

BACKUP_STATUS="success"
BACKUP_DIR="/opt/mcp/backups"

if [[ -d "${BACKUP_DIR}" ]]; then
    # Generate SHA256 hashes of all backups
    if find "${BACKUP_DIR}" -type f -exec sha256sum {} \; > /opt/soc/backup_hashes_$(date +%Y%m%d).txt 2>&1; then
        log "✓ Backup hashes generated"

        # Count backups
        BACKUP_COUNT=$(find "${BACKUP_DIR}" -type f | wc -l)
        BACKUP_SIZE=$(du -sh "${BACKUP_DIR}" | cut -f1)
        log "  Backup count: ${BACKUP_COUNT} files, Total size: ${BACKUP_SIZE}"
    else
        log_error "Failed to generate backup hashes"
        BACKUP_STATUS="failed"
    fi
else
    log_error "Backup directory not found: ${BACKUP_DIR}"
    BACKUP_STATUS="failed"
fi

################################################################################
# 4. Log Rotation and Cleanup
################################################################################

log "Performing log cleanup..."

CLEANUP_STATUS="success"

# Compress old logs older than 7 days
find /var/log/suricata -name "*.log" -mtime +7 -exec gzip {} \; 2>/dev/null || true
find /var/log/falco -name "*.log" -mtime +7 -exec gzip {} \; 2>/dev/null || true
find /opt/soc/logs -name "*.log" -mtime +7 -exec gzip {} \; 2>/dev/null || true

# Delete logs older than 90 days
find /opt/soc/logs -name "*.log.gz" -mtime +90 -delete 2>/dev/null || true
find /opt/soc/reports -name "*.json" -mtime +90 -delete 2>/dev/null || true
find /opt/soc/exports -name "*.json" -mtime +30 -delete 2>/dev/null || true

log "✓ Log cleanup completed"

################################################################################
# 5. Security Metrics Collection
################################################################################

log "Collecting security metrics..."

METRICS_STATUS="success"

# Collect CrowdSec metrics
if command -v cscli &>/dev/null; then
    cscli metrics -o json > /opt/soc/reports/crowdsec_metrics_$(date +%Y%m%d).json 2>/dev/null || true
fi

# Collect Falco event counts
if [[ -f /var/log/falco/events.log ]]; then
    jq -s 'group_by(.rule) | map({rule: .[0].rule, count: length}) | sort_by(-.count)' \
        /var/log/falco/events.log > /opt/soc/reports/falco_rules_$(date +%Y%m%d).json 2>/dev/null || true
fi

# Collect system metrics
cat > /opt/soc/reports/system_metrics_$(date +%Y%m%d).json <<METRICS
{
  "timestamp": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "uptime": "$(uptime -p)",
  "load_average": "$(cat /proc/loadavg | cut -d' ' -f1-3)",
  "memory": {
    "total": "$(free -h | awk '/^Mem:/{print $2}')",
    "used": "$(free -h | awk '/^Mem:/{print $3}')",
    "free": "$(free -h | awk '/^Mem:/{print $4}')"
  },
  "disk": {
    "root": "$(df -h / | awk 'NR==2{print $5}')",
    "var": "$(df -h /var | awk 'NR==2{print $5}')"
  }
}
METRICS

log "✓ Security metrics collected"

################################################################################
# 6. Finalize Report
################################################################################

cat >> "${REPORT_FILE}" <<REPORT
    "threat_feeds": {
      "suricata": "${SURICATA_STATUS}",
      "crowdsec": "${CROWDSEC_STATUS}",
      "wazuh": "${WAZUH_STATUS}"
    },
    "exports": "${EXPORT_STATUS}",
    "backups": "${BACKUP_STATUS}",
    "cleanup": "${CLEANUP_STATUS}",
    "metrics": "${METRICS_STATUS}"
  },
  "summary": {
    "status": "completed",
    "duration_seconds": $SECONDS
  }
}
REPORT

log "=== SOC Nightly Sync Completed ==="
log "Duration: $SECONDS seconds"

################################################################################
# 7. Send Notifications
################################################################################

# Load configuration
if [[ -f "${CONFIG_FILE}" ]]; then
    # Check if email notification is enabled
    if grep -q "enabled: true" "${CONFIG_FILE}" | grep -B1 "email" &>/dev/null; then
        if command -v mail &>/dev/null; then
            mail -s "SOC Nightly Report - $(hostname) - $(date +%Y-%m-%d)" \
                admin@example.com < "${LOG_FILE}" 2>/dev/null || true
        fi
    fi

    # Check if Nextcloud notification is enabled
    if grep -q "enabled: true" "${CONFIG_FILE}" | grep -B1 "nextcloud" &>/dev/null; then
        WEBHOOK_URL=$(grep -A1 "nextcloud:" "${CONFIG_FILE}" | grep "webhook_url" | cut -d':' -f2- | tr -d ' ')
        if [[ -n "${WEBHOOK_URL}" ]]; then
            curl -X POST -H "Content-Type: application/json" \
                -d "{\"text\":\"SOC nightly sync completed on $(hostname)\"}" \
                "${WEBHOOK_URL}" 2>/dev/null || true
        fi
    fi
fi

# Copy report to shared location if it exists
if [[ -d /mnt/nextcloud/SOC-Reports ]]; then
    cp "${REPORT_FILE}" /mnt/nextcloud/SOC-Reports/ 2>/dev/null || true
fi

exit 0
EOF

chmod +x /opt/soc/soc_sync.sh

# Create weekly summary script
cat > /opt/soc/weekly_summary.sh <<'EOF'
#!/bin/bash
# Weekly SOC Summary Report

REPORT_FILE="/opt/soc/reports/weekly_summary_$(date +%Y%W).json"

cat > "${REPORT_FILE}" <<SUMMARY
{
  "week": "$(date +%Y-W%W)",
  "period": {
    "start": "$(date -d 'last monday' +%Y-%m-%d)",
    "end": "$(date +%Y-%m-%d)"
  },
  "summary": {
    "total_sync_runs": $(ls -1 /opt/soc/logs/soc_sync_*.log 2>/dev/null | wc -l),
    "total_incidents": 0,
    "critical_alerts": 0,
    "blocked_ips": $(cscli decisions list -o json 2>/dev/null | jq 'length' || echo 0)
  }
}
SUMMARY

echo "Weekly summary generated: ${REPORT_FILE}"
EOF

chmod +x /opt/soc/weekly_summary.sh

# Install cron jobs
cat > /etc/cron.d/soc-sync <<'EOF'
# SOC Nightly Synchronization
# Runs at 2:00 AM daily
0 2 * * * root /opt/soc/soc_sync.sh

# Weekly summary
# Runs at 3:00 AM every Monday
0 3 * * 1 root /opt/soc/weekly_summary.sh
EOF

chmod 644 /etc/cron.d/soc-sync

# Create monitoring dashboard script
cat > /usr/local/bin/soc-dashboard.sh <<'EOF'
#!/bin/bash
# SOC Dashboard - Quick status overview

clear
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║            SOC Security Operations Dashboard                   ║"
echo "║                $(hostname -f | head -c 50)                      "
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "┌─ Security Services ────────────────────────────────────────────┐"
printf "│ Suricata:       "
systemctl is-active suricata &>/dev/null && echo -e "\033[32m● ACTIVE\033[0m" || echo -e "\033[31m○ INACTIVE\033[0m"
printf "│ CrowdSec:       "
systemctl is-active crowdsec &>/dev/null && echo -e "\033[32m● ACTIVE\033[0m" || echo -e "\033[31m○ INACTIVE\033[0m"
printf "│ Falco:          "
systemctl is-active falco &>/dev/null && echo -e "\033[32m● ACTIVE\033[0m" || echo -e "\033[31m○ INACTIVE\033[0m"
printf "│ Wazuh:          "
systemctl is-active wazuh-manager &>/dev/null || systemctl is-active wazuh-agent &>/dev/null && echo -e "\033[32m● ACTIVE\033[0m" || echo -e "\033[31m○ INACTIVE\033[0m"
echo "└────────────────────────────────────────────────────────────────┘"
echo ""

echo "┌─ Recent Activity ──────────────────────────────────────────────┐"
if command -v cscli &>/dev/null; then
    printf "│ Active Bans:    "
    cscli decisions list -o json 2>/dev/null | jq 'length' || echo "0"
fi
if [[ -f /var/log/falco/events.log ]]; then
    printf "│ Falco Events:   "
    wc -l < /var/log/falco/events.log
fi
if [[ -f /var/log/suricata/eve.json ]]; then
    printf "│ Suricata Alerts:"
    grep -c '"event_type":"alert"' /var/log/suricata/eve.json 2>/dev/null || echo "0"
fi
echo "└────────────────────────────────────────────────────────────────┘"
echo ""

echo "┌─ Last Sync ────────────────────────────────────────────────────┐"
if [[ -f /opt/soc/logs/soc_sync_$(date +%Y%m%d).log ]]; then
    tail -3 /opt/soc/logs/soc_sync_$(date +%Y%m%d).log | sed 's/^/│ /'
else
    echo "│ No sync log found for today"
fi
echo "└────────────────────────────────────────────────────────────────┘"
echo ""
EOF

chmod +x /usr/local/bin/soc-dashboard.sh

echo "✓ SOC sync scripts deployed successfully"
echo ""
echo "Deployment Summary:"
echo "  - Main sync script: /opt/soc/soc_sync.sh"
echo "  - Configuration: /opt/soc/config.yaml"
echo "  - Logs directory: /opt/soc/logs/"
echo "  - Reports directory: /opt/soc/reports/"
echo "  - Cron schedule: Daily at 2:00 AM"
echo "  - Dashboard: /usr/local/bin/soc-dashboard.sh"
echo ""
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed SOC sync to ${hostname}"
    else
        log_error "Failed to deploy SOC sync to ${hostname}"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_soc_sync() {
    local ip=$1
    local hostname=$2

    log_info "Verifying SOC sync deployment on ${hostname} (${ip})"

    # Check main script exists
    if ! ssh "root@${ip}" "test -f /opt/soc/soc_sync.sh"; then
        log_error "SOC sync script not found on ${hostname}"
        return 1
    fi

    # Check cron job exists
    if ! ssh "root@${ip}" "test -f /etc/cron.d/soc-sync"; then
        log_error "SOC cron job not found on ${hostname}"
        return 1
    fi

    # Check directories created
    if ! ssh "root@${ip}" "test -d /opt/soc/logs"; then
        log_error "SOC logs directory not found on ${hostname}"
        return 1
    fi

    log "✓ SOC sync verification passed for ${hostname}"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    local target="${1:-all}"

    log "Starting SOC sync deployment to ${target}"

    # Validate target
    if ! validate_host "${target}"; then
        exit 1
    fi

    # Deploy to specified target(s)
    case "${target}" in
        VMI01)
            check_ssh_access "${VMI01_IP}" || exit 1
            deploy_soc_sync "${VMI01_IP}" "VMI01"
            verify_soc_sync "${VMI01_IP}" "VMI01"
            ;;
        VMI02D)
            check_ssh_access "${VMI02D_IP}" || exit 1
            deploy_soc_sync "${VMI02D_IP}" "VMI02D"
            verify_soc_sync "${VMI02D_IP}" "VMI02D"
            ;;
        VMI03)
            check_ssh_access "${VMI03_IP}" || exit 1
            deploy_soc_sync "${VMI03_IP}" "VMI03"
            verify_soc_sync "${VMI03_IP}" "VMI03"
            ;;
        all)
            log_info "Deploying to all hosts"
            for host_ip in "${VMI01_IP}" "${VMI02D_IP}" "${VMI03_IP}"; do
                check_ssh_access "${host_ip}" || exit 1
            done

            deploy_soc_sync "${VMI01_IP}" "VMI01"
            verify_soc_sync "${VMI01_IP}" "VMI01"

            deploy_soc_sync "${VMI02D_IP}" "VMI02D"
            verify_soc_sync "${VMI02D_IP}" "VMI02D"

            deploy_soc_sync "${VMI03_IP}" "VMI03"
            verify_soc_sync "${VMI03_IP}" "VMI03"
            ;;
    esac

    log "✓ SOC sync deployment completed successfully"
    log_info "Configuration: /opt/soc/config.yaml (edit notification settings)"
    log_info "Manual run: ssh root@<host> '/opt/soc/soc_sync.sh'"
    log_info "Dashboard: ssh root@<host> '/usr/local/bin/soc-dashboard.sh'"
    log_info "Scheduled: Daily at 2:00 AM via cron"
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
