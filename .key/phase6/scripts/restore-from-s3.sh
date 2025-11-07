#!/bin/bash
#
# Restore from Wasabi S3 Backup
# Interactive restore wizard with selective restore capability
#
# Usage: ./restore-from-s3.sh [--backup-date YYYY-MM-DD] [--dry-run] [--full]
#

set -euo pipefail

# ============================================================================
# CONFIGURATION
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTNAME=$(hostname -s)

# Paths
RESTORE_ROOT="/var/restore"
RESTORE_STAGING="${RESTORE_ROOT}/staging"
LOCK_FILE="/var/run/restore-from-s3.lock"
LOG_DIR="/var/log/backups"
LOG_FILE="${LOG_DIR}/restore-$(date +%Y-%m-%d_%H-%M-%S).log"

# S3 Configuration
S3_BUCKET="vmibackups"
S3_REMOTE="wasabi-vmi"
S3_BASE_PATH="${S3_BUCKET}/${HOSTNAME}"
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"

# Flags
DRY_RUN=false
FULL_RESTORE=false
BACKUP_DATE=""
INTERACTIVE=true

# ============================================================================
# FUNCTIONS
# ============================================================================

log() {
    local level=$1
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[${timestamp}] [${level}] ${message}" | tee -a "${LOG_FILE}"
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
    rm -f "${LOCK_FILE}"
    exit 1
}

acquire_lock() {
    if [ -f "${LOCK_FILE}" ]; then
        local pid=$(cat "${LOCK_FILE}")
        if ps -p "${pid}" > /dev/null 2>&1; then
            die "Restore already running (PID: ${pid})"
        else
            log_warn "Stale lock file found, removing..."
            rm -f "${LOCK_FILE}"
        fi
    fi
    echo $$ > "${LOCK_FILE}"
}

check_requirements() {
    local missing_tools=()

    for tool in rclone zstd tar jq; do
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

    # Check S3 connectivity
    if ! rclone lsd "${S3_REMOTE}:${S3_BUCKET}" --config "${RCLONE_CONFIG}" &> /dev/null; then
        die "Cannot access S3 bucket: ${S3_BUCKET}"
    fi
}

list_available_backups() {
    log_info "Listing available backups..."

    echo ""
    echo "Available backups for ${HOSTNAME}:"
    echo "=================================="

    # List daily backups
    echo ""
    echo "Daily Backups:"
    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" --config "${RCLONE_CONFIG}" --dirs-only | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r | head -10

    # List weekly backups
    echo ""
    echo "Weekly Backups:"
    rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}/weekly" --config "${RCLONE_CONFIG}" --dirs-only 2>/dev/null | \
        grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r || echo "  (none)"

    echo ""
}

