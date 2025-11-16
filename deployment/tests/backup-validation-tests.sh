#!/bin/bash
set -euo pipefail

# =============================================================================
# MCP Bundle Backup Validation Suite
# =============================================================================
# Comprehensive backup validation and restore testing
#
# Features:
# - Automated restore testing to temporary location
# - File integrity verification (checksums)
# - Encryption verification
# - GFS rotation compliance checking
# - Performance metrics collection
# - Detailed test reports
#
# Usage: ./backup-validation-tests.sh [options]
# Options:
#   --full          Validate all backups in rotation
#   --latest        Validate only the latest backup (default)
#   --restore-test  Perform full restore test
#   --type <type>   Test specific backup type (daily, weekly, monthly, database)
#   --report <path> Custom report output path
# =============================================================================

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color
readonly BOLD='\033[1m'

# VM Configuration
readonly PRIMARY_VM="46.250.243.123"
readonly BACKUP_VM="46.250.241.70"
readonly BACKUP_DIR="/mnt/storage/backups"
readonly TEMP_RESTORE_DIR="/tmp/backup_restore_test_$$"

# GFS Rotation Configuration
readonly DAILY_RETENTION=7
readonly WEEKLY_RETENTION=4
readonly MONTHLY_RETENTION=12

# Configuration
VALIDATE_ALL=false
VALIDATE_LATEST=true
PERFORM_RESTORE=false
BACKUP_TYPE=""
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_DIR="/tmp/mcp_backup_validation_${TIMESTAMP}"
REPORT_FILE="${REPORT_DIR}/backup_validation_report.txt"
JSON_REPORT="${REPORT_DIR}/backup_validation_report.json"

# Test results tracking
declare -A TEST_RESULTS
declare -A PERFORMANCE_METRICS
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
WARNING_TESTS=0

# =============================================================================
# Utility Functions
# =============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$REPORT_FILE"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*" | tee -a "$REPORT_FILE"
    ((PASSED_TESTS++)) || true
}

log_error() {
    echo -e "${RED}[✗]${NC} $*" | tee -a "$REPORT_FILE"
    ((FAILED_TESTS++)) || true
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $*" | tee -a "$REPORT_FILE"
    ((WARNING_TESTS++)) || true
}

log_header() {
    echo -e "\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}" | tee -a "$REPORT_FILE"
    echo -e "${BOLD}${CYAN}$*${NC}" | tee -a "$REPORT_FILE"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}\n" | tee -a "$REPORT_FILE"
}

increment_test() {
    ((TOTAL_TESTS++)) || true
}

format_bytes() {
    local bytes=$1
    if [ "$bytes" -ge 1073741824 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $bytes/1073741824}")GB"
    elif [ "$bytes" -ge 1048576 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $bytes/1048576}")MB"
    elif [ "$bytes" -ge 1024 ]; then
        echo "$(awk "BEGIN {printf \"%.2f\", $bytes/1024}")KB"
    else
        echo "${bytes}B"
    fi
}

format_duration() {
    local seconds=$1
    local hours=$((seconds / 3600))
    local minutes=$(( (seconds % 3600) / 60 ))
    local secs=$((seconds % 60))

    if [ $hours -gt 0 ]; then
        printf "%dh %dm %ds" $hours $minutes $secs
    elif [ $minutes -gt 0 ]; then
        printf "%dm %ds" $minutes $secs
    else
        printf "%ds" $secs
    fi
}

# =============================================================================
# Backup Discovery
# =============================================================================

