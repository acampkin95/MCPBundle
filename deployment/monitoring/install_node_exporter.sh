#!/bin/bash

# Install Node Exporter on VMI01

VMI01_IP="46.250.243.123"
ROOT_PASS="C0nnaught"

echo "Installing Node Exporter on VMI01..."

sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=accept-new root@$VMI01_IP << 'ENDSSH'
# Check if already installed
if [ -f /usr/local/bin/node_exporter ]; then
    echo "Node Exporter already installed"
    systemctl restart node_exporter
    exit 0
fi

# Create user
useradd --no-create-home --shell /bin/false node_exporter || true

# Download and install
cd /tmp
wget -q https://github.com/prometheus/node_exporter/releases/download/v1.6.0/node_exporter-1.6.0.linux-amd64.tar.gz
tar xf node_exporter-1.6.0.linux-amd64.tar.gz
cp node_exporter-1.6.0.linux-amd64/node_exporter /usr/local/bin/
chown node_exporter:node_exporter /usr/local/bin/node_exporter

# Create systemd service
cat > /etc/systemd/system/node_exporter.service << 'EOF'
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable node_exporter
systemctl start node_exporter

# Cleanup
rm -rf /tmp/node_exporter-1.6.0.linux-amd64*

# Open firewall port
ufw allow 9100/tcp comment 'Node Exporter' || true

echo "Node Exporter installed and running on port 9100"
ENDSSH

echo "Testing Node Exporter on VMI01..."
curl -s http://$VMI01_IP:9100/metrics | head -5