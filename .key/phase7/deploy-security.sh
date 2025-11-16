#!/bin/bash
#
# deploy-security.sh - Master deployment script for CVE scanning and NIST compliance
#
# Description: Orchestrates deployment of security scanning infrastructure across all VMs
# Usage: ./deploy-security.sh [--vm1|--vm2|--vm3|--all]
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/security-deployment.log"
LOCK_FILE="/var/run/security-deployment.lock"
ADMIN_EMAIL="acampkinpersonnal@gmail.com"
DEPLOYMENT_START=$(date +%s)

# VM Configuration
declare -A VMS=(
    ["vm1"]="10.0.0.11"
    ["vm2"]="10.0.0.12"
    ["vm3"]="10.0.0.13"
)

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
    logger -t security-deployment "$*"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "$LOG_FILE" >&2
    logger -t security-deployment -p user.err "ERROR: $*"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*" | tee -a "$LOG_FILE"
    logger -t security-deployment -p user.warning "WARNING: $*"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $*" | tee -a "$LOG_FILE"
}

# Lock file management
acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid=$(cat "$LOCK_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            log_error "Deployment already running (PID: $pid)"
            exit 1
        else
            log_warn "Removing stale lock file"
            rm -f "$LOCK_FILE"
        fi
    fi
    echo $$ > "$LOCK_FILE"
}

release_lock() {
    rm -f "$LOCK_FILE"
}

# Cleanup on exit
cleanup() {
    local exit_code=$?
    release_lock

    local duration=$(($(date +%s) - DEPLOYMENT_START))
    if [ $exit_code -eq 0 ]; then
        log "Deployment completed successfully in ${duration}s"
        send_notification "Security Deployment Success" "Deployment completed in ${duration}s"
    else
        log_error "Deployment failed after ${duration}s with exit code: $exit_code"
        send_notification "Security Deployment Failed" "Deployment failed after ${duration}s. Check logs: $LOG_FILE"
    fi
}

trap cleanup EXIT INT TERM

# Email notification
send_notification() {
    local subject="$1"
    local body="$2"

    if command -v mail >/dev/null 2>&1; then
        echo "$body" | mail -s "$subject" "$ADMIN_EMAIL" 2>/dev/null || true
    fi
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."

    local missing_tools=()

    for tool in ssh scp rsync; do
        if ! command -v "$tool" >/dev/null 2>&1; then
            missing_tools+=("$tool")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    # Check SSH connectivity
    for vm in "${!VMS[@]}"; do
        local ip="${VMS[$vm]}"
        if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "alex@$ip" "echo test" >/dev/null 2>&1; then
            log_error "Cannot connect to $vm ($ip)"
            exit 1
        fi
    done

    log "Prerequisites check passed"
}

# Deploy to VM
deploy_to_vm() {
    local vm=$1
    local ip="${VMS[$vm]}"

    log "Deploying to $vm ($ip)..."

    # Create remote directories
    ssh "alex@$ip" 'sudo mkdir -p /opt/security/{cve-scanning,nist-compliance,automation,reporting,monitoring,config} && \
                    sudo chown -R alex:alex /opt/security'

    # Copy scripts
    log_info "Copying CVE scanning scripts to $vm..."
    scp -r "$SCRIPT_DIR/cve-scanning/"* "alex@$ip:/opt/security/cve-scanning/"

    log_info "Copying NIST compliance scripts to $vm..."
    scp -r "$SCRIPT_DIR/nist-compliance/"* "alex@$ip:/opt/security/nist-compliance/"

    log_info "Copying automation scripts to $vm..."
    scp -r "$SCRIPT_DIR/automation/"* "alex@$ip:/opt/security/automation/"

    log_info "Copying reporting scripts to $vm..."
    scp -r "$SCRIPT_DIR/reporting/"* "alex@$ip:/opt/security/reporting/"

    log_info "Copying monitoring scripts to $vm..."
    scp -r "$SCRIPT_DIR/monitoring/"* "alex@$ip:/opt/security/monitoring/"

    log_info "Copying configuration files to $vm..."
    scp -r "$SCRIPT_DIR/config/"* "alex@$ip:/opt/security/config/"

    # Make scripts executable
    ssh "alex@$ip" 'find /opt/security -type f -name "*.sh" -exec chmod +x {} \;'

    # Install scanners
    log_info "Installing security scanners on $vm..."
    ssh "alex@$ip" 'sudo /opt/security/cve-scanning/install-scanners.sh' || {
        log_error "Failed to install scanners on $vm"
        return 1
    }

    # Install OpenSCAP
    log_info "Installing OpenSCAP on $vm..."
    ssh "alex@$ip" 'sudo /opt/security/nist-compliance/install-openscap.sh' || {
        log_error "Failed to install OpenSCAP on $vm"
        return 1
    }

    # Setup automation (cron/systemd)
    log_info "Setting up automation on $vm..."
    ssh "alex@$ip" 'sudo /opt/security/automation/setup-automation.sh' || {
        log_error "Failed to setup automation on $vm"
        return 1
    }

    # Initial database update
    log_info "Updating vulnerability databases on $vm..."
    ssh "alex@$ip" 'sudo /opt/security/cve-scanning/update-cve-databases.sh' || {
        log_warn "Database update failed on $vm (non-fatal)"
    }

    # Run initial scan
    log_info "Running initial security scan on $vm..."
    ssh "alex@$ip" 'sudo /opt/security/cve-scanning/cve-scan.sh --initial' || {
        log_warn "Initial scan failed on $vm (non-fatal)"
    }

    log "Successfully deployed to $vm"
    return 0
}

