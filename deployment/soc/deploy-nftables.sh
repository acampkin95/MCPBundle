#!/bin/bash
################################################################################
# deploy-nftables.sh - Deploy nftables firewall with per-host rules
#
# Usage: ./deploy-nftables.sh [VMI01|VMI02D|VMI03|all]
#
# Security: Multi-layer firewall with IP whitelisting, VPN mesh, and service-
#           specific port controls per node
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
readonly LOG_FILE="/var/log/soc-nftables-deploy.log"
readonly BACKUP_DIR="/opt/mcp/backups/nftables"

# VM Configuration
readonly VMI01_IP="46.250.243.123"
readonly VMI02D_IP="46.250.241.70"
readonly VMI03_IP="154.26.158.31"

# Network ranges
readonly WHITELIST_IP="58.105.139.107"
readonly VPN_MESH1="10.0.50.0/24"
readonly VPN_MESH2="10.0.51.0/24"
readonly VPN_MESH3="10.0.52.0/24"
readonly USER_VPN="10.10.10.0/24"

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
        log_warn "Rolling back to previous nftables configuration..."
        if [[ -f "${BACKUP_DIR}/nftables.conf.backup" ]]; then
            ssh "root@${CURRENT_HOST}" "cp ${BACKUP_DIR}/nftables.conf.backup /etc/nftables.conf && nft -f /etc/nftables.conf" || true
        fi
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
# VMI01 Configuration (MCP/AI Primary)
################################################################################

deploy_vmi01_nftables() {
    log_info "Deploying nftables configuration for VMI01 (${VMI01_IP})"

    ssh "root@${VMI01_IP}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

# Install nftables
apt-get update
apt-get install -y nftables

# Backup existing configuration
mkdir -p /opt/mcp/backups/nftables
if [[ -f /etc/nftables.conf ]]; then
    cp /etc/nftables.conf /opt/mcp/backups/nftables/nftables.conf.backup.$(date +%Y%m%d_%H%M%S)
fi

# Create nftables directory structure
mkdir -p /etc/nftables.d

# Main configuration
cat > /etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f
# VMI01 (MCP/AI Primary) - nftables firewall configuration

flush ruleset

include "/etc/nftables.d/*.nft"
EOF

# Base rules for VMI01
cat > /etc/nftables.d/base.nft <<'EOF'
table inet filter {
    # Drop invalid packets
    chain input {
        type filter hook input priority filter; policy drop;

        # Allow established/related connections
        ct state established,related accept
        ct state invalid drop

        # Allow loopback
        iif lo accept

        # Allow ICMP (ping)
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept

        # WHITELIST: Full access from management IP
        ip saddr 58.105.139.107 accept

        # SSH access (from whitelist + VPN)
        tcp dport 22 ip saddr { 58.105.139.107, 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # PostgreSQL (VPN mesh only)
        tcp dport 5432 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24 } accept

        # Redis (localhost only - handled by lo accept)
        tcp dport 6379 ip saddr 127.0.0.1 accept

        # MCP Services (VPN mesh only)
        tcp dport 3000-3002 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24 } accept

        # PgBouncer (VPN mesh only)
        tcp dport 6432 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24 } accept

        # Suricata IPS drop chain (populated by Suricata)
        jump suricata_drop

        # Log dropped packets
        limit rate 5/minute log prefix "NFT_DROP_INPUT: " flags all counter
        counter drop
    }

    chain forward {
        type filter hook forward priority filter; policy drop;

        # Allow established/related
        ct state established,related accept
        ct state invalid drop

        # VPN forwarding
        iifname "wg0" oifname "eth0" accept
        iifname "eth0" oifname "wg0" accept

        # Suricata IPS drop chain
        jump suricata_drop

        counter drop
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }

    # Placeholder for Suricata IPS drops
    chain suricata_drop {
    }
}
EOF

# Rate limiting chain
cat > /etc/nftables.d/ratelimit.nft <<'EOF'
table inet ratelimit {
    set ssh_bruteforce {
        type ipv4_addr
        flags timeout
        timeout 1h
    }

    chain input {
        type filter hook input priority -10; policy accept;

        # SSH brute force protection
        tcp dport 22 ct state new add @ssh_bruteforce { ip saddr limit rate over 5/minute } drop
    }
}
EOF

