#!/bin/bash
#
# Daily Incremental Backup to Wasabi S3
# Runs on all 3 VMs (VMI01, VMI02D, VMI03)
#
# Usage: ./backup-to-s3.sh [--dry-run] [--verbose]
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
BACKUP_ROOT="/var/backups/s3-staging"
LOCAL_BACKUP_DIR="${BACKUP_ROOT}/${BACKUP_TIMESTAMP}"
LOCK_FILE="/var/run/backup-to-s3.lock"
LOG_DIR="/var/log/backups"
LOG_FILE="${LOG_DIR}/backup-${BACKUP_DATE}.log"
METADATA_FILE="${LOCAL_BACKUP_DIR}/backup-manifest.json"

# S3 Configuration
S3_BUCKET="vmibackups"
S3_REMOTE="wasabi-vmi"
S3_BASE_PATH="${S3_BUCKET}/${HOSTNAME}"
S3_BACKUP_PATH="${S3_BASE_PATH}/${BACKUP_DATE}"

# Rclone settings
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"
RCLONE_TRANSFERS=4
RCLONE_BANDWIDTH_LIMIT="" # e.g., "10M" for 10 MB/s

# Email notification
EMAIL_TO="acampkinpersonnal@gmail.com"
EMAIL_FROM="backup@${HOSTNAME}"
EMAIL_SUBJECT="Backup ${HOSTNAME} - ${BACKUP_DATE}"

# Compression
COMPRESSION="zstd"
COMPRESSION_LEVEL=3

# Exclude patterns file
EXCLUDE_FILE="${SCRIPT_DIR}/../config/backup-exclude.txt"

# Retention (days)
LOCAL_RETENTION_DAYS=2
DAILY_RETENTION_DAYS=7

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
    logger -t "backup-to-s3" -p "user.${level}" "${message}"
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
    # Don't delete local backup on error - may be useful for debugging
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
            die "Backup already running (PID: ${pid})"
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

    # Test S3 connectivity
    if ! rclone lsd "${S3_REMOTE}:${S3_BUCKET}" --config "${RCLONE_CONFIG}" &> /dev/null; then
        die "Cannot access S3 bucket: ${S3_BUCKET}"
    fi
}

get_vm_specific_paths() {
    # Define what to backup based on hostname
    case "${HOSTNAME}" in
        vmi01*)
            BACKUP_PATHS=(
                "/etc"
                "/opt/mcp"
                "/key"
                "/root"
                "/home"
            )
            NEED_POSTGRES=true
            NEED_REDIS=true
            NEED_KEYCLOAK=false
            ;;
        vmi02d*)
            BACKUP_PATHS=(
                "/etc"
                "/key"
                "/root"
                "/home"
            )
            NEED_POSTGRES=false
            NEED_REDIS=false
            NEED_KEYCLOAK=false
            # TODO: Add NextCloud when deployed
            ;;
        vmi03*)
            BACKUP_PATHS=(
                "/etc"
                "/opt/keycloak"
                "/key"
                "/root"
                "/home"
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
    log_info "Creating backup directory structure..."
    mkdir -p "${LOCAL_BACKUP_DIR}"/{files,databases,logs,metadata}
    mkdir -p "${LOG_DIR}"
}

backup_postgres() {
    if [ "${NEED_POSTGRES}" != "true" ]; then
        return 0
    fi

    log_info "Backing up PostgreSQL databases..."

    local db_backup_dir="${LOCAL_BACKUP_DIR}/databases/postgresql"
    mkdir -p "${db_backup_dir}"

    # Get list of databases
    local databases=(mcp_ecosystem keycloak nextcloud)

    for db in "${databases[@]}"; do
        # Check if database exists
        if sudo -u postgres psql -lqt | cut -d \| -f 1 | grep -qw "${db}"; then
            log_info "Dumping database: ${db}"

            local dump_file="${db_backup_dir}/${db}_${BACKUP_TIMESTAMP}.dump"

            if sudo -u postgres pg_dump -Fc -f "${dump_file}" "${db}"; then
                # Verify dump
                if sudo -u postgres pg_restore --list "${dump_file}" > /dev/null 2>&1; then
                    log_info "Database ${db} backed up successfully"
                    # Compress with zstd
                    zstd -${COMPRESSION_LEVEL} --rm "${dump_file}"
                else
                    log_error "Database dump verification failed for ${db}"
                fi
            else
                log_error "Failed to dump database: ${db}"
            fi
        else
            log_warn "Database ${db} not found, skipping"
        fi
    done

    # Also backup all databases as globals (roles, tablespaces, etc.)
    log_info "Backing up PostgreSQL globals..."
    sudo -u postgres pg_dumpall --globals-only > "${db_backup_dir}/globals_${BACKUP_TIMESTAMP}.sql"
    zstd -${COMPRESSION_LEVEL} --rm "${db_backup_dir}/globals_${BACKUP_TIMESTAMP}.sql"
}