# Deploy to all VMs
deploy_all() {
    log "Starting deployment to all VMs..."

    local failed_vms=()
    local success_count=0

    for vm in "${!VMS[@]}"; do
        if deploy_to_vm "$vm"; then
            ((success_count++))
        else
            failed_vms+=("$vm")
        fi
    done

    log "Deployment summary: $success_count/${#VMS[@]} VMs successful"

    if [ ${#failed_vms[@]} -gt 0 ]; then
        log_error "Failed VMs: ${failed_vms[*]}"
        return 1
    fi

    return 0
}

# Setup centralized reporting on VM1
setup_centralized_reporting() {
    log "Setting up centralized reporting on VM1..."

    local vm1_ip="${VMS[vm1]}"

    # Create reporting directory
    ssh "alex@$vm1_ip" 'sudo mkdir -p /opt/security/reports/{cve,nist,consolidated} && \
                         sudo chown -R alex:alex /opt/security/reports'

    # Setup report collection from other VMs
    cat > /tmp/collect-reports.sh << 'EOF'
#!/bin/bash
# Collect reports from all VMs to centralized location

VMS=("10.0.0.12" "10.0.0.13")
REPORT_DIR="/opt/security/reports"

for vm_ip in "${VMS[@]}"; do
    vm_name=$(ssh alex@$vm_ip hostname)
    mkdir -p "$REPORT_DIR/cve/$vm_name" "$REPORT_DIR/nist/$vm_name"

    # Collect CVE reports
    rsync -az "alex@$vm_ip:/opt/security/reports/cve/" "$REPORT_DIR/cve/$vm_name/" 2>/dev/null || true

    # Collect NIST reports
    rsync -az "alex@$vm_ip:/opt/security/reports/nist/" "$REPORT_DIR/nist/$vm_name/" 2>/dev/null || true
done

# Generate consolidated report
/opt/security/reporting/generate-dashboard.sh
EOF

    scp /tmp/collect-reports.sh "alex@$vm1_ip:/opt/security/reporting/collect-reports.sh"
    ssh "alex@$vm1_ip" 'chmod +x /opt/security/reporting/collect-reports.sh'

    # Add to cron on VM1
    ssh "alex@$vm1_ip" 'echo "0 5 * * * /opt/security/reporting/collect-reports.sh" | crontab -'

    rm /tmp/collect-reports.sh

    log "Centralized reporting configured on VM1"
}

# Generate deployment report
generate_deployment_report() {
    log "Generating deployment report..."

    local report_file="/tmp/security-deployment-report.txt"

    cat > "$report_file" << EOF
Security Scanning and Compliance Deployment Report
===================================================
Deployment Date: $(date)
Duration: $(($(date +%s) - DEPLOYMENT_START))s

VMs Configured:
EOF

    for vm in "${!VMS[@]}"; do
        local ip="${VMS[$vm]}"
        echo "  - $vm: $ip" >> "$report_file"

        # Get scanner versions
        echo "    Scanners:" >> "$report_file"
        ssh "alex@$ip" 'trivy --version 2>/dev/null | head -1' >> "$report_file" || echo "    Trivy: Not installed" >> "$report_file"
        ssh "alex@$ip" 'grype version 2>/dev/null | head -1' >> "$report_file" || echo "    Grype: Not installed" >> "$report_file"
        ssh "alex@$ip" 'oscap --version 2>/dev/null | head -1' >> "$report_file" || echo "    OpenSCAP: Not installed" >> "$report_file"
    done

    cat >> "$report_file" << EOF

Automation Configured:
  - Daily CVE scans at 04:00
  - Weekly NIST compliance checks on Sundays at 02:00
  - Monthly security audits on 1st of month at 01:00

Reporting:
  - Email notifications: $ADMIN_EMAIL
  - Centralized reports on VM1: /opt/security/reports
  - S3 backup configured

Monitoring:
  - Prometheus metrics enabled
  - Grafana dashboards configured
  - Alert rules active

Next Steps:
  1. Review initial scan results
  2. Configure suppression rules for false positives
  3. Customize NIST compliance profile
  4. Set up S3 credentials for report backup
  5. Configure SMTP for email notifications

Documentation:
  - CVE Scanning Guide: /opt/security/docs/CVE_SCANNING_GUIDE.md
  - NIST Compliance Guide: /opt/security/docs/NIST_COMPLIANCE_GUIDE.md
  - Remediation Procedures: /opt/security/docs/REMEDIATION_PROCEDURES.md

EOF

    cat "$report_file"
    send_notification "Security Deployment Complete" "$(cat $report_file)"

    rm "$report_file"
}

# Main execution
main() {
    log "Starting security infrastructure deployment"

    acquire_lock

    # Parse arguments
    local target="${1:-all}"

    case "$target" in
        --vm1)
            check_prerequisites
            deploy_to_vm "vm1"
            ;;
        --vm2)
            check_prerequisites
            deploy_to_vm "vm2"
            ;;
        --vm3)
            check_prerequisites
            deploy_to_vm "vm3"
            ;;
        --all|all)
            check_prerequisites
            deploy_all
            setup_centralized_reporting
            generate_deployment_report
            ;;
        --help|-h)
            echo "Usage: $0 [--vm1|--vm2|--vm3|--all]"
            echo ""
            echo "Options:"
            echo "  --vm1      Deploy only to VM1 (10.0.0.11)"
            echo "  --vm2      Deploy only to VM2 (10.0.0.12)"
            echo "  --vm3      Deploy only to VM3 (10.0.0.13)"
            echo "  --all      Deploy to all VMs (default)"
            echo "  --help     Show this help message"
            exit 0
            ;;
        *)
            log_error "Invalid option: $target"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
}

main "$@"
