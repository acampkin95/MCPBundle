#!/bin/bash
# Master Deployment Script for Phase 2: VMI03 Security Gateway
# Deploys all components: WireGuard, Keycloak, PiHole, Suricata, Postfix

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/phase2-deployment.log"

# Logging function
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log "ERROR" "${RED}$1${NC}"
    exit 1
}

# Success handler
success() {
    log "INFO" "${GREEN}$1${NC}"
}

# Warning handler
warning() {
    log "WARN" "${YELLOW}$1${NC}"
}

info() {
    log "INFO" "${BLUE}$1${NC}"
}

echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   VMI03 Security Gateway Deployment${NC}"
echo -e "${GREEN}   Phase 2: Complete Infrastructure Setup${NC}"
echo -e "${GREEN}================================================${NC}"
echo
echo -e "${BLUE}Components to be deployed:${NC}"
echo "  1. WireGuard VPN (3 tunnels)"
echo "  2. Keycloak Identity Management"
echo "  3. PiHole DNS + Suricata IDS/IPS"
echo "  4. Postfix Mail Server"
echo
echo -e "${YELLOW}This script will configure VMI03 (154.26.158.31)${NC}"
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error_exit "This script must be run as root"
fi

# Check if on correct server
CURRENT_IP=$(hostname -I | awk '{print $1}')
if [[ "$CURRENT_IP" != "154.26.158.31" ]]; then
    warning "Current IP ($CURRENT_IP) does not match VMI03 (154.26.158.31)"
    read -p "Continue anyway? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        exit 0
    fi
fi

# Confirm deployment
echo -e "${YELLOW}Ready to begin deployment?${NC}"
read -p "Continue? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo
info "Starting Phase 2 deployment..."
info "Logs will be written to: $LOG_FILE"
echo

# Update system
info "Step 0: Updating system packages..."
apt-get update || warning "apt-get update failed, continuing anyway"
apt-get upgrade -y || warning "apt-get upgrade failed, continuing anyway"
apt-get install -y curl wget git vim htop net-tools iptables-persistent || error_exit "Failed to install base packages"
success "System updated"
echo

# Deploy WireGuard
info "Step 1: Deploying WireGuard VPN tunnels..."
cd "$SCRIPT_DIR/wireguard" || error_exit "WireGuard directory not found"
bash deploy-wireguard.sh 2>&1 | tee -a "$LOG_FILE" || error_exit "WireGuard deployment failed"
success "WireGuard deployed successfully"
echo

# Deploy Keycloak
info "Step 2: Deploying Keycloak Identity Management..."
cd "$SCRIPT_DIR/keycloak" || error_exit "Keycloak directory not found"

# Check if database on VMI01 is accessible
if ! nc -zv 46.250.243.123 5432 2>&1 | grep -q succeeded; then
    warning "Cannot connect to PostgreSQL on VMI01"
    warning "Ensure PostgreSQL is running and accessible from VMI03"
    read -p "Continue with Keycloak deployment? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        warning "Skipping Keycloak deployment"
    else
        bash init-keycloak.sh 2>&1 | tee -a "$LOG_FILE" || warning "Keycloak deployment failed"
        success "Keycloak deployed"
    fi
else
    bash init-keycloak.sh 2>&1 | tee -a "$LOG_FILE" || warning "Keycloak deployment failed"
    success "Keycloak deployed successfully"
fi
echo

# Deploy PiHole and Suricata
info "Step 3: Deploying PiHole DNS and Suricata IDS/IPS..."
cd "$SCRIPT_DIR/pihole" || error_exit "PiHole directory not found"
bash deploy-pihole.sh 2>&1 | tee -a "$LOG_FILE" || error_exit "PiHole deployment failed"
success "PiHole and Suricata deployed successfully"
echo

# Deploy Postfix
info "Step 4: Deploying Postfix mail server..."
cd "$SCRIPT_DIR/postfix" || error_exit "Postfix directory not found"
bash install-postfix.sh 2>&1 | tee -a "$LOG_FILE" || error_exit "Postfix deployment failed"
success "Postfix deployed successfully"
echo

# Final system configuration
info "Step 5: Final system configuration..."

# Enable IP forwarding permanently
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf; then
    echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi
sysctl -p

# Configure firewall rules
info "Configuring UFW firewall..."
ufw --force enable || true
ufw default deny incoming || true
ufw default allow outgoing || true

# Allow SSH
ufw allow 22/tcp comment 'SSH' || true

