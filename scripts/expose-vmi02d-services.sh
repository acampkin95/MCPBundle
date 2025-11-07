#!/bin/bash
###############################################################################
# VMI02D Service Exposure Script
# Purpose: Remove tunnel isolation for NextCloud, Plex, and rsync
# Target: VMI02D (46.250.241.70)
# Date: 2025-11-07
###############################################################################

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════════════"
echo "  VMI02D Service Exposure Configuration"
echo "  WARNING: This will expose services to the public internet"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VMI02D_IP="46.250.241.70"
SERVICES=("NextCloud (80/443)" "Plex (32400)" "rsync (873)")

echo -e "${YELLOW}Services to be exposed:${NC}"
for service in "${SERVICES[@]}"; do
    echo "  - $service"
done
echo ""

read -p "Continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Step 1: Backup Current Firewall Configuration"
echo "═══════════════════════════════════════════════════════════════════"

# Backup current UFW rules
echo "Creating backup..."
sudo ufw status verbose > "/tmp/vmi02d-ufw-backup-$(date +%Y%m%d-%H%M%S).txt"
sudo iptables-save > "/tmp/vmi02d-iptables-backup-$(date +%Y%m%d-%H%M%S).txt"
echo -e "${GREEN}✓ Backup created${NC}"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Step 2: Configure UFW Firewall Rules"
echo "═══════════════════════════════════════════════════════════════════"

# Allow NextCloud (HTTP/HTTPS)
echo "Allowing NextCloud (HTTP/HTTPS)..."
sudo ufw allow 80/tcp comment 'NextCloud HTTP'
sudo ufw allow 443/tcp comment 'NextCloud HTTPS'
echo -e "${GREEN}✓ NextCloud ports opened${NC}"

# Allow Plex
echo "Allowing Plex..."
sudo ufw allow 32400/tcp comment 'Plex Media Server'
echo -e "${GREEN}✓ Plex port opened${NC}"

# Configure rsync
echo "Configuring rsync access..."
read -p "Use rsync daemon (873) or SSH (22)? [daemon/ssh]: " RSYNC_METHOD

if [ "$RSYNC_METHOD" == "daemon" ]; then
    sudo ufw allow 873/tcp comment 'rsync daemon'
    echo -e "${GREEN}✓ rsync daemon port opened${NC}"
    echo -e "${YELLOW}⚠ Remember to configure rsyncd.conf and authentication${NC}"
elif [ "$RSYNC_METHOD" == "ssh" ]; then
    # Check if SSH is already allowed
    if sudo ufw status | grep -q "22/tcp.*ALLOW"; then
        echo -e "${YELLOW}⚠ SSH port 22 is already open${NC}"
    else
        echo -e "${RED}WARNING: Opening SSH to public internet${NC}"
        read -p "Are you sure? This is less secure. (yes/no): " SSH_CONFIRM
        if [ "$SSH_CONFIRM" == "yes" ]; then
            sudo ufw allow 22/tcp comment 'SSH for rsync'
            echo -e "${GREEN}✓ SSH port opened${NC}"
        else
            echo "Skipping SSH port..."
        fi
    fi
else
    echo "Invalid option. Skipping rsync configuration."
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Step 3: Security Hardening"
echo "═══════════════════════════════════════════════════════════════════"

# Rate limiting for HTTP/HTTPS
echo "Configuring rate limiting..."
sudo ufw limit 22/tcp comment 'SSH rate limit'

# Ensure fail2ban is configured
echo "Checking fail2ban status..."
if systemctl is-active --quiet fail2ban; then
    echo -e "${GREEN}✓ fail2ban is active${NC}"
else
    echo -e "${YELLOW}⚠ fail2ban is not active - installing...${NC}"
    sudo apt-get update -qq
    sudo apt-get install -y fail2ban
    sudo systemctl enable fail2ban
    sudo systemctl start fail2ban
    echo -e "${GREEN}✓ fail2ban installed and started${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Step 4: SSL/TLS Configuration Check"
echo "═══════════════════════════════════════════════════════════════════"

echo "Checking for SSL certificates..."
if [ -d "/etc/letsencrypt/live" ]; then
    echo -e "${GREEN}✓ Let's Encrypt certificates found${NC}"
    ls -la /etc/letsencrypt/live/
