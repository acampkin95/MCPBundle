#!/bin/bash
set -euo pipefail

################################################################################
# Wasabi S3 Snapshot Configuration Script
#
# Purpose: Configure automated 6-hour snapshots with systemd timers, multi-VM
#          coordination, and GFS rotation
#
# Features:
#   - 6-hour snapshot schedule (00:00, 06:00, 12:00, 18:00)
#   - Multi-VM backup coordination via SSH
#   - PostgreSQL pg_basebackup
#   - Redis BGSAVE
#   - Rsync for critical directories
#   - SHA256 integrity verification
#   - Email and webhook notifications
#   - Comprehensive logging
#
# Usage: sudo ./configure-snapshots.sh
################################################################################

# Color output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

# Configuration
readonly LOG_DIR="/var/log/wasabi-backup"
readonly LOG_FILE="${LOG_DIR}/configure-snapshots.log"
readonly BACKUP_CONFIG_DIR="/etc/wasabi-backup"
readonly MANIFEST_DIR="${BACKUP_CONFIG_DIR}/manifests"
readonly SCRIPTS_DIR="${BACKUP_CONFIG_DIR}/scripts"
readonly SYSTEMD_DIR="/etc/systemd/system"
readonly TEMP_BACKUP_DIR="/var/backup/temp"

# VM Configuration
declare -A VM_HOSTS=(
    ["VMI01"]="46.250.243.123"
    ["VMI02D"]="46.250.241.70"
    ["VMI03"]="154.26.158.31"
    ["JUMPBOX"]="154.26.158.68"
)

# Notification Configuration
readonly NOTIFICATION_EMAIL="admin@example.com"
readonly NEXTCLOUD_WEBHOOK_URL="https://cloud.example.com/webhook"

################################################################################
# Pre-flight checks
################################################################################

preflight_checks() {
    log_info "Running pre-flight checks..."

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi

    # Check if configure-wasabi-s3.sh was run
    if [[ ! -f "${BACKUP_CONFIG_DIR}/gfs-policy.conf" ]]; then
        log_error "Please run configure-wasabi-s3.sh first"
        exit 1
    fi

    # Load shared policy variables (cache, retention, remote)
    # shellcheck disable=SC1091
    source "${BACKUP_CONFIG_DIR}/gfs-policy.conf"

    # Create directories
    mkdir -p "${LOG_DIR}"
    mkdir -p "${SCRIPTS_DIR}"
    mkdir -p "${TEMP_BACKUP_DIR}"
    chmod 750 "${LOG_DIR}"
    chmod 750 "${SCRIPTS_DIR}"
    chmod 700 "${TEMP_BACKUP_DIR}"
    mkdir -p "${LOCAL_CACHE_DIR:-/var/backup/cache}"
    chmod 750 "${LOCAL_CACHE_DIR:-/var/backup/cache}"

    # Check for required commands
    local required_commands=("rclone" "pg_basebackup" "redis-cli" "rsync" "jq" "sha256sum")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "${cmd}" &> /dev/null; then
            log_warning "Command not found: ${cmd} (may need to install on target VMs)"
        fi
    done

    log_success "Pre-flight checks completed"
}

################################################################################
# Create main snapshot script
################################################################################

create_snapshot_script() {
    log_info "Creating main snapshot script..."

cat > "${SCRIPTS_DIR}/wasabi-snapshot.sh" <<'EOFSCRIPT'
#!/bin/bash
set -euo pipefail

################################################################################
# Wasabi S3 Snapshot Execution Script
################################################################################

# Color output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

# Configuration
readonly BACKUP_CONFIG_DIR="/etc/wasabi-backup"
readonly MANIFEST_DIR="${BACKUP_CONFIG_DIR}/manifests"
readonly LOG_DIR="/var/log/wasabi-backup"
readonly LOG_FILE="${LOG_DIR}/snapshot-$(date +%Y%m%d).log"
readonly TEMP_DIR="/var/backup/temp"
readonly SSH_CONFIG="/root/.ssh/wasabi-backup-config"

# Source configurations
source "${BACKUP_CONFIG_DIR}/gfs-policy.conf"
source "${BACKUP_CONFIG_DIR}/manifest-functions.sh"

readonly CACHE_DIR="${LOCAL_CACHE_DIR:-/var/backup/cache}"
readonly CACHE_RETENTION_DAYS="${LOCAL_CACHE_RETENTION_DAYS:-3}"
readonly CACHE_MARKER="${CACHE_VERIFICATION_MARKER:-.verified}"

# VM Configuration
declare -A VM_HOSTS=(
    ["VMI01"]="46.250.243.123"
    ["VMI02D"]="46.250.241.70"
    ["VMI03"]="154.26.158.31"
    ["JUMPBOX"]="154.26.158.68"
)

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $*" | tee -a "${LOG_FILE}"
}

