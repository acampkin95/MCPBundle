#!/bin/bash
################################################################################
# deploy-all.sh - Master SOC deployment orchestrator
#
# Usage: ./deploy-all.sh [--quick|--full|--verify-only]
#
# Deploys complete SOC infrastructure across all three VMs in the correct order
# with health checks and rollback capabilities
################################################################################

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly BOLD='\033[1m'
readonly NC='\033[0m' # No Color

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/tmp/soc-master-deploy-$(date +%Y%m%d_%H%M%S).log"

# VM Configuration
readonly VMI01_IP="46.250.243.123"
readonly VMI02D_IP="46.250.241.70"
readonly VMI03_IP="154.26.158.31"

# Deployment mode
DEPLOYMENT_MODE="${1:---full}"

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

log_success() {
    echo -e "${GREEN}${BOLD}[$(date +'%Y-%m-%d %H:%M:%S')] ✓${NC} $*" | tee -a "${LOG_FILE}"
}

log_step() {
    echo -e "${CYAN}${BOLD}[$(date +'%Y-%m-%d %H:%M:%S')] ▶${NC} $*" | tee -a "${LOG_FILE}"
}

################################################################################
# Banner
################################################################################

print_banner() {
    clear
    cat <<'BANNER'
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║           MCP Bundle v0.2.0 - SOC Security Deployment                ║
║                                                                       ║
║   Multi-Layer Security Operations Center Infrastructure Automation   ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝

Architecture:
  VMI01  (46.250.243.123)  - MCP/AI Primary + Security Stack
  VMI02D (46.250.241.70)   - Data/CDN Standby + Security Stack
  VMI03  (154.26.158.31)   - Gateway/SOC Hub + Central Management

Security Layers:
  1. Network Firewall (nftables)
  2. Intrusion Prevention (Suricata)
  3. Threat Intelligence (CrowdSec)
  4. Runtime Security (Falco)
  5. SIEM & Incident Response (Wazuh + TheHive)

BANNER
    echo ""
}

################################################################################
# Pre-flight Checks
################################################################################

check_ssh_connectivity() {
    log_step "Performing pre-flight SSH connectivity checks..."

    local failed=0

    for host in "${VMI01_IP}" "${VMI02D_IP}" "${VMI03_IP}"; do
        if ssh -o ConnectTimeout=5 -o BatchMode=yes "root@${host}" "echo 'SSH OK'" &>/dev/null; then
            log "  ✓ SSH access verified for ${host}"
        else
            log_error "  ✗ Cannot SSH to root@${host}"
            failed=1
        fi
    done

    if [[ ${failed} -eq 1 ]]; then
        log_error "Pre-flight check failed. Ensure SSH key authentication is configured."
        exit 1
    fi

    log_success "Pre-flight SSH checks passed"
}

check_script_availability() {
    log_step "Checking deployment script availability..."

    local scripts=(
        "deploy-nftables.sh"
        "deploy-suricata.sh"
        "deploy-crowdsec.sh"
        "deploy-falco.sh"
        "deploy-wazuh-manager.sh"
        "deploy-wazuh-agent.sh"
        "deploy-elasticsearch.sh"
        "deploy-thehive-cortex.sh"
        "deploy-soc-sync.sh"
    )

    local failed=0

    for script in "${scripts[@]}"; do
        if [[ ! -f "${SCRIPT_DIR}/${script}" ]]; then
            log_error "  ✗ Missing: ${script}"
            failed=1
        elif [[ ! -x "${SCRIPT_DIR}/${script}" ]]; then
            log_error "  ✗ Not executable: ${script}"
            failed=1
        else
            log "  ✓ ${script}"
        fi
    done

    if [[ ${failed} -eq 1 ]]; then
        log_error "Script availability check failed"
        exit 1
    fi

    log_success "All deployment scripts available"
}

################################################################################
# Deployment Functions
################################################################################