# Enable and start nftables
systemctl enable nftables
nft -f /etc/nftables.conf

# Verify rules loaded
if nft list ruleset | grep -q "table inet filter"; then
    echo "✓ nftables rules loaded successfully for VMI01"
else
    echo "✗ Failed to load nftables rules"
    exit 1
fi

systemctl restart nftables
systemctl status nftables --no-pager
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed nftables to VMI01"
    else
        log_error "Failed to deploy nftables to VMI01"
        return 1
    fi
}

################################################################################
# VMI02D Configuration (Data/CDN Standby)
################################################################################

deploy_vmi02d_nftables() {
    log_info "Deploying nftables configuration for VMI02D (${VMI02D_IP})"

    ssh "root@${VMI02D_IP}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

# Install nftables
apt-get update
apt-get install -y nftables

# Backup existing configuration
mkdir -p /opt/mcp/backups/nftables
if [[ -f /etc/nftables.conf ]]; then
    cp /etc/nftables.conf /opt/mcp/backups/nftables/nftables.conf.backup.$(date +%Y%m%d_%H%M%S)
fi

# Create nftables directory structure
mkdir -p /etc/nftables.d

# Main configuration
cat > /etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f
# VMI02D (Data/CDN Standby) - nftables firewall configuration

flush ruleset

include "/etc/nftables.d/*.nft"
EOF

# Base rules for VMI02D
cat > /etc/nftables.d/base.nft <<'EOF'
table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        # Allow established/related connections
        ct state established,related accept
        ct state invalid drop

        # Allow loopback
        iif lo accept

        # Allow ICMP (ping)
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept

        # WHITELIST: Full access from management IP
        ip saddr 58.105.139.107 accept

        # SSH access (from whitelist + VPN)
        tcp dport 22 ip saddr { 58.105.139.107, 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # NextCloud HTTPS (public)
        tcp dport 443 accept

        # Plex Media Server (public)
        tcp dport 32400 accept

        # PostgreSQL (VMI01 only for replication)
        tcp dport 5432 ip saddr 46.250.243.123 accept

        # Elasticsearch (VMI03 only)
        tcp dport 9200 ip saddr 154.26.158.31 accept

        # Suricata IPS drop chain
        jump suricata_drop

        # Log dropped packets
        limit rate 5/minute log prefix "NFT_DROP_INPUT: " flags all counter
        counter drop
    }

    chain forward {
        type filter hook forward priority filter; policy drop;

        # Allow established/related
        ct state established,related accept
        ct state invalid drop

        # VPN forwarding
        iifname "wg0" oifname "eth0" accept
        iifname "eth0" oifname "wg0" accept

        # Suricata IPS drop chain
        jump suricata_drop

        counter drop
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }

    # Placeholder for Suricata IPS drops
    chain suricata_drop {
    }
}
EOF

# Rate limiting
cat > /etc/nftables.d/ratelimit.nft <<'EOF'
table inet ratelimit {
    set ssh_bruteforce {
        type ipv4_addr
        flags timeout
        timeout 1h
    }

    set http_ratelimit {
        type ipv4_addr
        flags timeout
        timeout 5m
    }

    chain input {
        type filter hook input priority -10; policy accept;

        # SSH brute force protection
        tcp dport 22 ct state new add @ssh_bruteforce { ip saddr limit rate over 5/minute } drop

        # HTTP rate limiting
        tcp dport { 80, 443 } ct state new add @http_ratelimit { ip saddr limit rate over 100/second } drop
    }
}
EOF

# Enable and start nftables
systemctl enable nftables
nft -f /etc/nftables.conf

# Verify rules loaded
if nft list ruleset | grep -q "table inet filter"; then
    echo "✓ nftables rules loaded successfully for VMI02D"
else
    echo "✗ Failed to load nftables rules"
    exit 1
fi

systemctl restart nftables
systemctl status nftables --no-pager
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed nftables to VMI02D"
    else
        log_error "Failed to deploy nftables to VMI02D"
        return 1
    fi
}

################################################################################
# VMI03 Configuration (Gateway/SOC Hub)
################################################################################

