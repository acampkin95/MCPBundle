#!/bin/bash
################################################################################
# deploy-crowdsec.sh - Install CrowdSec with nftables bouncer
#
# Usage: ./deploy-crowdsec.sh [VMI01|VMI02D|VMI03|all]
#
# Security: Collaborative threat intelligence with automatic IP banning via
#           nftables integration and community-powered threat detection
################################################################################

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/soc-crowdsec-deploy.log"
readonly BACKUP_DIR="/opt/mcp/backups/crowdsec"

# VM Configuration
readonly VMI01_IP="46.250.243.123"
readonly VMI02D_IP="46.250.241.70"
readonly VMI03_IP="154.26.158.31"

################################################################################
# Logging Functions
################################################################################

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "${LOG_FILE}" >&2
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*" | tee -a "${LOG_FILE}"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $*" | tee -a "${LOG_FILE}"
}

################################################################################
# Error Handling
################################################################################

cleanup_on_error() {
    local exit_code=$?
    if [[ ${exit_code} -ne 0 ]]; then
        log_error "Deployment failed with exit code ${exit_code}"
        log_warn "Check logs at ${LOG_FILE}"
    fi
}

trap cleanup_on_error EXIT

################################################################################
# Validation Functions
################################################################################

validate_host() {
    local host=$1
    if [[ ! "${host}" =~ ^(VMI01|VMI02D|VMI03|all)$ ]]; then
        log_error "Invalid host: ${host}. Must be VMI01, VMI02D, VMI03, or all"
        return 1
    fi
    return 0
}

check_ssh_access() {
    local ip=$1
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "root@${ip}" "echo 'SSH OK'" &>/dev/null; then
        log_error "Cannot SSH to root@${ip}. Check SSH keys and access."
        return 1
    fi
    log "SSH access verified for ${ip}"
    return 0
}

################################################################################
# CrowdSec Installation and Configuration
################################################################################

