#!/bin/bash
# DPI-SSL Setup Script using mitmproxy
# Optional deep packet inspection for Red Tunnel traffic
# WARNING: This is for security monitoring only, not content logging

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}DPI-SSL Setup (mitmproxy)${NC}"
echo -e "${GREEN}VMI03 Security Gateway - Red Tunnel${NC}"
echo -e "${GREEN}========================================${NC}"
echo

echo -e "${YELLOW}WARNING: SSL/TLS inspection can raise privacy concerns${NC}"
echo -e "${YELLOW}This setup is for threat detection only${NC}"
echo -e "${YELLOW}No content logging will be enabled${NC}"
echo
read -p "Continue with DPI-SSL setup? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborting."
    exit 0
fi

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   exit 1
fi

# Install mitmproxy
echo -e "${YELLOW}Installing mitmproxy...${NC}"
apt-get update
apt-get install -y python3-pip python3-venv

# Create mitmproxy directory
MITMPROXY_DIR="/opt/mitmproxy"
mkdir -p "$MITMPROXY_DIR"
cd "$MITMPROXY_DIR"

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install mitmproxy

# Create mitmproxy addon for threat detection
cat > "$MITMPROXY_DIR/threat_detector.py" <<'EOF'
"""
mitmproxy addon for threat detection
Monitors SSL/TLS traffic for suspicious patterns
Does NOT log content, only security events
"""

import logging
from mitmproxy import http, ctx
import re
import json
from datetime import datetime

class ThreatDetector:
    def __init__(self):
        self.suspicious_patterns = [
            r'eval\(',
            r'<script[^>]*>.*?</script>',
            r'UNION.*SELECT',
            r'\.\./',
            r'cmd\.exe',
            r'/etc/passwd',
            r'base64_decode',
        ]
        self.malware_domains = set()
        self.load_threat_intel()

    def load_threat_intel(self):
        """Load threat intelligence feeds"""
        # In production, load from external threat feeds
        ctx.log.info("Threat intelligence loaded")

    def request(self, flow: http.HTTPFlow) -> None:
        """Inspect outgoing requests for threats"""

        # Check for suspicious domains
        host = flow.request.pretty_host

        # Check for suspicious patterns in URL
        url = flow.request.pretty_url
        for pattern in self.suspicious_patterns:
            if re.search(pattern, url, re.IGNORECASE):
                self.log_threat(flow, "suspicious_pattern_in_url", pattern)

        # Check for suspicious headers
        if "User-Agent" in flow.request.headers:
            ua = flow.request.headers["User-Agent"]
            if len(ua) < 10 or "bot" in ua.lower():
                self.log_threat(flow, "suspicious_user_agent", ua)

    def response(self, flow: http.HTTPFlow) -> None:
        """Inspect responses for malicious content"""

        # Check for suspicious response headers
        if "Content-Type" in flow.response.headers:
            ct = flow.response.headers["Content-Type"]
            if "application/octet-stream" in ct and flow.request.path.endswith(('.exe', '.dll', '.bat', '.ps1')):
                self.log_threat(flow, "potential_malware_download", ct)

        # Check for large data exfiltration
        content_length = len(flow.response.content) if flow.response.content else 0
        if content_length > 10 * 1024 * 1024:  # 10MB
            self.log_threat(flow, "large_upload_detected", f"{content_length} bytes")

    def log_threat(self, flow: http.HTTPFlow, threat_type: str, details: str):
        """Log security threat (no content logging)"""
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "threat_type": threat_type,
            "source_ip": flow.client_conn.peername[0],
            "destination": flow.request.pretty_host,
            "url": flow.request.pretty_url,
            "method": flow.request.method,
            "details": details
        }

        # Log to file
        with open("/var/log/mitmproxy/threats.log", "a") as f:
            f.write(json.dumps(event) + "\n")

        # Log to syslog (forwards to VMI01)
        ctx.log.warn(f"THREAT_DETECTED: {json.dumps(event)}")

addons = [ThreatDetector()]
EOF

# Create log directory
mkdir -p /var/log/mitmproxy
chmod 755 /var/log/mitmproxy