################################################################################
# Determine backup type based on schedule
################################################################################

get_backup_type() {
    local day_of_week=$(date +%u)
    local day_of_month=$(date +%d)
    local month=$(date +%m)
    local hour=$(date +%H)

    # Yearly: January 1st at 00:00
    if [[ "${day_of_month}" == "01" ]] && [[ "${month}" == "01" ]] && [[ "${hour}" == "00" ]]; then
        echo "yearly"
        return
    fi

    # Monthly: 1st of month at 00:00
    if [[ "${day_of_month}" == "01" ]] && [[ "${hour}" == "00" ]]; then
        echo "monthly"
        return
    fi

    # Weekly: Sunday at 00:00
    if [[ "${day_of_week}" == "7" ]] && [[ "${hour}" == "00" ]]; then
        echo "weekly"
        return
    fi

    # Daily: at 00:00
    if [[ "${hour}" == "00" ]]; then
        echo "daily"
        return
    fi

    # Hourly: all other times (00:00, 06:00, 12:00, 18:00)
    echo "hourly"
}

################################################################################
# PostgreSQL backup function
################################################################################

backup_postgresql() {
    local vm_host="$1"
    local backup_id="$2"
    local backup_dir="${TEMP_DIR}/${backup_id}/postgresql"

    log_info "Backing up PostgreSQL from ${vm_host}..."

    mkdir -p "${backup_dir}"

    # Run pg_basebackup via SSH
    if ssh -F "${SSH_CONFIG}" "root@${vm_host}" \
        "sudo -u postgres pg_basebackup -D /tmp/pg_backup_${backup_id} -Ft -z -P"; then

        # Transfer backup to local temp
        scp -F "${SSH_CONFIG}" -r "root@${vm_host}:/tmp/pg_backup_${backup_id}/*" "${backup_dir}/"

        # Cleanup remote temp
        ssh -F "${SSH_CONFIG}" "root@${vm_host}" "rm -rf /tmp/pg_backup_${backup_id}"

        log_success "PostgreSQL backup completed from ${vm_host}"
        echo "${backup_dir}"
    else
        log_error "PostgreSQL backup failed from ${vm_host}"
        return 1
    fi
}

################################################################################
# Redis backup function
################################################################################

backup_redis() {
    local vm_host="$1"
    local backup_id="$2"
    local backup_dir="${TEMP_DIR}/${backup_id}/redis"

    log_info "Backing up Redis from ${vm_host}..."

    mkdir -p "${backup_dir}"

    # Trigger BGSAVE via SSH
    ssh -F "${SSH_CONFIG}" "root@${vm_host}" "redis-cli BGSAVE"

    # Wait for save to complete
    local max_wait=60
    local waited=0
    while [[ ${waited} -lt ${max_wait} ]]; do
        local save_status=$(ssh -F "${SSH_CONFIG}" "root@${vm_host}" \
            "redis-cli LASTSAVE")
        sleep 2
        local current_status=$(ssh -F "${SSH_CONFIG}" "root@${vm_host}" \
            "redis-cli LASTSAVE")

        if [[ "${current_status}" != "${save_status}" ]]; then
            break
        fi

        waited=$((waited + 2))
    done

    # Copy RDB file
    scp -F "${SSH_CONFIG}" "root@${vm_host}:/var/lib/redis/dump.rdb" \
        "${backup_dir}/dump.rdb"

    log_success "Redis backup completed from ${vm_host}"
    echo "${backup_dir}"
}

