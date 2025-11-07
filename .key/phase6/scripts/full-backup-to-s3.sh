#!/bin/bash
#
# Weekly Full Backup to Wasabi S3
# Runs on all 3 VMs (VMI01, VMI02D, VMI03)
# Scheduled for Sunday 3 AM
#
# Usage: ./full-backup-to-s3.sh [--dry-run] [--verbose]
#

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTNAME=$(hostname -s)
BACKUP_DATE=$(date +%Y-%m-%d)
BACKUP_TIME=$(date +%H-%M-%S)
BACKUP_TIMESTAMP="${BACKUP_DATE}_${BACKUP_TIME}"

# Paths
BACKUP_ROOT="/var/backups/s3-staging-full"
LOCAL_BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_TIMESTAMP}"
LOCK_FILE="/var/run/full-backup-to-s3.lock"
LOG_DIR="/var/log/backups"
LOG_FILE="${LOG_DIR}/full-backup-${BACKUP_DATE}.log"
METADATA_FILE="${LOCAL_BACKUP_DIR}/backup-manifest.json"

# S3 Configuration
S3_BUCKET="vmibackups"
S3_REMOTE="wasabi-vmi"
S3_BASE_PATH="${S3_BUCKET}/${HOSTNAME}"
S3_BACKUP_PATH="${S3_BASE_PATH}/weekly/${BACKUP_DATE}"

# Rclone settings
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"
RCLONE_TRANSFERS=4
RCLONE_BANDWIDTH_LIMIT="" # e.g., "10M" for 10 MB/s

# Email notification
EMAIL_TO="acampkinpersonnal@gmail.com"
EMAIL_FROM="backup@${HOSTNAME}"
EMAIL_SUBJECT="Full Backup ${HOSTNAME} - ${BACKUP_DATE}"

# Compression
COMPRESSION="zstd"
COMPRESSION_LEVEL=6  # Higher compression for weekly backups

# Exclude patterns file
EXCLUDE_FILE="${SCRIPT_DIR}/../config/backup-exclude.txt"

# Retention (weeks)
LOCAL_RETENTION_DAYS=1
WEEKLY_RETENTION_WEEKS=4

# Flags
DRY_RUN=false
VERBOSE=false

# ============================================================================
# FUNCTIONS
# ============================================================================

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
    logger -t "full-backup-to-s3" -p "user.${level}" "${message}"
}

log_info() {
    log "info" "$@"
}

log_error() {
    log "error" "$@"
}

log_warn() {
    log "warning" "$@"
}

die() {
    log_error "$@"
    cleanup_on_error
    send_failure_notification "$@"
    exit 1
}

cleanup_on_error() {
    log_warn "Cleaning up after error..."
    rm -f "${LOCK_FILE}"
}

cleanup_on_success() {
    log_info "Cleaning up old local backups (keeping last ${LOCAL_RETENTION_DAYS} days)..."
    find "${BACKUP_ROOT}" -maxdepth 1 -type d -mtime +${LOCAL_RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
    rm -f "${LOCK_FILE}"
}

acquire_lock() {
    if [ -f "${LOCK_FILE}" ]; then
        local pid=$(cat "${LOCK_FILE}")
        if ps -p "${pid}" > /dev/null 2>&1; then
            die "Full backup already running (PID: ${pid})"
        else
            log_warn "Stale lock file found, removing..."
            rm -f "${LOCK_FILE}"
        fi
    fi
    echo $$ > "${LOCK_FILE}"
}

check_requirements() {
    local missing_tools=()

    for tool in rclone zstd pg_dump redis-cli tar jq mail; do
        if ! command -v "${tool}" &> /dev/null; then
            missing_tools+=("${tool}")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        die "Missing required tools: ${missing_tools[*]}"
    fi

    if [ ! -f "${RCLONE_CONFIG}" ]; then
        die "Rclone config not found: ${RCLONE_CONFIG}"
    fi
}

get_vm_specific_paths() {
    # Define what to backup based on hostname
    case "${HOSTNAME}" in
        vmi01*)
            BACKUP_PATHS=(
                "/etc"
                "/opt"
                "/key"
                "/root"
                "/home"
                "/usr/local"
            )
            NEED_POSTGRES=true
            NEED_REDIS=true
            NEED_KEYCLOAK=false
            ;;
        vmi02d*)
            BACKUP_PATHS=(
                "/etc"
                "/opt"
                "/key"
                "/root"
                "/home"
                "/usr/local"
            )
            NEED_POSTGRES=false
            NEED_REDIS=false
            NEED_KEYCLOAK=false
            ;;
        vmi03*)
            BACKUP_PATHS=(
                "/etc"
                "/opt"
                "/key"
                "/root"
                "/home"
                "/usr/local"
            )
            NEED_POSTGRES=false
            NEED_REDIS=false
            NEED_KEYCLOAK=true
            ;;
        *)
            die "Unknown hostname: ${HOSTNAME}"
            ;;
    esac
}

