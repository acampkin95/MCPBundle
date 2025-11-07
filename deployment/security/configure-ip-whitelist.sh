#!/bin/bash
# ============================================================================
# MCP Ecosystem - IP Whitelisting Configuration
# ============================================================================
# Purpose: Configure IP whitelisting across all VMs and security layers
# Target: VMI01, VMI02D, VMI03
# Version: 0.2.0
#
# This script configures:
# - UFW firewall rules
# - Fail2Ban whitelist
# - PostgreSQL pg_hba.conf
# - Nginx/reverse proxy whitelist
# - Pi-Hole admin whitelist
# - Keycloak admin console whitelist
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/mcp/ip-whitelist-$(date +%Y%m%d_%H%M%S).log"

# VMs
VMI01_HOST="46.250.243.123"
VMI02D_HOST="46.250.241.70"
VMI03_HOST="154.26.158.31"

# Whitelisted IPs (customize these)
ADMIN_IP="${ADMIN_IP:-}"  # User's IP to be whitelisted
ALLOWED_NETWORKS=(
    "10.0.50.0/24"     # WireGuard root tunnel
    "10.0.51.0/24"     # WireGuard MCP tunnel
    "10.0.52.0/24"     # WireGuard red tunnel
)

# Services to protect
SERVICES=(
    "ssh:22"
    "postgresql:5432"
    "orchestrator:3000"
    "perplexity:3001"
    "it-mcp:3002"
    "keycloak:8080"
    "pihole:80"
    "grafana:3003"
    "prometheus:9090"
)

# ============================================================================
# Logging
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $*" | tee -a "$LOG_FILE"
}

# ============================================================================
# Detect Admin IP
# ============================================================================