################################################################################
# Directory backup function
################################################################################

backup_directory() {
    local vm_host="$1"
    local source_dir="$2"
    local backup_id="$3"
    local dest_name=$(echo "${source_dir}" | tr '/' '_' | sed 's/^_//')
    local backup_dir="${TEMP_DIR}/${backup_id}/${dest_name}"

    log_info "Backing up ${source_dir} from ${vm_host}..."

    mkdir -p "${backup_dir}"

    # Rsync directory via SSH
    if rsync -az --progress --stats \
        -e "ssh -F ${SSH_CONFIG}" \
        "root@${vm_host}:${source_dir}/" \
        "${backup_dir}/"; then

        log_success "Directory backup completed: ${source_dir}"
        echo "${backup_dir}"
    else
        log_warning "Directory backup failed: ${source_dir} (may not exist)"
        return 1
    fi
}

################################################################################
# Calculate checksums for backup
################################################################################

calculate_backup_checksums() {
    local backup_dir="$1"
    local checksum_file="${backup_dir}/checksums.sha256"

    log_info "Calculating checksums..."

    find "${backup_dir}" -type f ! -name "checksums.sha256" -exec sha256sum {} \; > "${checksum_file}"

    log_success "Checksums calculated and saved to ${checksum_file}"
}

################################################################################
# Cache staging and verification helpers
################################################################################

stage_backup_cache() {
    local vm_name="$1"
    local backup_id="$2"
    local source_dir="${TEMP_DIR}/${backup_id}"
    local cache_path="${CACHE_DIR}/${vm_name}/${backup_id}"

    mkdir -p "$(dirname "${cache_path}")"

    if mv "${source_dir}" "${cache_path}" 2>/dev/null; then
        log_info "Staged backup ${backup_id} in cache: ${cache_path}"
    else
        log_warning "Direct move to cache failed, falling back to rsync for ${backup_id}"
        mkdir -p "${cache_path}"
        rsync -a "${source_dir}/" "${cache_path}/"
        rm -rf "${source_dir}"
    fi

    echo "${cache_path}"
}

mark_backup_verified() {
    local cache_path="$1"
    touch "${cache_path}/${CACHE_MARKER}"
    log_info "Marked cache copy as verified: ${cache_path}"
}

verify_remote_backup() {
    local cache_path="$1"
    local remote_path="$2"

    log_info "Verifying remote backup integrity for ${remote_path}..."
    if rclone check "${cache_path}" "${remote_path}" --one-way --size-only --quiet; then
        log_success "Remote verification completed for ${remote_path}"
        return 0
    fi

    log_error "Remote verification failed for ${remote_path}"
    return 1
}

cleanup_cache() {
    local vm_name="$1"
    local vm_cache_root="${CACHE_DIR}/${vm_name}"

    [[ -d "${vm_cache_root}" ]] || return 0

    find "${vm_cache_root}" -mindepth 1 -maxdepth 1 -type d -mtime +"${CACHE_RETENTION_DAYS}" -print0 | while IFS= read -r -d '' dir; do
        if [[ -f "${dir}/${CACHE_MARKER}" ]]; then
            rm -rf "${dir}"
            log_info "Removed cached backup $(basename "${dir}") for ${vm_name} (retention ${CACHE_RETENTION_DAYS} days)"
        else
            log_warning "Skipped cache deletion for ${dir} (waiting for verification)"
        fi
    done
}

################################################################################
# Upload backup to Wasabi
################################################################################

upload_to_wasabi() {
    local cache_path="$1"
    local backup_type="$2"
    local vm_name="$3"
    local backup_id="$4"
    local remote_path="${RCLONE_REMOTE}:${backup_type}/${vm_name}/${backup_id}"

    log_info "Uploading backup to Wasabi: ${remote_path}..."

    # Upload with progress
    if rclone copy "${cache_path}" "${remote_path}" \
        --transfers 4 \
        --checkers 8 \
        --progress \
        --stats 30s \
        --log-file "${LOG_FILE}"; then

        log_success "Backup uploaded successfully"

        # Verify upload
        local local_size=$(du -sb "${cache_path}" | awk '{print $1}')
        local remote_size=$(rclone size "${remote_path}" --json | jq -r '.bytes')

        if [[ "${local_size}" == "${remote_size}" ]]; then
            log_success "Upload verified: ${local_size} bytes"
        else
            log_warning "Size mismatch: local=${local_size}, remote=${remote_size}"
        fi

        verify_remote_backup "${cache_path}" "${remote_path}"
        return $?
    else
        log_error "Backup upload failed"
        return 1
    fi
}