create_backup_structure() {
    log_info "Creating full backup directory structure..."
    mkdir -p "${LOCAL_BACKUP_DIR}"/{files,databases,logs,metadata,system}
    mkdir -p "${LOG_DIR}"
}

backup_postgres_full() {
    if [ "${NEED_POSTGRES}" != "true" ]; then
        return 0
    fi

    log_info "Performing full PostgreSQL backup..."

    local db_backup_dir="${LOCAL_BACKUP_DIR}/databases/postgresql"
    mkdir -p "${db_backup_dir}"

    # Full cluster backup with pg_dumpall
    log_info "Creating full cluster dump..."
    sudo -u postgres pg_dumpall > "${db_backup_dir}/full-cluster_${BACKUP_TIMESTAMP}.sql"

    # Individual database backups in custom format (for selective restore)
    local databases=(mcp_ecosystem keycloak nextcloud)

    for db in "${databases[@]}"; do
        if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "${db}"; then
            log_info "Creating custom format dump for: ${db}"

            local dump_file="${db_backup_dir}/${db}_${BACKUP_TIMESTAMP}.dump"

            sudo -u postgres pg_dump -Fc -Z 0 "${db}" > "${dump_file}"

            # Verify dump
            if sudo -u postgres pg_restore --list "${dump_file}" > /dev/null 2>&1; then
                log_info "Database ${db} backed up successfully"
            else
                log_error "Database dump verification failed for ${db}"
            fi
        fi
    done

    # Backup PostgreSQL configuration files
    if [ -d /etc/postgresql ]; then
        tar czf "${db_backup_dir}/postgresql-config_${BACKUP_TIMESTAMP}.tar.gz" \
            -C /etc postgresql
    fi

    # Compress all SQL dumps
    find "${db_backup_dir}" -name "*.sql" -exec zstd -${COMPRESSION_LEVEL} --rm {} \;
    find "${db_backup_dir}" -name "*.dump" -exec zstd -${COMPRESSION_LEVEL} --rm {} \;
}

backup_redis_full() {
    if [ "${NEED_REDIS}" != "true" ]; then
        return 0
    fi

    log_info "Performing full Redis backup..."

    local redis_backup_dir="${LOCAL_BACKUP_DIR}/databases/redis"
    mkdir -p "${redis_backup_dir}"

    # Force save
    redis-cli SAVE &> /dev/null || log_warn "Redis SAVE failed"

    # Copy RDB file
    if [ -f /var/lib/redis/dump.rdb ]; then
        cp /var/lib/redis/dump.rdb "${redis_backup_dir}/dump_${BACKUP_TIMESTAMP}.rdb"
    fi

    # Backup Redis configuration
    if [ -f /etc/redis/redis.conf ]; then
        cp /etc/redis/redis.conf "${redis_backup_dir}/redis.conf"
    fi

    # Compress
    find "${redis_backup_dir}" -type f -exec zstd -${COMPRESSION_LEVEL} --rm {} \;
}

backup_keycloak_full() {
    if [ "${NEED_KEYCLOAK}" != "true" ]; then
        return 0
    fi

    log_info "Performing full Keycloak backup..."

    local keycloak_backup_dir="${LOCAL_BACKUP_DIR}/files/keycloak"
    mkdir -p "${keycloak_backup_dir}"

    # Full backup of Keycloak directory
    if [ -d /opt/keycloak ]; then
        tar czf "${keycloak_backup_dir}/keycloak-full_${BACKUP_TIMESTAMP}.tar.gz" \
            -C /opt keycloak
    fi

    # Export Keycloak realm configuration
    # Note: This requires Keycloak to be running
    # Adjust path to your Keycloak installation
    if [ -x /opt/keycloak/bin/kc.sh ]; then
        /opt/keycloak/bin/kc.sh export \
            --dir "${keycloak_backup_dir}/realm-export" \
            --users realm_file 2>/dev/null || log_warn "Keycloak export failed"
    fi
}

