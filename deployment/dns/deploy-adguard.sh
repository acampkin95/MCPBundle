#!/bin/bash
set -euo pipefail

# AdGuard Home Deployment Script for VMI03 (154.26.158.31)
# Production-ready DNS filtering with VPN integration

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
readonly ADGUARD_VERSION="0.107.43"
readonly ADGUARD_HOME="/opt/adguard"
readonly ADGUARD_CONFIG="${ADGUARD_HOME}/AdGuardHome.yaml"
readonly ADGUARD_DATA="${ADGUARD_HOME}/data"
readonly ADGUARD_WORK="${ADGUARD_HOME}/work"
readonly ADGUARD_WEB_PORT="3030"
readonly ADGUARD_DNS_PORT="53"
readonly CREDENTIALS_FILE="${ADGUARD_HOME}/credentials.txt"

# VM IPs
readonly VMI03_IP="154.26.158.31"
readonly VPN_DNS_IP="10.10.10.1"
readonly WG_NET1="10.0.50.3"
readonly WG_NET2="10.0.51.3"
readonly WG_NET3="10.0.52.3"

# Admin credentials
readonly ADMIN_USER="admin"
readonly ADMIN_PASSWORD="$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)"
readonly ADMIN_PASSWORD_HASH="$(echo -n "${ADMIN_PASSWORD}" | htpasswd -niB -C 10 admin | cut -d: -f2)"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Error handler
cleanup_on_error() {
    log_error "Deployment failed. Rolling back changes..."
    systemctl stop adguard-home 2>/dev/null || true
    systemctl disable adguard-home 2>/dev/null || true
    exit 1
}

trap cleanup_on_error ERR

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

log_info "Starting AdGuard Home ${ADGUARD_VERSION} deployment on VMI03..."

# Install dependencies
log_info "Installing dependencies..."
apt-get update -qq
apt-get install -y -qq \
    wget \
    curl \
    apache2-utils \
    net-tools \
    bind9-dnsutils \
    jq
log_success "Dependencies installed"

# Stop systemd-resolved if running (conflicts with DNS on port 53)
if systemctl is-active --quiet systemd-resolved; then
    log_warn "systemd-resolved is running on port 53, stopping it..."
    systemctl stop systemd-resolved
    systemctl disable systemd-resolved

    # Update resolv.conf to use upstream DNS
    rm -f /etc/resolv.conf
    cat > /etc/resolv.conf <<EOF
nameserver 1.1.1.1
nameserver 8.8.8.8
EOF

    log_success "systemd-resolved stopped"
fi

# Create directory structure
log_info "Creating directory structure..."
mkdir -p "${ADGUARD_HOME}"
mkdir -p "${ADGUARD_DATA}"
mkdir -p "${ADGUARD_WORK}"
mkdir -p /tmp/adguard_install
log_success "Directory structure created"

# Download and install AdGuard Home
log_info "Downloading AdGuard Home ${ADGUARD_VERSION}..."
cd /tmp/adguard_install

ARCH="amd64"
if [[ $(uname -m) == "aarch64" ]]; then
    ARCH="arm64"
fi

DOWNLOAD_URL="https://github.com/AdguardTeam/AdGuardHome/releases/download/v${ADGUARD_VERSION}/AdGuardHome_linux_${ARCH}.tar.gz"

if [[ ! -f "AdGuardHome_linux_${ARCH}.tar.gz" ]]; then
    wget "${DOWNLOAD_URL}" -O "AdGuardHome_linux_${ARCH}.tar.gz"
    log_success "Downloaded AdGuard Home archive"
else
    log_info "AdGuard Home archive already exists, skipping download"
fi

log_info "Extracting AdGuard Home..."
tar xzf "AdGuardHome_linux_${ARCH}.tar.gz"

log_info "Installing AdGuard Home..."
cp AdGuardHome/AdGuardHome /usr/local/bin/
chmod +x /usr/local/bin/AdGuardHome
log_success "AdGuard Home installed"

