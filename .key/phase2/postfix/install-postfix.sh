#!/bin/bash
# Postfix Installation and Configuration Script for VMI03

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Postfix Installation${NC}"
echo -e "${GREEN}VMI03 Security Gateway${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   exit 1
fi

# Pre-configure Postfix settings (non-interactive installation)
echo -e "${YELLOW}Configuring Postfix installation...${NC}"
debconf-set-selections <<< "postfix postfix/mailname string vmi03.acdev.host"
debconf-set-selections <<< "postfix postfix/main_mailer_type string 'Internet Site'"

# Install Postfix
echo -e "${YELLOW}Installing Postfix...${NC}"
apt-get update
apt-get install -y postfix mailutils

# Stop Postfix for configuration
systemctl stop postfix

# Backup original configuration
cp /etc/postfix/main.cf /etc/postfix/main.cf.backup

# Copy new configuration
echo -e "${YELLOW}Applying configuration...${NC}"
cp main.cf /etc/postfix/main.cf

# Configure virtual aliases for root mail forwarding
cat > /etc/postfix/virtual <<EOF
# Virtual alias mapping for VMI03
root@vmi03.acdev.host acampkinpersonnal@gmail.com
root@acdev.host acampkinpersonnal@gmail.com
@vmi03.acdev.host acampkinpersonnal@gmail.com
EOF

postmap /etc/postfix/virtual

# Configure /etc/aliases for local forwarding
cat >> /etc/aliases <<EOF

# Forward root mail to external address
root: acampkinpersonnal@gmail.com
EOF

newaliases

# Configure header checks (optional spam filtering)
cat > /etc/postfix/header_checks <<'EOF'
# Header rewriting rules
/^Received:/                IGNORE
/^X-Originating-IP:/        IGNORE
/^X-Mailer:/                IGNORE
/^User-Agent:/              IGNORE
EOF

postmap /etc/postfix/header_checks

# Set correct permissions
chmod 644 /etc/postfix/main.cf
chmod 644 /etc/postfix/virtual
chmod 644 /etc/aliases

# Configure log rotation
cat > /etc/logrotate.d/postfix <<'EOF'
/var/log/postfix.log {
    daily
    rotate 7
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        /usr/sbin/postfix reload > /dev/null
    endscript
}
EOF

# Start Postfix
echo -e "${GREEN}Starting Postfix...${NC}"
systemctl enable postfix
systemctl start postfix

# Wait for Postfix to be ready
sleep 3

# Check Postfix status
if systemctl is-active --quiet postfix; then
    echo -e "${GREEN}Postfix is running${NC}"
else
    echo -e "${RED}Postfix failed to start${NC}"
    systemctl status postfix --no-pager
    exit 1
fi

# Display configuration
echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Postfix Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo -e "${YELLOW}Configuration Summary:${NC}"
echo "  Hostname: vmi03.acdev.host"
echo "  Domain: acdev.host"
echo "  Forward to: acampkinpersonnal@gmail.com"
echo "  Config: /etc/postfix/main.cf"
echo "  Logs: /var/log/postfix.log"
echo
echo -e "${YELLOW}Service Status:${NC}"
systemctl status postfix --no-pager | grep -E "Active|Main PID"
echo
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Test mail delivery: ./test-mail.sh"
echo "2. Monitor logs: tail -f /var/log/mail.log"
echo "3. Check queue: mailq"
echo
echo -e "${YELLOW}Optional: Configure SMTP Relay${NC}"
echo "If direct delivery fails, configure Gmail/SendGrid relay:"
echo "  1. Edit /etc/postfix/main.cf"
echo "  2. Uncomment and configure relayhost settings"
echo "  3. Create /etc/postfix/sasl_passwd with credentials"
echo "  4. Run: postmap /etc/postfix/sasl_passwd"
echo "  5. Restart: systemctl restart postfix"
echo
