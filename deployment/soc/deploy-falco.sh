#!/bin/bash
################################################################################
# deploy-falco.sh - Install Falco runtime security/EDR
#
# Usage: ./deploy-falco.sh [VMI01|VMI02D|VMI03|all]
#
# Security: Runtime behavioral monitoring and threat detection with kernel-level
#           visibility for detecting suspicious system calls and activities
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
readonly LOG_FILE="/var/log/soc-falco-deploy.log"
readonly BACKUP_DIR="/opt/mcp/backups/falco"

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
# Falco Installation and Configuration
################################################################################

deploy_falco() {
    local ip=$1
    local hostname=$2

    log_info "Deploying Falco to ${hostname} (${ip})"

    ssh "root@${ip}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

echo "=== Installing Falco Runtime Security ==="

# Install dependencies
apt-get update
apt-get install -y gnupg2 curl lsb-release

# Backup existing configuration
mkdir -p /opt/mcp/backups/falco
if [[ -d /etc/falco ]]; then
    cp -r /etc/falco /opt/mcp/backups/falco/falco.backup.$(date +%Y%m%d_%H%M%S)
fi

# Add Falco repository
curl -fsSL https://falco.org/repo/falcosecurity-packages.asc | \
    gpg --dearmor -o /usr/share/keyrings/falco-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/falco-archive-keyring.gpg] \
https://download.falco.org/packages/deb stable main" | \
    tee /etc/apt/sources.list.d/falcosecurity.list

# Update package list
apt-get update

# Install kernel headers for current kernel
KERNEL_VERSION=$(uname -r)
apt-get install -y linux-headers-${KERNEL_VERSION} || \
    apt-get install -y linux-headers-generic

# Install Falco
apt-get install -y falco

echo "=== Configuring Falco ==="

# Main Falco configuration
cat > /etc/falco/falco.yaml <<'EOF'
# Falco Runtime Security Configuration

# Rules files to load
rules_file:
  - /etc/falco/falco_rules.yaml
  - /etc/falco/falco_rules.local.yaml
  - /etc/falco/rules.d

# Watch config file for changes
watch_config_files: true

# JSON output for easier parsing
json_output: true
json_include_output_property: true
json_include_tags_property: true

# Output channels
stdout_output:
  enabled: true

syslog_output:
  enabled: true

file_output:
  enabled: true
  keep_alive: false
  filename: /var/log/falco/events.log

# HTTP output for forwarding to SIEM
http_output:
  enabled: false
  url: "http://localhost:9200/falco"
  user_agent: "falcosecurity/falco"

# Program output for custom handling
program_output:
  enabled: false
  keep_alive: false
  program: "jq '{text: .output}' | curl -d @- -X POST https://hooks.slack.com/services/XXX"

# gRPC output
grpc:
  enabled: false
  bind_address: "0.0.0.0:5060"
  threadiness: 8

grpc_output:
  enabled: false

# Buffering
output_timeout: 2000
outputs:
  max_burst: 1000

# Priority levels: emergency, alert, critical, error, warning, notice, informational, debug
log_stderr: true
log_syslog: true
log_level: info

priority: debug

# Buffered/unbuffered output
buffered_outputs: false

# Syscall event drops
syscall_event_drops:
  threshold: .1
  actions:
    - log
    - alert
  rate: .03333
  max_burst: 1

# Event rate limits
syscall_event_timeouts:
  max_consecutives: 1000

# Base syscalls to trace
base_syscalls:
  custom_set: []
  repair: false

# Modern BPF probe
engine:
  kind: kmod
  kmod:
    buf_size_preset: 4
    drop_failed_exit: false

# Metadata download
metadata_download:
  max_mb: 100
  chunk_wait_us: 1000
  watch_freq_sec: 1

# Webserver for healthz
webserver:
  enabled: true
  listen_port: 8765
  k8s_healthz_endpoint: /healthz
  ssl_enabled: false
  threadiness: 8

# Resource utilization
metrics:
  enabled: true
  interval: 1h
  output_file: /var/log/falco/metrics.txt
  resource_utilization_enabled: true
  kernel_event_counters_enabled: true
  libbpf_stats_enabled: true

# Load plugins
plugins:
  - name: json
    library_path: libjson.so
    init_config: ""
    open_params: ""

# Application rules tuning
load_plugins: []
EOF

# Create custom local rules
cat > /etc/falco/falco_rules.local.yaml <<'EOF'
# Custom Falco Rules for MCP Infrastructure

# Allow MCP services to access their directories
- macro: mcp_services
  condition: (proc.name in (node, npm, postgres, redis-server))

# Allow PostgreSQL operations
- rule: PostgreSQL Connection
  desc: Detect PostgreSQL connections
  condition: >
    spawned_process and
    proc.name = postgres and
    evt.type = accept
  output: >
    PostgreSQL connection accepted
    (user=%user.name command=%proc.cmdline connection=%fd.name container=%container.name)
  priority: INFO
  tags: [database, postgresql]