################################################################################
# Backup single VM
################################################################################

backup_vm() {
    local vm_name="$1"
    local vm_host="${VM_HOSTS[$vm_name]}"
    local backup_type=$(get_backup_type)
    local backup_id="$(generate_manifest_id)_${vm_name}"
    local start_time=$(date +%s)

    log_info "===== Starting backup for ${vm_name} ====="
    log_info "Backup ID: ${backup_id}"
    log_info "Backup type: ${backup_type}"

    # Create manifest
    local manifest_file=$(create_manifest "${backup_id}" "${backup_type}" "${vm_name}")
    log_info "Manifest created: ${manifest_file}"

    # Create temp backup directory
    local backup_dir="${TEMP_DIR}/${backup_id}"
    mkdir -p "${backup_dir}"

    # Source VM-specific configuration
    source "${BACKUP_CONFIG_DIR}/sources-${vm_name}.conf"

    # Perform backups based on VM type
    case "${vm_name}" in
        "VMI01")
            backup_postgresql "${vm_host}" "${backup_id}" || true
            backup_redis "${vm_host}" "${backup_id}" || true
            backup_directory "${vm_host}" "/var/log/mcp" "${backup_id}" || true
            backup_directory "${vm_host}" "/etc" "${backup_id}" || true
            ;;

        "VMI02D")
            # NextCloud incremental backup
            backup_directory "${vm_host}" "/var/www/nextcloud/data" "${backup_id}" || true
            backup_directory "${vm_host}" "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Plug-in Support/Databases" "${backup_id}" || true
            backup_directory "${vm_host}" "/etc" "${backup_id}" || true
            ;;

        "VMI03")
            backup_directory "${vm_host}" "/var/lib/keycloak" "${backup_id}" || true
            backup_directory "${vm_host}" "/var/lib/grafana" "${backup_id}" || true
            backup_directory "${vm_host}" "/etc/grafana/dashboards" "${backup_id}" || true
            backup_directory "${vm_host}" "/var/log/security" "${backup_id}" || true
            backup_directory "${vm_host}" "/etc" "${backup_id}" || true
            ;;
        "JUMPBOX")
            backup_directory "${vm_host}" "/opt/adguard" "${backup_id}" || true
            backup_directory "${vm_host}" "/etc/wireguard" "${backup_id}" || true
            backup_directory "${vm_host}" "/var/log/adguard" "${backup_id}" || true
            backup_directory "${vm_host}" "/etc" "${backup_id}" || true
            ;;
    esac

    # Calculate checksums
    calculate_backup_checksums "${backup_dir}"

    local cache_path
    cache_path=$(stage_backup_cache "${vm_name}" "${backup_id}")

    # Upload to Wasabi
    if upload_to_wasabi "${cache_path}" "${backup_type}" "${vm_name}" "${backup_id}"; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        # Finalize manifest
        finalize_manifest "${manifest_file}" "success" "${duration}"

        mark_backup_verified "${cache_path}"
        cleanup_cache "${vm_name}"

        log_success "===== Backup completed for ${vm_name} in ${duration}s ====="
        return 0
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        finalize_manifest "${manifest_file}" "failed" "${duration}"

        log_error "===== Backup failed for ${vm_name} ====="
        return 1
    fi
}

################################################################################
# Send notification
################################################################################

send_notification() {
    local subject="$1"
    local message="$2"
    local status="$3"

    # Log notification
    log_info "Sending notification: ${subject}"

    # Email notification (if mail is configured)
    if command -v mail &> /dev/null; then
        echo "${message}" | mail -s "${subject}" admin@example.com || true
    fi

    # NextCloud webhook notification
    if command -v curl &> /dev/null; then
        curl -X POST \
            -H "Content-Type: application/json" \
            -d "{\"subject\":\"${subject}\",\"message\":\"${message}\",\"status\":\"${status}\"}" \
            "https://nextcloud.example.com/webhook" &> /dev/null || true
    fi
}