# Create configuration
log_info "Creating AdGuard Home configuration..."
cat > "${ADGUARD_CONFIG}" <<EOF
bind_host: 0.0.0.0
bind_port: ${ADGUARD_WEB_PORT}
beta_bind_port: 0
users:
  - name: ${ADMIN_USER}
    password: ${ADMIN_PASSWORD_HASH}
auth_attempts: 5
block_auth_min: 15
http_proxy: ""
language: en
theme: auto
debug_pprof: false
web_session_ttl: 720
dns:
  bind_hosts:
    - 0.0.0.0
  port: ${ADGUARD_DNS_PORT}
  anonymize_client_ip: false
  protection_enabled: true
  blocking_mode: default
  blocking_ipv4: ""
  blocking_ipv6: ""
  blocked_response_ttl: 10
  parental_block_host: family-block.dns.adguard.com
  safebrowsing_block_host: standard-block.dns.adguard.com
  ratelimit: 20
  ratelimit_whitelist: []
  refuse_any: true
  upstream_dns:
    - https://dns.cloudflare.com/dns-query
    - https://dns.google/dns-query
    - 1.1.1.1
    - 8.8.8.8
  upstream_dns_file: ""
  bootstrap_dns:
    - 1.1.1.1
    - 8.8.8.8
  all_servers: false
  fastest_addr: false
  fastest_timeout: 1s
  allowed_clients: []
  disallowed_clients: []
  blocked_hosts:
    - version.bind
    - id.server
    - hostname.bind
  trusted_proxies:
    - 127.0.0.0/8
    - ::1/128
  cache_size: 4194304
  cache_ttl_min: 0
  cache_ttl_max: 0
  cache_optimistic: false
  bogus_nxdomain: []
  aaaa_disabled: false
  enable_dnssec: true
  edns_client_subnet: false
  max_goroutines: 300
  handle_ddr: true
  ipset: []
  ipset_file: ""
  filtering_enabled: true
  filters_update_interval: 24
  parental_enabled: false
  safesearch_enabled: false
  safebrowsing_enabled: false
  safebrowsing_cache_size: 1048576
  safesearch_cache_size: 1048576
  parental_cache_size: 1048576
  cache_time: 30
  rewrites: []
  blocked_services: []
  upstream_timeout: 10s
  private_networks: []
  use_private_ptr_resolvers: true
  local_ptr_upstreams: []
  use_dns64: false
  dns64_prefixes: []
  serve_http3: false
  use_http3_upstreams: false
tls:
  enabled: false
  server_name: ""
  force_https: false
  port_https: 443
  port_dns_over_tls: 853
  port_dns_over_quic: 784
  port_dnscrypt: 0
  dnscrypt_config_file: ""
  allow_unencrypted_doh: false
  certificate_chain: ""
  private_key: ""
  certificate_path: ""
  private_key_path: ""
  strict_sni_check: false
filters:
  - enabled: true
    url: https://big.oisd.nl
    name: OISD Full
    id: 1
  - enabled: true
    url: https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
    name: StevenBlack Unified
    id: 2
  - enabled: true
    url: https://o0.pages.dev/Lite/adblock.txt
    name: 1Hosts Lite
    id: 3
  - enabled: true
    url: https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt
    name: AdGuard DNS filter
    id: 4
whitelist_filters: []
user_rules:
  # Whitelist development domains
  - '@@||github.io^'
  - '@@||githubusercontent.com^'
  - '@@||cloudflare.com^'
  - '@@||cloudflare-dns.com^'
  - '@@||google-analytics.com^'
  - '@@||googletagmanager.com^'
  - '@@||doubleclick.net^'
  # Whitelist MCP infrastructure
  - '@@||prometheus.io^'
  - '@@||grafana.com^'
  - '@@||grafana.net^'
dhcp:
  enabled: false
  interface_name: ""
  local_domain_name: lan
  dhcpv4:
    gateway_ip: ""
    subnet_mask: ""
    range_start: ""
    range_end: ""
    lease_duration: 86400
    icmp_timeout_msec: 1000
    options: []
  dhcpv6:
    range_start: ""
    lease_duration: 86400
    ra_slaac_only: false
    ra_allow_slaac: false