detect_admin_ip() {
    if [ -z "$ADMIN_IP" ]; then
        log "Detecting your public IP address..."

        # Try multiple methods
        ADMIN_IP=$(curl -s ifconfig.me || \
                   curl -s icanhazip.com || \
                   curl -s ipinfo.io/ip || \
                   dig +short myip.opendns.com @resolver1.opendns.com || \
                   echo "")

        if [ -z "$ADMIN_IP" ]; then
            log_error "Could not detect public IP automatically"
            read -rp "Please enter your public IP address: " ADMIN_IP
        else
            log_success "Detected public IP: $ADMIN_IP"
            read -rp "Is this correct? (yes/no): " confirm

            if [ "$confirm" != "yes" ]; then
                read -rp "Please enter your public IP address: " ADMIN_IP
            fi
        fi
    fi

    # Validate IP format
    if [[ ! $ADMIN_IP =~ ^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
        log_error "Invalid IP address format: $ADMIN_IP"
        exit 1
    fi

    log_success "Admin IP to whitelist: $ADMIN_IP"
}

# ============================================================================
# Configure UFW Firewall
# ============================================================================

configure_ufw() {
    local target_host=$1
    log "Configuring UFW firewall on $target_host..."

    ssh "dev-admin@$target_host" bash <<EOF
set -e

# Ensure UFW is installed
if ! command -v ufw &>/dev/null; then
    sudo apt update
    sudo apt install -y ufw
fi

# Reset UFW to default state (ask for confirmation)
echo "Resetting UFW to default configuration..."

# Default policies
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH from admin IP (CRITICAL - do this first)
sudo ufw allow from $ADMIN_IP to any port 22 comment 'Admin SSH access'

# Allow SSH from VPN networks
sudo ufw allow from 10.0.50.0/24 to any port 22 comment 'SSH via root VPN'
sudo ufw allow from 10.0.51.0/24 to any port 22 comment 'SSH via MCP VPN'

# Allow WireGuard ports
sudo ufw allow 51820/udp comment 'WireGuard root tunnel'
sudo ufw allow 51821/udp comment 'WireGuard MCP tunnel'
sudo ufw allow 51822/udp comment 'WireGuard red tunnel'

# Allow inter-VM communication (all VMs in cluster)
sudo ufw allow from $VMI01_HOST comment 'VMI01 full access'
sudo ufw allow from $VMI02D_HOST comment 'VMI02D full access'
sudo ufw allow from $VMI03_HOST comment 'VMI03 full access'

# Allow VPN networks full access
sudo ufw allow from 10.0.50.0/24 comment 'Root VPN network'
sudo ufw allow from 10.0.51.0/24 comment 'MCP VPN network'
sudo ufw allow from 10.0.52.0/24 comment 'Red VPN network'

# Allow admin IP to all MCP services
sudo ufw allow from $ADMIN_IP to any port 3000 comment 'Admin - MCP Orchestrator'
sudo ufw allow from $ADMIN_IP to any port 3001 comment 'Admin - Perplexity MCP'
sudo ufw allow from $ADMIN_IP to any port 3002 comment 'Admin - IT-MCP'
sudo ufw allow from $ADMIN_IP to any port 8080 comment 'Admin - Keycloak'
sudo ufw allow from $ADMIN_IP to any port 3003 comment 'Admin - Grafana'
sudo ufw allow from $ADMIN_IP to any port 9090 comment 'Admin - Prometheus'
sudo ufw allow from $ADMIN_IP to any port 5432 comment 'Admin - PostgreSQL'

# Enable UFW
sudo ufw --force enable

echo "UFW configuration completed"
sudo ufw status numbered
EOF

    if [ $? -eq 0 ]; then
        log_success "UFW configured on $target_host"
    else
        log_error "Failed to configure UFW on $target_host"
        return 1
    fi
}

# ============================================================================
# Configure Fail2Ban Whitelist
# ============================================================================

configure_fail2ban() {
    local target_host=$1
    log "Configuring Fail2Ban whitelist on $target_host..."

    ssh "dev-admin@$target_host" bash <<EOF
set -e

# Ensure Fail2Ban is installed
if ! command -v fail2ban-client &>/dev/null; then
    sudo apt update
    sudo apt install -y fail2ban
fi

# Create custom jail configuration
sudo tee /etc/fail2ban/jail.local > /dev/null <<JAILCONF
[DEFAULT]
# Whitelist admin IP and VPN networks
ignoreip = 127.0.0.1/8 ::1 $ADMIN_IP 10.0.50.0/24 10.0.51.0/24 10.0.52.0/24 $VMI01_HOST $VMI02D_HOST $VMI03_HOST

# Ban time: 1 hour
bantime = 3600

# Find time: 10 minutes
findtime = 600

# Max retries before ban
maxretry = 5

# Email notifications (configure later)
destemail = admin@mcp-ecosystem.local
sendername = Fail2Ban-MCP
action = %(action_)s

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200

[nginx-http-auth]
enabled = true
filter = nginx-http-auth
port = http,https
logpath = /var/log/nginx/error.log

[postgresql]
enabled = true
filter = postgresql
port = 5432
logpath = /var/log/postgresql/postgresql-*-main.log
maxretry = 5
JAILCONF

# Restart Fail2Ban
sudo systemctl restart fail2ban
sudo systemctl enable fail2ban

echo "Fail2Ban configuration completed"
sudo fail2ban-client status
EOF

    if [ $? -eq 0 ]; then
        log_success "Fail2Ban configured on $target_host"
    else
        log_error "Failed to configure Fail2Ban on $target_host"
        return 1
    fi
}

# ============================================================================
# Configure PostgreSQL Access
# ============================================================================

configure_postgresql() {
    local target_host=$1
    log "Configuring PostgreSQL access control on $target_host..."

    ssh "dev-admin@$target_host" bash <<EOF
set -e

# Backup existing pg_hba.conf
sudo cp /etc/postgresql/16/main/pg_hba.conf /etc/postgresql/16/main/pg_hba.conf.backup.\$(date +%Y%m%d_%H%M%S)

# Create new pg_hba.conf with whitelist
sudo tee /etc/postgresql/16/main/pg_hba.conf > /dev/null <<PGCONF
# PostgreSQL Client Authentication Configuration File
# ====================================================

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# Local connections
local   all             postgres                                peer
local   all             all                                     peer

# Admin IP access
host    all             all             $ADMIN_IP/32           scram-sha-256

# VPN network access
host    all             all             10.0.50.0/24            scram-sha-256
host    all             all             10.0.51.0/24            scram-sha-256
host    all             all             10.0.52.0/24            scram-sha-256

# Inter-VM access
host    all             all             $VMI01_HOST/32         scram-sha-256
host    all             all             $VMI02D_HOST/32        scram-sha-256
host    all             all             $VMI03_HOST/32         scram-sha-256

# Localhost IPv4
host    all             all             127.0.0.1/32            scram-sha-256

# Localhost IPv6
host    all             all             ::1/128                 scram-sha-256

# Deny all other connections
host    all             all             0.0.0.0/0               reject
host    all             all             ::/0                    reject
PGCONF

# Reload PostgreSQL
sudo systemctl reload postgresql

echo "PostgreSQL access control configured"
EOF

    if [ $? -eq 0 ]; then
        log_success "PostgreSQL configured on $target_host"
    else
        log_error "Failed to configure PostgreSQL on $target_host"
        return 1
    fi
}

# ============================================================================
# Configure Nginx/Reverse Proxy
# ============================================================================

configure_nginx_whitelist() {
    local target_host=$1
    log "Configuring Nginx whitelist on $target_host..."

    ssh "dev-admin@$target_host" bash <<EOF
set -e

# Create whitelist configuration file
sudo mkdir -p /etc/nginx/conf.d

sudo tee /etc/nginx/conf.d/whitelist.conf > /dev/null <<NGINXCONF
# MCP Ecosystem IP Whitelist

# Admin IP
allow $ADMIN_IP;

# VPN Networks
allow 10.0.50.0/24;
allow 10.0.51.0/24;
allow 10.0.52.0/24;

# Inter-VM
allow $VMI01_HOST;
allow $VMI02D_HOST;
allow $VMI03_HOST;

# Localhost
allow 127.0.0.1;

# Deny all others
deny all;
NGINXCONF

# Test configuration
sudo nginx -t

# Reload Nginx if test passes
if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    echo "Nginx whitelist configured"
else
    echo "Nginx configuration test failed"
    exit 1
fi
EOF

    if [ $? -eq 0 ]; then
        log_success "Nginx configured on $target_host"
    else
        log_warning "Nginx not installed or configuration failed on $target_host (may not be critical)"
    fi
}

# ============================================================================
# Configure Pi-Hole Whitelist
# ============================================================================

configure_pihole() {
    log "Configuring Pi-Hole admin whitelist on VMI03..."

    ssh "dev-admin@$VMI03_HOST" bash <<EOF
set -e

# Create Pi-Hole custom whitelist for admin interface
if [ -f /etc/lighttpd/conf-available/15-pihole-admin.conf ]; then
    sudo tee /etc/lighttpd/conf-available/99-admin-whitelist.conf > /dev/null <<PICONF
# Pi-Hole Admin Interface Whitelist
\\\$HTTP["url"] =~ "^/admin" {
    \\\$HTTP["remoteip"] !~ "^($ADMIN_IP|10\.0\.50\.|10\.0\.51\.|10\.0\.52\.|127\.0\.0\.1)$" {
        url.access-deny = ( "" )
    }
}
PICONF

    sudo lighttpd-enable-mod admin-whitelist
    sudo systemctl restart lighttpd
    echo "Pi-Hole admin whitelist configured"
else
    echo "Pi-Hole not yet installed, skipping"
fi
EOF

    if [ $? -eq 0 ]; then
        log_success "Pi-Hole configured on VMI03"
    else
        log_warning "Pi-Hole configuration skipped (may not be installed yet)"
    fi
}

# ============================================================================
# Configure Keycloak Admin Console
# ============================================================================

configure_keycloak() {
    log "Configuring Keycloak admin console whitelist on VMI01..."

    ssh "dev-admin@$VMI01_HOST" bash <<EOF
set -e

# Create Keycloak proxy configuration (if using reverse proxy)
if [ -f /etc/nginx/sites-available/keycloak ]; then
    sudo tee /etc/nginx/conf.d/keycloak-admin-whitelist.conf > /dev/null <<KCCONF
# Keycloak Admin Console Whitelist
location /admin {
    # Admin IP
    allow $ADMIN_IP;

    # VPN Networks
    allow 10.0.50.0/24;
    allow 10.0.51.0/24;
    allow 10.0.52.0/24;

    # Localhost
    allow 127.0.0.1;

    deny all;

    proxy_pass http://localhost:8080;
    proxy_set_header Host \\\$host;
    proxy_set_header X-Real-IP \\\$remote_addr;
}
KCCONF

    sudo nginx -t && sudo systemctl reload nginx
    echo "Keycloak admin whitelist configured"
else
    echo "Keycloak not yet configured, skipping"
fi
EOF

    if [ $? -eq 0 ]; then
        log_success "Keycloak configured on VMI01"
    else
        log_warning "Keycloak configuration skipped (may not be installed yet)"
    fi
}

# ============================================================================
# Verify Configuration
# ============================================================================

verify_configuration() {
    log "Verifying IP whitelist configuration..."

    local checks=0
    local passed=0

    # Test SSH access
    log "Testing SSH access to VMs..."
    for host in "$VMI01_HOST" "$VMI02D_HOST" "$VMI03_HOST"; do
        ((checks++))
        if ssh -o ConnectTimeout=5 "dev-admin@$host" "echo 'SSH OK'" &>/dev/null; then
            log_success "SSH access to $host: OK"
            ((passed++))
        else
            log_error "SSH access to $host: FAILED"
        fi
    done

    # Test MCP services (if accessible)
    log "Testing MCP service access..."
    for url in "$VMI01_HOST:3000" "$VMI01_HOST:3001" "$VMI01_HOST:3002"; do
        ((checks++))
        if curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://$url/health" 2>/dev/null | grep -q "200"; then
            log_success "HTTP access to $url: OK"
            ((passed++))
        else
            log_warning "HTTP access to $url: Cannot verify (service may be down)"
        fi
    done

    echo ""
    log "Verification completed: $passed/$checks checks passed"
}

# ============================================================================
# Generate Summary Report
# ============================================================================

generate_summary() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║           IP WHITELIST CONFIGURATION COMPLETE                  ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log "Whitelisted IP: $ADMIN_IP"
    log "Whitelisted Networks:"
    for network in "${ALLOWED_NETWORKS[@]}"; do
        log "  - $network"
    done

    echo ""
    log "Configured on:"
    log "  - VMI01 ($VMI01_HOST): UFW, Fail2Ban, PostgreSQL, Nginx"
    log "  - VMI02D ($VMI02D_HOST): UFW, Fail2Ban"
    log "  - VMI03 ($VMI03_HOST): UFW, Fail2Ban, Pi-Hole"

    echo ""
    log "Security layers applied:"
    log "  ✓ UFW firewall rules"
    log "  ✓ Fail2Ban intrusion prevention"
    log "  ✓ PostgreSQL pg_hba.conf access control"
    log "  ✓ Nginx/reverse proxy whitelist"
    log "  ✓ Pi-Hole admin interface protection"
    log "  ✓ Keycloak admin console restriction"

    echo ""
    log "Next steps:"
    log "  1. Test access from your IP: $ADMIN_IP"
    log "  2. Verify you can SSH to all VMs"
    log "  3. Confirm MCP services are accessible"
    log "  4. Update whitelist if your IP changes:"
    log "     ADMIN_IP=<new-ip> $0"

    echo ""
    log "To add additional IPs, edit this script and add to ALLOWED_NETWORKS"
    log "Full log: $LOG_FILE"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║          MCP Ecosystem - IP Whitelist Configuration            ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    mkdir -p "$(dirname "$LOG_FILE")"

    log "IP whitelist configuration started"
    echo ""

    # Detect admin IP
    detect_admin_ip
    echo ""

    # Confirmation prompt
    log_warning "╔════════════════════════════════════════════════════════════════╗"
    log_warning "║                   SECURITY CONFIGURATION                       ║"
    log_warning "║                                                                ║"
    log_warning "║  This will configure IP whitelisting on all VMs              ║"
    log_warning "║  Admin IP: $ADMIN_IP"
    log_warning "║                                                                ║"
    log_warning "║  Services will be restricted to whitelisted IPs only         ║"
    log_warning "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    read -rp "Proceed with IP whitelist configuration? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log "Configuration cancelled by user"
        exit 0
    fi

    echo ""

    # Configure each VM
    for host in "$VMI01_HOST" "$VMI02D_HOST" "$VMI03_HOST"; do
        log "═══════════════════════════════════════════════════════════════"
        log "Configuring $host"
        log "═══════════════════════════════════════════════════════════════"

        configure_ufw "$host"
        configure_fail2ban "$host"

        if [ "$host" = "$VMI01_HOST" ]; then
            configure_postgresql "$host"
            configure_nginx_whitelist "$host"
            configure_keycloak
        fi

        echo ""
    done

    # Configure Pi-Hole on VMI03
    configure_pihole

    # Verify configuration
    verify_configuration

    # Generate summary
    generate_summary
}

# Run main function
main "$@"