backup_system_state() {
    log_info "Backing up system state..."

    local system_dir="${LOCAL_BACKUP_DIR}/system"

    # Installed packages
    dpkg -l > "${system_dir}/packages.txt"
    apt-mark showmanual > "${system_dir}/manual-packages.txt"
    apt-mark showauto > "${system_dir}/auto-packages.txt"

    # System services
    systemctl list-unit-files --state=enabled > "${system_dir}/enabled-services.txt"
    systemctl list-unit-files --state=disabled > "${system_dir}/disabled-services.txt"

    # Network configuration
    ip addr show > "${system_dir}/network-interfaces.txt"
    ip route show > "${system_dir}/routes.txt"

    # Firewall rules
    if command -v iptables &> /dev/null; then
        iptables-save > "${system_dir}/iptables-rules.txt"
    fi

    if command -v ufw &> /dev/null; then
        ufw status verbose > "${system_dir}/ufw-status.txt"
    fi

    # Cron jobs
    crontab -l > "${system_dir}/root-crontab.txt" 2>/dev/null || true
    if [ -d /etc/cron.d ]; then
        tar czf "${system_dir}/cron.d.tar.gz" -C /etc cron.d
    fi

    # System information
    uname -a > "${system_dir}/uname.txt"
    cat /etc/os-release > "${system_dir}/os-release.txt"
    df -h > "${system_dir}/disk-usage.txt"
    free -h > "${system_dir}/memory.txt"

    # SSH keys and configuration
    if [ -d /etc/ssh ]; then
        tar czf "${system_dir}/ssh-config.tar.gz" -C /etc ssh \
            --exclude='ssh_host_*_key' \
            --exclude='ssh_host_*_key.pub'
    fi

    # Environment variables
    env | sort > "${system_dir}/environment.txt"
}

backup_logs_full() {
    log_info "Backing up all system logs..."

    local logs_backup_dir="${LOCAL_BACKUP_DIR}/logs"
    mkdir -p "${logs_backup_dir}"

    # Journal logs (systemd)
    if command -v journalctl &> /dev/null; then
        journalctl --no-pager > "${logs_backup_dir}/journal-full.log" || true
    fi

    # Traditional logs
    if [ -d /var/log ]; then
        tar czf "${LOCAL_BACKUP_DIR}/logs-full_${BACKUP_TIMESTAMP}.tar.gz" \
            --exclude='/var/log/journal' \
            -C /var log
    fi

    rm -rf "${logs_backup_dir}"
}

backup_files_full() {
    log_info "Backing up filesystem paths (full)..."

    local files_backup_dir="${LOCAL_BACKUP_DIR}/files"

    for path in "${BACKUP_PATHS[@]}"; do
        if [ ! -e "${path}" ]; then
            log_warn "Path does not exist, skipping: ${path}"
            continue
        fi

        log_info "Backing up: ${path}"

        local dest_name=$(echo "${path}" | sed 's|^/||; s|/|_|g')
        local archive_name="${files_backup_dir}/${dest_name}_${BACKUP_TIMESTAMP}.tar.zst"

        local tar_opts=(
            --create
            --file -
            --preserve-permissions
            --one-file-system
            --acls
            --xattrs
        )

        if [ -f "${EXCLUDE_FILE}" ]; then
            tar_opts+=(--exclude-from="${EXCLUDE_FILE}")
        fi

        # Exclude patterns
        tar_opts+=(
            --exclude='*.tmp'
            --exclude='*.cache'
            --exclude='*.swp'
            --exclude='*~'
        )

        if tar "${tar_opts[@]}" -C / "${path#/}" | zstd -${COMPRESSION_LEVEL} -T0 > "${archive_name}"; then
            local size=$(du -h "${archive_name}" | cut -f1)
            log_info "Completed full backup of ${path} (${size})"
        else
            log_error "Failed to backup: ${path}"
        fi
    done
}