discover_backups() {
    log_header "Discovering Backups"

    increment_test

    log "Scanning backup directory on ${BACKUP_VM}:${BACKUP_DIR}..."

    # Get directory structure
    local backup_list=$(ssh "root@${BACKUP_VM}" "find ${BACKUP_DIR} -type f -name '*.tar.gz' -o -name '*.sql.gz' -o -name '*.enc' 2>/dev/null | sort -r" || echo "")

    if [ -z "$backup_list" ]; then
        log_error "No backups found in ${BACKUP_DIR}"
        return 1
    fi

    local backup_count=$(echo "$backup_list" | wc -l)
    log_success "Found $backup_count backup files"

    # Categorize backups
    local daily_backups=$(echo "$backup_list" | grep -c "/daily/" || true)
    local weekly_backups=$(echo "$backup_list" | grep -c "/weekly/" || true)
    local monthly_backups=$(echo "$backup_list" | grep -c "/monthly/" || true)
    local db_backups=$(echo "$backup_list" | grep -c ".sql.gz" || true)

    log "Backup breakdown:"
    log "  Daily backups: $daily_backups"
    log "  Weekly backups: $weekly_backups"
    log "  Monthly backups: $monthly_backups"
    log "  Database backups: $db_backups"

    # Store for later use
    echo "$backup_list" > "${REPORT_DIR}/backup_list.txt"

    TEST_RESULTS["total_backups"]=$backup_count
    TEST_RESULTS["daily_backups"]=$daily_backups
    TEST_RESULTS["weekly_backups"]=$weekly_backups
    TEST_RESULTS["monthly_backups"]=$monthly_backups
    TEST_RESULTS["db_backups"]=$db_backups

    return 0
}

# =============================================================================
# GFS Rotation Validation
# =============================================================================

validate_gfs_rotation() {
    log_header "Validating GFS Rotation Compliance"

    increment_test

    log "Checking Grandfather-Father-Son rotation policy..."

    # Check daily retention
    local daily_count=$(ssh "root@${BACKUP_VM}" "find ${BACKUP_DIR}/daily -type f -mtime -${DAILY_RETENTION} 2>/dev/null | wc -l" || echo 0)
    log "Daily backups within retention (${DAILY_RETENTION} days): $daily_count"

    if [ "$daily_count" -ge "$DAILY_RETENTION" ]; then
        log_success "Daily retention policy satisfied"
    else
        log_warning "Expected at least ${DAILY_RETENTION} daily backups, found ${daily_count}"
    fi

    # Check weekly retention
    local weekly_count=$(ssh "root@${BACKUP_VM}" "find ${BACKUP_DIR}/weekly -type f 2>/dev/null | wc -l" || echo 0)
    log "Weekly backups: $weekly_count"

    if [ "$weekly_count" -ge "$WEEKLY_RETENTION" ]; then
        log_success "Weekly retention policy satisfied"
    else
        log_warning "Expected at least ${WEEKLY_RETENTION} weekly backups, found ${weekly_count}"
    fi

    # Check monthly retention
    local monthly_count=$(ssh "root@${BACKUP_VM}" "find ${BACKUP_DIR}/monthly -type f 2>/dev/null | wc -l" || echo 0)
    log "Monthly backups: $monthly_count"

    if [ "$monthly_count" -ge 1 ]; then
        log_success "Monthly backups present"
    else
        log_warning "No monthly backups found"
    fi

    # Check for old backups that should have been pruned
    local old_daily=$(ssh "root@${BACKUP_VM}" "find ${BACKUP_DIR}/daily -type f -mtime +${DAILY_RETENTION} 2>/dev/null | wc -l" || echo 0)

    if [ "$old_daily" -gt 0 ]; then
        log_warning "$old_daily daily backup(s) older than retention period (should be pruned)"
    else
        log_success "No stale daily backups found"
    fi

    # Check backup age
    local latest_daily=$(ssh "root@${BACKUP_VM}" "find ${BACKUP_DIR}/daily -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 | cut -d' ' -f2" || echo "")

    if [ -n "$latest_daily" ]; then
        local age=$(ssh "root@${BACKUP_VM}" "echo \$(( \$(date +%s) - \$(stat -c %Y \"$latest_daily\") ))")
        local age_hours=$((age / 3600))

        log "Latest daily backup age: ${age_hours} hours"

        if [ "$age_hours" -gt 48 ]; then
            log_error "Latest backup is more than 48 hours old"
        elif [ "$age_hours" -gt 24 ]; then
            log_warning "Latest backup is more than 24 hours old"
        else
            log_success "Latest backup is fresh (< 24 hours)"
        fi
    fi
}