deploy_vmi03_nftables() {
    log_info "Deploying nftables configuration for VMI03 (${VMI03_IP})"

    ssh "root@${VMI03_IP}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

# Install nftables
apt-get update
apt-get install -y nftables

# Backup existing configuration
mkdir -p /opt/mcp/backups/nftables
if [[ -f /etc/nftables.conf ]]; then
    cp /etc/nftables.conf /opt/mcp/backups/nftables/nftables.conf.backup.$(date +%Y%m%d_%H%M%S)
fi

# Create nftables directory structure
mkdir -p /etc/nftables.d

# Main configuration
cat > /etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f
# VMI03 (Gateway/SOC Hub) - nftables firewall configuration

flush ruleset

include "/etc/nftables.d/*.nft"
EOF

# Base rules for VMI03
cat > /etc/nftables.d/base.nft <<'EOF'
table inet filter {
    chain input {
        type filter hook input priority filter; policy drop;

        # Allow established/related connections
        ct state established,related accept
        ct state invalid drop

        # Allow loopback
        iif lo accept

        # Allow ICMP (ping)
        ip protocol icmp accept
        ip6 nexthdr icmpv6 accept

        # WHITELIST: Full access from management IP
        ip saddr 58.105.139.107 accept

        # SSH access (from whitelist + VPN)
        tcp dport 22 ip saddr { 58.105.139.107, 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # HTTP/HTTPS (public - for HAProxy, Nginx)
        tcp dport { 80, 443 } accept

        # Keycloak SSO (public)
        tcp dport 8443 accept

        # WireGuard VPN (public)
        udp dport 51820 accept

        # === SOC Services (VPN only) ===

        # Kibana (VPN only)
        tcp dport 5601 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # TheHive (VPN only)
        tcp dport 9000 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # Cortex (VPN only)
        tcp dport 9001 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # Grafana (VPN only)
        tcp dport 3000 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # Prometheus (VPN only)
        tcp dport 9090 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # HAProxy Stats (VPN only)
        tcp dport 8404 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # AdGuard Home (VPN only)
        tcp dport 3030 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept
        udp dport 53 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept
        tcp dport 53 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24, 10.10.10.0/24 } accept

        # Wazuh Manager API (VPN only)
        tcp dport 55000 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24 } accept

        # Wazuh Agent enrollment (VPN mesh only)
        tcp dport 1514 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24 } accept
        tcp dport 1515 ip saddr { 10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24 } accept

        # Elasticsearch (localhost only for Wazuh/Kibana)
        tcp dport 9200 ip saddr 127.0.0.1 accept

        # Suricata IPS drop chain
        jump suricata_drop

        # Log dropped packets
        limit rate 10/minute log prefix "NFT_DROP_INPUT: " flags all counter
        counter drop
    }

    chain forward {
        type filter hook forward priority filter; policy drop;

        # Allow established/related
        ct state established,related accept
        ct state invalid drop

        # VPN forwarding (WireGuard)
        iifname "wg0" oifname "eth0" accept
        iifname "eth0" oifname "wg0" ct state established,related accept

        # VPN mesh forwarding
        iifname "wg1" oifname "eth0" accept
        iifname "eth0" oifname "wg1" accept
        iifname "wg2" oifname "eth0" accept
        iifname "eth0" oifname "wg2" accept

        # Suricata IPS drop chain
        jump suricata_drop

        counter drop
    }

    chain output {
        type filter hook output priority filter; policy accept;
    }

    # Placeholder for Suricata IPS drops
    chain suricata_drop {
    }
}
EOF

# Rate limiting
cat > /etc/nftables.d/ratelimit.nft <<'EOF'
table inet ratelimit {
    set ssh_bruteforce {
        type ipv4_addr
        flags timeout
        timeout 1h
    }

    set http_ratelimit {
        type ipv4_addr
        flags timeout
        timeout 5m
    }

    set keycloak_ratelimit {
        type ipv4_addr
        flags timeout
        timeout 5m
    }

    chain input {
        type filter hook input priority -10; policy accept;

        # SSH brute force protection
        tcp dport 22 ct state new add @ssh_bruteforce { ip saddr limit rate over 5/minute } drop

        # HTTP rate limiting
        tcp dport { 80, 443 } ct state new add @http_ratelimit { ip saddr limit rate over 100/second } drop

        # Keycloak authentication rate limiting
        tcp dport 8443 ct state new add @keycloak_ratelimit { ip saddr limit rate over 20/minute } drop
    }
}
EOF

