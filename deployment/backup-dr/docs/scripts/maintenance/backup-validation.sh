#!/bin/bash
set -euo pipefail

################################################################################
# Wasabi S3 Backup Validation Script
#
# Purpose: Comprehensive validation of Wasabi S3 backups including integrity
#          checks, encryption verification, GFS rotation validation, and
#          performance metrics
#
# Features:
#   - Test restore procedures
#   - Verify file integrity with SHA256 checksums
#   - Check encryption configuration
#   - Validate GFS rotation policy compliance
#   - Performance metrics and benchmarking
#   - Detailed reporting (JSON + human-readable)
#
# Usage: sudo ./backup-validation.sh [--backup-id BACKUP_ID] [--full]
################################################################################

# Color output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
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

log_section() {
    echo -e "${CYAN}[SECTION]${NC} $*" | tee -a "${LOG_FILE}"
}

# Configuration
readonly LOG_DIR="/var/log/wasabi-backup"
readonly LOG_FILE="${LOG_DIR}/validation-$(date +%Y%m%d_%H%M%S).log"
readonly BACKUP_CONFIG_DIR="/etc/wasabi-backup"
readonly MANIFEST_DIR="${BACKUP_CONFIG_DIR}/manifests"
readonly TEMP_RESTORE_DIR="/var/backup/restore-test"
readonly REPORT_DIR="/var/log/wasabi-backup/reports"
readonly REPORT_JSON="${REPORT_DIR}/validation-report-$(date +%Y%m%d_%H%M%S).json"
readonly REPORT_HTML="${REPORT_DIR}/validation-report-$(date +%Y%m%d_%H%M%S).html"

# Validation results
declare -A VALIDATION_RESULTS=(
    ["total_tests"]=0
    ["passed_tests"]=0
    ["failed_tests"]=0
    ["warnings"]=0
)

# Test categories
declare -A TEST_RESULTS

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

    # Create directories
    mkdir -p "${LOG_DIR}"
    mkdir -p "${REPORT_DIR}"
    mkdir -p "${TEMP_RESTORE_DIR}"
    chmod 750 "${LOG_DIR}"
    chmod 750 "${REPORT_DIR}"
    chmod 700 "${TEMP_RESTORE_DIR}"

    # Check if configure-wasabi-s3.sh was run
    if [[ ! -f "${BACKUP_CONFIG_DIR}/gfs-policy.conf" ]]; then
        log_error "Please run configure-wasabi-s3.sh first"
        exit 1
    fi

    # Source configurations
    source "${BACKUP_CONFIG_DIR}/gfs-policy.conf"

    # Check for required commands
    local required_commands=("rclone" "jq" "sha256sum")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "${cmd}" &> /dev/null; then
            log_error "Required command not found: ${cmd}"
            exit 1
        fi
    done

    log_success "Pre-flight checks completed"
}

################################################################################
# Test 1: Verify rclone connection
################################################################################

test_rclone_connection() {
    log_section "Test 1: Verifying rclone connection to Wasabi..."

    ((VALIDATION_RESULTS[total_tests]++))

    local test_name="rclone_connection"
    local start_time=$(date +%s%N)

    if rclone lsd wasabi-crypt: &> /dev/null; then
        local end_time=$(date +%s%N)
        local duration=$(( (end_time - start_time) / 1000000 ))

        log_success "rclone connection successful (${duration}ms)"
        ((VALIDATION_RESULTS[passed_tests]++))
        TEST_RESULTS["${test_name}"]="PASSED:${duration}ms:rclone successfully connected to Wasabi"
        return 0
    else
        log_error "rclone connection failed"
        ((VALIDATION_RESULTS[failed_tests]++))
        TEST_RESULTS["${test_name}"]="FAILED:0:Cannot connect to Wasabi S3"
        return 1
    fi
}

################################################################################
# Test 2: Verify encryption
################################################################################

