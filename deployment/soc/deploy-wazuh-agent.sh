#!/bin/bash
################################################################################
# deploy-wazuh-agent.sh - Install Wazuh agent on VMI01/VMI02D
#
# Usage: ./deploy-wazuh-agent.sh [VMI01|VMI02D|all]
#
# Security: Lightweight agent for log forwarding, FIM, and security monitoring
#           to Wazuh Manager on VMI03
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
readonly LOG_FILE="/var/log/soc-wazuh-agent-deploy.log"
readonly BACKUP_DIR="/opt/mcp/backups/wazuh"

# VM Configuration
readonly VMI01_IP="46.250.243.123"
readonly VMI02D_IP="46.250.241.70"
readonly VMI03_IP="154.26.158.31"  # Manager IP
readonly WAZUH_MANAGER_IP="10.0.52.1"  # VPN IP of VMI03

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
    if [[ ! "${host}" =~ ^(VMI01|VMI02D|all)$ ]]; then
        log_error "Invalid host: ${host}. Must be VMI01, VMI02D, or all"
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
# Wazuh Agent Installation
################################################################################

deploy_wazuh_agent() {
    local ip=$1
    local hostname=$2
    local manager_ip=${WAZUH_MANAGER_IP}

    log_info "Deploying Wazuh Agent to ${hostname} (${ip})"
    log_info "Manager IP: ${manager_ip}"

    ssh "root@${ip}" bash <<REMOTE_SCRIPT
set -euo pipefail

echo "=== Installing Wazuh Agent ==="

# Install dependencies
apt-get update
apt-get install -y curl gnupg lsb-release apt-transport-https

# Backup existing configuration
mkdir -p /opt/mcp/backups/wazuh
if [[ -d /var/ossec ]]; then
    cp -r /var/ossec/etc /opt/mcp/backups/wazuh/ossec-etc.backup.\$(date +%Y%m%d_%H%M%S) || true
fi

# Add Wazuh repository
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --dearmor -o /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | \\
    tee /etc/apt/sources.list.d/wazuh.list

# Update package list
apt-get update

# Install Wazuh Agent
WAZUH_MANAGER="${manager_ip}" apt-get install -y wazuh-agent

echo "=== Configuring Wazuh Agent ==="

# Configure ossec.conf
cat > /var/ossec/etc/ossec.conf <<'EOF'
<ossec_config>
  <client>
    <server>
      <address>${manager_ip}</address>
      <port>1514</port>
      <protocol>tcp</protocol>
    </server>
    <config-profile>ubuntu, ubuntu24.04</config-profile>
    <notify_time>10</notify_time>
    <time-reconnect>60</time-reconnect>
    <auto_restart>yes</auto_restart>
    <crypto_method>aes</crypto_method>
  </client>

  <client_buffer>
    <disabled>no</disabled>
    <queue_size>5000</queue_size>
    <events_per_second>500</events_per_second>
  </client_buffer>

  <!-- File Integrity Monitoring -->
  <syscheck>
    <disabled>no</disabled>
    <frequency>43200</frequency>
    <scan_on_start>yes</scan_on_start>

    <!-- System critical files -->
    <directories check_all="yes" realtime="yes">/etc,/usr/bin,/usr/sbin</directories>
    <directories check_all="yes" realtime="yes">/bin,/sbin,/boot</directories>

    <!-- SSH keys and configs -->
    <directories check_all="yes" realtime="yes">/root/.ssh,/home/*/.ssh</directories>

    <!-- MCP configurations -->
    <directories check_all="yes" realtime="yes">/opt/mcp</directories>

    <!-- PostgreSQL data directory (if exists) -->
    <directories check_all="yes" realtime="no">/var/lib/postgresql</directories>

    <!-- Nginx configs (if exists) -->
    <directories check_all="yes" realtime="yes">/etc/nginx</directories>

    <!-- Ignore frequently changing files -->
    <ignore>/etc/mtab</ignore>
    <ignore>/etc/hosts.deny</ignore>
    <ignore>/etc/random-seed</ignore>
    <ignore>/etc/random.seed</ignore>
    <ignore>/etc/adjtime</ignore>
    <ignore type="sregex">.log\$|.swp\$</ignore>
  </syscheck>

  <!-- Rootkit Detection -->
  <rootcheck>
    <disabled>no</disabled>
    <check_files>yes</check_files>
    <check_trojans>yes</check_trojans>
    <check_dev>yes</check_dev>
    <check_sys>yes</check_sys>
    <check_pids>yes</check_pids>
    <check_ports>yes</check_ports>
    <check_if>yes</check_if>
    <frequency>43200</frequency>
    <rootkit_files>/var/ossec/etc/shared/rootkit_files.txt</rootkit_files>
    <rootkit_trojans>/var/ossec/etc/shared/rootkit_trojans.txt</rootkit_trojans>
    <skip_nfs>yes</skip_nfs>
  </rootcheck>

  <!-- Security Configuration Assessment -->
  <sca>
    <enabled>yes</enabled>
    <scan_on_start>yes</scan_on_start>
    <interval>12h</interval>
    <skip_nfs>yes</skip_nfs>
  </sca>

  <!-- Vulnerability Detector (agent-side) -->
  <vulnerability-detector>
    <enabled>yes</enabled>
    <interval>5m</interval>
    <min_full_scan_interval>6h</min_full_scan_interval>
    <run_on_start>yes</run_on_start>
  </vulnerability-detector>

  <!-- System inventory -->
  <wodle name="syscollector">
    <disabled>no</disabled>
    <interval>1h</interval>
    <scan_on_start>yes</scan_on_start>
    <hardware>yes</hardware>
    <os>yes</os>
    <network>yes</network>
    <packages>yes</packages>
    <ports all="no">yes</ports>
    <processes>yes</processes>
  </wodle>

  <!-- Log analysis -->
  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/syslog</location>
  </localfile>

  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/auth.log</location>
  </localfile>

  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/kern.log</location>
  </localfile>

  <!-- Suricata logs -->
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/suricata/eve.json</location>
  </localfile>

  <!-- Falco logs -->
  <localfile>
    <log_format>json</log_format>
    <location>/var/log/falco/events.log</location>
  </localfile>

  <!-- CrowdSec logs -->
  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/crowdsec.log</location>
  </localfile>

  <!-- PostgreSQL logs (if exists) -->
  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/postgresql/postgresql-*.log</location>
  </localfile>

  <!-- Nginx logs (if exists) -->
  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/nginx/access.log</location>
  </localfile>

  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/nginx/error.log</location>
  </localfile>

  <!-- MCP service logs -->
  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/mcp/*.log</location>
  </localfile>

  <!-- Active Response -->
  <active-response>
    <disabled>no</disabled>
  </active-response>

  <labels>
    <label key="node.name">${hostname}</label>
    <label key="node.role">\$(hostname | grep -q "vmi01" && echo "primary" || echo "standby")</label>
    <label key="environment">production</label>
  </labels>

</ossec_config>
EOF

# Replace manager IP placeholder
sed -i "s/\\\${manager_ip}/${manager_ip}/" /var/ossec/etc/ossec.conf
sed -i "s/\\\${hostname}/${hostname}/" /var/ossec/etc/ossec.conf

# Set permissions
chown root:wazuh /var/ossec/etc/ossec.conf
chmod 640 /var/ossec/etc/ossec.conf

# Enable and start Wazuh Agent
systemctl daemon-reload
systemctl enable wazuh-agent
systemctl restart wazuh-agent

# Wait for service to start
sleep 5

# Verify Wazuh Agent is running
if systemctl is-active --quiet wazuh-agent; then
    echo "✓ Wazuh Agent service is running"
else
    echo "✗ Wazuh Agent service failed to start"
    journalctl -u wazuh-agent -n 50 --no-pager
    exit 1
fi

# Check agent status
if /var/ossec/bin/wazuh-control status | grep -q "wazuh-agentd"; then
    echo "✓ Wazuh Agent daemon running"
else
    echo "✗ Wazuh Agent daemon not running"
    /var/ossec/bin/wazuh-control status
    exit 1
fi

# Check connection to manager
sleep 5
if grep -q "Connected to the server" /var/ossec/logs/ossec.log 2>/dev/null; then
    echo "✓ Wazuh Agent connected to manager"
else
    echo "⚠ Wazuh Agent not yet connected to manager (this is normal on first install)"
    echo "   The agent needs to be registered on the manager first"
    tail -20 /var/ossec/logs/ossec.log
fi

# Create monitoring script
cat > /usr/local/bin/wazuh-agent-status.sh <<'EOF'
#!/bin/bash
# Wazuh Agent Status Report

echo "=== Wazuh Agent Status - \$(date) ==="
echo ""

echo "Service Status:"
systemctl status wazuh-agent --no-pager | head -10
echo ""

echo "Process Status:"
/var/ossec/bin/wazuh-control status
echo ""

echo "Connection Status:"
grep -i "connected" /var/ossec/logs/ossec.log | tail -5
echo ""

echo "Recent Log Entries:"
tail -20 /var/ossec/logs/ossec.log
echo ""
EOF

chmod +x /usr/local/bin/wazuh-agent-status.sh

echo ""
echo "✓ Wazuh Agent deployment completed successfully"
echo ""
echo "=== IMPORTANT: Agent Registration Required ==="
echo "On the Wazuh Manager (VMI03), run:"
echo ""
echo "  /var/ossec/bin/manage_agents"
echo ""
echo "Then select 'A' to add agent, enter hostname: ${hostname}"
echo "Or use automatic registration with authd password"
echo ""

systemctl status wazuh-agent --no-pager
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed Wazuh Agent to ${hostname}"
    else
        log_error "Failed to deploy Wazuh Agent to ${hostname}"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_wazuh_agent() {
    local ip=$1
    local hostname=$2

    log_info "Verifying Wazuh Agent deployment on ${hostname} (${ip})"

    # Check service status
    if ! ssh "root@${ip}" "systemctl is-active wazuh-agent" | grep -q "active"; then
        log_error "Wazuh Agent service not active on ${hostname}"
        return 1
    fi

    # Check processes
    if ! ssh "root@${ip}" "/var/ossec/bin/wazuh-control status" | grep -q "is running"; then
        log_error "Wazuh Agent processes not running on ${hostname}"
        return 1
    fi

    log "✓ Wazuh Agent verification passed for ${hostname}"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    local target="${1:-all}"

    log "Starting Wazuh Agent deployment to ${target}"
    log "Manager IP: ${WAZUH_MANAGER_IP}"

    # Validate target
    if ! validate_host "${target}"; then
        exit 1
    fi

    # Deploy to specified target(s)
    case "${target}" in
        VMI01)
            check_ssh_access "${VMI01_IP}" || exit 1
            deploy_wazuh_agent "${VMI01_IP}" "VMI01"
            verify_wazuh_agent "${VMI01_IP}" "VMI01"
            ;;
        VMI02D)
            check_ssh_access "${VMI02D_IP}" || exit 1
            deploy_wazuh_agent "${VMI02D_IP}" "VMI02D"
            verify_wazuh_agent "${VMI02D_IP}" "VMI02D"
            ;;
        all)
            log_info "Deploying to all agent hosts"
            check_ssh_access "${VMI01_IP}" || exit 1
            check_ssh_access "${VMI02D_IP}" || exit 1

            deploy_wazuh_agent "${VMI01_IP}" "VMI01"
            verify_wazuh_agent "${VMI01_IP}" "VMI01"

            deploy_wazuh_agent "${VMI02D_IP}" "VMI02D"
            verify_wazuh_agent "${VMI02D_IP}" "VMI02D"
            ;;
    esac

    log "✓ Wazuh Agent deployment completed successfully"
    log_warn "IMPORTANT: Agents must be registered on the manager"
    log_info "On VMI03, run: /var/ossec/bin/manage_agents"
    log_info "View agent status: ssh root@<host> '/usr/local/bin/wazuh-agent-status.sh'"
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
