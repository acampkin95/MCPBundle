#!/bin/bash
################################################################################
# verify-soc.sh - Comprehensive SOC infrastructure verification
#
# Usage: ./verify-soc.sh [--detailed|--quick]
#
# Performs complete health checks across all SOC components on all three VMs
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

# VM Configuration
readonly VMI01_IP="46.250.243.123"
readonly VMI02D_IP="46.250.241.70"
readonly VMI03_IP="154.26.158.31"

# Verification mode
VERIFICATION_MODE="${1:---quick}"

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

################################################################################
# Logging Functions
################################################################################

check_pass() {
    echo -e "${GREEN}✓${NC} $*"
    ((PASSED_CHECKS++))
    ((TOTAL_CHECKS++))
}

check_fail() {
    echo -e "${RED}✗${NC} $*"
    ((FAILED_CHECKS++))
    ((TOTAL_CHECKS++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $*"
    ((WARNING_CHECKS++))
    ((TOTAL_CHECKS++))
}

section_header() {
    echo ""
    echo -e "${CYAN}${BOLD}═══ $* ═══${NC}"
    echo ""
}

host_header() {
    echo -e "${BLUE}${BOLD}▶ $*${NC}"
}

################################################################################
# Service Checks
################################################################################

check_service() {
    local ip=$1
    local service=$2
    local service_name=$3

    if ssh "root@${ip}" "systemctl is-active ${service}" &>/dev/null; then
        check_pass "${service_name} is active"
    else
        check_fail "${service_name} is not active"
    fi
}

check_port() {
    local ip=$1
    local port=$2
    local service_name=$3

    if ssh "root@${ip}" "ss -tlnp | grep -q ':${port}'" &>/dev/null; then
        check_pass "${service_name} listening on port ${port}"
    else
        check_fail "${service_name} not listening on port ${port}"
    fi
}

check_process() {
    local ip=$1
    local process=$2
    local service_name=$3

    if ssh "root@${ip}" "pgrep -f ${process}" &>/dev/null; then
        check_pass "${service_name} process running"
    else
        check_fail "${service_name} process not found"
    fi
}

check_file_exists() {
    local ip=$1
    local file=$2
    local description=$3

    if ssh "root@${ip}" "test -f ${file}" &>/dev/null; then
        check_pass "${description} exists"
    else
        check_fail "${description} not found"
    fi
}

check_directory_exists() {
    local ip=$1
    local directory=$2
    local description=$3

    if ssh "root@${ip}" "test -d ${directory}" &>/dev/null; then
        check_pass "${description} exists"
    else
        check_fail "${description} not found"
    fi
}

################################################################################
# Component Verification
################################################################################

verify_nftables() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - nftables Firewall"

    check_service "${ip}" "nftables" "nftables service"

    # Check rules loaded
    if ssh "root@${ip}" "nft list ruleset | grep -q 'table inet filter'" &>/dev/null; then
        check_pass "Firewall rules loaded"
    else
        check_fail "Firewall rules not loaded"
    fi

    # Check for expected chains
    if ssh "root@${ip}" "nft list ruleset | grep -q 'chain input'" &>/dev/null; then
        check_pass "Input chain configured"
    else
        check_fail "Input chain missing"
    fi

    if ssh "root@${ip}" "nft list ruleset | grep -q 'chain suricata_drop'" &>/dev/null; then
        check_pass "Suricata drop chain present"
    else
        check_warn "Suricata drop chain not found"
    fi
}

verify_suricata() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - Suricata IPS"

    check_service "${ip}" "suricata" "Suricata service"

    # Check rules loaded
    local rule_count
    rule_count=$(ssh "root@${ip}" "suricata -T -c /etc/suricata/suricata.yaml 2>&1 | grep -oP '\d+(?= signatures)' || echo '0'")

    if [[ ${rule_count} -gt 1000 ]]; then
        check_pass "Suricata rules loaded: ${rule_count} signatures"
    else
        check_warn "Low signature count: ${rule_count}"
    fi

    # Check log file
    check_file_exists "${ip}" "/var/log/suricata/eve.json" "Suricata eve.json log"
}

verify_crowdsec() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - CrowdSec"

    check_service "${ip}" "crowdsec" "CrowdSec service"
    check_service "${ip}" "crowdsec-firewall-bouncer" "CrowdSec bouncer"

    # Check collections installed
    local collection_count
    collection_count=$(ssh "root@${ip}" "cscli collections list -o raw 2>/dev/null | wc -l" || echo "0")

    if [[ ${collection_count} -ge 3 ]]; then
        check_pass "CrowdSec collections installed: ${collection_count}"
    else
        check_warn "Low collection count: ${collection_count}"
    fi

    # Check nftables integration
    if ssh "root@${ip}" "nft list ruleset | grep -q crowdsec" &>/dev/null; then
        check_pass "CrowdSec nftables integration active"
    else
        check_warn "CrowdSec nftables integration not detected"
    fi
}

