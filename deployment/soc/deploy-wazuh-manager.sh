#!/bin/bash
################################################################################
# deploy-wazuh-manager.sh - Install Wazuh manager on VMI03
#
# Usage: ./deploy-wazuh-manager.sh
#
# Security: Central SIEM manager for log aggregation, threat detection, and
#           compliance monitoring across all infrastructure nodes
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
readonly LOG_FILE="/var/log/soc-wazuh-manager-deploy.log"
readonly BACKUP_DIR="/opt/mcp/backups/wazuh"

# VM Configuration
readonly VMI03_IP="154.26.158.31"
readonly WAZUH_VERSION="4.9"

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
# Wazuh Manager Installation
################################################################################

deploy_wazuh_manager() {
    local ip=$1

    log_info "Deploying Wazuh Manager to VMI03 (${ip})"

    ssh "root@${ip}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

echo "=== Installing Wazuh Manager ==="

# Install dependencies
apt-get update
apt-get install -y curl gnupg lsb-release apt-transport-https

# Backup existing configuration
mkdir -p /opt/mcp/backups/wazuh
if [[ -d /var/ossec ]]; then
    cp -r /var/ossec/etc /opt/mcp/backups/wazuh/ossec-etc.backup.$(date +%Y%m%d_%H%M%S) || true
fi

# Add Wazuh repository
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --dearmor -o /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | \
    tee /etc/apt/sources.list.d/wazuh.list

# Update package list
apt-get update

# Install Wazuh Manager
apt-get install -y wazuh-manager

echo "=== Configuring Wazuh Manager ==="

# Configure ossec.conf
cat > /var/ossec/etc/ossec.conf <<'EOF'
<ossec_config>
  <global>
    <jsonout_output>yes</jsonout_output>
    <alerts_log>yes</alerts_log>
    <logall>yes</logall>
    <logall_json>yes</logall_json>
    <email_notification>no</email_notification>
    <smtp_server>localhost</smtp_server>
    <email_from>wazuh@mcp.local</email_from>
    <email_to>admin@mcp.local</email_to>
    <email_maxperhour>12</email_maxperhour>
    <email_log_source>alerts.log</email_log_source>
  </global>

  <alerts>
    <log_alert_level>3</log_alert_level>
    <email_alert_level>12</email_alert_level>
  </alerts>

  <!-- Integration with Suricata -->
  <integration>
    <name>suricata</name>
    <hook_url>/var/ossec/integrations/suricata</hook_url>
    <level>3</level>
    <alert_format>json</alert_format>
  </integration>

  <!-- Integration with Falco -->
  <integration>
    <name>custom-falco</name>
    <hook_url>/var/ossec/integrations/custom-falco</hook_url>
    <level>5</level>
    <alert_format>json</alert_format>
  </integration>

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

    <!-- Ignore frequently changing files -->
    <ignore>/etc/mtab</ignore>
    <ignore>/etc/hosts.deny</ignore>
    <ignore>/etc/mail/statistics</ignore>
    <ignore>/etc/random-seed</ignore>
    <ignore>/etc/random.seed</ignore>
    <ignore>/etc/adjtime</ignore>
    <ignore>/etc/httpd/logs</ignore>
    <ignore>/etc/utmpx</ignore>
    <ignore>/etc/wtmpx</ignore>
    <ignore>/etc/cups/certs</ignore>
    <ignore>/etc/dumpdates</ignore>
    <ignore>/etc/svc/volatile</ignore>
    <ignore type="sregex">.log$|.swp$</ignore>

    <!-- Windows registry monitoring (if needed) -->
    <windows_registry>HKEY_LOCAL_MACHINE\Software\Classes\batfile</windows_registry>
    <windows_registry>HKEY_LOCAL_MACHINE\Software\Classes\cmdfile</windows_registry>
    <windows_registry>HKEY_LOCAL_MACHINE\Software\Classes\exefile</windows_registry>
    <windows_registry>HKEY_LOCAL_MACHINE\Software\Classes\piffile</windows_registry>
    <windows_registry>HKEY_LOCAL_MACHINE\Software\Classes\AllFilesystemObjects</windows_registry>
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

  <!-- OpenSCAP -->
  <wodle name="open-scap">
    <disabled>yes</disabled>
    <timeout>1800</timeout>
    <interval>1d</interval>
    <scan-on-start>yes</scan-on-start>
  </wodle>

  <!-- CIS-CAT -->
  <wodle name="cis-cat">
    <disabled>yes</disabled>
    <timeout>1800</timeout>
    <interval>1d</interval>
    <scan-on-start>yes</scan-on-start>
  </wodle>

  <!-- Vulnerability Detector -->
  <vulnerability-detector>
    <enabled>yes</enabled>
    <interval>5m</interval>
    <min_full_scan_interval>6h</min_full_scan_interval>
    <run_on_start>yes</run_on_start>

    <!-- Ubuntu -->
    <provider name="canonical">
      <enabled>yes</enabled>
      <os>jammy</os>
      <update_interval>1h</update_interval>
    </provider>

    <!-- Debian -->
    <provider name="debian">
      <enabled>yes</enabled>
      <os>bookworm</os>
      <update_interval>1h</update_interval>
    </provider>

    <!-- RedHat -->
    <provider name="redhat">
      <enabled>yes</enabled>
      <update_interval>1h</update_interval>
    </provider>

    <!-- NVD -->
    <provider name="nvd">
      <enabled>yes</enabled>
      <update_interval>1h</update_interval>
    </provider>
  </vulnerability-detector>

  <!-- Security Configuration Assessment -->
  <sca>
    <enabled>yes</enabled>
    <scan_on_start>yes</scan_on_start>
    <interval>12h</interval>
    <skip_nfs>yes</skip_nfs>
  </sca>

  <!-- Active Response -->
  <active-response>
    <disabled>no</disabled>
    <ca_store>/var/ossec/etc/wpk_root.pem</ca_store>
  </active-response>

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

  <!-- PostgreSQL logs -->
  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/postgresql/postgresql-*.log</location>
  </localfile>

  <!-- Nginx logs -->
  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/nginx/access.log</location>
  </localfile>

  <localfile>
    <log_format>syslog</log_format>
    <location>/var/log/nginx/error.log</location>
  </localfile>

  <!-- Remote connection -->
  <remote>
    <connection>secure</connection>
    <port>1514</port>
    <protocol>tcp</protocol>
    <queue_size>131072</queue_size>
  </remote>

  <!-- Rules -->
  <ruleset>
    <decoder_dir>ruleset/decoders</decoder_dir>
    <rule_dir>ruleset/rules</rule_dir>
    <rule_exclude>0215-policy_rules.xml</rule_exclude>
    <list>etc/lists/audit-keys</list>
    <list>etc/lists/amazon/aws-eventnames</list>
    <list>etc/lists/security-eventchannel</list>

    <!-- Custom rules -->
    <rule_dir>etc/rules</rule_dir>
  </ruleset>

  <!-- Auth -->
  <auth>
    <disabled>no</disabled>
    <port>1515</port>
    <use_source_ip>yes</use_source_ip>
    <purge>yes</purge>
    <use_password>yes</use_password>
    <limit_maxagents>yes</limit_maxagents>
    <ciphers>HIGH:!ADH:!EXP:!MD5:!RC4:!3DES:!CAMELLIA:@STRENGTH</ciphers>
    <ssl_agent_ca>/var/ossec/etc/rootCA.pem</ssl_agent_ca>
    <ssl_verify_host>no</ssl_verify_host>
    <ssl_manager_cert>/var/ossec/etc/sslmanager.cert</ssl_manager_cert>
    <ssl_manager_key>/var/ossec/etc/sslmanager.key</ssl_manager_key>
    <ssl_auto_negotiate>no</ssl_auto_negotiate>
  </auth>

  <!-- Cluster configuration -->
  <cluster>
    <name>mcp-cluster</name>
    <node_name>vmi03-manager</node_name>
    <node_type>master</node_type>
    <key></key>
    <port>1516</port>
    <bind_addr>0.0.0.0</bind_addr>
    <nodes>
        <node>vmi03-manager</node>
    </nodes>
    <hidden>no</hidden>
    <disabled>yes</disabled>
  </cluster>

</ossec_config>
EOF

# Create custom rules for MCP infrastructure
mkdir -p /var/ossec/etc/rules
cat > /var/ossec/etc/rules/local_rules.xml <<'EOF'
<!-- Local rules for MCP infrastructure -->

<group name="local,mcp,">

  <!-- PostgreSQL rules -->
  <rule id="100001" level="3">
    <decoded_as>postgres</decoded_as>
    <description>PostgreSQL: Connection established</description>
    <group>postgresql,</group>
  </rule>

  <rule id="100002" level="8">
    <decoded_as>postgres</decoded_as>
    <match>FATAL</match>
    <description>PostgreSQL: Fatal error</description>
    <group>postgresql,</group>
  </rule>

  <!-- SSH rules -->
  <rule id="100010" level="10">
    <if_sid>5712</if_sid>
    <srcip>!58.105.139.107</srcip>
    <description>SSH: Successful login from non-whitelisted IP</description>
    <group>authentication_success,pci_dss_10.2.5,</group>
  </rule>

  <!-- Suricata integration -->
  <rule id="100020" level="5">
    <decoded_as>json</decoded_as>
    <field name="event_type">alert</field>
    <description>Suricata: IDS alert detected</description>
    <group>suricata,ids,</group>
  </rule>

  <rule id="100021" level="12">
    <if_sid>100020</if_sid>
    <field name="alert.severity">1</field>
    <description>Suricata: Critical severity alert</description>
    <group>suricata,ids,</group>
  </rule>

  <!-- Falco integration -->
  <rule id="100030" level="7">
    <decoded_as>json</decoded_as>
    <field name="priority">Warning</field>
    <description>Falco: Runtime security warning</description>
    <group>falco,runtime_security,</group>
  </rule>

  <rule id="100031" level="12">
    <decoded_as>json</decoded_as>
    <field name="priority">Critical</field>
    <description>Falco: Critical runtime security event</description>
    <group>falco,runtime_security,</group>
  </rule>

  <!-- MCP Service monitoring -->
  <rule id="100040" level="7">
    <match>mcp-orchestrator|itjsst-mcp|perplexity-mcp</match>
    <match>error|exception|fatal</match>
    <description>MCP Service: Error detected</description>
    <group>mcp,service_error,</group>
  </rule>

</group>
EOF

# Set permissions
chown -R wazuh:wazuh /var/ossec/etc/rules

# Enable and start Wazuh Manager
systemctl daemon-reload
systemctl enable wazuh-manager
systemctl restart wazuh-manager

# Wait for service to start
sleep 10

# Verify Wazuh Manager is running
if systemctl is-active --quiet wazuh-manager; then
    echo "✓ Wazuh Manager service is running"
else
    echo "✗ Wazuh Manager service failed to start"
    journalctl -u wazuh-manager -n 50 --no-pager
    exit 1
fi

# Check API is responding
if /var/ossec/bin/wazuh-control status | grep -q "wazuh-manager"; then
    echo "✓ Wazuh Manager processes running"
else
    echo "✗ Wazuh Manager processes not running properly"
    /var/ossec/bin/wazuh-control status
    exit 1
fi

# Display agent auth password
if [[ -f /var/ossec/etc/authd.pass ]]; then
    echo ""
    echo "=== Wazuh Agent Registration Password ==="
    cat /var/ossec/etc/authd.pass
    echo ""
    echo "Save this password for agent enrollment!"
    echo ""
fi

# Create monitoring script
cat > /usr/local/bin/wazuh-status.sh <<'EOF'
#!/bin/bash
# Wazuh Manager Status Report

echo "=== Wazuh Manager Status - $(date) ==="
echo ""

echo "Service Status:"
systemctl status wazuh-manager --no-pager | head -10
echo ""

echo "Process Status:"
/var/ossec/bin/wazuh-control status
echo ""

echo "Connected Agents:"
/var/ossec/bin/agent_control -l
echo ""

echo "Recent Alerts:"
tail -20 /var/ossec/logs/alerts/alerts.log
echo ""
EOF

chmod +x /usr/local/bin/wazuh-status.sh

echo "✓ Wazuh Manager deployment completed successfully"
systemctl status wazuh-manager --no-pager
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed Wazuh Manager to VMI03"
    else
        log_error "Failed to deploy Wazuh Manager to VMI03"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_wazuh_manager() {
    local ip=$1

    log_info "Verifying Wazuh Manager deployment on VMI03 (${ip})"

    # Check service status
    if ! ssh "root@${ip}" "systemctl is-active wazuh-manager" | grep -q "active"; then
        log_error "Wazuh Manager service not active"
        return 1
    fi

    # Check processes
    if ! ssh "root@${ip}" "/var/ossec/bin/wazuh-control status" | grep -q "is running"; then
        log_error "Wazuh Manager processes not running"
        return 1
    fi

    # Check ports listening
    if ! ssh "root@${ip}" "ss -tlnp | grep -q ':1514'"; then
        log_warn "Wazuh Manager port 1514 not listening"
    fi

    if ! ssh "root@${ip}" "ss -tlnp | grep -q ':1515'"; then
        log_warn "Wazuh Manager auth port 1515 not listening"
    fi

    log "✓ Wazuh Manager verification passed"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    log "Starting Wazuh Manager deployment to VMI03"

    # Check SSH access
    check_ssh_access "${VMI03_IP}" || exit 1

    # Deploy Wazuh Manager
    deploy_wazuh_manager "${VMI03_IP}"

    # Verify deployment
    verify_wazuh_manager "${VMI03_IP}"

    log "✓ Wazuh Manager deployment completed successfully"
    log_info "Manager IP: ${VMI03_IP}"
    log_info "Agent connection port: 1514"
    log_info "Agent enrollment port: 1515"
    log_info "View status: ssh root@${VMI03_IP} '/usr/local/bin/wazuh-status.sh'"
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