# =============================================================================
# Backup Integrity Verification
# =============================================================================

verify_backup_integrity() {
    local backup_file=$1
    local backup_type=$2

    log_header "Verifying Backup Integrity: $(basename "$backup_file")"

    increment_test

    # Get backup info
    local file_size=$(ssh "root@${BACKUP_VM}" "stat -c %s \"$backup_file\" 2>/dev/null || echo 0")
    local file_date=$(ssh "root@${BACKUP_VM}" "stat -c %y \"$backup_file\" 2>/dev/null | cut -d' ' -f1" || echo "unknown")

    log "Backup file: $(basename "$backup_file")"
    log "Size: $(format_bytes "$file_size")"
    log "Date: $file_date"

    PERFORMANCE_METRICS["${backup_type}_size"]=$file_size

    # Check if file is not empty
    if [ "$file_size" -eq 0 ]; then
        log_error "Backup file is empty"
        return 1
    fi

    log_success "Backup file size is valid"

    # Check file integrity based on type
    if [[ "$backup_file" == *.tar.gz ]]; then
        log "Testing tar.gz archive integrity..."
        if ssh "root@${BACKUP_VM}" "tar -tzf \"$backup_file\" >/dev/null 2>&1"; then
            log_success "Archive integrity verified"

            # Count files in archive
            local file_count=$(ssh "root@${BACKUP_VM}" "tar -tzf \"$backup_file\" 2>/dev/null | wc -l")
            log "Archive contains $file_count files/directories"

            if [ "$file_count" -eq 0 ]; then
                log_error "Archive is empty"
                return 1
            fi
        else
            log_error "Archive is corrupted"
            return 1
        fi

    elif [[ "$backup_file" == *.sql.gz ]]; then
        log "Testing SQL dump integrity..."
        if ssh "root@${BACKUP_VM}" "gunzip -t \"$backup_file\" 2>&1"; then
            log_success "SQL dump compression verified"

            # Check if SQL is valid
            local sql_size=$(ssh "root@${BACKUP_VM}" "gunzip -c \"$backup_file\" 2>/dev/null | wc -c")
            log "Decompressed SQL size: $(format_bytes "$sql_size")"

            if [ "$sql_size" -eq 0 ]; then
                log_error "SQL dump is empty after decompression"
                return 1
            fi

            # Check for SQL keywords (basic validation)
            if ssh "root@${BACKUP_VM}" "gunzip -c \"$backup_file\" 2>/dev/null | head -100 | grep -q 'PostgreSQL\\|CREATE\\|INSERT'"; then
                log_success "SQL dump contains valid PostgreSQL statements"
            else
                log_warning "SQL dump doesn't contain expected PostgreSQL statements"
            fi
        else
            log_error "SQL dump is corrupted"
            return 1
        fi

    elif [[ "$backup_file" == *.enc ]]; then
        log "Encrypted backup detected"
        log_warning "Encryption verification requires decryption key (skipping content validation)"
        log_success "Encrypted file exists and is non-empty"
    fi

    # Check for corresponding checksum file
    local checksum_file="${backup_file}.sha256"
    if ssh "root@${BACKUP_VM}" "[ -f \"$checksum_file\" ]"; then
        log "Verifying SHA256 checksum..."

        local stored_sum=$(ssh "root@${BACKUP_VM}" "cat \"$checksum_file\" 2>/dev/null | awk '{print \$1}'")
        local computed_sum=$(ssh "root@${BACKUP_VM}" "sha256sum \"$backup_file\" 2>/dev/null | awk '{print \$1}'")

        if [ "$stored_sum" = "$computed_sum" ]; then
            log_success "Checksum verification passed"
        else
            log_error "Checksum mismatch! Backup may be corrupted"
            log "  Stored:   $stored_sum"
            log "  Computed: $computed_sum"
            return 1
        fi
    else
        log_warning "No checksum file found for verification"
    fi

    return 0
}

# =============================================================================
# Restore Testing
# =============================================================================

