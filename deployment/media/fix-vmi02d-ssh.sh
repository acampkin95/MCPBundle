#!/bin/bash

# VMI02D SSH Service Recovery Script
# Run this via Contabo console to restore SSH access
# Version: 1.0.0
# Date: November 9, 2025

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }

echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo -e "${BLUE}     VMI02D SSH Service Recovery Script         ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   error "This script must be run as root"
   exit 1
fi

# Step 1: Check SSH service status
log "Checking SSH service status..."
if systemctl is-active --quiet sshd; then
    log "SSH service is running"
    systemctl status sshd --no-pager | head -10
elif systemctl is-active --quiet ssh; then
    log "SSH service is running (as 'ssh')"
    systemctl status ssh --no-pager | head -10
else
    warning "SSH service is not running!"

    # Try to start SSH
    log "Attempting to start SSH service..."
    if systemctl start sshd 2>/dev/null; then
        log "SSH service started successfully (sshd)"
    elif systemctl start ssh 2>/dev/null; then
        log "SSH service started successfully (ssh)"
    else
        error "Failed to start SSH service"

        # Check if SSH is installed
        if ! command -v sshd &> /dev/null; then
            error "SSH server not installed!"
            log "Installing OpenSSH server..."
            apt-get update
            apt-get install -y openssh-server
            systemctl enable ssh
            systemctl start ssh
        fi
    fi
fi

# Step 2: Check SSH configuration
log "Checking SSH configuration..."
SSHD_CONFIG="/etc/ssh/sshd_config"

if [ -f "$SSHD_CONFIG" ]; then
    # Check critical settings
    echo ""
    info "Current SSH settings:"
    grep -E "^Port|^PermitRootLogin|^PubkeyAuthentication|^PasswordAuthentication" "$SSHD_CONFIG" || true

    # Backup config
    cp "$SSHD_CONFIG" "${SSHD_CONFIG}.backup.$(date +%Y%m%d-%H%M%S)"

    # Ensure root login is permitted
    if ! grep -q "^PermitRootLogin yes" "$SSHD_CONFIG"; then
        warning "Root login might be disabled"
        echo ""
        read -p "Enable root login? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' "$SSHD_CONFIG"
            log "Root login enabled"
        fi
    fi

    # Ensure pubkey authentication is enabled
    if ! grep -q "^PubkeyAuthentication yes" "$SSHD_CONFIG"; then
        sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' "$SSHD_CONFIG"
        log "Public key authentication enabled"
    fi
else
    error "SSH config file not found!"
fi

# Step 3: Check and fix authorized_keys
log "Checking SSH authorized_keys..."
SSH_DIR="/root/.ssh"
AUTH_KEYS="$SSH_DIR/authorized_keys"

if [ ! -d "$SSH_DIR" ]; then
    mkdir -p "$SSH_DIR"
    chmod 700 "$SSH_DIR"
    log "Created SSH directory"
fi

if [ -f "$AUTH_KEYS" ]; then
    info "Current authorized_keys entries:"
    cat "$AUTH_KEYS" | cut -c1-50
    echo ""

    # Fix permissions
    chmod 600 "$AUTH_KEYS"
    chmod 700 "$SSH_DIR"
    chown -R root:root "$SSH_DIR"
    log "Fixed SSH permissions"
else
    warning "No authorized_keys file found"
    touch "$AUTH_KEYS"
    chmod 600 "$AUTH_KEYS"
fi

# Step 4: Add SSH keys
echo ""
info "Add SSH public keys for access"
echo "Current keys in authorized_keys: $(wc -l < "$AUTH_KEYS" 2>/dev/null || echo 0)"
echo ""
echo "To add your SSH key, paste it here (or press Enter to skip):"
read -r NEW_KEY

if [ -n "$NEW_KEY" ]; then
    echo "$NEW_KEY" >> "$AUTH_KEYS"
    log "SSH key added"
fi

# Step 5: Check firewall
log "Checking firewall rules..."

