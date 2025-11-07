#!/bin/bash
# Postfix Mail Testing Script
# Sends test emails to verify mail delivery

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Postfix Mail Delivery Test${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Check if mail command exists
if ! command -v mail &> /dev/null && ! command -v mailx &> /dev/null; then
    echo -e "${YELLOW}Installing mailutils...${NC}"
    apt-get update
    apt-get install -y mailutils
fi

# Test 1: Local delivery test
echo -e "${YELLOW}Test 1: Local mail delivery${NC}"
echo "This is a test email from VMI03 Postfix" | mail -s "VMI03 Postfix Test - Local" root
if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}Local mail sent successfully${NC}"
else
    echo -e "${RED}Failed to send local mail${NC}"
fi

# Test 2: External delivery test
echo -e "${YELLOW}Test 2: External mail delivery${NC}"
cat <<EOF | mail -s "VMI03 Postfix Test - External" acampkinpersonnal@gmail.com
This is a test email from VMI03 Security Gateway.

Server: vmi03.acdev.host
IP: 154.26.158.31
Time: $(date)

If you received this, Postfix is configured correctly!

---
VMI03 Automated Mail System
EOF

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}External mail queued for delivery${NC}"
else
    echo -e "${RED}Failed to queue external mail${NC}"
fi

# Test 3: System alert test
echo -e "${YELLOW}Test 3: System alert format test${NC}"
cat <<EOF | mail -s "[VMI03 ALERT] Postfix Configuration Test" acampkinpersonnal@gmail.com
ALERT: Postfix configuration test

Server: vmi03.acdev.host (154.26.158.31)
Component: Postfix Mail System
Severity: INFO
Time: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

Message:
This is a test of the VMI03 alert system. If you receive this email,
the mail server is properly configured for sending system alerts.

System Status:
$(uptime)

Disk Usage:
$(df -h / | tail -1)

Memory Usage:
$(free -h | grep Mem)

---
This is an automated message from VMI03 Security Gateway
EOF

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}Alert format test queued${NC}"
else
    echo -e "${RED}Failed to queue alert${NC}"
fi

# Check mail queue
echo
echo -e "${YELLOW}Mail Queue Status:${NC}"
mailq

# Check Postfix status
echo
echo -e "${YELLOW}Postfix Service Status:${NC}"
systemctl status postfix --no-pager | grep -E "Active|Main PID|Tasks"

# Display recent log entries
echo
echo -e "${YELLOW}Recent Postfix Logs:${NC}"
tail -20 /var/log/mail.log | grep -E "postfix|status="

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Mail Tests Complete${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Check email: acampkinpersonnal@gmail.com"
echo "2. Verify mail queue: mailq"
echo "3. Monitor logs: tail -f /var/log/mail.log"
echo "4. Check local mail: mail (for root user)"
echo
echo -e "${YELLOW}If mail is not received:${NC}"
echo "1. Check spam folder"
echo "2. Verify DNS/rDNS settings"
echo "3. Check mail.log for errors"
echo "4. Consider using SMTP relay (Gmail, SendGrid, etc.)"
echo