backup_redis() {
    if [ "${NEED_REDIS}" != "true" ]; then
        return 0
    fi

    log_info "Backing up Redis..."

    local redis_backup_dir="${LOCAL_BACKUP_DIR}/databases/redis"
    mkdir -p "${redis_backup_dir}"

    # Trigger BGSAVE
    redis-cli BGSAVE &> /dev/null || true

    # Wait for save to complete
    local timeout=60
    local elapsed=0
    while [ ${elapsed} -lt ${timeout} ]; do
        if redis-cli LASTSAVE | grep -q "$(date +%s)"; then
            break
        fi
        sleep 1
        ((elapsed++))
    done

    # Copy dump file
    if [ -f /var/lib/redis/dump.rdb ]; then
        cp /var/lib/redis/dump.rdb "${redis_backup_dir}/dump_${BACKUP_TIMESTAMP}.rdb"
        zstd -${COMPRESSION_LEVEL} --rm "${redis_backup_dir}/dump_${BACKUP_TIMESTAMP}.rdb"
        log_info "Redis backup completed"
    else
        log_warn "Redis dump file not found"
    fi
}

backup_keycloak() {
    if [ "${NEED_KEYCLOAK}" != "true" ]; then
        return 0
    fi

    log_info "Backing up Keycloak configuration..."

    local keycloak_backup_dir="${LOCAL_BACKUP_DIR}/files/keycloak"
    mkdir -p "${keycloak_backup_dir}"

    # Backup Keycloak data directory if it exists
    if [ -d /opt/keycloak/data ]; then
        tar czf "${keycloak_backup_dir}/keycloak-data_${BACKUP_TIMESTAMP}.tar.gz" \
            -C /opt/keycloak data
    fi

    # Backup Keycloak configuration
    if [ -d /opt/keycloak/conf ]; then
        tar czf "${keycloak_backup_dir}/keycloak-conf_${BACKUP_TIMESTAMP}.tar.gz" \
            -C /opt/keycloak conf
    fi
}

backup_system_logs() {
    log_info "Backing up system logs (last 7 days)..."

    local logs_backup_dir="${LOCAL_BACKUP_DIR}/logs"

    # Find and copy recent logs
    find /var/log -type f -mtime -7 -name "*.log" -o -name "*.log.*" | \
        while read -r logfile; do
            local relative_path="${logfile#/var/log/}"
            local dest_dir="${logs_backup_dir}/$(dirname "${relative_path}")"
            mkdir -p "${dest_dir}"
            cp "${logfile}" "${dest_dir}/" 2>/dev/null || true
        done

    # Compress logs directory
    if [ -d "${logs_backup_dir}" ]; then
        tar czf "${LOCAL_BACKUP_DIR}/logs_${BACKUP_TIMESTAMP}.tar.gz" \
            -C "${LOCAL_BACKUP_DIR}" logs
        rm -rf "${logs_backup_dir}"
    fi
}

backup_package_list() {
    log_info "Backing up installed packages list..."

    local metadata_dir="${LOCAL_BACKUP_DIR}/metadata"

    dpkg -l > "${metadata_dir}/packages_${BACKUP_TIMESTAMP}.txt"
    apt-mark showmanual > "${metadata_dir}/manual-packages_${BACKUP_TIMESTAMP}.txt"
    systemctl list-unit-files --state=enabled > "${metadata_dir}/enabled-services_${BACKUP_TIMESTAMP}.txt"
}

backup_files() {
    log_info "Backing up filesystem paths..."

    local files_backup_dir="${LOCAL_BACKUP_DIR}/files"

    for path in "${BACKUP_PATHS[@]}"; do
        if [ ! -e "${path}" ]; then
            log_warn "Path does not exist, skipping: ${path}"
            continue
        fi

        log_info "Backing up: ${path}"

        local dest_name=$(echo "${path}" | sed 's|^/||; s|/|_|g')
        local archive_name="${files_backup_dir}/${dest_name}_${BACKUP_TIMESTAMP}.tar.zst"

        # Create archive with zstd compression
        local tar_opts=(
            --create
            --file -
            --preserve-permissions
            --one-file-system
        )

        if [ -f "${EXCLUDE_FILE}" ]; then
            tar_opts+=(--exclude-from="${EXCLUDE_FILE}")
        fi

        # Exclude common patterns
        tar_opts+=(
            --exclude='*.tmp'
            --exclude='*.cache'
            --exclude='*~'
            --exclude='.git'
        )

        if tar "${tar_opts[@]}" -C / "${path#/}" | zstd -${COMPRESSION_LEVEL} -T0 > "${archive_name}"; then
            local size=$(du -h "${archive_name}" | cut -f1)
            log_info "Completed backup of ${path} (${size})"
        else
            log_error "Failed to backup: ${path}"
        fi
    done
}