# Detect privilege escalation
- rule: Privilege Escalation via SUID
  desc: Detect execution of SUID binaries
  condition: >
    spawned_process and
    proc.suid != proc.uid and
    not proc.name in (sudo, su, passwd)
  output: >
    SUID binary executed
    (user=%user.name command=%proc.cmdline parent=%proc.pname container=%container.name)
  priority: WARNING
  tags: [privilege_escalation, mitre_privilege_escalation]

# Detect reverse shells
- rule: Reverse Shell Detection
  desc: Detect potential reverse shell connections
  condition: >
    spawned_process and
    proc.name in (bash, sh, zsh) and
    (proc.cmdline contains "/dev/tcp" or
     proc.cmdline contains "/dev/udp" or
     proc.cmdline contains "nc " or
     proc.cmdline contains "ncat " or
     proc.cmdline contains "socat ")
  output: >
    Potential reverse shell detected
    (user=%user.name command=%proc.cmdline parent=%proc.pname container=%container.name)
  priority: CRITICAL
  tags: [reverse_shell, mitre_execution]

# Detect cryptocurrency mining
- rule: Cryptocurrency Mining Activity
  desc: Detect cryptocurrency mining tools
  condition: >
    spawned_process and
    proc.name in (xmrig, minergate, cpuminer, ccminer, ethminer)
  output: >
    Cryptocurrency mining detected
    (user=%user.name command=%proc.cmdline container=%container.name)
  priority: CRITICAL
  tags: [cryptomining, malware]

# File integrity monitoring for critical files
- rule: Critical File Modification
  desc: Detect modifications to critical system files
  condition: >
    (modify and fd.name in (/etc/passwd, /etc/shadow, /etc/sudoers, /etc/ssh/sshd_config)) or
    (open_write and fd.name pmatch (/etc/cron*))
  output: >
    Critical system file modified
    (user=%user.name file=%fd.name command=%proc.cmdline container=%container.name)
  priority: CRITICAL
  tags: [file_integrity, mitre_persistence]

