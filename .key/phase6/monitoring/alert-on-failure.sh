#!/bin/bash
#
# Backup Failure Alert Script
# Sends alerts when backups fail or are stale
#
# Usage: ./alert-on-failure.sh
# Can be called by systemd OnFailure or run periodically
#

set -euo pipefail

HOSTNAME=$(hostname -s)
EMAIL_TO="acampkinpersonnal@gmail.com"
EMAIL_FROM="backup-alert@${HOSTNAME}"
ALERT_LOG="/var/log/backups/alerts.log"

S3_BUCKET="vmibackups"
S3_REMOTE="wasabi-vmi"
S3_BASE_PATH="${S3_BUCKET}/${HOSTNAME}"
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${ALERT_LOG}"
}

send_alert() {
    local alert_type="$1"
    local alert_message="$2"
    local severity="${3:-WARNING}"

    log "${severity}: ${alert_type} - ${alert_message}"

    # Build email
    local subject="[${severity}] Backup Alert: ${HOSTNAME} - ${alert_type}"
    local body=$(cat <<EOF
Backup Alert for ${HOSTNAME}

Alert Type: ${alert_type}
Severity: ${severity}
Time: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

Message:
${alert_message}

---
System: ${HOSTNAME}
IP: $(hostname -I | awk '{print $1}')
Uptime: $(uptime -p)

Recent Backup Logs:
$(tail -20 /var/log/backups/backup-*.log 2>/dev/null | tail -10 || echo "No recent logs available")

---
Automated Backup Alert System
EOF
)

    echo "${body}" | mail -s "${subject}" -r "${EMAIL_FROM}" "${EMAIL_TO}" 2>/dev/null || \
        log "ERROR: Failed to send email alert"

    # Also send to syslog
    logger -t backup-alert -p user.${severity,,} "${alert_type}: ${alert_message}"
}