if command -v ufw &> /dev/null; then
    if ufw status | grep -q "Status: active"; then
        info "UFW firewall is active"

        # Check if SSH is allowed
        if ! ufw status | grep -q "22/tcp"; then
            warning "SSH port 22 not explicitly allowed"
            ufw allow 22/tcp
            log "Added SSH rule to UFW"
        fi

        # Show current rules
        echo ""
        info "Current firewall rules:"
        ufw status numbered | head -20
    else
        info "UFW firewall is inactive"
    fi
fi

# Step 6: Check fail2ban
log "Checking fail2ban..."

if systemctl is-active --quiet fail2ban; then
    info "Fail2ban is running"

    # Check for banned IPs
    if command -v fail2ban-client &> /dev/null; then
        echo ""
        info "Currently banned IPs:"
        fail2ban-client status sshd 2>/dev/null | grep "Banned IP" || echo "No banned IPs"

        # Option to unban all
        echo ""
        read -p "Unban all IPs? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            fail2ban-client unban --all 2>/dev/null || true
            log "All IPs unbanned"
        fi
    fi
else
    info "Fail2ban is not running"
fi

# Step 7: Restart SSH service
log "Restarting SSH service..."
if systemctl restart sshd 2>/dev/null; then
    log "SSH service restarted (sshd)"
elif systemctl restart ssh 2>/dev/null; then
    log "SSH service restarted (ssh)"
fi

# Step 8: Test SSH locally
log "Testing SSH connection locally..."
if ssh -o ConnectTimeout=2 -o StrictHostKeyChecking=no root@localhost "echo 'Local SSH test successful'" 2>/dev/null; then
    log "✓ Local SSH connection works"
else
    warning "Local SSH connection failed"
fi

# Step 9: Show network information
echo ""
log "Network Information:"
echo ""
info "IP Addresses:"
ip -4 addr show | grep inet | grep -v 127.0.0.1

echo ""
info "Listening ports:"
ss -tlnp | grep -E ":22|:80|:443|:8080" | head -10

# Step 10: Summary
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}                    SUMMARY                      ${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""

# Check final SSH status
if ss -tlnp | grep -q ":22"; then
    echo -e "${GREEN}✓ SSH is listening on port 22${NC}"

    # Get server IPs
    PRIMARY_IP=$(ip -4 addr show | grep "inet " | grep -v "127.0.0.1" | head -1 | awk '{print $2}' | cut -d/ -f1)

    echo ""
    echo "You should now be able to SSH using:"
    echo -e "${BLUE}  ssh root@$PRIMARY_IP${NC}"
    echo -e "${BLUE}  ssh root@46.250.241.70${NC}"

    echo ""
    echo "From another server (VMI01/VMI03):"
    echo -e "${BLUE}  ssh root@10.0.0.2${NC}"
else
    echo -e "${RED}✗ SSH is not listening${NC}"
    echo ""
    echo "Manual troubleshooting steps:"
    echo "1. Check SSH logs: journalctl -u ssh -n 50"
    echo "2. Check system logs: tail -50 /var/log/syslog"
    echo "3. Try manual start: /usr/sbin/sshd -d"
fi

echo ""
echo "To deploy media stack after fixing SSH:"
echo "  1. Copy deployment scripts to server"
echo "  2. Run: ./deploy-media-stack.sh"
echo ""

# Optional: Add known working SSH key
echo ""
read -p "Add VMI01/VMI03 SSH keys for inter-server access? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    cat >> "$AUTH_KEYS" <<EOF
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKTjmZ3fBirdJHHKGVv+xP2xFfLzPvH5p1OqFQmICW+V vmi01-root@acdev.host
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMLo8ggD5n5V/xLcmWdeqWVJfOgpBXkPQfxXAmaGuflr vmi03-root@auth.acdev.host
EOF
    log "Added inter-server SSH keys"
fi

echo ""
log "SSH recovery script completed!"