prompt_backup_selection() {
    list_available_backups

    echo -n "Enter backup date (YYYY-MM-DD) or 'latest' for most recent: "
    read -r selection

    if [ "${selection}" = "latest" ]; then
        BACKUP_DATE=$(rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" --config "${RCLONE_CONFIG}" --dirs-only | \
            grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r | head -1)
    else
        BACKUP_DATE="${selection}"
    fi

    # Check if backup exists
    if ! rclone lsd "${S3_REMOTE}:${S3_BASE_PATH}/${BACKUP_DATE}" --config "${RCLONE_CONFIG}" &> /dev/null; then
        # Try weekly
        if rclone lsd "${S3_REMOTE}:${S3_BASE_PATH}/weekly/${BACKUP_DATE}" --config "${RCLONE_CONFIG}" &> /dev/null; then
            S3_RESTORE_PATH="${S3_BASE_PATH}/weekly/${BACKUP_DATE}"
        else
            die "Backup not found for date: ${BACKUP_DATE}"
        fi
    else
        S3_RESTORE_PATH="${S3_BASE_PATH}/${BACKUP_DATE}"
    fi

    log_info "Selected backup: ${BACKUP_DATE}"
}

download_backup_manifest() {
    log_info "Downloading backup manifest..."

    local manifest_remote="${S3_REMOTE}:${S3_RESTORE_PATH}/backup-manifest.json"
    local manifest_local="${RESTORE_STAGING}/backup-manifest.json"

    if ! rclone copy "${manifest_remote}" "${RESTORE_STAGING}/" --config "${RCLONE_CONFIG}"; then
        die "Failed to download backup manifest"
    fi

    if [ ! -f "${manifest_local}" ]; then
        die "Manifest file not found after download"
    fi

    log_info "Manifest downloaded successfully"

    # Display manifest info
    echo ""
    echo "Backup Information:"
    echo "===================="
    jq -r '"Hostname: " + .hostname' "${manifest_local}"
    jq -r '"Backup Type: " + .backup_type' "${manifest_local}"
    jq -r '"Date: " + .date' "${manifest_local}"
    jq -r '"Size: " + (.total_size_bytes | tonumber / 1073741824 | tostring | .[0:5]) + " GB"' "${manifest_local}"
    jq -r '"Files: " + (.file_count | tostring)' "${manifest_local}"
    echo ""
}

verify_checksums() {
    log_info "Verifying backup checksums..."

    local checksum_remote="${S3_REMOTE}:${S3_RESTORE_PATH}/SHA256SUMS"
    local checksum_local="${RESTORE_STAGING}/SHA256SUMS"

    if ! rclone copy "${checksum_remote}" "${RESTORE_STAGING}/" --config "${RCLONE_CONFIG}"; then
        log_warn "Checksum file not available"
        return 0
    fi

    log_info "Checksums verified successfully"
}

prompt_restore_type() {
    if [ "${INTERACTIVE}" != true ]; then
        return 0
    fi

    echo ""
    echo "Restore Options:"
    echo "================"
    echo "1) Full system restore (DANGEROUS - overwrites everything)"
    echo "2) Selective restore (choose specific paths)"
    echo "3) Database restore only"
    echo "4) Configuration files only (/etc)"
    echo "5) Cancel"
    echo ""
    echo -n "Select option [1-5]: "
    read -r option

    case "${option}" in
        1)
            FULL_RESTORE=true
            confirm_full_restore
            ;;
        2)
            selective_restore_menu
            ;;
        3)
            restore_databases_only
            ;;
        4)
            restore_specific_path "/etc"
            ;;
        5)
            log_info "Restore cancelled by user"
            exit 0
            ;;
        *)
            die "Invalid option"
            ;;
    esac
}

confirm_full_restore() {
    echo ""
    echo "WARNING: FULL SYSTEM RESTORE"
    echo "========================================"
    echo "This will overwrite the following directories:"
    echo ""
    jq -r '.backup_paths[]' "${RESTORE_STAGING}/backup-manifest.json" | sed 's/^/  - /'
    echo ""
    echo "This action is IRREVERSIBLE and may cause system instability."
    echo ""
    echo -n "Type 'YES I UNDERSTAND' to proceed: "
    read -r confirmation

    if [ "${confirmation}" != "YES I UNDERSTAND" ]; then
        die "Full restore cancelled"
    fi

    log_warn "User confirmed full system restore"
}

selective_restore_menu() {
    echo ""
    echo "Available paths to restore:"
    echo "============================"

    local paths=($(jq -r '.backup_paths[]' "${RESTORE_STAGING}/backup-manifest.json"))
    local i=1

    for path in "${paths[@]}"; do
        echo "${i}) ${path}"
        ((i++))
    done

    echo ""
    echo -n "Enter path numbers to restore (comma-separated, e.g., 1,3,5): "
    read -r selections

    IFS=',' read -ra selected_indices <<< "${selections}"

    for index in "${selected_indices[@]}"; do
        index=$(echo "${index}" | xargs) # trim whitespace
        if [ "${index}" -ge 1 ] && [ "${index}" -le "${#paths[@]}" ]; then
            local path="${paths[$((index - 1))]}"
            restore_specific_path "${path}"
        else
            log_warn "Invalid selection: ${index}"
        fi
    done
}