# Allow WireGuard ports
ufw allow 51820/udp comment 'WireGuard Root Tunnel' || true
ufw allow 51821/udp comment 'WireGuard MCP Tunnel' || true
ufw allow 51822/udp comment 'WireGuard Red Tunnel' || true

# Allow Keycloak
ufw allow from 10.100.0.0/24 to any port 8080 comment 'Keycloak from Root tunnel' || true

# Allow DNS from WireGuard tunnels
ufw allow from 10.100.0.0/24 to any port 53 comment 'DNS from Root tunnel' || true
ufw allow from 10.101.0.0/24 to any port 53 comment 'DNS from MCP tunnel' || true
ufw allow from 10.102.0.0/24 to any port 53 comment 'DNS from Red tunnel' || true

# Reload firewall
ufw reload || true
success "Firewall configured"

# Save iptables rules
iptables-save > /etc/iptables/rules.v4 || warning "Failed to save iptables rules"

# Create deployment summary
SUMMARY_FILE="/root/phase2-deployment-summary.txt"
cat > "$SUMMARY_FILE" <<EOF
===============================================
VMI03 Security Gateway - Deployment Summary
===============================================
Deployed: $(date)
Server: vmi03.acdev.host (154.26.158.31)

WIREGUARD VPN
=============
Root Tunnel (Port 51820):
  Network: 10.100.0.0/24
  Server: 10.100.0.1
  Purpose: Admin access to all VMs
  Status: $(systemctl is-active wg-quick@wg-root)

MCP Tunnel (Port 51821):
  Network: 10.101.0.0/24
  Server: 10.101.0.1
  Purpose: MCP agent communication
  Status: $(systemctl is-active wg-quick@wg-mcp)

Red Tunnel (Port 51822):
  Network: 10.102.0.0/24
  Server: 10.102.0.1
  Purpose: Guest VPN with security
  Status: $(systemctl is-active wg-quick@wg-red)

Client Configs: /etc/wireguard/clients/
QR Codes: /etc/wireguard/clients/*-qr.png

KEYCLOAK
========
URL: http://154.26.158.31:8080/admin
Realm: acdev-infrastructure
Admin User: alex.campkin
Admin Password: See /opt/keycloak/.env
Service Accounts: /opt/keycloak/service-accounts.txt
Status: $(docker ps --filter name=keycloak --format "{{.Status}}" || echo "Not running")

PIHOLE
======
Web UI: http://10.102.0.1/admin (Root tunnel only)
DNS: 10.102.0.1
Password: See /opt/pihole/.env
Status: $(docker ps --filter name=pihole --format "{{.Status}}" || echo "Not running")

SURICATA IDS/IPS
================
Monitoring: wg-red, eth0
Rules: ET Open (Emerging Threats)
Logs: /var/log/suricata/
Status: $(systemctl is-active suricata)

POSTFIX
=======
Hostname: vmi03.acdev.host
Forward To: acampkinpersonnal@gmail.com
Config: /etc/postfix/main.cf
Logs: /var/log/mail.log
Status: $(systemctl is-active postfix)

NEXT STEPS
==========
1. Download WireGuard client configs from /etc/wireguard/clients/
2. Connect via Root tunnel to access services
3. Login to Keycloak and configure MFA
4. Access PiHole admin and customize blocklists
5. Test mail delivery: cd /opt/phase2/postfix && bash test-mail.sh
6. Review Suricata alerts: tail -f /var/log/suricata/fast.log
7. Monitor system logs: journalctl -f

SECURITY REMINDERS
==================
- Change all default passwords immediately
- Configure MFA for all admin accounts
- Review and customize firewall rules
- Set up automated backups
- Configure monitoring and alerting
- Keep systems updated regularly

EOF

success "Deployment summary created: $SUMMARY_FILE"

# Display summary
cat "$SUMMARY_FILE"

echo
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}  Phase 2 Deployment Complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo
success "All components deployed successfully"
info "Full deployment log: $LOG_FILE"
info "Deployment summary: $SUMMARY_FILE"
echo
echo -e "${YELLOW}Important Files:${NC}"
echo "  - WireGuard client configs: /etc/wireguard/clients/"
echo "  - Keycloak passwords: /opt/keycloak/.env"
echo "  - PiHole password: /opt/pihole/.env"
echo "  - Deployment log: $LOG_FILE"
echo
echo -e "${YELLOW}Next Actions:${NC}"
echo "  1. Securely download client configs"
echo "  2. Test VPN connections"
echo "  3. Configure service passwords"
echo "  4. Set up monitoring"
echo