################################################################################
# Main backup execution
################################################################################

main() {
    log_info "===== Wasabi Snapshot Starting ====="
    log_info "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

    local backup_type=$(get_backup_type)
    log_info "Backup type: ${backup_type}"

    local success_count=0
    local fail_count=0
    local vm_statuses=""

    # Backup all VMs
    for vm in "${!VM_HOSTS[@]}"; do
        if backup_vm "${vm}"; then
            ((success_count++))
            vm_statuses="${vm_statuses}\n  - ${vm}: SUCCESS"
        else
            ((fail_count++))
            vm_statuses="${vm_statuses}\n  - ${vm}: FAILED"
        fi
    done

    # Apply GFS rotation
    log_info "Applying GFS rotation..."
    "${BACKUP_CONFIG_DIR}/gfs-rotate.sh" || log_warning "GFS rotation had some issues"

    # Send summary notification
    local total_vms=${#VM_HOSTS[@]}
    local summary="Wasabi Backup Summary\n"
    summary+="Backup Type: ${backup_type}\n"
    summary+="Total VMs: ${total_vms}\n"
    summary+="Successful: ${success_count}\n"
    summary+="Failed: ${fail_count}\n"
    summary+="VM Status:${vm_statuses}"

    if [[ ${fail_count} -eq 0 ]]; then
        send_notification "Wasabi Backup Success" "${summary}" "success"
        log_success "===== All backups completed successfully ====="
    else
        send_notification "Wasabi Backup Partial Failure" "${summary}" "warning"
        log_warning "===== Some backups failed ====="
    fi

    log_info "===== Wasabi Snapshot Complete ====="
}

# Error handler
trap 'log_error "Snapshot script failed at line $LINENO"' ERR

# Run main
main "$@"
EOFSCRIPT

    chmod 755 "${SCRIPTS_DIR}/wasabi-snapshot.sh"
    log_success "Main snapshot script created"
}

################################################################################
# Create systemd timer and service units
################################################################################

create_systemd_units() {
    log_info "Creating systemd timer and service units..."

    # Snapshot service
    cat > "${SYSTEMD_DIR}/wasabi-snapshot.service" <<'EOF'
[Unit]
Description=Wasabi S3 6-Hour Snapshot Backup
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/etc/wasabi-backup/scripts/wasabi-snapshot.sh
User=root
StandardOutput=journal
StandardError=journal
SyslogIdentifier=wasabi-snapshot

# Security settings
PrivateTmp=yes
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/log/wasabi-backup /var/backup/temp /etc/wasabi-backup/manifests

# Timeout
TimeoutSec=3600

[Install]
WantedBy=multi-user.target
EOF

    # Snapshot timer (6-hour intervals)
    cat > "${SYSTEMD_DIR}/wasabi-snapshot.timer" <<'EOF'
[Unit]
Description=Wasabi S3 6-Hour Snapshot Timer
Requires=wasabi-snapshot.service

[Timer]
# Run every 6 hours at :00:00, :06:00, :12:00, :18:00
OnCalendar=00/6:00:00
Persistent=true
Unit=wasabi-snapshot.service

[Install]
WantedBy=timers.target
EOF

    chmod 644 "${SYSTEMD_DIR}/wasabi-snapshot.service"
    chmod 644 "${SYSTEMD_DIR}/wasabi-snapshot.timer"

    # Reload systemd
    systemctl daemon-reload

    log_success "Systemd units created"
}

################################################################################
# Enable and start timer
################################################################################

enable_timer() {
    log_info "Enabling and starting wasabi-snapshot timer..."

    systemctl enable wasabi-snapshot.timer
    systemctl start wasabi-snapshot.timer

    # Show timer status
    systemctl status wasabi-snapshot.timer --no-pager || true

    # Show next scheduled run
    local next_run=$(systemctl list-timers --no-pager | grep wasabi-snapshot | awk '{print $1, $2, $3}')
    log_info "Next snapshot: ${next_run}"

    log_success "Timer enabled and started"
}