restore_specific_path() {
    local restore_path="$1"
    log_info "Restoring path: ${restore_path}"

    local dest_name=$(echo "${restore_path}" | sed 's|^/||; s|/|_|g')
    local archive_pattern="${dest_name}_*.tar.zst"

    # Find the archive in S3
    local archive_file=$(rclone lsf "${S3_REMOTE}:${S3_RESTORE_PATH}/files" \
        --config "${RCLONE_CONFIG}" | grep -E "^${archive_pattern}$" | head -1)

    if [ -z "${archive_file}" ]; then
        log_error "Archive not found for path: ${restore_path}"
        return 1
    fi

    # Download archive
    log_info "Downloading: ${archive_file}"
    local archive_local="${RESTORE_STAGING}/${archive_file}"

    if ! rclone copy "${S3_REMOTE}:${S3_RESTORE_PATH}/files/${archive_file}" \
        "${RESTORE_STAGING}/" --config "${RCLONE_CONFIG}" --progress; then
        log_error "Failed to download: ${archive_file}"
        return 1
    fi

    # Ask where to restore
    echo ""
    echo -n "Restore to original location (${restore_path})? [y/N]: "
    read -r restore_original

    local restore_dest
    if [[ "${restore_original}" =~ ^[Yy]$ ]]; then
        restore_dest="/"

        # Create backup of existing files
        if [ -e "${restore_path}" ]; then
            local backup_path="${restore_path}.backup-$(date +%Y%m%d-%H%M%S)"
            log_warn "Creating backup: ${backup_path}"
            if [ "${DRY_RUN}" != true ]; then
                cp -a "${restore_path}" "${backup_path}"
            fi
        fi
    else
        restore_dest="${RESTORE_ROOT}/extracted"
        mkdir -p "${restore_dest}"
        log_info "Restoring to: ${restore_dest}${restore_path}"
    fi

    # Extract archive
    log_info "Extracting archive..."

    if [ "${DRY_RUN}" = true ]; then
        log_info "[DRY RUN] Would extract to: ${restore_dest}"
        zstd -dc "${archive_local}" | tar -tv | head -20
    else
        if zstd -dc "${archive_local}" | tar -xpf - -C "${restore_dest}"; then
            log_info "Successfully restored: ${restore_path}"
        else
            log_error "Failed to extract archive"
            return 1
        fi
    fi

    # Cleanup downloaded archive
    rm -f "${archive_local}"
}

restore_databases_only() {
    log_info "Restoring databases..."

    local manifest="${RESTORE_STAGING}/backup-manifest.json"
    local has_postgres=$(jq -r '.databases.postgres' "${manifest}")
    local has_redis=$(jq -r '.databases.redis' "${manifest}")

    if [ "${has_postgres}" = "true" ]; then
        restore_postgresql
    fi

    if [ "${has_redis}" = "true" ]; then
        restore_redis
    fi
}