perform_restore_test() {
    local backup_file=$1
    local backup_type=$2

    log_header "Restore Test: $(basename "$backup_file")"

    increment_test

    log "Creating temporary restore location: $TEMP_RESTORE_DIR"
    mkdir -p "$TEMP_RESTORE_DIR"

    # Start timing
    local start_time=$(date +%s)

    # Copy backup to local temp for testing
    log "Downloading backup for restore test..."
    local local_backup="${TEMP_RESTORE_DIR}/$(basename "$backup_file")"

    if scp -q "root@${BACKUP_VM}:${backup_file}" "$local_backup"; then
        log_success "Backup downloaded successfully"
    else
        log_error "Failed to download backup"
        return 1
    fi

    # Restore based on type
    if [[ "$backup_file" == *.tar.gz ]]; then
        log "Extracting archive to temporary location..."

        if tar -xzf "$local_backup" -C "$TEMP_RESTORE_DIR" 2>/dev/null; then
            local restored_files=$(find "$TEMP_RESTORE_DIR" -type f | wc -l)
            log_success "Successfully restored $restored_files files"

            # Sample file verification
            log "Performing spot-check on restored files..."
            local sample_count=10
            local verified=0

            for file in $(find "$TEMP_RESTORE_DIR" -type f | shuf | head -n $sample_count); do
                if [ -r "$file" ] && [ -s "$file" ]; then
                    ((verified++)) || true
                fi
            done

            log "Verified $verified/$sample_count sampled files"

            if [ "$verified" -eq "$sample_count" ]; then
                log_success "All sampled files are readable and non-empty"
            else
                log_warning "$((sample_count - verified)) sampled files failed verification"
            fi

        else
            log_error "Failed to extract archive"
            return 1
        fi

    elif [[ "$backup_file" == *.sql.gz ]]; then
        log "Testing SQL restore (dry-run)..."

        # Decompress and validate SQL
        if gunzip -c "$local_backup" > "${TEMP_RESTORE_DIR}/restore.sql" 2>/dev/null; then
            local sql_lines=$(wc -l < "${TEMP_RESTORE_DIR}/restore.sql")
            local sql_size=$(stat -f %z "${TEMP_RESTORE_DIR}/restore.sql" 2>/dev/null || stat -c %s "${TEMP_RESTORE_DIR}/restore.sql")

            log_success "SQL decompressed successfully"
            log "SQL dump: $sql_lines lines, $(format_bytes "$sql_size")"

            # Count critical SQL statements
            local create_count=$(grep -c "^CREATE" "${TEMP_RESTORE_DIR}/restore.sql" || true)
            local insert_count=$(grep -c "^INSERT" "${TEMP_RESTORE_DIR}/restore.sql" || true)
            local copy_count=$(grep -c "^COPY" "${TEMP_RESTORE_DIR}/restore.sql" || true)

            log "SQL statements: CREATE=$create_count, INSERT=$insert_count, COPY=$copy_count"

            if [ "$create_count" -gt 0 ]; then
                log_success "SQL dump contains schema definitions"
            else
                log_warning "No CREATE statements found in SQL dump"
            fi

            if [ "$insert_count" -gt 0 ] || [ "$copy_count" -gt 0 ]; then
                log_success "SQL dump contains data"
            else
                log_warning "No data statements found in SQL dump"
            fi

        else
            log_error "Failed to decompress SQL dump"
            return 1
        fi
    fi

    # Calculate performance metrics
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    local file_size=$(stat -f %z "$local_backup" 2>/dev/null || stat -c %s "$local_backup")
    local throughput=$((file_size / duration))

    log "Restore performance:"
    log "  Duration: $(format_duration $duration)"
    log "  Throughput: $(format_bytes $throughput)/s"

    PERFORMANCE_METRICS["${backup_type}_restore_time"]=$duration
    PERFORMANCE_METRICS["${backup_type}_throughput"]=$throughput

    # Cleanup
    log "Cleaning up temporary restore location..."
    rm -rf "$TEMP_RESTORE_DIR"

    log_success "Restore test completed successfully"

    return 0
}