deploy_crowdsec() {
    local ip=$1
    local hostname=$2

    log_info "Deploying CrowdSec to ${hostname} (${ip})"

    ssh "root@${ip}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

echo "=== Installing CrowdSec Security Engine ==="

# Install dependencies
apt-get update
apt-get install -y curl gnupg lsb-release

# Backup existing configuration
mkdir -p /opt/mcp/backups/crowdsec
if [[ -d /etc/crowdsec ]]; then
    cp -r /etc/crowdsec /opt/mcp/backups/crowdsec/crowdsec.backup.$(date +%Y%m%d_%H%M%S)
fi

# Install CrowdSec
curl -s https://install.crowdsec.net | bash

# Wait for installation to complete
sleep 5

# Verify installation
if ! command -v cscli &>/dev/null; then
    echo "✗ CrowdSec installation failed - cscli not found"
    exit 1
fi

echo "=== Installing CrowdSec Collections ==="

# Install essential collections
cscli collections install crowdsecurity/linux || true
cscli collections install crowdsecurity/sshd || true
cscli collections install crowdsecurity/nginx || true
cscli collections install crowdsecurity/apache2 || true
cscli collections install crowdsecurity/postgresql || true
cscli collections install crowdsecurity/suricata || true
cscli collections install crowdsecurity/base-http-scenarios || true
cscli collections install crowdsecurity/http-cve || true

# Update hub
cscli hub update

echo "=== Installing nftables Bouncer ==="

# Install nftables bouncer
apt-get install -y crowdsec-firewall-bouncer-nftables

# Configure nftables bouncer
cat > /etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml <<'EOF'
# CrowdSec nftables Bouncer Configuration

mode: nftables
pid_dir: /var/run/
update_frequency: 10s
daemonize: true
log_mode: file
log_dir: /var/log/
log_level: info
log_compression: true
log_max_size: 40
log_max_backups: 3
log_max_age: 30
compress_logs: true

# API configuration
api_url: http://127.0.0.1:8080/
api_key: ${BOUNCER_KEY}

# nftables configuration
nftables:
  ipv4:
    enabled: true
    set-only: false
    table: crowdsec
    chain: crowdsec-chain
  ipv6:
    enabled: true
    set-only: false
    table: crowdsec6
    chain: crowdsec6-chain

# Blacklist all protocols for banned IPs
deny_action: drop
deny_log: true

# Decision types to process
scopes:
  - ip
  - range

# Prometheus metrics
prometheus:
  enabled: true
  listen_addr: 127.0.0.1
  listen_port: 60601
EOF

# Generate bouncer API key
BOUNCER_KEY=$(cscli bouncers add crowdsec-firewall-bouncer -o raw)

# Update bouncer config with API key
sed -i "s/\${BOUNCER_KEY}/${BOUNCER_KEY}/" /etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml

echo "=== Configuring CrowdSec Engine ==="

# Configure CrowdSec to read all relevant logs
cat > /etc/crowdsec/acquis.yaml <<'EOF'
# Log acquisition configuration

# System authentication logs
- filename: /var/log/auth.log
  labels:
    type: syslog

# Suricata logs
- filename: /var/log/suricata/eve.json
  labels:
    type: suricata

# Nginx logs
- filename: /var/log/nginx/*.log
  labels:
    type: nginx

# PostgreSQL logs
- filename: /var/log/postgresql/postgresql-*.log
  labels:
    type: postgres

# Kernel logs
- filename: /var/log/kern.log
  labels:
    type: syslog

# Syslog
- filename: /var/log/syslog
  labels:
    type: syslog
EOF

# Configure CrowdSec profiles for auto-ban
cat > /etc/crowdsec/profiles.yaml <<'EOF'
# CrowdSec Decision Profiles

name: default_ip_remediation
filters:
 - Alert.Remediation == true && Alert.GetScope() == "Ip"
decisions:
 - type: ban
   duration: 4h
on_success: break

---
name: default_range_remediation
filters:
 - Alert.Remediation == true && Alert.GetScope() == "Range"
decisions:
 - type: ban
   duration: 4h
on_success: break

---
name: aggressive_ban
filters:
 - Alert.GetScenario() contains "crowdsecurity/ssh-bf"
 - Alert.GetScenario() contains "crowdsecurity/http-probing"
 - Alert.GetScenario() contains "crowdsecurity/http-crawl-non_statics"
decisions:
 - type: ban
   duration: 24h
on_success: break

---
name: slow_ban
filters:
 - Alert.GetScenario() contains "crowdsecurity/http-sensitive-files"
decisions:
 - type: ban
   duration: 12h
on_success: break
EOF

# Enable CrowdSec central API (optional - for sharing threat intel)
# cscli capi register

echo "=== Starting CrowdSec Services ==="

# Enable and start CrowdSec
systemctl enable crowdsec
systemctl restart crowdsec

# Wait for CrowdSec to start
sleep 5

# Enable and start bouncer
systemctl enable crowdsec-firewall-bouncer
systemctl restart crowdsec-firewall-bouncer

# Wait for bouncer to start
sleep 3

# Verify services are running
if ! systemctl is-active --quiet crowdsec; then
    echo "✗ CrowdSec service failed to start"
    journalctl -u crowdsec -n 50 --no-pager
    exit 1
fi

if ! systemctl is-active --quiet crowdsec-firewall-bouncer; then
    echo "✗ CrowdSec firewall bouncer failed to start"
    journalctl -u crowdsec-firewall-bouncer -n 50 --no-pager
    exit 1
fi

echo "✓ CrowdSec and bouncer services running"

# Display status
echo "=== CrowdSec Status ==="
cscli metrics
cscli bouncers list
cscli collections list

# Create monitoring script
cat > /usr/local/bin/crowdsec-report.sh <<'EOF'
#!/bin/bash
# CrowdSec Status Report

echo "=== CrowdSec Status Report - $(date) ==="
echo ""

echo "Active Decisions:"
cscli decisions list
echo ""

echo "Active Alerts:"
cscli alerts list -l 10
echo ""

echo "Metrics:"
cscli metrics
echo ""

echo "Bouncers:"
cscli bouncers list
echo ""

echo "Collections:"
cscli collections list
echo ""

echo "Scenarios:"
cscli scenarios list
echo ""
EOF

chmod +x /usr/local/bin/crowdsec-report.sh

# Add to daily cron for reporting
cat > /etc/cron.daily/crowdsec-report <<'EOF'
#!/bin/bash
/usr/local/bin/crowdsec-report.sh >> /var/log/crowdsec/daily-report.log 2>&1
EOF

chmod +x /etc/cron.daily/crowdsec-report

echo "✓ CrowdSec deployment completed successfully"
systemctl status crowdsec --no-pager
systemctl status crowdsec-firewall-bouncer --no-pager
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed CrowdSec to ${hostname}"
    else
        log_error "Failed to deploy CrowdSec to ${hostname}"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_crowdsec() {
    local ip=$1
    local hostname=$2

    log_info "Verifying CrowdSec deployment on ${hostname} (${ip})"

    # Check CrowdSec service
    if ! ssh "root@${ip}" "systemctl is-active crowdsec" | grep -q "active"; then
        log_error "CrowdSec service not active on ${hostname}"
        return 1
    fi

    # Check bouncer service
    if ! ssh "root@${ip}" "systemctl is-active crowdsec-firewall-bouncer" | grep -q "active"; then
        log_error "CrowdSec bouncer service not active on ${hostname}"
        return 1
    fi

    # Check collections installed
    local collection_count
    collection_count=$(ssh "root@${ip}" "cscli collections list -o raw | wc -l")
    log "CrowdSec collections installed on ${hostname}: ${collection_count}"

    if [[ ${collection_count} -lt 3 ]]; then
        log_warn "Low collection count on ${hostname}: ${collection_count}"
    fi

    # Check bouncers registered
    local bouncer_count
    bouncer_count=$(ssh "root@${ip}" "cscli bouncers list -o raw | wc -l")
    log "CrowdSec bouncers registered on ${hostname}: ${bouncer_count}"

    # Check nftables integration
    if ! ssh "root@${ip}" "nft list ruleset | grep -q crowdsec"; then
        log_warn "CrowdSec nftables integration not detected on ${hostname}"
    else
        log "✓ CrowdSec nftables integration active on ${hostname}"
    fi

    log "✓ CrowdSec verification passed for ${hostname}"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    local target="${1:-all}"

    log "Starting CrowdSec deployment to ${target}"

    # Validate target
    if ! validate_host "${target}"; then
        exit 1
    fi

    # Deploy to specified target(s)
    case "${target}" in
        VMI01)
            check_ssh_access "${VMI01_IP}" || exit 1
            deploy_crowdsec "${VMI01_IP}" "VMI01"
            verify_crowdsec "${VMI01_IP}" "VMI01"
            ;;
        VMI02D)
            check_ssh_access "${VMI02D_IP}" || exit 1
            deploy_crowdsec "${VMI02D_IP}" "VMI02D"
            verify_crowdsec "${VMI02D_IP}" "VMI02D"
            ;;
        VMI03)
            check_ssh_access "${VMI03_IP}" || exit 1
            deploy_crowdsec "${VMI03_IP}" "VMI03"
            verify_crowdsec "${VMI03_IP}" "VMI03"
            ;;
        all)
            log_info "Deploying to all hosts"
            for host_ip in "${VMI01_IP}" "${VMI02D_IP}" "${VMI03_IP}"; do
                check_ssh_access "${host_ip}" || exit 1
            done

            deploy_crowdsec "${VMI01_IP}" "VMI01"
            verify_crowdsec "${VMI01_IP}" "VMI01"

            deploy_crowdsec "${VMI02D_IP}" "VMI02D"
            verify_crowdsec "${VMI02D_IP}" "VMI02D"

            deploy_crowdsec "${VMI03_IP}" "VMI03"
            verify_crowdsec "${VMI03_IP}" "VMI03"
            ;;
    esac

    log "✓ CrowdSec deployment completed successfully"
    log_info "Monitor decisions: ssh root@<host> 'cscli decisions list'"
    log_info "View alerts: ssh root@<host> 'cscli alerts list'"
    log_info "Daily reports: /var/log/crowdsec/daily-report.log"
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
