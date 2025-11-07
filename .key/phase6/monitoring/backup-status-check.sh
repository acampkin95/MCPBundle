#!/bin/bash
#
# Backup Status Check for Prometheus
# Exports backup metrics in Prometheus format
#
# Usage: ./backup-status-check.sh
# Output: Prometheus metrics to stdout
#

set -euo pipefail

HOSTNAME=$(hostname -s)
S3_BUCKET="vmibackups"
S3_REMOTE="wasabi-vmi"
S3_BASE_PATH="${S3_BUCKET}/${HOSTNAME}"
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"

# Get latest backup info
get_latest_backup_metrics() {
    # Find latest daily backup
    local latest_daily=$(rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" \
        --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r | head -1)

    if [ -z "${latest_daily}" ]; then
        echo "# No backups found"
        echo "backup_status{hostname=\"${HOSTNAME}\",type=\"daily\"} 0"
        return 1
    fi

    # Download manifest
    local manifest="/tmp/backup-manifest-$$.json"
    if ! rclone copy "${S3_REMOTE}:${S3_BASE_PATH}/${latest_daily}/backup-manifest.json" \
        "${manifest}" --config "${RCLONE_CONFIG}" 2>/dev/null; then
        echo "backup_status{hostname=\"${HOSTNAME}\",type=\"daily\"} 0"
        return 1
    fi

    # Extract metrics from manifest
    local backup_timestamp=$(jq -r '.timestamp' "${manifest}")
    local backup_size=$(jq -r '.total_size_bytes' "${manifest}")
    local file_count=$(jq -r '.file_count' "${manifest}")
    local backup_type=$(jq -r '.backup_type' "${manifest}")

    # Calculate age in hours
    local backup_date=$(jq -r '.date' "${manifest}")
    local backup_epoch=$(date -d "${backup_date}" +%s)
    local now_epoch=$(date +%s)
    local age_hours=$(( (now_epoch - backup_epoch) / 3600 ))

    # Output Prometheus metrics
    cat <<EOF
# HELP backup_status Backup completion status (1 = success, 0 = failed)
# TYPE backup_status gauge
backup_status{hostname="${HOSTNAME}",type="${backup_type}"} 1

# HELP backup_age_hours Age of latest backup in hours
# TYPE backup_age_hours gauge
backup_age_hours{hostname="${HOSTNAME}",type="${backup_type}"} ${age_hours}

# HELP backup_size_bytes Size of latest backup in bytes
# TYPE backup_size_bytes gauge
backup_size_bytes{hostname="${HOSTNAME}",type="${backup_type}"} ${backup_size}

# HELP backup_file_count Number of files in latest backup
# TYPE backup_file_count gauge
backup_file_count{hostname="${HOSTNAME}",type="${backup_type}"} ${file_count}

# HELP backup_last_timestamp Unix timestamp of latest backup
# TYPE backup_last_timestamp gauge
backup_last_timestamp{hostname="${HOSTNAME}",type="${backup_type}"} ${backup_epoch}
EOF

    rm -f "${manifest}"
}

# Check backup age and alert if stale
check_backup_freshness() {
    local latest_daily=$(rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" \
        --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r | head -1)

    if [ -z "${latest_daily}" ]; then
        echo "backup_is_stale{hostname=\"${HOSTNAME}\"} 1"
        return
    fi

    local backup_epoch=$(date -d "${latest_daily}" +%s)
    local now_epoch=$(date +%s)
    local age_hours=$(( (now_epoch - backup_epoch) / 3600 ))

    # Alert if backup is older than 36 hours (1.5 days)
    if [ ${age_hours} -gt 36 ]; then
        echo "backup_is_stale{hostname=\"${HOSTNAME}\"} 1"
    else
        echo "backup_is_stale{hostname=\"${HOSTNAME}\"} 0"
    fi
}

# Check S3 connectivity
check_s3_connectivity() {
    if rclone lsd "${S3_REMOTE}:${S3_BUCKET}" --config "${RCLONE_CONFIG}" &> /dev/null; then
        echo "backup_s3_reachable{hostname=\"${HOSTNAME}\"} 1"
    else
        echo "backup_s3_reachable{hostname=\"${HOSTNAME}\"} 0"
    fi
}

# Get total storage usage
get_storage_metrics() {
    local size_json=$(rclone size "${S3_REMOTE}:${S3_BASE_PATH}" \
        --config "${RCLONE_CONFIG}" --json 2>/dev/null || echo '{"bytes":0,"count":0}')

    local total_bytes=$(echo "${size_json}" | jq -r '.bytes')
    local total_files=$(echo "${size_json}" | jq -r '.count')

    cat <<EOF
# HELP backup_total_storage_bytes Total storage used by all backups
# TYPE backup_total_storage_bytes gauge
backup_total_storage_bytes{hostname="${HOSTNAME}"} ${total_bytes}

# HELP backup_total_files Total number of backup files
# TYPE backup_total_files gauge
backup_total_files{hostname="${HOSTNAME}"} ${total_files}
EOF
}

# Count backups by type
count_backups() {
    local daily_count=$(rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" \
        --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | wc -l)

    local weekly_count=$(rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}/weekly" \
        --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | wc -l || echo 0)

    cat <<EOF
# HELP backup_count Number of backups by type
# TYPE backup_count gauge
backup_count{hostname="${HOSTNAME}",type="daily"} ${daily_count}
backup_count{hostname="${HOSTNAME}",type="weekly"} ${weekly_count}
EOF
}

# Main
main() {
    echo "# Backup metrics for ${HOSTNAME}"
    echo "# Generated at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    echo ""

    check_s3_connectivity
    get_latest_backup_metrics
    check_backup_freshness
    get_storage_metrics
    count_backups
}

main