verify_falco() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - Falco Runtime Security"

    check_service "${ip}" "falco" "Falco service"

    # Check healthz endpoint
    if ssh "root@${ip}" "curl -s http://localhost:8765/healthz 2>/dev/null | grep -q ok" &>/dev/null; then
        check_pass "Falco healthz endpoint responding"
    else
        check_warn "Falco healthz endpoint not responding"
    fi

    # Check kernel module or eBPF
    if ssh "root@${ip}" "lsmod | grep -q falco" &>/dev/null; then
        check_pass "Falco kernel module loaded"
    else
        check_warn "Falco kernel module not loaded (may be using eBPF)"
    fi

    check_directory_exists "${ip}" "/var/log/falco" "Falco log directory"
}

verify_wazuh_agent() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - Wazuh Agent"

    check_service "${ip}" "wazuh-agent" "Wazuh agent service"

    # Check agent daemon
    if ssh "root@${ip}" "/var/ossec/bin/wazuh-control status | grep -q 'wazuh-agentd is running'" &>/dev/null; then
        check_pass "Wazuh agent daemon running"
    else
        check_fail "Wazuh agent daemon not running"
    fi

    # Check connection to manager
    if ssh "root@${ip}" "grep -q 'Connected to the server' /var/ossec/logs/ossec.log 2>/dev/null" &>/dev/null; then
        check_pass "Wazuh agent connected to manager"
    else
        check_warn "Wazuh agent connection status unknown"
    fi
}

verify_wazuh_manager() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - Wazuh Manager"

    check_service "${ip}" "wazuh-manager" "Wazuh manager service"

    # Check manager processes
    if ssh "root@${ip}" "/var/ossec/bin/wazuh-control status | grep -q 'is running'" &>/dev/null; then
        check_pass "Wazuh manager processes running"
    else
        check_fail "Wazuh manager processes not running"
    fi

    # Check ports
    check_port "${ip}" "1514" "Wazuh agent communication"
    check_port "${ip}" "1515" "Wazuh agent enrollment"

    # Check connected agents
    local agent_count
    agent_count=$(ssh "root@${ip}" "/var/ossec/bin/agent_control -l 2>/dev/null | grep -c 'Active' || echo '0'")
    echo -e "  ${BLUE}Info:${NC} Connected agents: ${agent_count}"
}

verify_elasticsearch() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - Elasticsearch"

    check_service "${ip}" "elasticsearch" "Elasticsearch service"

    # Check cluster health
    if ssh "root@${ip}" "curl -s http://localhost:9200/_cluster/health 2>/dev/null | grep -q cluster_name" &>/dev/null; then
        check_pass "Elasticsearch responding"

        local cluster_status
        cluster_status=$(ssh "root@${ip}" "curl -s http://localhost:9200/_cluster/health 2>/dev/null | jq -r '.status' || echo 'unknown'")

        if [[ "${cluster_status}" == "green" ]] || [[ "${cluster_status}" == "yellow" ]]; then
            check_pass "Cluster status: ${cluster_status}"
        else
            check_warn "Cluster status: ${cluster_status}"
        fi
    else
        check_fail "Elasticsearch not responding"
    fi

    check_port "${ip}" "9200" "Elasticsearch HTTP"
}

verify_kibana() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - Kibana"

    check_service "${ip}" "kibana" "Kibana service"

    # Check Kibana API
    if ssh "root@${ip}" "curl -s http://localhost:5601/api/status 2>/dev/null | grep -q available" &>/dev/null; then
        check_pass "Kibana API responding"
    else
        check_warn "Kibana API not responding (may still be starting)"
    fi

    check_port "${ip}" "5601" "Kibana HTTP"
}

verify_thehive() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - TheHive"

    check_service "${ip}" "thehive" "TheHive service"
    check_service "${ip}" "cassandra" "Cassandra database"

    # Check TheHive API
    if ssh "root@${ip}" "curl -s http://localhost:9000/api/status 2>/dev/null | grep -q OK" &>/dev/null; then
        check_pass "TheHive API responding"
    else
        check_warn "TheHive API not responding"
    fi

    check_port "${ip}" "9000" "TheHive HTTP"
}