clients:
  runtime_sources:
    whois: true
    arp: true
    rdns: true
    dhcp: true
    hosts: true
  persistent: []
log_file: ""
log_max_backups: 0
log_max_size: 100
log_max_age: 3
log_compress: false
log_localtime: false
verbose: false
os:
  group: ""
  user: ""
  rlimit_nofile: 0
schema_version: 27
EOF

log_success "AdGuard Home configuration created"

# Set ownership
log_info "Setting file permissions..."
chown -R root:root "${ADGUARD_HOME}"
chmod 755 "${ADGUARD_HOME}"
chmod 644 "${ADGUARD_CONFIG}"
log_success "Permissions set"

# Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/adguard-home.service <<EOF
[Unit]
Description=AdGuard Home DNS Ad Blocker
Documentation=https://github.com/AdguardTeam/AdGuardHome
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${ADGUARD_HOME}
ExecStart=/usr/local/bin/AdGuardHome -c ${ADGUARD_CONFIG} -w ${ADGUARD_WORK} --no-check-update
Restart=always
RestartSec=5
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

# Hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${ADGUARD_HOME}
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

log_success "Systemd service created"

# Create Prometheus metrics exporter configuration
log_info "Configuring Prometheus metrics..."
cat > "${ADGUARD_HOME}/prometheus-config.txt" <<EOF
# AdGuard Home Prometheus Metrics
# Access metrics at: http://${VMI03_IP}:${ADGUARD_WEB_PORT}/control/stats

# Add to Prometheus scrape config:
# - job_name: 'adguard'
#   static_configs:
#     - targets:
#         - '${VMI03_IP}:${ADGUARD_WEB_PORT}'
#       labels:
#         environment: 'production'
#         instance: 'vmi03-adguard'
#   metrics_path: '/control/stats'
#   params:
#     format: ['prometheus']
EOF

log_success "Prometheus metrics configuration created"

# Enable and start service
log_info "Enabling and starting AdGuard Home service..."
systemctl daemon-reload
systemctl enable adguard-home
systemctl restart adguard-home

# Wait for service to start
sleep 5

# Check service status
if systemctl is-active --quiet adguard-home; then
    log_success "AdGuard Home service is running"
else
    log_error "AdGuard Home service failed to start"
    journalctl -u adguard-home -n 50 --no-pager
    exit 1
fi

# Configure firewall (if UFW is active)
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
    log_info "Configuring firewall..."

    # Allow DNS from WireGuard networks
    ufw allow from 10.0.50.0/24 to any port ${ADGUARD_DNS_PORT} proto udp comment 'AdGuard DNS from WireGuard'
    ufw allow from 10.0.50.0/24 to any port ${ADGUARD_DNS_PORT} proto tcp comment 'AdGuard DNS from WireGuard'
    ufw allow from 10.0.51.0/24 to any port ${ADGUARD_DNS_PORT} proto udp comment 'AdGuard DNS from WireGuard'
    ufw allow from 10.0.51.0/24 to any port ${ADGUARD_DNS_PORT} proto tcp comment 'AdGuard DNS from WireGuard'
    ufw allow from 10.0.52.0/24 to any port ${ADGUARD_DNS_PORT} proto udp comment 'AdGuard DNS from WireGuard'
    ufw allow from 10.0.52.0/24 to any port ${ADGUARD_DNS_PORT} proto tcp comment 'AdGuard DNS from WireGuard'

    # Allow web interface from WireGuard
    ufw allow from 10.0.50.0/24 to any port ${ADGUARD_WEB_PORT} comment 'AdGuard Web from WireGuard'
    ufw allow from 10.0.51.0/24 to any port ${ADGUARD_WEB_PORT} comment 'AdGuard Web from WireGuard'
    ufw allow from 10.0.52.0/24 to any port ${ADGUARD_WEB_PORT} comment 'AdGuard Web from WireGuard'

    log_success "Firewall rules added"
fi

# Test DNS resolution
log_info "Testing DNS resolution..."
if dig @localhost google.com +short > /dev/null 2>&1; then
    log_success "DNS resolution working"
else
    log_warn "DNS resolution test failed"
fi

