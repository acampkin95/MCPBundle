#!/bin/bash
#
# Cleanup Old Backups
# Enforces retention policy for S3 backups
#
# Usage: ./cleanup-old-backups.sh [--dry-run] [--force]
#

set -euo pipefail

HOSTNAME=$(hostname -s)

S3_BUCKET="vmibackups"
S3_REMOTE="wasabi-vmi"
S3_BASE_PATH="${S3_BUCKET}/${HOSTNAME}"
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"

# Retention policies (in days)
DAILY_RETENTION_DAYS=7
WEEKLY_RETENTION_WEEKS=4
MONTHLY_RETENTION_MONTHS=12

DRY_RUN=false
FORCE=false

LOG_FILE="/var/log/backups/cleanup-$(date +%Y-%m-%d).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"
}

cleanup_daily_backups() {
    log "Cleaning up daily backups (retention: ${DAILY_RETENTION_DAYS} days)"

    local cutoff_date=$(date -d "${DAILY_RETENTION_DAYS} days ago" +%Y-%m-%d)
    local deleted_count=0
    local total_freed=0

    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" --config "${RCLONE_CONFIG}" --dirs-only | \
        while read -r backup_dir; do
            backup_dir="${backup_dir%/}"

            # Skip weekly and monthly directories
            if [[ "${backup_dir}" == "weekly" ]] || [[ "${backup_dir}" == "monthly" ]]; then
                continue
            fi

            # Check if it's a date directory
            if [[ "${backup_dir}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                if [[ "${backup_dir}" < "${cutoff_date}" ]]; then
                    # Calculate size before deletion
                    local size=$(rclone size "${S3_REMOTE}:${S3_BASE_PATH}/${backup_dir}" \
                        --config "${RCLONE_CONFIG}" --json | jq -r '.bytes')

                    log "Deleting daily backup: ${backup_dir} ($(numfmt --to=iec ${size}))"

                    if [ "${DRY_RUN}" != true ]; then
                        rclone purge "${S3_REMOTE}:${S3_BASE_PATH}/${backup_dir}" \
                            --config "${RCLONE_CONFIG}"
                        ((deleted_count++))
                        ((total_freed += size))
                    else
                        log "  [DRY RUN] Would delete"
                    fi
                fi
            fi
        done

    log "Daily cleanup: ${deleted_count} backups deleted, $(numfmt --to=iec ${total_freed}) freed"
}

cleanup_weekly_backups() {
    log "Cleaning up weekly backups (retention: ${WEEKLY_RETENTION_WEEKS} weeks)"

    local cutoff_date=$(date -d "${WEEKLY_RETENTION_WEEKS} weeks ago" +%Y-%m-%d)
    local deleted_count=0
    local total_freed=0

    if ! rclone lsd "${S3_REMOTE}:${S3_BASE_PATH}/weekly" --config "${RCLONE_CONFIG}" &> /dev/null; then
        log "No weekly backups directory found"
        return 0
    fi

    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}/weekly" --config "${RCLONE_CONFIG}" --dirs-only | \
        while read -r backup_dir; do
            backup_dir="${backup_dir%/}"

            if [[ "${backup_dir}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                if [[ "${backup_dir}" < "${cutoff_date}" ]]; then
                    local size=$(rclone size "${S3_REMOTE}:${S3_BASE_PATH}/weekly/${backup_dir}" \
                        --config "${RCLONE_CONFIG}" --json | jq -r '.bytes')

                    log "Deleting weekly backup: ${backup_dir} ($(numfmt --to=iec ${size}))"

                    if [ "${DRY_RUN}" != true ]; then
                        rclone purge "${S3_REMOTE}:${S3_BASE_PATH}/weekly/${backup_dir}" \
                            --config "${RCLONE_CONFIG}"
                        ((deleted_count++))
                        ((total_freed += size))
                    else
                        log "  [DRY RUN] Would delete"
                    fi
                fi
            fi
        done

    log "Weekly cleanup: ${deleted_count} backups deleted, $(numfmt --to=iec ${total_freed}) freed"
}

cleanup_monthly_backups() {
    log "Cleaning up monthly backups (retention: ${MONTHLY_RETENTION_MONTHS} months)"

    local cutoff_date=$(date -d "${MONTHLY_RETENTION_MONTHS} months ago" +%Y-%m-%d)
    local deleted_count=0

    if ! rclone lsd "${S3_REMOTE}:${S3_BASE_PATH}/monthly" --config "${RCLONE_CONFIG}" &> /dev/null; then
        log "No monthly backups directory found"
        return 0
    fi

    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}/monthly" --config "${RCLONE_CONFIG}" --dirs-only | \
        while read -r backup_dir; do
            backup_dir="${backup_dir%/}"

            if [[ "${backup_dir}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                if [[ "${backup_dir}" < "${cutoff_date}" ]]; then
                    log "Deleting monthly backup: ${backup_dir}"

                    if [ "${DRY_RUN}" != true ]; then
                        rclone purge "${S3_REMOTE}:${S3_BASE_PATH}/monthly/${backup_dir}" \
                            --config "${RCLONE_CONFIG}"
                        ((deleted_count++))
                    else
                        log "  [DRY RUN] Would delete"
                    fi
                fi
            fi
        done

    log "Monthly cleanup: ${deleted_count} backups deleted"
}

print_retention_status() {
    log "Current backup inventory:"

    echo ""
    echo "Daily backups:"
    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" --config "${RCLONE_CONFIG}" --dirs-only | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r | head -10

    echo ""
    echo "Weekly backups:"
    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}/weekly" --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        sed 's|/||' | sort -r || echo "  (none)"

    echo ""
    echo "Monthly backups:"
    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}/monthly" --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        sed 's|/||' | sort -r || echo "  (none)"

    echo ""
    echo "Total storage usage:"
    rclone size "${S3_REMOTE}:${S3_BASE_PATH}" --config "${RCLONE_CONFIG}" --json | \
        jq -r '"  Size: " + (.bytes | tonumber / 1073741824 | tostring | .[0:6]) + " GB"'
}

main() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                log "DRY RUN MODE"
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            *)
                echo "Usage: $0 [--dry-run] [--force]"
                exit 1
                ;;
        esac
    done

    mkdir -p "$(dirname "${LOG_FILE}")"

    log "Starting backup cleanup for ${HOSTNAME}"

    if [ "${FORCE}" != true ]; then
        echo "This will delete old backups according to retention policy:"
        echo "  Daily: ${DAILY_RETENTION_DAYS} days"
        echo "  Weekly: ${WEEKLY_RETENTION_WEEKS} weeks"
        echo "  Monthly: ${MONTHLY_RETENTION_MONTHS} months"
        echo ""
        echo -n "Continue? [y/N]: "
        read -r confirm

        if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
            log "Cleanup cancelled"
            exit 0
        fi
    fi

    cleanup_daily_backups
    cleanup_weekly_backups
    cleanup_monthly_backups

    print_retention_status

    log "Cleanup completed"
}

main "$@"
