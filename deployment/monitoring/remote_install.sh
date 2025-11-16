#!/bin/bash

# Remote Installation Script - Run this directly on VMI03

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting Monitoring Stack Installation on VMI03${NC}"

# 1. Install HAProxy
echo -e "${YELLOW}Installing HAProxy...${NC}"
apt-get update
apt-get install -y haproxy

# Configure HAProxy
cat > /etc/haproxy/haproxy.cfg << 'EOF'
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    timeout connect         10s
    timeout client          30s
    timeout server          30s
    maxconn                 3000

# Stats
stats enable
stats uri /stats
stats realm HAProxy\ Statistics
stats auth admin:HAProxyAdmin2024

# Frontend
frontend http_front
    bind *:80
    default_backend mcp_servers

# Backend
backend mcp_servers
    balance roundrobin
    option httpchk GET /health
    server mcp-orchestrator 46.250.243.123:3000 check inter 5s
    server mcp-perplexity 46.250.243.123:3001 check inter 5s
    server mcp-it 46.250.243.123:3002 check inter 5s

# Stats page
listen stats
    bind *:8404
    stats enable
    stats uri /
    stats auth admin:HAProxyStats2024!
    stats refresh 30s
EOF

systemctl restart haproxy
systemctl enable haproxy
echo "✓ HAProxy installed"

# 2. Install Prometheus
echo -e "${YELLOW}Installing Prometheus...${NC}"
useradd --no-create-home --shell /bin/false prometheus || true

cd /tmp
wget -q https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xf prometheus-2.45.0.linux-amd64.tar.gz

cp prometheus-2.45.0.linux-amd64/prometheus /usr/local/bin/
cp prometheus-2.45.0.linux-amd64/promtool /usr/local/bin/

mkdir -p /etc/prometheus /var/lib/prometheus
cp -r prometheus-2.45.0.linux-amd64/consoles /etc/prometheus
cp -r prometheus-2.45.0.linux-amd64/console_libraries /etc/prometheus

# Prometheus config
cat > /etc/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node-vmi03'
    static_configs:
      - targets: ['localhost:9100']

  - job_name: 'node-vmi01'
    static_configs:
      - targets: ['46.250.243.123:9100']

  - job_name: 'haproxy'
    static_configs:
      - targets: ['localhost:8404']

  - job_name: 'mcp-orchestrator'
    static_configs:
      - targets: ['46.250.243.123:3000']

  - job_name: 'mcp-perplexity'
    static_configs:
      - targets: ['46.250.243.123:3001']

  - job_name: 'mcp-it'
    static_configs:
      - targets: ['46.250.243.123:3002']
EOF

# Alert rules
cat > /etc/prometheus/alerts.yml << 'EOF'
groups:
  - name: system
    rules:
      - alert: HighCPUUsage
        expr: 100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"

      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service is down"
EOF

# Systemd service
cat > /etc/systemd/system/prometheus.service << 'EOF'
[Unit]
Description=Prometheus
After=network.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus \
    --config.file /etc/prometheus/prometheus.yml \
    --storage.tsdb.path /var/lib/prometheus/ \
    --storage.tsdb.retention.time=30d \
    --web.console.templates=/etc/prometheus/consoles \
    --web.console.libraries=/etc/prometheus/console_libraries

[Install]
WantedBy=multi-user.target
EOF

chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
chown prometheus:prometheus /usr/local/bin/prometheus /usr/local/bin/promtool

systemctl daemon-reload
systemctl enable prometheus
systemctl start prometheus

rm -rf /tmp/prometheus-2.45.0.linux-amd64*
echo "✓ Prometheus installed"

# 3. Install Node Exporter
echo -e "${YELLOW}Installing Node Exporter...${NC}"
useradd --no-create-home --shell /bin/false node_exporter || true

cd /tmp
wget -q https://github.com/prometheus/node_exporter/releases/download/v1.6.0/node_exporter-1.6.0.linux-amd64.tar.gz
tar xf node_exporter-1.6.0.linux-amd64.tar.gz
cp node_exporter-1.6.0.linux-amd64/node_exporter /usr/local/bin/
chown node_exporter:node_exporter /usr/local/bin/node_exporter

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

systemctl daemon-reload
systemctl enable node_exporter
systemctl start node_exporter

rm -rf /tmp/node_exporter-1.6.0.linux-amd64*
echo "✓ Node Exporter installed"

# 4. Install Grafana
echo -e "${YELLOW}Installing Grafana...${NC}"
apt-get install -y software-properties-common
wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
add-apt-repository 'deb https://packages.grafana.com/oss/deb stable main'
apt-get update
apt-get install -y grafana

# Configure Grafana
sed -i 's/;admin_user = admin/admin_user = admin/g' /etc/grafana/grafana.ini
sed -i 's/;admin_password = admin/admin_password = GrafanaAdmin2024!/g' /etc/grafana/grafana.ini

systemctl daemon-reload
systemctl enable grafana-server
systemctl start grafana-server
echo "✓ Grafana installed"

# 5. Configure Grafana data source
sleep 10
curl -X POST \
  -H 'Content-Type: application/json' \
  -u 'admin:GrafanaAdmin2024!' \
  -d '{
    "name": "Prometheus",
    "type": "prometheus",
    "access": "proxy",
    "url": "http://localhost:9090",
    "isDefault": true
  }' \
  http://localhost:3000/api/datasources

echo "✓ Prometheus data source added"

# 6. Open firewall ports
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp
ufw allow 8404/tcp
ufw allow 9090/tcp
ufw allow 9100/tcp

echo -e "${GREEN}======================================"
echo "Installation Complete!"
echo "======================================"
echo ""
echo "HAProxy Stats: http://$(hostname -I | awk '{print $1}'):8404"
echo "  Username: admin / Password: HAProxyStats2024!"
echo ""
echo "Prometheus: http://$(hostname -I | awk '{print $1}'):9090"
echo ""
echo "Grafana: http://$(hostname -I | awk '{print $1}'):3000"
echo "  Username: admin / Password: GrafanaAdmin2024!"
echo "======================================${NC}"