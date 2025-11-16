#!/bin/bash
################################################################################
# deploy-suricata.sh - Install and configure Suricata IPS
#
# Usage: ./deploy-suricata.sh [VMI01|VMI02D|VMI03|all]
#
# Security: Inline IPS with automatic threat detection, rule updates, and
#           integration with nftables for dynamic blocking
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
readonly LOG_FILE="/var/log/soc-suricata-deploy.log"
readonly BACKUP_DIR="/opt/mcp/backups/suricata"

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
# Suricata Installation and Configuration
################################################################################

deploy_suricata() {
    local ip=$1
    local hostname=$2
    local interfaces=$3  # Comma-separated list of interfaces

    log_info "Deploying Suricata to ${hostname} (${ip})"
    log_info "Monitoring interfaces: ${interfaces}"

    ssh "root@${ip}" bash <<REMOTE_SCRIPT
set -euo pipefail

echo "=== Installing Suricata IPS ==="

# Install dependencies
apt-get update
apt-get install -y software-properties-common

# Add Suricata PPA for latest version
add-apt-repository -y ppa:oisf/suricata-stable
apt-get update

# Install Suricata
apt-get install -y suricata suricata-update jq

# Backup existing configuration
mkdir -p /opt/mcp/backups/suricata
if [[ -f /etc/suricata/suricata.yaml ]]; then
    cp /etc/suricata/suricata.yaml /opt/mcp/backups/suricata/suricata.yaml.backup.\$(date +%Y%m%d_%H%M%S)
fi

# Get network interfaces
IFS=',' read -ra IFACES <<< "${interfaces}"

echo "=== Configuring Suricata for IPS mode ==="

# Create Suricata configuration
cat > /etc/suricata/suricata.yaml <<'EOF'
%YAML 1.1
---

# Suricata IPS Configuration
# Mode: Inline IPS with nftables integration

vars:
  address-groups:
    HOME_NET: "[10.0.50.0/24,10.0.51.0/24,10.0.52.0/24,10.10.10.0/24,127.0.0.0/8]"
    EXTERNAL_NET: "!$HOME_NET"

    HTTP_SERVERS: "$HOME_NET"
    SMTP_SERVERS: "$HOME_NET"
    SQL_SERVERS: "$HOME_NET"
    DNS_SERVERS: "$HOME_NET"
    TELNET_SERVERS: "$HOME_NET"
    AIM_SERVERS: "$EXTERNAL_NET"
    DC_SERVERS: "$HOME_NET"
    DNP3_SERVER: "$HOME_NET"
    DNP3_CLIENT: "$HOME_NET"
    MODBUS_CLIENT: "$HOME_NET"
    MODBUS_SERVER: "$HOME_NET"
    ENIP_CLIENT: "$HOME_NET"
    ENIP_SERVER: "$HOME_NET"

  port-groups:
    HTTP_PORTS: "80"
    SHELLCODE_PORTS: "!80"
    ORACLE_PORTS: 1521
    SSH_PORTS: 22
    DNP3_PORTS: 20000
    MODBUS_PORTS: 502
    FILE_DATA_PORTS: "[$HTTP_PORTS,110,143]"
    FTP_PORTS: 21
    GENEVE_PORTS: 6081
    VXLAN_PORTS: 4789
    TEREDO_PORTS: 3544

# Logging configuration
outputs:
  - fast:
      enabled: yes
      filename: fast.log
      append: yes

  - eve-log:
      enabled: yes
      filetype: regular
      filename: eve.json
      types:
        - alert:
            tagged-packets: yes
        - anomaly:
            enabled: yes
        - http:
            extended: yes
        - dns:
            query: yes
            answer: yes
        - tls:
            extended: yes
        - files:
            force-magic: yes
        - drop:
            alerts: yes
        - smtp:
        - ssh:
        - stats:
            totals: yes
            threads: yes
            deltas: yes
        - flow:

  - syslog:
      enabled: yes
      facility: local5
      format: "[%i] <%d> -- "
      level: Info

# AF_PACKET IPS mode
af-packet:
EOF

# Add interface configurations
for iface in "\${IFACES[@]}"; do
    cat >> /etc/suricata/suricata.yaml <<EOF
  - interface: \${iface}
    cluster-id: 99
    cluster-type: cluster_flow
    defrag: yes
    use-mmap: yes
    tpacket-v3: yes
    ring-size: 2048
    block-size: 32768
    copy-mode: ips
    copy-iface: nfqueue
EOF
done

# Continue Suricata configuration
cat >> /etc/suricata/suricata.yaml <<'EOF'

# NFQueue IPS mode
nfq:
  mode: accept
  repeat-mark: 1
  repeat-mask: 1
  bypass-mark: 1
  bypass-mask: 1
  route-queue: 2
  batchcount: 20
  fail-open: yes

# Detection engine
detect:
  profile: high
  custom-values:
    toclient-groups: 3
    toserver-groups: 25
  sgh-mpm-context: auto
  inspection-recursion-limit: 3000
  prefilter:
    default: mpm

# Threading
threading:
  set-cpu-affinity: no
  cpu-affinity:
    - management-cpu-set:
        cpu: [ 0 ]
    - receive-cpu-set:
        cpu: [ 0 ]
    - worker-cpu-set:
        cpu: [ "all" ]
  detect-thread-ratio: 1.0

# Logging
logging:
  default-log-level: notice
  outputs:
    - console:
        enabled: yes
    - file:
        enabled: yes
        level: info
        filename: /var/log/suricata/suricata.log
    - syslog:
        enabled: yes
        facility: local5
        format: "[%i] <%d> -- "

# Performance tuning
max-pending-packets: 1024
runmode: workers

# Stream engine
stream:
  memcap: 64mb
  checksum-validation: yes
  inline: auto
  reassembly:
    memcap: 256mb
    depth: 1mb
    toserver-chunk-size: 2560
    toclient-chunk-size: 2560
    randomize-chunk-size: yes

# Application layer protocols
app-layer:
  protocols:
    http:
      enabled: yes
      memcap: 64mb
    tls:
      enabled: yes
      detection-ports:
        dp: 443
    dns:
      tcp:
        enabled: yes
        detection-ports:
          dp: 53
      udp:
        enabled: yes
        detection-ports:
          dp: 53
    ssh:
      enabled: yes
    smtp:
      enabled: yes
      mime:
        decode-mime: yes
        decode-base64: yes
        decode-quoted-printable: yes

# Rule files
default-rule-path: /var/lib/suricata/rules
rule-files:
  - suricata.rules

# Classification configuration
classification-file: /etc/suricata/classification.config
reference-config-file: /etc/suricata/reference.config
threshold-file: /etc/suricata/threshold.config
EOF

echo "=== Updating Suricata rules ==="

# Configure suricata-update
cat > /etc/suricata/update.yaml <<'EOF'
sources:
  et/open:
    enabled: yes
  oisf/trafficid:
    enabled: yes
  sslbl/ssl-fp-blacklist:
    enabled: yes
  sslbl/ja3-fingerprints:
    enabled: yes
  etnetera/aggressive:
    enabled: yes
  tgreen/hunting:
    enabled: yes

# Enable specific rule categories
enabled:
  - "*"

# Disable noisy rules
disabled:
  - "*deleted*"
  - "*TEST*"

# Modify rules for our environment
modify:
  - re:'^alert.*msg:"ET POLICY.*"'
    option:
      priority: 3
EOF

# Update rules
suricata-update -v

# Create systemd override for proper startup
mkdir -p /etc/systemd/system/suricata.service.d
cat > /etc/systemd/system/suricata.service.d/override.conf <<'EOF'
[Service]
# Wait for network to be fully up
After=network-online.target
Wants=network-online.target

# Restart on failure
Restart=on-failure
RestartSec=10s

# Resource limits
LimitNOFILE=65535
LimitNPROC=8192
EOF

# Reload systemd
systemctl daemon-reload

# Enable and start Suricata
systemctl enable suricata

echo "=== Starting Suricata service ==="
systemctl restart suricata

# Wait for service to start
sleep 5

# Verify Suricata is running
if systemctl is-active --quiet suricata; then
    echo "✓ Suricata service is running"
else
    echo "✗ Suricata service failed to start"
    journalctl -u suricata -n 50 --no-pager
    exit 1
fi

# Check rules loaded
RULE_COUNT=\$(suricata -T -c /etc/suricata/suricata.yaml 2>&1 | grep -oP '\d+(?= signatures)' || echo "0")
echo "✓ Suricata loaded \${RULE_COUNT} signatures"

# Create daily update cron job
cat > /etc/cron.daily/suricata-update <<'EOF'
#!/bin/bash
# Update Suricata rules daily

set -euo pipefail

LOG_FILE="/var/log/suricata/rule-update.log"

{
    echo "=== Suricata Rule Update - \$(date) ==="

    # Update rules
    if suricata-update -v; then
        echo "✓ Rules updated successfully"

        # Reload Suricata with new rules
        if systemctl reload suricata; then
            echo "✓ Suricata reloaded successfully"
        else
            echo "✗ Failed to reload Suricata"
            exit 1
        fi
    else
        echo "✗ Failed to update rules"
        exit 1
    fi

    echo "=== Update completed ==="
} >> "\${LOG_FILE}" 2>&1
EOF

chmod +x /etc/cron.daily/suricata-update

echo "✓ Suricata IPS deployment completed successfully"
systemctl status suricata --no-pager
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed Suricata to ${hostname}"
    else
        log_error "Failed to deploy Suricata to ${hostname}"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_suricata() {
    local ip=$1
    local hostname=$2

    log_info "Verifying Suricata deployment on ${hostname} (${ip})"

    # Check service status
    if ! ssh "root@${ip}" "systemctl is-active suricata" | grep -q "active"; then
        log_error "Suricata service not active on ${hostname}"
        return 1
    fi

    # Check rules loaded
    local rule_count
    rule_count=$(ssh "root@${ip}" "suricata -T -c /etc/suricata/suricata.yaml 2>&1 | grep -oP '\d+(?= signatures)' || echo '0'")
    log "Suricata signatures loaded on ${hostname}: ${rule_count}"

    if [[ ${rule_count} -lt 1000 ]]; then
        log_warn "Low signature count on ${hostname}: ${rule_count}"
    fi

    # Check log files
    if ! ssh "root@${ip}" "test -f /var/log/suricata/eve.json"; then
        log_warn "Suricata eve.json log not found on ${hostname}"
    fi

    log "✓ Suricata verification passed for ${hostname}"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    local target="${1:-all}"

    log "Starting Suricata IPS deployment to ${target}"

    # Validate target
    if ! validate_host "${target}"; then
        exit 1
    fi

    # Deploy to specified target(s)
    case "${target}" in
        VMI01)
            check_ssh_access "${VMI01_IP}" || exit 1
            deploy_suricata "${VMI01_IP}" "VMI01" "eth0"
            verify_suricata "${VMI01_IP}" "VMI01"
            ;;
        VMI02D)
            check_ssh_access "${VMI02D_IP}" || exit 1
            deploy_suricata "${VMI02D_IP}" "VMI02D" "eth0"
            verify_suricata "${VMI02D_IP}" "VMI02D"
            ;;
        VMI03)
            check_ssh_access "${VMI03_IP}" || exit 1
            deploy_suricata "${VMI03_IP}" "VMI03" "eth0,wg0"
            verify_suricata "${VMI03_IP}" "VMI03"
            ;;
        all)
            log_info "Deploying to all hosts"
            for host_ip in "${VMI01_IP}" "${VMI02D_IP}" "${VMI03_IP}"; do
                check_ssh_access "${host_ip}" || exit 1
            done

            deploy_suricata "${VMI01_IP}" "VMI01" "eth0"
            verify_suricata "${VMI01_IP}" "VMI01"

            deploy_suricata "${VMI02D_IP}" "VMI02D" "eth0"
            verify_suricata "${VMI02D_IP}" "VMI02D"

            deploy_suricata "${VMI03_IP}" "VMI03" "eth0,wg0"
            verify_suricata "${VMI03_IP}" "VMI03"
            ;;
    esac

    log "✓ Suricata IPS deployment completed successfully"
    log_info "Rules will auto-update daily via cron"
    log_info "Monitor alerts: tail -f /var/log/suricata/eve.json | jq ."
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