# Update WireGuard configurations
log_info "Generating WireGuard DNS configuration updates..."
cat > "${ADGUARD_HOME}/wireguard-dns-update.txt" <<EOF
# WireGuard DNS Configuration Update
# Add this to each WireGuard client configuration:

[Interface]
DNS = ${VPN_DNS_IP}

# Alternative: Use specific WireGuard interface IPs
# DNS = ${WG_NET1}  # For wg0
# DNS = ${WG_NET2}  # For wg1
# DNS = ${WG_NET3}  # For wg2

# If you have existing WireGuard configs, update them with:
# sed -i '/^DNS/d' /etc/wireguard/wg*.conf
# echo "DNS = ${VPN_DNS_IP}" >> /etc/wireguard/wg0.conf
# systemctl restart wg-quick@wg0
EOF

log_success "WireGuard DNS update instructions created"

# Create health check script
log_info "Creating health check script..."
cat > "${ADGUARD_HOME}/health-check.sh" <<'EOF'
#!/bin/bash
# AdGuard Home Health Check Script

set -euo pipefail

readonly ADGUARD_URL="http://localhost:3030"
readonly DNS_SERVER="127.0.0.1"

check_web_interface() {
    if curl -sf "${ADGUARD_URL}/control/status" > /dev/null; then
        echo "[OK] Web Interface"
        return 0
    else
        echo "[FAIL] Web Interface"
        return 1
    fi
}

check_dns_resolution() {
    if dig @${DNS_SERVER} google.com +short > /dev/null 2>&1; then
        echo "[OK] DNS Resolution"
        return 0
    else
        echo "[FAIL] DNS Resolution"
        return 1
    fi
}

check_dns_filtering() {
    # Test if known ad domain is blocked
    local result=$(dig @${DNS_SERVER} ads.google.com +short)
    if [[ -n "${result}" ]] && [[ "${result}" =~ ^0\.0\.0\.0$ || "${result}" =~ ^127\.0\.0\.1$ ]]; then
        echo "[OK] DNS Filtering (ads blocked)"
        return 0
    else
        echo "[WARN] DNS Filtering (may not be working)"
        return 1
    fi
}

echo "=== AdGuard Home Health Check ==="
echo

# Check web interface
check_web_interface
web_status=$?

# Check DNS resolution
check_dns_resolution
dns_status=$?

# Check DNS filtering
check_dns_filtering
filter_status=$?

# Get statistics
if command -v curl &> /dev/null; then
    stats=$(curl -sf "${ADGUARD_URL}/control/stats" 2>/dev/null || echo "{}")
    queries=$(echo "${stats}" | jq -r '.num_dns_queries // 0')
    blocked=$(echo "${stats}" | jq -r '.num_blocked_filtering // 0')
    echo "[INFO] Total queries: ${queries}"
    echo "[INFO] Blocked queries: ${blocked}"
fi

# Overall status
echo
if [[ ${web_status} -eq 0 && ${dns_status} -eq 0 ]]; then
    echo "=== Overall Status: HEALTHY ==="
    exit 0
else
    echo "=== Overall Status: UNHEALTHY ==="
    exit 1
fi
EOF

chmod +x "${ADGUARD_HOME}/health-check.sh"
log_success "Health check script created"

# Run health check
log_info "Running health check..."
if "${ADGUARD_HOME}/health-check.sh"; then
    log_success "Health check passed"
else
    log_warn "Health check reported issues"
fi

# Save credentials
log_info "Saving credentials..."
cat > "${CREDENTIALS_FILE}" <<EOF
# AdGuard Home Credentials - Generated $(date)
# KEEP THIS FILE SECURE!

Admin Username: ${ADMIN_USER}
Admin Password: ${ADMIN_PASSWORD}

Web Interface: http://${VMI03_IP}:${ADGUARD_WEB_PORT}
DNS Server IPs:
  - ${VPN_DNS_IP} (VPN virtual IP)
  - ${WG_NET1} (WireGuard wg0)
  - ${WG_NET2} (WireGuard wg1)
  - ${WG_NET3} (WireGuard wg2)