# =============================================================================
# Encryption Verification
# =============================================================================

verify_encryption() {
    log_header "Verifying Backup Encryption"

    increment_test

    log "Searching for encrypted backups..."

    local encrypted_backups=$(ssh "root@${BACKUP_VM}" "find ${BACKUP_DIR} -type f -name '*.enc' 2>/dev/null" || echo "")

    if [ -z "$encrypted_backups" ]; then
        log_warning "No encrypted backups found"
        return 0
    fi

    local enc_count=$(echo "$encrypted_backups" | wc -l)
    log_success "Found $enc_count encrypted backup(s)"

    # Verify encryption on sample
    local sample=$(echo "$encrypted_backups" | head -1)
    log "Verifying encryption on: $(basename "$sample")"

    # Check if file is actually encrypted (not plaintext)
    local file_type=$(ssh "root@${BACKUP_VM}" "file \"$sample\"" || echo "")

    if echo "$file_type" | grep -qi "encrypted\|openssl\|data"; then
        log_success "File appears to be encrypted"
    else
        log_error "File may not be properly encrypted: $file_type"
        return 1
    fi

    # Check for plaintext signatures (should not be present)
    if ssh "root@${BACKUP_VM}" "strings \"$sample\" 2>/dev/null | grep -qi 'postgresql\|database\|password'"; then
        log_error "Encrypted file contains plaintext sensitive data!"
        return 1
    else
        log_success "No plaintext sensitive data detected in encrypted file"
    fi

    TEST_RESULTS["encrypted_backups"]=$enc_count

    return 0
}

# =============================================================================
# Performance Analysis
# =============================================================================

analyze_performance() {
    log_header "Backup Performance Analysis"

    increment_test

    log "Analyzing backup metrics..."

    # Get backup sizes over time
    local daily_sizes=$(ssh "root@${BACKUP_VM}" "find ${BACKUP_DIR}/daily -type f -printf '%s\n' 2>/dev/null | sort -rn | head -7" || echo "")

    if [ -n "$daily_sizes" ]; then
        local total_size=0
        local count=0

        while IFS= read -r size; do
            total_size=$((total_size + size))
            ((count++)) || true
        done <<< "$daily_sizes"

        local avg_size=$((total_size / count))

        log "Daily backup statistics (last 7 days):"
        log "  Average size: $(format_bytes $avg_size)"
        log "  Total size: $(format_bytes $total_size)"

        PERFORMANCE_METRICS["avg_daily_backup_size"]=$avg_size
        PERFORMANCE_METRICS["total_daily_backup_size"]=$total_size

        log_success "Performance metrics collected"
    else
        log_warning "Insufficient data for performance analysis"
    fi

    # Check disk usage on backup VM
    log "Checking backup storage utilization..."

    local disk_usage=$(ssh "root@${BACKUP_VM}" "df -h ${BACKUP_DIR} | tail -1" || echo "")

    if [ -n "$disk_usage" ]; then
        local usage_pct=$(echo "$disk_usage" | awk '{print $5}' | sed 's/%//')
        local available=$(echo "$disk_usage" | awk '{print $4}')

        log "Backup storage: ${usage_pct}% used, ${available} available"

        if [ "$usage_pct" -gt 90 ]; then
            log_error "Backup storage critically low (<10% free)"
        elif [ "$usage_pct" -gt 80 ]; then
            log_warning "Backup storage running low (<20% free)"
        else
            log_success "Backup storage has adequate space"
        fi

        PERFORMANCE_METRICS["storage_usage_pct"]=$usage_pct
    fi
}

# =============================================================================
# Report Generation
# =============================================================================