verify_cortex() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - Cortex"

    check_service "${ip}" "cortex" "Cortex service"

    # Check Cortex API
    if ssh "root@${ip}" "curl -s http://localhost:9001/api/status 2>/dev/null | grep -q OK" &>/dev/null; then
        check_pass "Cortex API responding"
    else
        check_warn "Cortex API not responding"
    fi

    check_port "${ip}" "9001" "Cortex HTTP"
}

verify_soc_sync() {
    local ip=$1
    local hostname=$2

    host_header "${hostname} - SOC Sync"

    check_file_exists "${ip}" "/opt/soc/soc_sync.sh" "SOC sync script"
    check_file_exists "${ip}" "/opt/soc/config.yaml" "SOC configuration"
    check_file_exists "${ip}" "/etc/cron.d/soc-sync" "SOC cron job"

    check_directory_exists "${ip}" "/opt/soc/logs" "SOC logs directory"
    check_directory_exists "${ip}" "/opt/soc/reports" "SOC reports directory"
}

################################################################################
# Full Host Verification
################################################################################

verify_vmi01() {
    section_header "VMI01 (MCP/AI Primary) - ${VMI01_IP}"

    verify_nftables "${VMI01_IP}" "VMI01"
    verify_suricata "${VMI01_IP}" "VMI01"
    verify_crowdsec "${VMI01_IP}" "VMI01"
    verify_falco "${VMI01_IP}" "VMI01"
    verify_wazuh_agent "${VMI01_IP}" "VMI01"
    verify_soc_sync "${VMI01_IP}" "VMI01"
}

verify_vmi02d() {
    section_header "VMI02D (Data/CDN Standby) - ${VMI02D_IP}"

    verify_nftables "${VMI02D_IP}" "VMI02D"
    verify_suricata "${VMI02D_IP}" "VMI02D"
    verify_crowdsec "${VMI02D_IP}" "VMI02D"
    verify_falco "${VMI02D_IP}" "VMI02D"
    verify_wazuh_agent "${VMI02D_IP}" "VMI02D"
    verify_soc_sync "${VMI02D_IP}" "VMI02D"
}

verify_vmi03() {
    section_header "VMI03 (Gateway/SOC Hub) - ${VMI03_IP}"

    verify_nftables "${VMI03_IP}" "VMI03"
    verify_suricata "${VMI03_IP}" "VMI03"
    verify_crowdsec "${VMI03_IP}" "VMI03"
    verify_falco "${VMI03_IP}" "VMI03"
    verify_wazuh_manager "${VMI03_IP}" "VMI03"
    verify_elasticsearch "${VMI03_IP}" "VMI03"
    verify_kibana "${VMI03_IP}" "VMI03"
    verify_thehive "${VMI03_IP}" "VMI03"
    verify_cortex "${VMI03_IP}" "VMI03"
    verify_soc_sync "${VMI03_IP}" "VMI03"
}

################################################################################
# Summary Report
################################################################################

print_summary() {
    section_header "Verification Summary"

    local pass_rate=0
    if [[ ${TOTAL_CHECKS} -gt 0 ]]; then
        pass_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    fi

    echo -e "${BOLD}Total Checks:${NC}    ${TOTAL_CHECKS}"
    echo -e "${GREEN}${BOLD}Passed:${NC}          ${PASSED_CHECKS}"
    echo -e "${RED}${BOLD}Failed:${NC}          ${FAILED_CHECKS}"
    echo -e "${YELLOW}${BOLD}Warnings:${NC}        ${WARNING_CHECKS}"
    echo ""
    echo -e "${BOLD}Pass Rate:${NC}       ${pass_rate}%"
    echo ""

    if [[ ${FAILED_CHECKS} -eq 0 ]] && [[ ${WARNING_CHECKS} -eq 0 ]]; then
        echo -e "${GREEN}${BOLD}✓ All checks passed - SOC infrastructure is healthy${NC}"
        return 0
    elif [[ ${FAILED_CHECKS} -eq 0 ]]; then
        echo -e "${YELLOW}${BOLD}⚠ All checks passed with warnings - review warnings above${NC}"
        return 0
    else
        echo -e "${RED}${BOLD}✗ Some checks failed - see failures above${NC}"
        return 1
    fi
}

################################################################################
# Main
################################################################################

main() {
    clear
    cat <<'BANNER'
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║              SOC Infrastructure Verification                          ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
BANNER

    echo ""
    echo -e "${BLUE}Verification mode: ${VERIFICATION_MODE}${NC}"
    echo ""

    # Verify all hosts
    verify_vmi01
    verify_vmi02d
    verify_vmi03

    # Print summary
    print_summary
}

# Run main function
main "$@"