generate_manifest() {
    log_info "Generating full backup manifest..."

    local total_size=$(du -sb "${LOCAL_BACKUP_DIR}" | cut -f1)
    local file_count=$(find "${LOCAL_BACKUP_DIR}" -type f | wc -l)
    local end_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "${METADATA_FILE}" <<EOF
{
  "hostname": "${HOSTNAME}",
  "backup_type": "weekly-full",
  "timestamp": "${BACKUP_TIMESTAMP}",
  "date": "${BACKUP_DATE}",
  "start_time": "${START_TIME}",
  "end_time": "${end_time}",
  "total_size_bytes": ${total_size},
  "file_count": ${file_count},
  "backup_paths": $(printf '%s\n' "${BACKUP_PATHS[@]}" | jq -R . | jq -s .),
  "databases": {
    "postgres": ${NEED_POSTGRES},
    "redis": ${NEED_REDIS}
  },
  "s3_path": "${S3_BACKUP_PATH}",
  "compression": "${COMPRESSION}",
  "compression_level": ${COMPRESSION_LEVEL},
  "retention_weeks": ${WEEKLY_RETENTION_WEEKS},
  "rclone_version": "$(rclone version --check=false | head -1)",
  "script_version": "1.0.0"
}
EOF

    log_info "Manifest: ${file_count} files, total size: $(numfmt --to=iec ${total_size})"
}

calculate_checksums() {
    log_info "Calculating checksums..."

    local checksum_file="${LOCAL_BACKUP_DIR}/SHA256SUMS"

    find "${LOCAL_BACKUP_DIR}" -type f ! -name "SHA256SUMS" -exec sha256sum {} \; > "${checksum_file}"

    local checksum_count=$(wc -l < "${checksum_file}")
    log_info "Generated ${checksum_count} checksums"
}

upload_to_s3() {
    log_info "Uploading full backup to S3: ${S3_BACKUP_PATH}"

    local rclone_opts=(
        --config "${RCLONE_CONFIG}"
        --progress
        --stats 1m
        --transfers ${RCLONE_TRANSFERS}
        --checkers 8
        --verbose
    )

    if [ -n "${RCLONE_BANDWIDTH_LIMIT}" ]; then
        rclone_opts+=(--bwlimit "${RCLONE_BANDWIDTH_LIMIT}")
    fi

    if [ "${DRY_RUN}" = true ]; then
        rclone_opts+=(--dry-run)
    fi

    # Upload with retry logic
    local max_retries=3
    local retry_count=0
    local upload_success=false

    while [ ${retry_count} -lt ${max_retries} ]; do
        log_info "Upload attempt $((retry_count + 1))/${max_retries}"

        if rclone sync "${LOCAL_BACKUP_DIR}" \
            "${S3_REMOTE}:${S3_BACKUP_PATH}" \
            "${rclone_opts[@]}" 2>&1 | tee -a "${LOG_FILE}"; then
            upload_success=true
            break
        else
            ((retry_count++))
            if [ ${retry_count} -lt ${max_retries} ]; then
                log_warn "Upload failed, retrying in 120 seconds..."
                sleep 120
            fi
        fi
    done

    if [ "${upload_success}" != true ]; then
        die "Failed to upload backup after ${max_retries} attempts"
    fi

    log_info "Upload completed successfully"
}

verify_upload() {
    log_info "Verifying upload integrity..."

    local local_count=$(find "${LOCAL_BACKUP_DIR}" -type f | wc -l)
    local remote_count=$(rclone ls "${S3_REMOTE}:${S3_BACKUP_PATH}" --config "${RCLONE_CONFIG}" | wc -l)

    if [ "${local_count}" -ne "${remote_count}" ]; then
        die "File count mismatch: local=${local_count}, remote=${remote_count}"
    fi

    log_info "Verification passed: ${remote_count} files uploaded"
}