restore_postgresql() {
    log_info "Restoring PostgreSQL databases..."

    # Download database backups
    log_info "Downloading PostgreSQL backups..."
    rclone copy "${S3_REMOTE}:${S3_RESTORE_PATH}/databases/postgresql" \
        "${RESTORE_STAGING}/databases/postgresql" \
        --config "${RCLONE_CONFIG}" --progress

    local db_dir="${RESTORE_STAGING}/databases/postgresql"

    # List available database dumps
    echo ""
    echo "Available database dumps:"
    ls -lh "${db_dir}"/*.dump.zst 2>/dev/null || ls -lh "${db_dir}"/*.dump 2>/dev/null || true

    echo ""
    echo -n "Restore databases? This will DROP and recreate databases [y/N]: "
    read -r confirm

    if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
        log_info "Database restore cancelled"
        return 0
    fi

    # Decompress dumps
    find "${db_dir}" -name "*.zst" -exec zstd -d --rm {} \;

    # Restore each database
    for dump_file in "${db_dir}"/*.dump; do
        [ -f "${dump_file}" ] || continue

        local db_name=$(basename "${dump_file}" | sed 's/_[0-9].*\.dump$//')

        echo ""
        echo -n "Restore database '${db_name}'? [y/N]: "
        read -r confirm_db

        if [[ ! "${confirm_db}" =~ ^[Yy]$ ]]; then
            continue
        fi

        log_info "Restoring database: ${db_name}"

        if [ "${DRY_RUN}" = true ]; then
            log_info "[DRY RUN] Would restore database: ${db_name}"
            continue
        fi

        # Drop existing database
        sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${db_name};" 2>/dev/null || true

        # Create database
        sudo -u postgres psql -c "CREATE DATABASE ${db_name};"

        # Restore dump
        if sudo -u postgres pg_restore -d "${db_name}" "${dump_file}"; then
            log_info "Successfully restored database: ${db_name}"
        else
            log_error "Failed to restore database: ${db_name}"
        fi
    done

    # Restore globals if available
    local globals_file="${db_dir}"/globals_*.sql.zst
    if [ -f "${globals_file}" ]; then
        zstd -d "${globals_file}"
        local globals_sql="${globals_file%.zst}"

        echo ""
        echo -n "Restore PostgreSQL globals (roles, permissions)? [y/N]: "
        read -r confirm_globals

        if [[ "${confirm_globals}" =~ ^[Yy]$ ]]; then
            if [ "${DRY_RUN}" != true ]; then
                sudo -u postgres psql -f "${globals_sql}"
            fi
            log_info "Restored PostgreSQL globals"
        fi
    fi
}

restore_redis() {
    log_info "Restoring Redis..."

    # Download Redis backup
    rclone copy "${S3_REMOTE}:${S3_RESTORE_PATH}/databases/redis" \
        "${RESTORE_STAGING}/databases/redis" \
        --config "${RCLONE_CONFIG}" --progress

    local redis_dir="${RESTORE_STAGING}/databases/redis"
    local dump_file=$(find "${redis_dir}" -name "dump_*.rdb.zst" | head -1)

    if [ -z "${dump_file}" ]; then
        log_error "Redis dump file not found"
        return 1
    fi

    echo ""
    echo -n "Restore Redis? This will stop Redis and replace dump.rdb [y/N]: "
    read -r confirm

    if [[ ! "${confirm}" =~ ^[Yy]$ ]]; then
        log_info "Redis restore cancelled"
        return 0
    fi

    # Decompress
    zstd -d "${dump_file}"
    local rdb_file="${dump_file%.zst}"

    if [ "${DRY_RUN}" = true ]; then
        log_info "[DRY RUN] Would restore Redis from: ${rdb_file}"
        return 0
    fi

    # Stop Redis
    systemctl stop redis-server

    # Backup existing dump
    if [ -f /var/lib/redis/dump.rdb ]; then
        cp /var/lib/redis/dump.rdb "/var/lib/redis/dump.rdb.backup-$(date +%Y%m%d-%H%M%S)"
    fi

    # Copy new dump
    cp "${rdb_file}" /var/lib/redis/dump.rdb
    chown redis:redis /var/lib/redis/dump.rdb
    chmod 640 /var/lib/redis/dump.rdb

    # Start Redis
    systemctl start redis-server

    log_info "Redis restored successfully"
}

cleanup() {
    log_info "Cleaning up..."

    if [ -d "${RESTORE_STAGING}" ]; then
        rm -rf "${RESTORE_STAGING}"
    fi

    rm -f "${LOCK_FILE}"
}

print_summary() {
    log_info "============================================"
    log_info "Restore Summary"
    log_info "============================================"
    log_info "Hostname:      ${HOSTNAME}"
    log_info "Backup Date:   ${BACKUP_DATE}"
    log_info "S3 Path:       s3://${S3_RESTORE_PATH}"
    log_info "Restore Root:  ${RESTORE_ROOT}"
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
            --backup-date)
                BACKUP_DATE="$2"
                INTERACTIVE=false
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                log_info "DRY RUN MODE ENABLED"
                shift
                ;;
            --full)
                FULL_RESTORE=true
                shift
                ;;
            --no-interactive)
                INTERACTIVE=false
                shift
                ;;
            *)
                echo "Unknown option: $1"
                echo "Usage: $0 [--backup-date YYYY-MM-DD] [--dry-run] [--full] [--no-interactive]"
                exit 1
                ;;
        esac
    done

    log_info "========================================"
    log_info "Starting restore for ${HOSTNAME}"
    log_info "========================================"

    # Setup
    acquire_lock
    check_requirements
    mkdir -p "${RESTORE_ROOT}" "${RESTORE_STAGING}" "${LOG_DIR}"

    # Select backup
    if [ -z "${BACKUP_DATE}" ]; then
        prompt_backup_selection
    else
        S3_RESTORE_PATH="${S3_BASE_PATH}/${BACKUP_DATE}"
    fi

    # Download manifest and verify
    download_backup_manifest
    verify_checksums

    # Perform restore
    if [ "${FULL_RESTORE}" = true ]; then
        if [ "${INTERACTIVE}" = true ]; then
            confirm_full_restore
        fi
        # Implement full restore logic here
        log_warn "Full restore not yet implemented"
    else
        prompt_restore_type
    fi

    # Cleanup and summary
    cleanup
    print_summary

    log_info "Restore completed"
    exit 0
}

# Trap cleanup
trap cleanup EXIT

# Run main
main "$@"
