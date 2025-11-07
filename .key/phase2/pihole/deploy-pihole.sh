#!/bin/bash
# PiHole and Suricata Deployment Script for VMI03
# Deploys DNS filtering and IDS/IPS for Red Tunnel security

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}PiHole & Suricata Deployment${NC}"
echo -e "${GREEN}VMI03 Security Gateway${NC}"
echo -e "${GREEN}========================================${NC}"
echo

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   exit 1
fi

# Install dependencies
echo -e "${YELLOW}Installing dependencies...${NC}"
apt-get update
apt-get install -y docker.io docker-compose suricata suricata-update rsyslog

# Create PiHole directory
PIHOLE_DIR="/opt/pihole"
mkdir -p "$PIHOLE_DIR"/{etc-pihole,etc-dnsmasq.d,unbound}
cd "$PIHOLE_DIR"

# Generate PiHole web password
if [[ ! -f .env ]]; then
    echo -e "${YELLOW}Generating PiHole web password...${NC}"
    PIHOLE_PASS=$(openssl rand -base64 24)
    cat > .env <<EOF
PIHOLE_WEB_PASSWORD=$PIHOLE_PASS
EOF
    chmod 600 .env
    echo -e "${GREEN}PiHole password: $PIHOLE_PASS${NC}"
    echo -e "${YELLOW}Saved to $PIHOLE_DIR/.env${NC}"
fi

# Copy configuration files
echo -e "${YELLOW}Copying configuration files...${NC}"
cp docker-compose.yml "$PIHOLE_DIR/"
cp custom-dns.list "$PIHOLE_DIR/"

# Configure Unbound (recursive DNS)
cat > "$PIHOLE_DIR/unbound/unbound.conf" <<'EOF'
server:
    verbosity: 1
    interface: 0.0.0.0
    port: 53
    do-ip4: yes
    do-ip6: no
    do-udp: yes
    do-tcp: yes
    access-control: 172.20.0.0/24 allow
    access-control: 127.0.0.1/32 allow
    root-hints: "/opt/unbound/etc/unbound/root.hints"
    hide-identity: yes
    hide-version: yes
    harden-glue: yes
    harden-dnssec-stripped: yes
    use-caps-for-id: yes
    cache-min-ttl: 3600
    cache-max-ttl: 86400
    prefetch: yes
    num-threads: 2
    msg-cache-slabs: 8
    rrset-cache-slabs: 8
    infra-cache-slabs: 8
    key-cache-slabs: 8
    rrset-cache-size: 256m
    msg-cache-size: 128m
    so-rcvbuf: 1m
    private-address: 10.0.0.0/8
    private-address: 172.16.0.0/12
    private-address: 192.168.0.0/16
    private-address: 169.254.0.0/16
    unwanted-reply-threshold: 10000
    do-not-query-localhost: no
    val-clean-additional: yes

forward-zone:
    name: "."
    forward-addr: 1.1.1.1@853
    forward-addr: 1.0.0.1@853
    forward-addr: 9.9.9.9@853
    forward-tls-upstream: yes
EOF

# Download root hints for Unbound
curl -o "$PIHOLE_DIR/unbound/root.hints" https://www.internic.net/domain/named.cache

# Start PiHole
echo -e "${GREEN}Starting PiHole...${NC}"
docker-compose up -d

# Wait for PiHole to be ready
echo -e "${YELLOW}Waiting for PiHole to start...${NC}"
sleep 15

# Add blocklists
echo -e "${YELLOW}Adding blocklists to PiHole...${NC}"
docker exec pihole pihole -a adlist add https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts
docker exec pihole pihole -a adlist add https://mirror1.malwaredomains.com/files/justdomains
docker exec pihole pihole -a adlist add https://s3.amazonaws.com/lists.disconnect.me/simple_tracking.txt
docker exec pihole pihole -a adlist add https://s3.amazonaws.com/lists.disconnect.me/simple_ad.txt
docker exec pihole pihole -a adlist add https://phishing.army/download/phishing_army_blocklist_extended.txt

# Update gravity
echo -e "${YELLOW}Updating PiHole gravity database...${NC}"
docker exec pihole pihole -g

# Configure Suricata
echo -e "${GREEN}Configuring Suricata IDS/IPS...${NC}"

# Copy Suricata configuration
cp suricata/suricata.yaml /etc/suricata/

# Update Suricata rules
echo -e "${YELLOW}Downloading Suricata rules...${NC}"
suricata-update update-sources
suricata-update enable-source et/open
suricata-update

# Configure Suricata to start on boot
systemctl enable suricata
systemctl restart suricata

# Configure rsyslog to forward to VMI01
echo -e "${YELLOW}Configuring syslog forwarding to VMI01...${NC}"
cat >> /etc/rsyslog.conf <<'EOF'

# Forward Suricata logs to VMI01
local5.* @@46.250.243.123:514

# Forward PiHole logs to VMI01
if $programname == 'pihole' then @@46.250.243.123:514
& stop
EOF

systemctl restart rsyslog

# Configure log rotation
cat > /etc/logrotate.d/suricata <<'EOF'
/var/log/suricata/*.log /var/log/suricata/*.json {
    daily
    rotate 7
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        /bin/kill -HUP $(cat /var/run/suricata.pid 2>/dev/null) 2>/dev/null || true
    endscript
}
EOF

# Test Suricata
echo -e "${YELLOW}Testing Suricata configuration...${NC}"
suricata -T -c /etc/suricata/suricata.yaml -v

# Display status
echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}PiHole & Suricata Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
source .env
echo -e "${YELLOW}PiHole Web Interface:${NC}"
echo "  URL: http://10.102.0.1/admin (accessible via Root tunnel only)"
echo "  Password: $PIHOLE_WEB_PASSWORD"
echo
echo -e "${YELLOW}DNS Configuration:${NC}"
echo "  DNS Server: 10.102.0.1"
echo "  Upstream: Cloudflare DoH (1.1.1.1), Quad9 (9.9.9.9) via Unbound"
echo
echo -e "${YELLOW}Suricata IDS/IPS:${NC}"
echo "  Status: $(systemctl is-active suricata)"
echo "  Monitoring: wg-red, eth0"
echo "  Logs: /var/log/suricata/"
echo "  Rules: ET Open (Emerging Threats)"
echo
echo -e "${YELLOW}Blocklists Configured:${NC}"
echo "  - Steven Black unified hosts"
echo "  - Malware Domains"
echo "  - Disconnect.me tracking & ads"
echo "  - Phishing Army blocklist"
echo
echo -e "${YELLOW}Log Forwarding:${NC}"
echo "  Destination: VMI01 (46.250.243.123:514)"
echo "  Facility: local5 (Suricata)"
echo
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Access PiHole admin via Root tunnel"
echo "2. Review and customize blocklists"
echo "3. Monitor Suricata alerts: tail -f /var/log/suricata/fast.log"
echo "4. Verify DNS resolution: dig @10.102.0.1 example.com"
echo "5. Check syslog forwarding: ssh root@46.250.243.123 'tail -f /var/log/syslog'"
echo
echo -e "${YELLOW}Container Status:${NC}"
docker-compose ps
echo