# SSH key access monitoring
- rule: SSH Key Access
  desc: Monitor access to SSH private keys
  condition: >
    open_read and
    fd.name pmatch (/home/*/.ssh/id_*, /root/.ssh/id_*) and
    not proc.name in (ssh, sshd, ssh-agent)
  output: >
    SSH private key accessed
    (user=%user.name file=%fd.name command=%proc.cmdline container=%container.name)
  priority: WARNING
  tags: [credential_access, mitre_credential_access]

# Container escape detection
- rule: Container Escape Attempt
  desc: Detect attempts to escape container
  condition: >
    spawned_process and
    container and
    (proc.cmdline contains "docker" or
     proc.cmdline contains "runc" or
     proc.cmdline contains "/var/run/docker.sock")
  output: >
    Container escape attempt detected
    (user=%user.name command=%proc.cmdline container=%container.name)
  priority: CRITICAL
  tags: [container_escape, mitre_privilege_escalation]

# Network connection to suspicious ports
- rule: Connection to Suspicious Port
  desc: Detect connections to commonly malicious ports
  condition: >
    outbound and
    fd.sport in (4444, 5555, 6666, 7777, 8888, 9999, 31337)
  output: >
    Connection to suspicious port
    (user=%user.name port=%fd.sport command=%proc.cmdline container=%container.name)
  priority: WARNING
  tags: [network, mitre_command_and_control]
EOF

# Create rules directory for additional rules
mkdir -p /etc/falco/rules.d

# Configure log rotation
cat > /etc/logrotate.d/falco <<'EOF'
/var/log/falco/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
    sharedscripts
    postrotate
        systemctl reload falco > /dev/null 2>&1 || true
    endscript
}
EOF

# Create log directory
mkdir -p /var/log/falco
chmod 755 /var/log/falco

# Create systemd override for better service management
mkdir -p /etc/systemd/system/falco.service.d
cat > /etc/systemd/system/falco.service.d/override.conf <<'EOF'
[Service]
# Restart on failure
Restart=on-failure
RestartSec=10s

# Resource limits
LimitNOFILE=65535

# Wait for network
After=network-online.target
Wants=network-online.target
EOF

# Reload systemd
systemctl daemon-reload

# Enable and start Falco
systemctl enable falco

echo "=== Starting Falco service ==="
systemctl restart falco

# Wait for service to start
sleep 5

# Verify Falco is running
if systemctl is-active --quiet falco; then
    echo "✓ Falco service is running"
else
    echo "✗ Falco service failed to start"
    journalctl -u falco -n 50 --no-pager
    exit 1
fi

# Check Falco is processing events
sleep 2
if [[ -f /var/log/falco/events.log ]]; then
    echo "✓ Falco is logging events"
else
    echo "⚠ Falco events log not yet created"
fi

# Create monitoring script
cat > /usr/local/bin/falco-report.sh <<'EOF'
#!/bin/bash
# Falco Events Report

LOG_FILE="/var/log/falco/events.log"
REPORT_FILE="/var/log/falco/daily-report.txt"

if [[ ! -f "${LOG_FILE}" ]]; then
    echo "No Falco events log found"
    exit 0
fi

{
    echo "=== Falco Daily Report - $(date) ==="
    echo ""

    echo "Critical Events (last 24h):"
    grep -i "priority.*critical" "${LOG_FILE}" | tail -20 || echo "None"
    echo ""

    echo "Warning Events (last 24h):"
    grep -i "priority.*warning" "${LOG_FILE}" | tail -20 || echo "None"
    echo ""

    echo "Top 10 Event Rules Triggered:"
    jq -r '.rule' "${LOG_FILE}" 2>/dev/null | sort | uniq -c | sort -rn | head -10 || echo "Unable to parse"
    echo ""

    echo "Top Users in Events:"
    jq -r '.output_fields."user.name"' "${LOG_FILE}" 2>/dev/null | sort | uniq -c | sort -rn | head -10 || echo "Unable to parse"
    echo ""
} > "${REPORT_FILE}"

cat "${REPORT_FILE}"
EOF

chmod +x /usr/local/bin/falco-report.sh

# Add daily reporting to cron
cat > /etc/cron.daily/falco-report <<'EOF'
#!/bin/bash
/usr/local/bin/falco-report.sh
EOF

chmod +x /etc/cron.daily/falco-report

echo "✓ Falco deployment completed successfully"
systemctl status falco --no-pager

# Display some recent events
echo ""
echo "=== Recent Falco Events ==="
if [[ -f /var/log/falco/events.log ]]; then
    tail -5 /var/log/falco/events.log | jq -C '.' 2>/dev/null || tail -5 /var/log/falco/events.log
fi
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed Falco to ${hostname}"
    else
        log_error "Failed to deploy Falco to ${hostname}"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_falco() {
    local ip=$1
    local hostname=$2

    log_info "Verifying Falco deployment on ${hostname} (${ip})"

    # Check service status
    if ! ssh "root@${ip}" "systemctl is-active falco" | grep -q "active"; then
        log_error "Falco service not active on ${hostname}"
        return 1
    fi

    # Check healthz endpoint
    if ssh "root@${ip}" "curl -s http://localhost:8765/healthz" | grep -q "ok"; then
        log "✓ Falco healthz endpoint responding on ${hostname}"
    else
        log_warn "Falco healthz endpoint not responding on ${hostname}"
    fi

    # Check log file exists
    if ! ssh "root@${ip}" "test -f /var/log/falco/events.log"; then
        log_warn "Falco events log not found on ${hostname} (may be normal if just started)"
    fi

    # Check kernel module or eBPF loaded
    if ssh "root@${ip}" "lsmod | grep -q falco"; then
        log "✓ Falco kernel module loaded on ${hostname}"
    else
        log_warn "Falco kernel module not loaded on ${hostname} (may be using eBPF)"
    fi

    log "✓ Falco verification passed for ${hostname}"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    local target="${1:-all}"

    log "Starting Falco runtime security deployment to ${target}"

    # Validate target
    if ! validate_host "${target}"; then
        exit 1
    fi

    # Deploy to specified target(s)
    case "${target}" in
        VMI01)
            check_ssh_access "${VMI01_IP}" || exit 1
            deploy_falco "${VMI01_IP}" "VMI01"
            verify_falco "${VMI01_IP}" "VMI01"
            ;;
        VMI02D)
            check_ssh_access "${VMI02D_IP}" || exit 1
            deploy_falco "${VMI02D_IP}" "VMI02D"
            verify_falco "${VMI02D_IP}" "VMI02D"
            ;;
        VMI03)
            check_ssh_access "${VMI03_IP}" || exit 1
            deploy_falco "${VMI03_IP}" "VMI03"
            verify_falco "${VMI03_IP}" "VMI03"
            ;;
        all)
            log_info "Deploying to all hosts"
            for host_ip in "${VMI01_IP}" "${VMI02D_IP}" "${VMI03_IP}"; do
                check_ssh_access "${host_ip}" || exit 1
            done

            deploy_falco "${VMI01_IP}" "VMI01"
            verify_falco "${VMI01_IP}" "VMI01"

            deploy_falco "${VMI02D_IP}" "VMI02D"
            verify_falco "${VMI02D_IP}" "VMI02D"

            deploy_falco "${VMI03_IP}" "VMI03"
            verify_falco "${VMI03_IP}" "VMI03"
            ;;
    esac

    log "✓ Falco deployment completed successfully"
    log_info "Monitor events: ssh root@<host> 'tail -f /var/log/falco/events.log | jq .'"
    log_info "View reports: ssh root@<host> '/usr/local/bin/falco-report.sh'"
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