# Create systemd service
cat > /etc/systemd/system/mitmproxy.service <<EOF
[Unit]
Description=mitmproxy SSL/TLS Inspector
After=network.target wg-quick@wg-red.service
Requires=wg-quick@wg-red.service

[Service]
Type=simple
User=root
WorkingDirectory=$MITMPROXY_DIR
ExecStart=$MITMPROXY_DIR/venv/bin/mitmdump \\
    --mode transparent \\
    --listen-host 10.102.0.1 \\
    --listen-port 8080 \\
    --set block_global=false \\
    --set ssl_insecure=true \\
    --scripts $MITMPROXY_DIR/threat_detector.py \\
    --set flow_detail=1
Restart=always
RestartSec=10

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/mitmproxy $MITMPROXY_DIR

[Install]
WantedBy=multi-user.target
EOF

# Configure iptables to redirect HTTPS traffic to mitmproxy
cat > "$MITMPROXY_DIR/setup-iptables.sh" <<'EOF'
#!/bin/bash
# Redirect Red tunnel HTTPS traffic to mitmproxy for inspection

# Enable IP forwarding
sysctl -w net.ipv4.ip_forward=1

# Redirect HTTPS traffic from wg-red to mitmproxy
iptables -t nat -A PREROUTING -i wg-red -p tcp --dport 443 -j REDIRECT --to-port 8080

# Mark packets from mitmproxy to avoid loops
iptables -t mangle -A OUTPUT -p tcp --sport 8080 -j MARK --set-mark 1
iptables -t nat -A OUTPUT -p tcp -m mark --mark 1 -j RETURN

echo "iptables rules configured for DPI-SSL"
EOF

chmod +x "$MITMPROXY_DIR/setup-iptables.sh"

# Create cleanup script
cat > "$MITMPROXY_DIR/cleanup-iptables.sh" <<'EOF'
#!/bin/bash
# Remove mitmproxy iptables rules

iptables -t nat -D PREROUTING -i wg-red -p tcp --dport 443 -j REDIRECT --to-port 8080 2>/dev/null || true
iptables -t mangle -D OUTPUT -p tcp --sport 8080 -j MARK --set-mark 1 2>/dev/null || true
iptables -t nat -D OUTPUT -p tcp -m mark --mark 1 -j RETURN 2>/dev/null || true

echo "iptables rules removed"
EOF

chmod +x "$MITMPROXY_DIR/cleanup-iptables.sh"

# Configure log forwarding to VMI01
cat >> /etc/rsyslog.conf <<'EOF'

# Forward mitmproxy threat logs to VMI01
if $programname == 'mitmdump' then @@46.250.243.123:514
& stop
EOF

systemctl restart rsyslog

# Log rotation
cat > /etc/logrotate.d/mitmproxy <<'EOF'
/var/log/mitmproxy/*.log {
    daily
    rotate 7
    missingok
    notifempty
    compress
    delaycompress
    create 0644 root root
}
EOF

echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}DPI-SSL Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo -e "${YELLOW}Installation Summary:${NC}"
echo "  Location: $MITMPROXY_DIR"
echo "  Service: mitmproxy.service"
echo "  Logs: /var/log/mitmproxy/"
echo
echo -e "${YELLOW}To enable DPI-SSL inspection:${NC}"
echo "  1. Setup iptables: $MITMPROXY_DIR/setup-iptables.sh"
echo "  2. Enable service: systemctl enable mitmproxy"
echo "  3. Start service: systemctl start mitmproxy"
echo
echo -e "${YELLOW}To disable DPI-SSL inspection:${NC}"
echo "  1. Stop service: systemctl stop mitmproxy"
echo "  2. Disable service: systemctl disable mitmproxy"
echo "  3. Cleanup iptables: $MITMPROXY_DIR/cleanup-iptables.sh"
echo
echo -e "${YELLOW}Monitor threats:${NC}"
echo "  tail -f /var/log/mitmproxy/threats.log"
echo
echo -e "${RED}IMPORTANT:${NC}"
echo "  - Clients will see certificate warnings"
echo "  - Install mitmproxy CA cert on client devices if needed"
echo "  - Certificate: ~/.mitmproxy/mitmproxy-ca-cert.pem"
echo "  - This is for security monitoring only"
echo