# NAT for VPN clients
cat > /etc/nftables.d/nat.nft <<'EOF'
table inet nat {
    chain postrouting {
        type nat hook postrouting priority srcnat; policy accept;

        # NAT for user VPN clients
        oifname "eth0" ip saddr 10.10.10.0/24 masquerade
    }
}
EOF

# Enable and start nftables
systemctl enable nftables
nft -f /etc/nftables.conf

# Verify rules loaded
if nft list ruleset | grep -q "table inet filter"; then
    echo "✓ nftables rules loaded successfully for VMI03"
else
    echo "✗ Failed to load nftables rules"
    exit 1
fi

systemctl restart nftables
systemctl status nftables --no-pager
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed nftables to VMI03"
    else
        log_error "Failed to deploy nftables to VMI03"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_nftables() {
    local ip=$1
    local hostname=$2

    log_info "Verifying nftables deployment on ${hostname} (${ip})"

    # Check service status
    if ! ssh "root@${ip}" "systemctl is-active nftables" | grep -q "active"; then
        log_error "nftables service not active on ${hostname}"
        return 1
    fi

    # Check rules loaded
    if ! ssh "root@${ip}" "nft list ruleset | grep -q 'table inet filter'"; then
        log_error "nftables rules not loaded on ${hostname}"
        return 1
    fi

    # Count rules
    local rule_count
    rule_count=$(ssh "root@${ip}" "nft list ruleset | wc -l")
    log "nftables rules on ${hostname}: ${rule_count} lines"

    # Check specific chains exist
    for chain in input forward output suricata_drop; do
        if ! ssh "root@${ip}" "nft list ruleset | grep -q 'chain ${chain}'"; then
            log_warn "Chain '${chain}' not found on ${hostname}"
        fi
    done

    log "✓ nftables verification passed for ${hostname}"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    local target="${1:-all}"

    log "Starting nftables deployment to ${target}"
    log "Target: ${target}"
    log "Whitelist IP: ${WHITELIST_IP}"
    log "VPN Mesh: ${VPN_MESH1}, ${VPN_MESH2}, ${VPN_MESH3}"
    log "User VPN: ${USER_VPN}"

    # Validate target
    if ! validate_host "${target}"; then
        exit 1
    fi

    # Deploy to specified target(s)
    case "${target}" in
        VMI01)
            check_ssh_access "${VMI01_IP}" || exit 1
            CURRENT_HOST="${VMI01_IP}"
            deploy_vmi01_nftables
            verify_nftables "${VMI01_IP}" "VMI01"
            ;;
        VMI02D)
            check_ssh_access "${VMI02D_IP}" || exit 1
            CURRENT_HOST="${VMI02D_IP}"
            deploy_vmi02d_nftables
            verify_nftables "${VMI02D_IP}" "VMI02D"
            ;;
        VMI03)
            check_ssh_access "${VMI03_IP}" || exit 1
            CURRENT_HOST="${VMI03_IP}"
            deploy_vmi03_nftables
            verify_nftables "${VMI03_IP}" "VMI03"
            ;;
        all)
            log_info "Deploying to all hosts"
            for host_ip in "${VMI01_IP}" "${VMI02D_IP}" "${VMI03_IP}"; do
                check_ssh_access "${host_ip}" || exit 1
            done

            CURRENT_HOST="${VMI01_IP}"
            deploy_vmi01_nftables
            verify_nftables "${VMI01_IP}" "VMI01"

            CURRENT_HOST="${VMI02D_IP}"
            deploy_vmi02d_nftables
            verify_nftables "${VMI02D_IP}" "VMI02D"

            CURRENT_HOST="${VMI03_IP}"
            deploy_vmi03_nftables
            verify_nftables "${VMI03_IP}" "VMI03"
            ;;
    esac

    log "✓ nftables deployment completed successfully"
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