generate_manifest() {
    log_info "Generating backup manifest..."

    local total_size=$(du -sb "${LOCAL_BACKUP_DIR}" | cut -f1)
    local file_count=$(find "${LOCAL_BACKUP_DIR}" -type f | wc -l)
    local end_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    cat > "${METADATA_FILE}" <<EOF
{
  "hostname": "${HOSTNAME}",
  "backup_type": "daily-incremental",
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
    log_info "Uploading backup to S3: ${S3_BACKUP_PATH}"

    local rclone_opts=(
        --config "${RCLONE_CONFIG}"
        --progress
        --stats 30s
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
                log_warn "Upload failed, retrying in 60 seconds..."
                sleep 60
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

    # Check if all files were uploaded
    local local_count=$(find "${LOCAL_BACKUP_DIR}" -type f | wc -l)
    local remote_count=$(rclone ls "${S3_REMOTE}:${S3_BACKUP_PATH}" --config "${RCLONE_CONFIG}" | wc -l)

    if [ "${local_count}" -ne "${remote_count}" ]; then
        die "File count mismatch: local=${local_count}, remote=${remote_count}"
    fi

    log_info "Verification passed: ${remote_count} files uploaded"
}

cleanup_old_s3_backups() {
    log_info "Cleaning up old S3 backups (keeping last ${DAILY_RETENTION_DAYS} days)..."

    # Get list of backup dates
    local cutoff_date=$(date -d "${DAILY_RETENTION_DAYS} days ago" +%Y-%m-%d)

    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" --config "${RCLONE_CONFIG}" --dirs-only | \
        while read -r backup_dir; do
            backup_dir="${backup_dir%/}"

            # Check if it's a date directory (YYYY-MM-DD format)
            if [[ "${backup_dir}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
                if [[ "${backup_dir}" < "${cutoff_date}" ]]; then
                    log_info "Deleting old backup: ${backup_dir}"
                    if [ "${DRY_RUN}" != true ]; then
                        rclone purge "${S3_REMOTE}:${S3_BASE_PATH}/${backup_dir}" \
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
Backup completed successfully for ${HOSTNAME}

Backup Details:
- Date: ${BACKUP_DATE}
- Time: ${BACKUP_TIME}
- Duration: ${duration} seconds
- Total Size: ${backup_size}
- S3 Path: s3://${S3_BACKUP_PATH}

Backup Contents:
$(cat "${METADATA_FILE}" | jq -r '.backup_paths[]' | sed 's/^/  - /')

Databases:
$(cat "${METADATA_FILE}" | jq -r '.databases | to_entries[] | "  - \(.key): \(.value)"')

Log File: ${LOG_FILE}

---
Automated backup system
EOF
)

    echo "${email_body}" | mail -s "${EMAIL_SUBJECT} - SUCCESS" \
        -r "${EMAIL_FROM}" "${EMAIL_TO}" 2>/dev/null || \
        log_warn "Failed to send email notification"
}

send_failure_notification() {
    local error_msg="$*"

    local email_body=$(cat <<EOF
Backup FAILED for ${HOSTNAME}

Error: ${error_msg}

Date: ${BACKUP_DATE}
Time: ${BACKUP_TIME}

Please check the log file: ${LOG_FILE}

Recent log entries:
$(tail -n 20 "${LOG_FILE}" 2>/dev/null || echo "Log file not available")

---
Automated backup system
EOF
)

    echo "${email_body}" | mail -s "${EMAIL_SUBJECT} - FAILED" \
        -r "${EMAIL_FROM}" "${EMAIL_TO}" 2>/dev/null || true
}

print_summary() {
    local duration=$1
    local backup_size=$2

    log_info "============================================"
    log_info "Backup Summary"
    log_info "============================================"
    log_info "Hostname:      ${HOSTNAME}"
    log_info "Date:          ${BACKUP_DATE}"
    log_info "Duration:      ${duration} seconds"
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
    log_info "Starting backup for ${HOSTNAME}"
    log_info "========================================"

    # Pre-flight checks
    acquire_lock
    check_requirements
    get_vm_specific_paths
    create_backup_structure

    # Perform backups
    backup_postgres
    backup_redis
    backup_keycloak
    backup_files
    backup_system_logs
    backup_package_list

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

    log_info "Backup completed successfully"
    exit 0
}

# Trap errors
trap 'die "Script failed at line $LINENO"' ERR

# Run main
main "$@"