check_backup_age() {
    log "Checking backup age..."

    local latest_backup=$(rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" \
        --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r | head -1)

    if [ -z "${latest_backup}" ]; then
        send_alert "NO_BACKUPS" \
            "No backups found in S3 bucket for ${HOSTNAME}" \
            "CRITICAL"
        return 1
    fi

    local backup_epoch=$(date -d "${latest_backup}" +%s)
    local now_epoch=$(date +%s)
    local age_hours=$(( (now_epoch - backup_epoch) / 3600 ))

    if [ ${age_hours} -gt 48 ]; then
        send_alert "STALE_BACKUP" \
            "Latest backup is ${age_hours} hours old (dated ${latest_backup}). Expected daily backups." \
            "CRITICAL"
        return 1
    elif [ ${age_hours} -gt 36 ]; then
        send_alert "OLD_BACKUP" \
            "Latest backup is ${age_hours} hours old (dated ${latest_backup}). May need attention." \
            "WARNING"
        return 1
    fi

    log "Backup age OK: ${age_hours} hours"
    return 0
}

check_s3_connectivity() {
    log "Checking S3 connectivity..."

    if ! rclone lsd "${S3_REMOTE}:${S3_BUCKET}" --config "${RCLONE_CONFIG}" &> /dev/null; then
        send_alert "S3_UNREACHABLE" \
            "Cannot connect to S3 bucket: ${S3_BUCKET}. Check network and credentials." \
            "CRITICAL"
        return 1
    fi

    log "S3 connectivity OK"
    return 0
}

check_backup_size_anomaly() {
    log "Checking for backup size anomalies..."

    # Get last 3 backup sizes
    local backups=($(rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" \
        --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r | head -3))

    if [ ${#backups[@]} -lt 2 ]; then
        log "Not enough backups to compare sizes"
        return 0
    fi

    # Get sizes
    local sizes=()
    for backup in "${backups[@]}"; do
        local size=$(rclone size "${S3_REMOTE}:${S3_BASE_PATH}/${backup}" \
            --config "${RCLONE_CONFIG}" --json 2>/dev/null | jq -r '.bytes')
        sizes+=("${size}")
    done

    # Compare latest with average of previous
    local latest_size=${sizes[0]}
    local prev_avg=$(( (${sizes[1]} + ${sizes[2]:-${sizes[1]}}) / 2 ))

    # Alert if latest is less than 50% of average (significant data loss?)
    if [ ${latest_size} -lt $((prev_avg / 2)) ]; then
        send_alert "BACKUP_SIZE_ANOMALY" \
            "Latest backup size ($(numfmt --to=iec ${latest_size})) is significantly smaller than previous average ($(numfmt --to=iec ${prev_avg})). Possible incomplete backup." \
            "WARNING"
        return 1
    fi

    log "Backup size OK"
    return 0
}

check_recent_failures() {
    log "Checking for recent backup failures..."

    # Check systemd status for backup services
    if systemctl is-active --quiet backup-daily.timer; then
        if systemctl status backup-daily.service | grep -q "failed"; then
            local failure_time=$(systemctl show backup-daily.service -p ExecMainExitTimestamp --value)
            send_alert "BACKUP_SERVICE_FAILED" \
                "Daily backup service failed at ${failure_time}" \
                "CRITICAL"
            return 1
        fi
    fi

    # Check log files for errors
    local error_count=$(grep -c "ERROR\|FAILED\|die" /var/log/backups/backup-*.log 2>/dev/null | \
        awk -F: '{sum+=$2} END {print sum}' || echo 0)

    if [ ${error_count} -gt 5 ]; then
        send_alert "BACKUP_ERRORS" \
            "Found ${error_count} errors in recent backup logs. Check /var/log/backups/" \
            "WARNING"
        return 1
    fi

    log "No recent failures detected"
    return 0
}

check_disk_space() {
    log "Checking disk space for backup staging..."

    # Check /var/backups partition
    local usage=$(df /var/backups | awk 'NR==2 {print $5}' | sed 's/%//')

    if [ ${usage} -gt 90 ]; then
        send_alert "DISK_SPACE_CRITICAL" \
            "Backup staging disk usage is ${usage}%. Cleanup required." \
            "CRITICAL"
        return 1
    elif [ ${usage} -gt 80 ]; then
        send_alert "DISK_SPACE_WARNING" \
            "Backup staging disk usage is ${usage}%. Consider cleanup." \
            "WARNING"
        return 1
    fi

    log "Disk space OK: ${usage}%"
    return 0
}

check_rclone_config() {
    log "Checking rclone configuration..."

    if [ ! -f "${RCLONE_CONFIG}" ]; then
        send_alert "RCLONE_CONFIG_MISSING" \
            "Rclone config file not found: ${RCLONE_CONFIG}" \
            "CRITICAL"
        return 1
    fi

    # Check for placeholder credentials
    if grep -q "PLACEHOLDER" "${RCLONE_CONFIG}"; then
        send_alert "RCLONE_CONFIG_INVALID" \
            "Rclone config contains placeholder values. Update with actual credentials." \
            "CRITICAL"
        return 1
    fi

    log "Rclone config OK"
    return 0
}

main() {
    mkdir -p "$(dirname "${ALERT_LOG}")"

    log "=========================================="
    log "Starting backup health checks for ${HOSTNAME}"
    log "=========================================="

    local failed_checks=0

    # Run all checks
    check_rclone_config || ((failed_checks++))
    check_s3_connectivity || ((failed_checks++))
    check_backup_age || ((failed_checks++))
    check_backup_size_anomaly || ((failed_checks++))
    check_recent_failures || ((failed_checks++))
    check_disk_space || ((failed_checks++))

    if [ ${failed_checks} -eq 0 ]; then
        log "All checks passed"
        exit 0
    else
        log "${failed_checks} check(s) failed"
        exit 1
    fi
}

main "$@"