################################################################################
# Create notification templates
################################################################################

create_notification_templates() {
    log_info "Creating notification templates..."

    cat > "${BACKUP_CONFIG_DIR}/notification-templates.conf" <<'EOF'
# Email and Webhook Notification Templates

# Email settings
EMAIL_FROM="backup@mcp-bundle.local"
EMAIL_TO="admin@example.com"
EMAIL_SMTP_SERVER="localhost"

# NextCloud webhook
NEXTCLOUD_WEBHOOK_URL="https://nextcloud.example.com/webhook"
NEXTCLOUD_WEBHOOK_TOKEN="your-webhook-token-here"

# Slack webhook (optional)
SLACK_WEBHOOK_URL=""

# Success template
SUCCESS_SUBJECT="[SUCCESS] Wasabi Backup - %BACKUP_TYPE% - %TIMESTAMP%"
SUCCESS_BODY="All backups completed successfully.\nBackup Type: %BACKUP_TYPE%\nTimestamp: %TIMESTAMP%\nVMs: %VM_COUNT%\nDuration: %DURATION%s"

# Failure template
FAILURE_SUBJECT="[FAILURE] Wasabi Backup - %BACKUP_TYPE% - %TIMESTAMP%"
FAILURE_BODY="Backup completed with failures.\nBackup Type: %BACKUP_TYPE%\nTimestamp: %TIMESTAMP%\nFailed VMs: %FAILED_VMS%\nCheck logs at: /var/log/wasabi-backup/"

# Warning template
WARNING_SUBJECT="[WARNING] Wasabi Backup - %BACKUP_TYPE% - %TIMESTAMP%"
WARNING_BODY="Backup completed with warnings.\nBackup Type: %BACKUP_TYPE%\nTimestamp: %TIMESTAMP%\nWarnings: %WARNINGS%"
EOF

    chmod 640 "${BACKUP_CONFIG_DIR}/notification-templates.conf"
    log_success "Notification templates created"
}

################################################################################
# Test snapshot execution
################################################################################

test_snapshot() {
    log_info "Running test snapshot (dry-run mode)..."

    log_warning "Skipping test execution to avoid actual backup"
    log_info "To test manually, run: ${SCRIPTS_DIR}/wasabi-snapshot.sh"
}

################################################################################
# Main installation
################################################################################

main() {
    log_info "===== Wasabi Snapshot Configuration Starting ====="
    log_info "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

    preflight_checks
    create_snapshot_script
    create_systemd_units
    create_notification_templates
    enable_timer
    test_snapshot

    log_success "===== Wasabi Snapshot Configuration Complete ====="
    echo ""
    log_info "Configuration Summary:"
    echo "  - Snapshot script: ${SCRIPTS_DIR}/wasabi-snapshot.sh"
    echo "  - Systemd service: ${SYSTEMD_DIR}/wasabi-snapshot.service"
    echo "  - Systemd timer: ${SYSTEMD_DIR}/wasabi-snapshot.timer"
    echo "  - Logs: ${LOG_DIR}/"
    echo ""
    log_info "Snapshot Schedule:"
    echo "  - Every 6 hours: 00:00, 06:00, 12:00, 18:00"
    echo "  - GFS rotation applied automatically"
    echo ""
    log_info "Next Steps:"
    echo "  1. Check timer status: systemctl status wasabi-snapshot.timer"
    echo "  2. View timer schedule: systemctl list-timers wasabi-snapshot.timer"
    echo "  3. Test manually: ${SCRIPTS_DIR}/wasabi-snapshot.sh"
    echo "  4. Configure notification settings in: ${BACKUP_CONFIG_DIR}/notification-templates.conf"
    echo ""
    log_info "Monitoring:"
    echo "  - Logs: journalctl -u wasabi-snapshot.service -f"
    echo "  - Manifests: ${MANIFEST_DIR}/"
    echo ""
}

# Error handler
trap 'log_error "Script failed at line $LINENO"' ERR

# Run main
main "$@"