DNS Port: ${ADGUARD_DNS_PORT}
Web Port: ${ADGUARD_WEB_PORT}

Configuration: ${ADGUARD_CONFIG}
EOF

chmod 600 "${CREDENTIALS_FILE}"
chown root:root "${CREDENTIALS_FILE}"
log_success "Credentials saved to ${CREDENTIALS_FILE}"

# Cleanup
rm -rf /tmp/adguard_install

# Print summary
cat <<EOF

${GREEN}╔════════════════════════════════════════════════════════════════╗
║         AdGuard Home Deployment Complete!                     ║
╚════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Installation Details:${NC}
  Version:        ${ADGUARD_VERSION}
  Home Directory: ${ADGUARD_HOME}
  Configuration:  ${ADGUARD_CONFIG}
  Web UI:         http://${VMI03_IP}:${ADGUARD_WEB_PORT}
  Credentials:    ${CREDENTIALS_FILE}

${BLUE}Login Credentials:${NC}
  Username:       ${ADMIN_USER}
  Password:       ${ADMIN_PASSWORD}

${BLUE}DNS Server IPs:${NC}
  VPN DNS:        ${VPN_DNS_IP}
  WireGuard wg0:  ${WG_NET1}
  WireGuard wg1:  ${WG_NET2}
  WireGuard wg2:  ${WG_NET3}
  DNS Port:       ${ADGUARD_DNS_PORT}

${BLUE}Service Management:${NC}
  Status:         systemctl status adguard-home
  Start:          systemctl start adguard-home
  Stop:           systemctl stop adguard-home
  Restart:        systemctl restart adguard-home
  Logs:           journalctl -u adguard-home -f
  Health Check:   ${ADGUARD_HOME}/health-check.sh

${BLUE}Active Blocklists:${NC}
  1. OISD Full (comprehensive blocking)
  2. StevenBlack Unified (malware + ads)
  3. 1Hosts Lite (balanced blocking)
  4. AdGuard DNS filter (official list)

${BLUE}Whitelisted Domains:${NC}
  - *.github.io, *.githubusercontent.com
  - *.cloudflare.com, *.cloudflare-dns.com
  - Analytics domains (for debugging)
  - MCP infrastructure domains

${BLUE}Upstream DNS:${NC}
  Primary:   Cloudflare DNS over HTTPS (1.1.1.1)
  Secondary: Google DNS over HTTPS (8.8.8.8)
  DNSSEC:    Enabled

${BLUE}WireGuard Integration:${NC}
  See: ${ADGUARD_HOME}/wireguard-dns-update.txt

  Quick update for existing configs:
    sed -i '/^DNS/d' /etc/wireguard/wg0.conf
    echo "DNS = ${VPN_DNS_IP}" >> /etc/wireguard/wg0.conf
    systemctl restart wg-quick@wg0

${BLUE}Prometheus Metrics:${NC}
  Endpoint: http://${VMI03_IP}:${ADGUARD_WEB_PORT}/control/stats
  See: ${ADGUARD_HOME}/prometheus-config.txt

${BLUE}Next Steps:${NC}
  1. Login to web interface: http://${VMI03_IP}:${ADGUARD_WEB_PORT}
  2. Update WireGuard client configs with DNS = ${VPN_DNS_IP}
  3. Verify DNS filtering is working: dig @${VPN_DNS_IP} ads.google.com
  4. Configure custom filtering rules if needed
  5. Set up query logging for analysis
  6. Add AdGuard metrics to Prometheus

${YELLOW}Testing DNS:${NC}
  Test DNS resolution:
    dig @${VPN_DNS_IP} google.com

  Test ad blocking (should return 0.0.0.0):
    dig @${VPN_DNS_IP} ads.google.com

  Test from client with VPN:
    nslookup google.com

${YELLOW}Security Notes:${NC}
  - Change admin password after first login
  - Enable rate limiting to prevent DNS amplification
  - Monitor query logs for suspicious activity
  - Keep blocklists updated (automatic every 24h)
  - Credentials stored in: ${CREDENTIALS_FILE}

EOF

log_success "AdGuard Home deployment completed successfully!"