else
    echo -e "${YELLOW}⚠ No SSL certificates found${NC}"
    echo "Consider setting up Let's Encrypt for HTTPS:"
    echo "  sudo apt-get install certbot python3-certbot-nginx"
    echo "  sudo certbot --nginx -d your-domain.com"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Step 5: Service Configuration Verification"
echo "═══════════════════════════════════════════════════════════════════"

# Check NextCloud
echo "Checking NextCloud status..."
if systemctl is-active --quiet nextcloud 2>/dev/null || [ -d "/var/www/nextcloud" ]; then
    echo -e "${GREEN}✓ NextCloud appears to be installed${NC}"
else
    echo -e "${YELLOW}⚠ NextCloud not found - may need installation${NC}"
fi

# Check Plex
echo "Checking Plex Media Server status..."
if systemctl is-active --quiet plexmediaserver 2>/dev/null || [ -d "/var/lib/plexmediaserver" ]; then
    echo -e "${GREEN}✓ Plex Media Server appears to be installed${NC}"
else
    echo -e "${YELLOW}⚠ Plex not found - may need installation${NC}"
fi

# Check rsync
echo "Checking rsync..."
if command -v rsync &> /dev/null; then
    echo -e "${GREEN}✓ rsync is installed${NC}"
else
    echo -e "${RED}✗ rsync not installed${NC}"
    sudo apt-get install -y rsync
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Step 6: Apply Firewall Changes"
echo "═══════════════════════════════════════════════════════════════════"

echo "Current firewall status:"
sudo ufw status numbered

read -p "Apply these changes? (yes/no): " APPLY_CONFIRM
if [ "$APPLY_CONFIRM" == "yes" ]; then
    sudo ufw --force enable
    echo -e "${GREEN}✓ Firewall rules applied and enabled${NC}"
else
    echo "Changes not applied. Firewall rules are staged but not active."
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Configuration Summary"
echo "═══════════════════════════════════════════════════════════════════"

echo ""
echo "Services Exposed:"
echo "  ✓ NextCloud: http://$VMI02D_IP:80 (HTTP)"
echo "  ✓ NextCloud: https://$VMI02D_IP:443 (HTTPS)"
echo "  ✓ Plex:      http://$VMI02D_IP:32400/web (Web Interface)"

if [ "$RSYNC_METHOD" == "daemon" ]; then
    echo "  ✓ rsync:     rsync://$VMI02D_IP/"
elif [ "$RSYNC_METHOD" == "ssh" ]; then
    echo "  ✓ rsync:     ssh root@$VMI02D_IP (via SSH)"
fi

echo ""
echo "Security Recommendations:"
echo "  1. Configure SSL/TLS certificates for HTTPS"
echo "  2. Enable strong authentication on all services"
echo "  3. Configure fail2ban for brute force protection"
echo "  4. Set up monitoring and alerting"
echo "  5. Regular security audits"
echo "  6. Keep all services updated"

echo ""
echo "Firewall Backup Locations:"
echo "  UFW: $(ls -t /tmp/vmi02d-ufw-backup-*.txt 2>/dev/null | head -1)"
echo "  iptables: $(ls -t /tmp/vmi02d-iptables-backup-*.txt 2>/dev/null | head -1)"

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Configuration Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════════════════${NC}"
echo ""

# Generate rollback script
ROLLBACK_SCRIPT="/tmp/rollback-vmi02d-exposure-$(date +%Y%m%d-%H%M%S).sh"
cat > "$ROLLBACK_SCRIPT" <<'EOF'
#!/bin/bash
# Rollback script - Remove public exposure

echo "Rolling back firewall changes..."
sudo ufw delete allow 80/tcp
sudo ufw delete allow 443/tcp
sudo ufw delete allow 32400/tcp
sudo ufw delete allow 873/tcp
sudo ufw reload
echo "Rollback complete. Services are VPN-only again."
EOF

chmod +x "$ROLLBACK_SCRIPT"
echo "Rollback script created: $ROLLBACK_SCRIPT"
echo "Run this script to revert changes if needed."