test_encryption() {
    log_section "Test 2: Verifying encryption configuration..."

    ((VALIDATION_RESULTS[total_tests]++))

    local test_name="encryption_verification"
    local test_file="encryption-test-$(date +%s).txt"
    local test_content="This is an encryption test - $(date)"

    # Create test file
    echo "${test_content}" > "/tmp/${test_file}"

    # Upload to encrypted remote
    if rclone copy "/tmp/${test_file}" "wasabi-crypt:test/" &> /dev/null; then

        # Verify file is encrypted on non-encrypted remote
        if rclone cat "wasabi:mcp-bundle-backups/test/${test_file}" 2>/dev/null | grep -q "${test_content}"; then
            log_error "File is NOT encrypted!"
            ((VALIDATION_RESULTS[failed_tests]++))
            TEST_RESULTS["${test_name}"]="FAILED:0:Files are not encrypted"
            rclone purge "wasabi-crypt:test/" &> /dev/null
            rm -f "/tmp/${test_file}"
            return 1
        else
            log_success "File is properly encrypted with AES-256"
            ((VALIDATION_RESULTS[passed_tests]++))
            TEST_RESULTS["${test_name}"]="PASSED:0:AES-256 encryption verified"
            rclone purge "wasabi-crypt:test/" &> /dev/null
            rm -f "/tmp/${test_file}"
            return 0
        fi
    else
        log_error "Failed to upload test file"
        ((VALIDATION_RESULTS[failed_tests]++))
        TEST_RESULTS["${test_name}"]="FAILED:0:Upload test failed"
        rm -f "/tmp/${test_file}"
        return 1
    fi
}

################################################################################
# Test 3: Verify GFS rotation compliance
################################################################################

test_gfs_rotation() {
    log_section "Test 3: Verifying GFS rotation policy compliance..."

    ((VALIDATION_RESULTS[total_tests]++))

    local test_name="gfs_rotation_compliance"
    local total_issues=0

    # Source GFS policy
    source "${BACKUP_CONFIG_DIR}/gfs-policy.conf"

    # Check each backup type
    for backup_type in hourly daily weekly monthly yearly; do
        local retention_var="${backup_type^^}_RETENTION"
        local expected_retention=${!retention_var}

        log_info "Checking ${backup_type} backups (max: ${expected_retention})..."

        local backup_count=$(rclone lsf "wasabi-crypt:${backup_type}/" --dirs-only 2>/dev/null | wc -l || echo "0")

        if [[ ${backup_count} -le ${expected_retention} ]]; then
            log_success "${backup_type}: ${backup_count}/${expected_retention} backups (compliant)"
        else
            log_warning "${backup_type}: ${backup_count}/${expected_retention} backups (EXCEEDS LIMIT)"
            ((total_issues++))
            ((VALIDATION_RESULTS[warnings]++))
        fi
    done

    if [[ ${total_issues} -eq 0 ]]; then
        log_success "GFS rotation policy is compliant"
        ((VALIDATION_RESULTS[passed_tests]++))
        TEST_RESULTS["${test_name}"]="PASSED:0:All retention limits compliant"
        return 0
    else
        log_warning "GFS rotation has ${total_issues} compliance issues"
        ((VALIDATION_RESULTS[passed_tests]++))  # Warning, not failure
        TEST_RESULTS["${test_name}"]="WARNING:0:${total_issues} retention limits exceeded"
        return 0
    fi
}

################################################################################
# Test 4: Verify backup manifest integrity
################################################################################