generate_reports() {
    log_header "Generating Validation Reports"

    # Create markdown summary
    cat > "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md" << EOF
# MCP Bundle Backup Validation Report
**Generated:** $(date)
**Test Run ID:** $TIMESTAMP

## Executive Summary

- **Total Tests:** $TOTAL_TESTS
- **Passed:** $PASSED_TESTS ($(( PASSED_TESTS * 100 / TOTAL_TESTS ))%)
- **Failed:** $FAILED_TESTS
- **Warnings:** $WARNING_TESTS

## Backup Inventory

EOF

    if [ -n "${TEST_RESULTS[total_backups]:-}" ]; then
        cat >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md" << EOF
- **Total Backups:** ${TEST_RESULTS[total_backups]}
- **Daily Backups:** ${TEST_RESULTS[daily_backups]}
- **Weekly Backups:** ${TEST_RESULTS[weekly_backups]}
- **Monthly Backups:** ${TEST_RESULTS[monthly_backups]}
- **Database Backups:** ${TEST_RESULTS[db_backups]}
- **Encrypted Backups:** ${TEST_RESULTS[encrypted_backups]:-0}

EOF
    fi

    cat >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md" << EOF
## GFS Rotation Compliance

- **Daily Retention:** $DAILY_RETENTION days
- **Weekly Retention:** $WEEKLY_RETENTION weeks
- **Monthly Retention:** $MONTHLY_RETENTION months

See detailed rotation analysis in the full report.

## Performance Metrics

EOF

    if [ ${#PERFORMANCE_METRICS[@]} -gt 0 ]; then
        for metric in "${!PERFORMANCE_METRICS[@]}"; do
            local value="${PERFORMANCE_METRICS[$metric]}"
            if [[ "$metric" == *"size"* ]]; then
                value=$(format_bytes "$value")
            elif [[ "$metric" == *"time"* ]]; then
                value=$(format_duration "$value")
            elif [[ "$metric" == *"throughput"* ]]; then
                value="$(format_bytes "$value")/s"
            fi
            echo "- **$metric:** $value" >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md"
        done
    else
        echo "No performance metrics collected." >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md"
    fi

    cat >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md" << EOF

## Test Results

See detailed test logs in: \`backup_validation_report.txt\`

## Recommendations

EOF

    if [ $FAILED_TESTS -gt 0 ]; then
        cat >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md" << EOF
**CRITICAL:** $FAILED_TESTS validation tests failed. Immediate investigation required.

EOF
    fi

    if [ $WARNING_TESTS -gt 0 ]; then
        cat >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md" << EOF
**WARNING:** $WARNING_TESTS tests produced warnings. Review and address as needed.

EOF
    fi

    if [ $FAILED_TESTS -eq 0 ] && [ $WARNING_TESTS -eq 0 ]; then
        cat >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md" << EOF
All backups passed validation. Backup system is healthy.

EOF
    fi

    cat >> "${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md" << EOF
## Next Steps

1. Review any failed tests and investigate root causes
2. Address warnings to improve backup reliability
3. Schedule regular backup validation (recommended: weekly)
4. Monitor backup storage capacity and plan for expansion if needed
5. Test restore procedures periodically in production-like environment

EOF

    # Generate JSON report
    local metrics_json="{"
    local first=true
    for metric in "${!PERFORMANCE_METRICS[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            metrics_json+=","
        fi
        metrics_json+="\"$metric\":${PERFORMANCE_METRICS[$metric]}"
    done
    metrics_json+="}"

    local results_json="{"
    first=true
    for result in "${!TEST_RESULTS[@]}"; do
        if [ "$first" = true ]; then
            first=false
        else
            results_json+=","
        fi
        results_json+="\"$result\":\"${TEST_RESULTS[$result]}\""
    done
    results_json+="}"

    cat > "$JSON_REPORT" << EOF
{
  "timestamp": "$TIMESTAMP",
  "summary": {
    "total_tests": $TOTAL_TESTS,
    "passed": $PASSED_TESTS,
    "failed": $FAILED_TESTS,
    "warnings": $WARNING_TESTS,
    "success_rate": $(( PASSED_TESTS * 100 / TOTAL_TESTS ))
  },
  "test_results": $results_json,
  "performance_metrics": $metrics_json,
  "report_directory": "$REPORT_DIR"
}
EOF

    log_success "Reports generated in: $REPORT_DIR"
    log_success "Summary: ${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md"
    log_success "JSON: $JSON_REPORT"
}

# =============================================================================
# Main Execution
# =============================================================================

print_usage() {
    cat << EOF
Usage: $0 [options]

Options:
  --full          Validate all backups in rotation (default: latest only)
  --latest        Validate only the latest backup
  --restore-test  Perform actual restore test (WARNING: resource intensive)
  --type <type>   Test specific backup type (daily, weekly, monthly, database)
  --report <path> Custom report output directory
  -h, --help      Show this help message

Examples:
  $0                     # Validate latest backups
  $0 --full              # Validate all backups
  $0 --restore-test      # Include restore testing
  $0 --type daily        # Test only daily backups
  $0 --full --restore-test  # Full validation with restore tests

EOF
}

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --full)
                VALIDATE_ALL=true
                VALIDATE_LATEST=false
                shift
                ;;
            --latest)
                VALIDATE_LATEST=true
                VALIDATE_ALL=false
                shift
                ;;
            --restore-test)
                PERFORM_RESTORE=true
                shift
                ;;
            --type)
                BACKUP_TYPE="$2"
                shift 2
                ;;
            --report)
                REPORT_DIR="$2"
                REPORT_FILE="${REPORT_DIR}/backup_validation_report.txt"
                JSON_REPORT="${REPORT_DIR}/backup_validation_report.json"
                shift 2
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done

    # Create report directory
    mkdir -p "$REPORT_DIR"

    # Print banner
    log_header "MCP Bundle Backup Validation Suite"
    log "Timestamp: $(date)"
    log "Validate All: $VALIDATE_ALL"
    log "Restore Testing: $PERFORM_RESTORE"
    log "Backup Type Filter: ${BACKUP_TYPE:-All}"
    log "Report Directory: $REPORT_DIR"

    # Run validation tests
    discover_backups
    validate_gfs_rotation
    verify_encryption
    analyze_performance

    # Get backups to test
    if [ -f "${REPORT_DIR}/backup_list.txt" ]; then
        local backup_list=$(cat "${REPORT_DIR}/backup_list.txt")

        # Filter by type if specified
        if [ -n "$BACKUP_TYPE" ]; then
            backup_list=$(echo "$backup_list" | grep "/$BACKUP_TYPE/" || echo "")
        fi

        # Select backups to validate
        local backups_to_test=""
        if [ "$VALIDATE_LATEST" = true ]; then
            backups_to_test=$(echo "$backup_list" | head -3)
            log "Testing latest 3 backups..."
        else
            backups_to_test="$backup_list"
            log "Testing all $(echo "$backup_list" | wc -l) backups..."
        fi

        # Test each backup
        while IFS= read -r backup_file; do
            [ -z "$backup_file" ] && continue

            local type="unknown"
            if echo "$backup_file" | grep -q "/daily/"; then
                type="daily"
            elif echo "$backup_file" | grep -q "/weekly/"; then
                type="weekly"
            elif echo "$backup_file" | grep -q "/monthly/"; then
                type="monthly"
            fi

            verify_backup_integrity "$backup_file" "$type"

            if [ "$PERFORM_RESTORE" = true ]; then
                perform_restore_test "$backup_file" "$type"
            fi

        done <<< "$backups_to_test"
    fi

    # Generate reports
    generate_reports

    # Print final summary
    log_header "Backup Validation Complete"
    log "Total Tests: $TOTAL_TESTS"
    log_success "Passed: $PASSED_TESTS ($(( PASSED_TESTS * 100 / TOTAL_TESTS ))%)"

    if [ $FAILED_TESTS -gt 0 ]; then
        log_error "Failed: $FAILED_TESTS"
    fi

    if [ $WARNING_TESTS -gt 0 ]; then
        log_warning "Warnings: $WARNING_TESTS"
    fi

    log ""
    log "Full report available at: ${REPORT_DIR}/BACKUP_VALIDATION_SUMMARY.md"

    # Exit with appropriate code
    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    fi

    exit 0
}

# Trap cleanup
trap 'rm -rf "$TEMP_RESTORE_DIR" 2>/dev/null' EXIT

# Run main function
main "$@"