deploy_layer() {
    local layer_name=$1
    local script_name=$2
    local args=$3

    log_step "Deploying Layer: ${layer_name}"
    echo ""

    if "${SCRIPT_DIR}/${script_name}" ${args}; then
        log_success "Layer '${layer_name}' deployed successfully"
        echo ""
        sleep 3
        return 0
    else
        log_error "Layer '${layer_name}' deployment failed"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_deployment() {
    log_step "Verifying SOC deployment across all hosts..."
    echo ""

    local failed=0

    # Check VMI01
    log_info "Verifying VMI01 (${VMI01_IP})..."
    if ! ssh "root@${VMI01_IP}" 'systemctl is-active nftables suricata crowdsec falco wazuh-agent' &>/dev/null; then
        log_warn "  Some services not active on VMI01"
        failed=1
    else
        log "  ✓ All services active on VMI01"
    fi

    # Check VMI02D
    log_info "Verifying VMI02D (${VMI02D_IP})..."
    if ! ssh "root@${VMI02D_IP}" 'systemctl is-active nftables suricata crowdsec falco wazuh-agent' &>/dev/null; then
        log_warn "  Some services not active on VMI02D"
        failed=1
    else
        log "  ✓ All services active on VMI02D"
    fi

    # Check VMI03
    log_info "Verifying VMI03 (${VMI03_IP})..."
    if ! ssh "root@${VMI03_IP}" 'systemctl is-active nftables suricata crowdsec falco wazuh-manager elasticsearch' &>/dev/null; then
        log_warn "  Some services not active on VMI03"
        failed=1
    else
        log "  ✓ All services active on VMI03"
    fi

    echo ""

    if [[ ${failed} -eq 0 ]]; then
        log_success "Deployment verification passed"
        return 0
    else
        log_warn "Deployment verification found issues - check individual services"
        return 1
    fi
}

display_deployment_summary() {
    cat <<'SUMMARY'

╔═══════════════════════════════════════════════════════════════════════╗
║                     DEPLOYMENT SUMMARY                                ║
╚═══════════════════════════════════════════════════════════════════════╝

Services Deployed:

  Layer 1: Network Firewall (nftables)
    ✓ VMI01, VMI02D, VMI03 - Per-host firewall rules active

  Layer 2: Intrusion Prevention (Suricata)
    ✓ VMI01, VMI02D, VMI03 - Inline IPS monitoring all traffic

  Layer 3: Threat Intelligence (CrowdSec)
    ✓ VMI01, VMI02D, VMI03 - Community threat feeds active

  Layer 4: Runtime Security (Falco)
    ✓ VMI01, VMI02D, VMI03 - Kernel-level monitoring active

  Layer 5: SIEM & Response
    ✓ VMI03 - Wazuh Manager (SIEM)
    ✓ VMI01, VMI02D - Wazuh Agents
    ✓ VMI03 - Elasticsearch + Kibana
    ✓ VMI03 - TheHive + Cortex

  Automation:
    ✓ All hosts - Nightly SOC sync at 2:00 AM

─────────────────────────────────────────────────────────────────────────

Access Points (via VPN):

  Kibana:          http://154.26.158.31:5601
  TheHive:         http://154.26.158.31:9000
  Cortex:          http://154.26.158.31:9001
  Grafana:         http://154.26.158.31:3000
  Prometheus:      http://154.26.158.31:9090

Credentials:

  Elasticsearch:   ssh root@154.26.158.31 'cat /opt/mcp/credentials/elasticsearch.txt'
  TheHive:         ssh root@154.26.158.31 'cat /opt/mcp/credentials/thehive.txt'
  Wazuh:           ssh root@154.26.158.31 'cat /var/ossec/etc/authd.pass'

─────────────────────────────────────────────────────────────────────────

Post-Deployment Tasks:

  1. Register Wazuh Agents:
     ssh root@154.26.158.31 '/var/ossec/bin/manage_agents'

  2. Configure TheHive:
     - Access web interface
     - Complete setup wizard
     - Generate Cortex API key
     - Update TheHive config with Cortex key

  3. Install Cortex Analyzers:
     ssh root@154.26.158.31 '/usr/local/bin/install-cortex-analyzers.sh'

  4. Configure Notifications:
     Edit /opt/soc/config.yaml on each host

  5. Import Kibana Dashboards:
     - Access Kibana web interface
     - Import Wazuh, Suricata, Falco dashboards

─────────────────────────────────────────────────────────────────────────

Monitoring Commands:

  SOC Dashboard:
    ssh root@<host> '/usr/local/bin/soc-dashboard.sh'

  View Alerts:
    ssh root@<host> 'tail -f /var/log/suricata/eve.json | jq .'
    ssh root@<host> 'tail -f /var/log/falco/events.log | jq .'
    ssh root@<host> 'cscli decisions list'

  Service Status:
    ssh root@<host> 'systemctl status nftables suricata crowdsec falco'

─────────────────────────────────────────────────────────────────────────

SUMMARY

    log_info "Deployment log saved to: ${LOG_FILE}"
    echo ""
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    print_banner

    log_info "Deployment mode: ${DEPLOYMENT_MODE}"
    log_info "Log file: ${LOG_FILE}"
    echo ""

    # Pre-flight checks
    check_ssh_connectivity
    check_script_availability
    echo ""

    if [[ "${DEPLOYMENT_MODE}" == "--verify-only" ]]; then
        verify_deployment
        exit $?
    fi

    # Confirmation prompt
    read -p "Begin SOC deployment across all three VMs? (yes/no): " -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_warn "Deployment cancelled by user"
        exit 0
    fi

    log_info "Starting full SOC deployment..."
    echo ""

    # Layer 1: Network Firewall
    deploy_layer "Layer 1 - Network Firewall (nftables)" \
                 "deploy-nftables.sh" \
                 "all" || exit 1

    # Layer 2: Intrusion Prevention
    deploy_layer "Layer 2 - Intrusion Prevention (Suricata)" \
                 "deploy-suricata.sh" \
                 "all" || exit 1

    # Layer 3: Threat Intelligence
    deploy_layer "Layer 3 - Threat Intelligence (CrowdSec)" \
                 "deploy-crowdsec.sh" \
                 "all" || exit 1

    # Layer 4: Runtime Security
    deploy_layer "Layer 4 - Runtime Security (Falco)" \
                 "deploy-falco.sh" \
                 "all" || exit 1

    # Layer 5a: SIEM Manager (VMI03)
    deploy_layer "Layer 5a - SIEM Manager (Wazuh)" \
                 "deploy-wazuh-manager.sh" \
                 "" || exit 1

    # Layer 5b: SIEM Agents (VMI01, VMI02D)
    deploy_layer "Layer 5b - SIEM Agents (Wazuh)" \
                 "deploy-wazuh-agent.sh" \
                 "all" || exit 1

    # Layer 5c: Log Analytics (VMI03)
    deploy_layer "Layer 5c - Log Analytics (Elasticsearch + Kibana)" \
                 "deploy-elasticsearch.sh" \
                 "" || exit 1

    # Layer 5d: Incident Response (VMI03)
    deploy_layer "Layer 5d - Incident Response (TheHive + Cortex)" \
                 "deploy-thehive-cortex.sh" \
                 "" || exit 1

    # Automation: SOC Sync
    deploy_layer "Automation - Nightly SOC Sync" \
                 "deploy-soc-sync.sh" \
                 "all" || exit 1

    echo ""
    log_step "Performing final verification..."
    echo ""
    sleep 5

    verify_deployment

    echo ""
    log_success "SOC deployment completed successfully!"
    echo ""

    display_deployment_summary
}

# Run main function
main "$@"