cleanup_old_s3_backups() {
    log_info "Cleaning up old weekly S3 backups (keeping last ${WEEKLY_RETENTION_WEEKS} weeks)..."

    local cutoff_date=$(date -d "${WEEKLY_RETENTION_WEEKS} weeks ago" +%Y-%m-%d)

    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}/weekly" --config "${RCLONE_CONFIG}" --dirs-only | \
        while read -r backup_dir; do
            backup_dir="${backup_dir%/}"

            if [[ "${backup_dir}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                if [[ "${backup_dir}" < "${cutoff_date}" ]]; then
                    log_info "Deleting old weekly backup: ${backup_dir}"
                    if [ "${DRY_RUN}" != true ]; then
                        rclone purge "${S3_REMOTE}:${S3_BASE_PATH}/weekly/${backup_dir}" \
                            --config "${RCLONE_CONFIG}" || log_error "Failed to delete ${backup_dir}"
                    fi
                fi
            fi
        done
}

send_success_notification() {
    local duration=$1
    local backup_size=$2

    local email_body=$(cat <<EOF
Full backup completed successfully for ${HOSTNAME}

Backup Details:
- Date: ${BACKUP_DATE}
- Time: ${BACKUP_TIME}
- Duration: ${duration} seconds ($(($duration / 3600))h $(($duration % 3600 / 60))m)
- Total Size: ${backup_size}
- S3 Path: s3://${S3_BACKUP_PATH}

Backup Type: Weekly Full Backup
Compression: ${COMPRESSION} (level ${COMPRESSION_LEVEL})

Backup Contents:
$(cat "${METADATA_FILE}" | jq -r '.backup_paths[]' | sed 's/^/  - /')

System State: Included
Databases: $(cat "${METADATA_FILE}" | jq -r '.databases | to_entries[] | select(.value==true) | .key' | tr '\n' ',' | sed 's/,$//')

Log File: ${LOG_FILE}

---
Automated full backup system
EOF
)

    echo "${email_body}" | mail -s "${EMAIL_SUBJECT} - SUCCESS" \
        -r "${EMAIL_FROM}" "${EMAIL_TO}" 2>/dev/null || \
        log_warn "Failed to send email notification"
}

send_failure_notification() {
    local error_msg="$*"

    local email_body=$(cat <<EOF
Full Backup FAILED for ${HOSTNAME}

Error: ${error_msg}

Date: ${BACKUP_DATE}
Time: ${BACKUP_TIME}

Please check the log file: ${LOG_FILE}

Recent log entries:
$(tail -n 30 "${LOG_FILE}" 2>/dev/null || echo "Log file not available")

---
Automated full backup system
EOF
)

    echo "${email_body}" | mail -s "${EMAIL_SUBJECT} - FAILED" \
        -r "${EMAIL_FROM}" "${EMAIL_TO}" 2>/dev/null || true
}

print_summary() {
    local duration=$1
    local backup_size=$2

    log_info "============================================"
    log_info "Full Backup Summary"
    log_info "============================================"
    log_info "Hostname:      ${HOSTNAME}"
    log_info "Date:          ${BACKUP_DATE}"
    log_info "Duration:      ${duration} seconds ($(($duration / 3600))h $(($duration % 3600 / 60))m)"
    log_info "Total Size:    ${backup_size}"
    log_info "S3 Path:       s3://${S3_BACKUP_PATH}"
    log_info "Local Path:    ${LOCAL_BACKUP_DIR}"
    log_info "Log File:      ${LOG_FILE}"
    log_info "============================================"
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                DRY_RUN=true
                log_info "DRY RUN MODE ENABLED"
                ;;
            --verbose)
                VERBOSE=true
                set -x
                ;;
            *)
                echo "Unknown option: $1"
                echo "Usage: $0 [--dry-run] [--verbose]"
                exit 1
                ;;
        esac
        shift
    done

    START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    local start_seconds=$(date +%s)

    log_info "========================================"
    log_info "Starting FULL backup for ${HOSTNAME}"
    log_info "========================================"

    # Pre-flight checks
    acquire_lock
    check_requirements
    get_vm_specific_paths
    create_backup_structure

    # Perform full backups
    backup_postgres_full
    backup_redis_full
    backup_keycloak_full
    backup_system_state
    backup_files_full
    backup_logs_full

    # Generate metadata
    generate_manifest
    calculate_checksums

    # Upload to S3
    upload_to_s3
    verify_upload

    # Cleanup
    cleanup_old_s3_backups
    cleanup_on_success

    # Calculate summary
    local end_seconds=$(date +%s)
    local duration=$((end_seconds - start_seconds))
    local backup_size=$(du -sh "${LOCAL_BACKUP_DIR}" | cut -f1)

    # Report
    print_summary "${duration}" "${backup_size}"
    send_success_notification "${duration}" "${backup_size}"

    log_info "Full backup completed successfully"
    exit 0
}

# Trap errors
trap 'die "Script failed at line $LINENO"' ERR

# Run main
main "$@"