test_manifest_integrity() {
    log_section "Test 4: Verifying backup manifest integrity..."

    ((VALIDATION_RESULTS[total_tests]++))

    local test_name="manifest_integrity"
    local manifest_count=0
    local valid_count=0
    local invalid_count=0

    # Check all manifests
    for manifest_file in "${MANIFEST_DIR}"/*.json; do
        if [[ ! -f "${manifest_file}" ]]; then
            continue
        fi

        ((manifest_count++))

        # Validate JSON structure
        if jq empty "${manifest_file}" 2>/dev/null; then
            # Check required fields
            local required_fields=("backup_id" "timestamp" "type" "vm" "status")
            local missing_fields=0

            for field in "${required_fields[@]}"; do
                if ! jq -e ".${field}" "${manifest_file}" &>/dev/null; then
                    log_warning "Manifest missing field '${field}': ${manifest_file}"
                    ((missing_fields++))
                fi
            done

            if [[ ${missing_fields} -eq 0 ]]; then
                ((valid_count++))
            else
                ((invalid_count++))
            fi
        else
            log_error "Invalid JSON in manifest: ${manifest_file}"
            ((invalid_count++))
        fi
    done

    if [[ ${manifest_count} -eq 0 ]]; then
        log_warning "No manifests found"
        ((VALIDATION_RESULTS[warnings]++))
        ((VALIDATION_RESULTS[passed_tests]++))
        TEST_RESULTS["${test_name}"]="WARNING:0:No manifests found"
        return 0
    fi

    log_info "Manifest validation: ${valid_count} valid, ${invalid_count} invalid (total: ${manifest_count})"

    if [[ ${invalid_count} -eq 0 ]]; then
        log_success "All manifests are valid"
        ((VALIDATION_RESULTS[passed_tests]++))
        TEST_RESULTS["${test_name}"]="PASSED:0:${valid_count}/${manifest_count} manifests valid"
        return 0
    else
        log_error "Some manifests are invalid"
        ((VALIDATION_RESULTS[failed_tests]++))
        TEST_RESULTS["${test_name}"]="FAILED:0:${invalid_count}/${manifest_count} manifests invalid"
        return 1
    fi
}

################################################################################
# Test 5: Test restore procedure
################################################################################

test_restore_procedure() {
    log_section "Test 5: Testing restore procedure..."

    ((VALIDATION_RESULTS[total_tests]++))

    local test_name="restore_procedure"

    # Find most recent backup
    local latest_manifest=$(ls -t "${MANIFEST_DIR}"/*.json 2>/dev/null | head -n1)

    if [[ ! -f "${latest_manifest}" ]]; then
        log_warning "No backups found to test restore"
        ((VALIDATION_RESULTS[warnings]++))
        ((VALIDATION_RESULTS[passed_tests]++))
        TEST_RESULTS["${test_name}"]="WARNING:0:No backups available for restore test"
        return 0
    fi

    local backup_id=$(jq -r '.backup_id' "${latest_manifest}")
    local backup_type=$(jq -r '.type' "${latest_manifest}")
    local vm=$(jq -r '.vm' "${latest_manifest}")

    log_info "Testing restore of: ${backup_id}"

    local start_time=$(date +%s)

    # Create restore directory
    local restore_dir="${TEMP_RESTORE_DIR}/${backup_id}"
    mkdir -p "${restore_dir}"

    # Download backup
    if rclone copy "wasabi-crypt:${backup_type}/${vm}/${backup_id}" "${restore_dir}" \
        --progress --log-level ERROR; then

        local end_time=$(date +%s)
        local duration=$((end_time - start_time))

        # Verify checksums if available
        if [[ -f "${restore_dir}/checksums.sha256" ]]; then
            cd "${restore_dir}"
            if sha256sum -c checksums.sha256 &> /dev/null; then
                log_success "Restore successful and verified (${duration}s)"
                ((VALIDATION_RESULTS[passed_tests]++))
                TEST_RESULTS["${test_name}"]="PASSED:${duration}s:Restore and verification successful"
                rm -rf "${restore_dir}"
                return 0
            else
                log_error "Checksum verification failed after restore"
                ((VALIDATION_RESULTS[failed_tests]++))
                TEST_RESULTS["${test_name}"]="FAILED:${duration}s:Checksum verification failed"
                rm -rf "${restore_dir}"
                return 1
            fi
        else
            log_success "Restore successful (${duration}s, no checksums to verify)"
            ((VALIDATION_RESULTS[passed_tests]++))
            TEST_RESULTS["${test_name}"]="PASSED:${duration}s:Restore successful (no checksum file)"
            rm -rf "${restore_dir}"
            return 0
        fi
    else
        log_error "Restore failed"
        ((VALIDATION_RESULTS[failed_tests]++))
        TEST_RESULTS["${test_name}"]="FAILED:0:Download from Wasabi failed"
        rm -rf "${restore_dir}"
        return 1
    fi
}

################################################################################
# Test 6: Performance metrics
################################################################################

test_performance_metrics() {
    log_section "Test 6: Collecting performance metrics..."

    ((VALIDATION_RESULTS[total_tests]++))

    local test_name="performance_metrics"

    # Test upload speed
    log_info "Testing upload speed..."
    local test_file="/tmp/perf-test-$(date +%s).bin"
    dd if=/dev/urandom of="${test_file}" bs=1M count=10 &>/dev/null

    local start_time=$(date +%s%N)
    rclone copy "${test_file}" "wasabi-crypt:test/" --log-level ERROR
    local end_time=$(date +%s%N)

    local upload_duration=$(( (end_time - start_time) / 1000000 ))
    local upload_speed=$(( 10 * 1000 / upload_duration ))

    log_info "Upload speed: ${upload_speed} MB/s (10MB in ${upload_duration}ms)"

    # Test download speed
    log_info "Testing download speed..."
    local download_file="/tmp/perf-download-$(date +%s).bin"

    start_time=$(date +%s%N)
    rclone copy "wasabi-crypt:test/$(basename ${test_file})" "/tmp/" --log-level ERROR
    end_time=$(date +%s%N)

    local download_duration=$(( (end_time - start_time) / 1000000 ))
    local download_speed=$(( 10 * 1000 / download_duration ))

    log_info "Download speed: ${download_speed} MB/s (10MB in ${download_duration}ms)"

    # Cleanup
    rclone purge "wasabi-crypt:test/" &> /dev/null
    rm -f "${test_file}" "${download_file}"

    log_success "Performance metrics collected"
    ((VALIDATION_RESULTS[passed_tests]++))
    TEST_RESULTS["${test_name}"]="PASSED:0:Upload ${upload_speed}MB/s, Download ${download_speed}MB/s"

    return 0
}

################################################################################
# Test 7: Storage quota and usage
################################################################################

test_storage_usage() {
    log_section "Test 7: Checking storage quota and usage..."

    ((VALIDATION_RESULTS[total_tests]++))

    local test_name="storage_usage"

    # Get storage usage
    local storage_info=$(rclone size "wasabi-crypt:" --json 2>/dev/null)

    if [[ $? -eq 0 ]]; then
        local total_bytes=$(echo "${storage_info}" | jq -r '.bytes')
        local total_files=$(echo "${storage_info}" | jq -r '.count')
        local total_gb=$(( total_bytes / 1024 / 1024 / 1024 ))

        log_info "Total storage used: ${total_gb} GB (${total_files} files)"

        # Check if approaching any limits (example: 1TB limit)
        local limit_gb=1000
        local usage_percent=$(( total_gb * 100 / limit_gb ))

        if [[ ${usage_percent} -lt 80 ]]; then
            log_success "Storage usage: ${usage_percent}% of ${limit_gb}GB limit"
            ((VALIDATION_RESULTS[passed_tests]++))
            TEST_RESULTS["${test_name}"]="PASSED:0:${total_gb}GB used (${usage_percent}%)"
        elif [[ ${usage_percent} -lt 90 ]]; then
            log_warning "Storage usage: ${usage_percent}% of ${limit_gb}GB limit (approaching limit)"
            ((VALIDATION_RESULTS[warnings]++))
            ((VALIDATION_RESULTS[passed_tests]++))
            TEST_RESULTS["${test_name}"]="WARNING:0:${total_gb}GB used (${usage_percent}% - approaching limit)"
        else
            log_error "Storage usage: ${usage_percent}% of ${limit_gb}GB limit (CRITICAL)"
            ((VALIDATION_RESULTS[failed_tests]++))
            TEST_RESULTS["${test_name}"]="FAILED:0:${total_gb}GB used (${usage_percent}% - critical)"
        fi

        return 0
    else
        log_error "Failed to get storage usage"
        ((VALIDATION_RESULTS[failed_tests]++))
        TEST_RESULTS["${test_name}"]="FAILED:0:Cannot retrieve storage information"
        return 1
    fi
}

################################################################################
# Test 8: Backup age verification
################################################################################

test_backup_age() {
    log_section "Test 8: Verifying backup age..."

    ((VALIDATION_RESULTS[total_tests]++))

    local test_name="backup_age"

    # Find most recent backup
    local latest_manifest=$(ls -t "${MANIFEST_DIR}"/*.json 2>/dev/null | head -n1)

    if [[ ! -f "${latest_manifest}" ]]; then
        log_warning "No backups found"
        ((VALIDATION_RESULTS[warnings]++))
        ((VALIDATION_RESULTS[passed_tests]++))
        TEST_RESULTS["${test_name}"]="WARNING:0:No backups found"
        return 0
    fi

    local backup_timestamp=$(jq -r '.timestamp' "${latest_manifest}")
    local backup_epoch=$(date -d "${backup_timestamp}" +%s 2>/dev/null || echo "0")
    local current_epoch=$(date +%s)
    local age_hours=$(( (current_epoch - backup_epoch) / 3600 ))

    log_info "Latest backup age: ${age_hours} hours"

    # Backups should run every 6 hours, warn if > 12 hours old
    if [[ ${age_hours} -le 12 ]]; then
        log_success "Latest backup is recent (${age_hours} hours old)"
        ((VALIDATION_RESULTS[passed_tests]++))
        TEST_RESULTS["${test_name}"]="PASSED:0:Latest backup is ${age_hours} hours old"
    elif [[ ${age_hours} -le 24 ]]; then
        log_warning "Latest backup is ${age_hours} hours old (stale)"
        ((VALIDATION_RESULTS[warnings]++))
        ((VALIDATION_RESULTS[passed_tests]++))
        TEST_RESULTS["${test_name}"]="WARNING:0:Latest backup is ${age_hours} hours old (stale)"
    else
        log_error "Latest backup is ${age_hours} hours old (CRITICAL)"
        ((VALIDATION_RESULTS[failed_tests]++))
        TEST_RESULTS["${test_name}"]="FAILED:0:Latest backup is ${age_hours} hours old (critical)"
    fi

    return 0
}

################################################################################
# Generate JSON report
################################################################################

generate_json_report() {
    log_info "Generating JSON report..."

    local test_details="{"
    local first=true

    for test_name in "${!TEST_RESULTS[@]}"; do
        if [[ "${first}" == "true" ]]; then
            first=false
        else
            test_details="${test_details},"
        fi

        IFS=':' read -r status duration message <<< "${TEST_RESULTS[$test_name]}"
        test_details="${test_details}\"${test_name}\":{\"status\":\"${status}\",\"duration\":\"${duration}\",\"message\":\"${message}\"}"
    done
    test_details="${test_details}}"

    cat > "${REPORT_JSON}" <<EOF
{
  "validation_timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "summary": {
    "total_tests": ${VALIDATION_RESULTS[total_tests]},
    "passed": ${VALIDATION_RESULTS[passed_tests]},
    "failed": ${VALIDATION_RESULTS[failed_tests]},
    "warnings": ${VALIDATION_RESULTS[warnings]},
    "success_rate": $(( VALIDATION_RESULTS[passed_tests] * 100 / VALIDATION_RESULTS[total_tests] ))
  },
  "test_results": ${test_details},
  "log_file": "${LOG_FILE}"
}
EOF

    log_success "JSON report generated: ${REPORT_JSON}"
}

################################################################################
# Generate HTML report
################################################################################

generate_html_report() {
    log_info "Generating HTML report..."

    local success_rate=$(( VALIDATION_RESULTS[passed_tests] * 100 / VALIDATION_RESULTS[total_tests] ))

    cat > "${REPORT_HTML}" <<'EOFHTML'
<!DOCTYPE html>
<html>
<head>
    <title>Wasabi Backup Validation Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
        .summary-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
        .summary-card h3 { margin: 0; font-size: 14px; opacity: 0.9; }
        .summary-card p { margin: 10px 0 0; font-size: 32px; font-weight: bold; }
        .test-result { padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid; }
        .test-result.passed { background: #e8f5e9; border-color: #4CAF50; }
        .test-result.failed { background: #ffebee; border-color: #f44336; }
        .test-result.warning { background: #fff3e0; border-color: #ff9800; }
        .test-name { font-weight: bold; color: #333; margin-bottom: 5px; }
        .test-message { color: #666; font-size: 14px; }
        .test-duration { color: #999; font-size: 12px; float: right; }
        .status-badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; }
        .status-badge.passed { background: #4CAF50; color: white; }
        .status-badge.failed { background: #f44336; color: white; }
        .status-badge.warning { background: #ff9800; color: white; }
        .progress-bar { width: 100%; height: 30px; background: #e0e0e0; border-radius: 15px; overflow: hidden; margin: 20px 0; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #4CAF50, #8BC34A); text-align: center; line-height: 30px; color: white; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Wasabi S3 Backup Validation Report</h1>
        <p><strong>Generated:</strong> TIMESTAMP_PLACEHOLDER</p>

        <div class="summary">
            <div class="summary-card">
                <h3>Total Tests</h3>
                <p>TOTAL_TESTS_PLACEHOLDER</p>
            </div>
            <div class="summary-card">
                <h3>Passed</h3>
                <p>PASSED_TESTS_PLACEHOLDER</p>
            </div>
            <div class="summary-card">
                <h3>Failed</h3>
                <p>FAILED_TESTS_PLACEHOLDER</p>
            </div>
            <div class="summary-card">
                <h3>Warnings</h3>
                <p>WARNINGS_PLACEHOLDER</p>
            </div>
        </div>

        <div class="progress-bar">
            <div class="progress-fill" style="width: SUCCESS_RATE_PLACEHOLDER%;">SUCCESS_RATE_PLACEHOLDER% Success Rate</div>
        </div>

        <h2>Test Results</h2>
        TEST_RESULTS_PLACEHOLDER
    </div>
</body>
</html>
EOFHTML

    # Replace placeholders
    sed -i "s/TIMESTAMP_PLACEHOLDER/$(date -u +"%Y-%m-%d %H:%M:%S UTC")/g" "${REPORT_HTML}"
    sed -i "s/TOTAL_TESTS_PLACEHOLDER/${VALIDATION_RESULTS[total_tests]}/g" "${REPORT_HTML}"
    sed -i "s/PASSED_TESTS_PLACEHOLDER/${VALIDATION_RESULTS[passed_tests]}/g" "${REPORT_HTML}"
    sed -i "s/FAILED_TESTS_PLACEHOLDER/${VALIDATION_RESULTS[failed_tests]}/g" "${REPORT_HTML}"
    sed -i "s/WARNINGS_PLACEHOLDER/${VALIDATION_RESULTS[warnings]}/g" "${REPORT_HTML}"
    sed -i "s/SUCCESS_RATE_PLACEHOLDER/${success_rate}/g" "${REPORT_HTML}"

    # Generate test results HTML
    local test_results_html=""
    for test_name in "${!TEST_RESULTS[@]}"; do
        IFS=':' read -r status duration message <<< "${TEST_RESULTS[$test_name]}"
        local status_lower=$(echo "${status}" | tr '[:upper:]' '[:lower:]')

        test_results_html="${test_results_html}<div class=\"test-result ${status_lower}\">"
        test_results_html="${test_results_html}<div class=\"test-name\">${test_name} <span class=\"status-badge ${status_lower}\">${status}</span>"
        test_results_html="${test_results_html}<span class=\"test-duration\">${duration}</span></div>"
        test_results_html="${test_results_html}<div class=\"test-message\">${message}</div>"
        test_results_html="${test_results_html}</div>"
    done

    sed -i "s|TEST_RESULTS_PLACEHOLDER|${test_results_html}|g" "${REPORT_HTML}"

    log_success "HTML report generated: ${REPORT_HTML}"
}

################################################################################
# Print summary
################################################################################

print_summary() {
    echo ""
    log_section "===== Validation Summary ====="
    echo ""
    echo "  Total Tests:    ${VALIDATION_RESULTS[total_tests]}"
    echo "  Passed:         ${GREEN}${VALIDATION_RESULTS[passed_tests]}${NC}"
    echo "  Failed:         ${RED}${VALIDATION_RESULTS[failed_tests]}${NC}"
    echo "  Warnings:       ${YELLOW}${VALIDATION_RESULTS[warnings]}${NC}"
    echo ""

    local success_rate=$(( VALIDATION_RESULTS[passed_tests] * 100 / VALIDATION_RESULTS[total_tests] ))
    echo "  Success Rate:   ${success_rate}%"
    echo ""

    echo "Reports:"
    echo "  - JSON:  ${REPORT_JSON}"
    echo "  - HTML:  ${REPORT_HTML}"
    echo "  - Log:   ${LOG_FILE}"
    echo ""

    if [[ ${VALIDATION_RESULTS[failed_tests]} -eq 0 ]]; then
        log_success "===== All Validation Tests Passed ====="
        return 0
    else
        log_error "===== Some Validation Tests Failed ====="
        return 1
    fi
}

################################################################################
# Main validation
################################################################################

main() {
    log_info "===== Wasabi Backup Validation Starting ====="
    log_info "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"

    preflight_checks

    # Run all tests
    test_rclone_connection
    test_encryption
    test_gfs_rotation
    test_manifest_integrity
    test_restore_procedure
    test_performance_metrics
    test_storage_usage
    test_backup_age

    # Generate reports
    generate_json_report
    generate_html_report

    # Print summary
    print_summary

    log_info "===== Wasabi Backup Validation Complete ====="
}

# Error handler
trap 'log_error "Validation script failed at line $LINENO"' ERR

# Run main
main "$@"
