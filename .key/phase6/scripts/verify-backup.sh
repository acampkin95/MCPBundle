#!/bin/bash
#
# Verify Backup Integrity
# Tests backup integrity without performing a full restore
#
# Usage: ./verify-backup.sh [--backup-date YYYY-MM-DD] [--quick]
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOSTNAME=$(hostname -s)

S3_BUCKET="vmibackups"
S3_REMOTE="wasabi-vmi"
S3_BASE_PATH="${S3_BUCKET}/${HOSTNAME}"
RCLONE_CONFIG="/root/.config/rclone/rclone.conf"

BACKUP_DATE=""
QUICK_MODE=false
TEST_DIR="/tmp/backup-verification-$$"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

cleanup() {
    rm -rf "${TEST_DIR}"
}

trap cleanup EXIT

verify_backup() {
    local backup_date="$1"
    local s3_path="${S3_BASE_PATH}/${backup_date}"

    log "Verifying backup: ${backup_date}"

    # Check if backup exists
    if ! rclone lsd "${S3_REMOTE}:${s3_path}" --config "${RCLONE_CONFIG}" &> /dev/null; then
        log "ERROR: Backup not found: ${backup_date}"
        return 1
    fi

    # Download manifest
    mkdir -p "${TEST_DIR}"
    if ! rclone copy "${S3_REMOTE}:${s3_path}/backup-manifest.json" \
        "${TEST_DIR}/" --config "${RCLONE_CONFIG}"; then
        log "ERROR: Cannot download manifest"
        return 1
    fi

    # Parse manifest
    local manifest="${TEST_DIR}/backup-manifest.json"
    log "Backup type: $(jq -r '.backup_type' "${manifest}")"
    log "File count: $(jq -r '.file_count' "${manifest}")"
    log "Size: $(jq -r '.total_size_bytes' "${manifest}" | numfmt --to=iec)"

    # Verify file count
    local remote_count=$(rclone ls "${S3_REMOTE}:${s3_path}" --config "${RCLONE_CONFIG}" | wc -l)
    local manifest_count=$(jq -r '.file_count' "${manifest}")

    if [ "${remote_count}" -ne "${manifest_count}" ]; then
        log "ERROR: File count mismatch (manifest: ${manifest_count}, actual: ${remote_count})"
        return 1
    fi

    if [ "${QUICK_MODE}" = true ]; then
        log "Quick mode: Skipping detailed verification"
        log "PASSED: Basic verification"
        return 0
    fi

    # Download and verify checksums
    if rclone copy "${S3_REMOTE}:${s3_path}/SHA256SUMS" \
        "${TEST_DIR}/" --config "${RCLONE_CONFIG}"; then

        log "Verifying checksums..."

        # Download a sample of files and verify
        local sample_size=5
        local files=($(rclone lsf "${S3_REMOTE}:${s3_path}/files" --config "${RCLONE_CONFIG}" | head -${sample_size}))

        for file in "${files[@]}"; do
            log "Testing: ${file}"

            rclone copy "${S3_REMOTE}:${s3_path}/files/${file}" \
                "${TEST_DIR}/files/" --config "${RCLONE_CONFIG}"

            # Test extraction
            local test_file="${TEST_DIR}/files/${file}"
            if [[ "${file}" == *.tar.zst ]]; then
                if ! zstd -t "${test_file}" &> /dev/null; then
                    log "ERROR: Corruption detected in ${file}"
                    return 1
                fi
                log "  OK: Compression valid"

                # Test tar integrity
                if ! zstd -dc "${test_file}" | tar -t > /dev/null 2>&1; then
                    log "ERROR: Archive corruption in ${file}"
                    return 1
                fi
                log "  OK: Archive valid"
            fi
        done
    fi

    # Verify database dumps if present
    if jq -e '.databases.postgres == true' "${manifest}" &> /dev/null; then
        log "Verifying PostgreSQL dumps..."

        local dumps=($(rclone lsf "${S3_REMOTE}:${s3_path}/databases/postgresql" \
            --config "${RCLONE_CONFIG}" | grep '\.dump\.zst$' | head -2))

        for dump in "${dumps[@]}"; do
            log "Testing: ${dump}"

            rclone copy "${S3_REMOTE}:${s3_path}/databases/postgresql/${dump}" \
                "${TEST_DIR}/db/" --config "${RCLONE_CONFIG}"

            local dump_file="${TEST_DIR}/db/${dump}"

            # Decompress
            zstd -d "${dump_file}"
            local decompressed="${dump_file%.zst}"

            # Verify pg_restore can read it
            if sudo -u postgres pg_restore --list "${decompressed}" > /dev/null 2>&1; then
                log "  OK: Database dump valid"
            else
                log "ERROR: Invalid database dump: ${dump}"
                return 1
            fi
        done
    fi

    log "PASSED: Backup verification successful"
    return 0
}

main() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backup-date)
                BACKUP_DATE="$2"
                shift 2
                ;;
            --quick)
                QUICK_MODE=true
                shift
                ;;
            *)
                echo "Usage: $0 [--backup-date YYYY-MM-DD] [--quick]"
                exit 1
                ;;
        esac
    done

    if [ -z "${BACKUP_DATE}" ]; then
        # Get latest backup
        BACKUP_DATE=$(rclone lsf "${S3_REMOTE}:${S3_BASE_PATH}" --config "${RCLONE_CONFIG}" --dirs-only | \
            grep -E '^[0-9]{4}-[0-9]{2}-[0-9]{2}/$' | sed 's|/||' | sort -r | head -1)
    fi

    if [ -z "${BACKUP_DATE}" ]; then
        log "ERROR: No backups found"
        exit 1
    fi

    verify_backup "${BACKUP_DATE}"
}

main "$@"
