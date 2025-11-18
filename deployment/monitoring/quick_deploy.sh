#!/bin/bash

# Quick Monitoring Stack Deployment with Connection Handling

set -e

# Configuration
VMI03_IP="154.26.158.31"
VMI01_IP="46.250.243.123"
VMI02D_IP="185.21.217.89"
ROOT_PASS="C0nnaught"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Quick Monitoring Stack Deployment${NC}"

# Step 1: Test connections first
echo -e "${YELLOW}Testing connections...${NC}"
for server in $VMI03_IP $VMI01_IP; do
    if sshpass -p "$ROOT_PASS" ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new root@$server "echo 'Connected to $server'" 2>/dev/null; then
        echo -e "${GREEN}✓ Connected to $server${NC}"
    else
        echo -e "${RED}✗ Failed to connect to $server${NC}"
        exit 1
    fi
done

# Step 2: Install HAProxy on VMI03
echo -e "${YELLOW}Installing HAProxy on VMI03...${NC}"
sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=accept-new root@$VMI03_IP << 'ENDSSH'
# Update and install HAProxy
apt-get update -qq
apt-get install -y haproxy

# Create HAProxy configuration
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

# Stats page
stats enable
stats uri /stats
stats realm HAProxy\ Statistics
stats auth admin:HAProxyAdmin2024

# Frontend
frontend http_front
    bind *:80
    default_backend servers

# Backend for MCP services
backend servers
    balance roundrobin
    option httpchk GET /health
    server mcp-orchestrator 46.250.243.123:3000 check
    server mcp-perplexity 46.250.243.123:3001 check
    server mcp-it 46.250.243.123:3002 check

# Stats listener
listen stats
    bind *:8404
    stats enable
    stats uri /
    stats auth admin:HAProxyStats2024!
EOF

# Restart HAProxy
systemctl restart haproxy
systemctl enable haproxy
echo "HAProxy installed and configured"
ENDSSH

# Step 3: Install Prometheus on VMI03
echo -e "${YELLOW}Installing Prometheus on VMI03...${NC}"
sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=accept-new root@$VMI03_IP << 'ENDSSH'
# Create prometheus user
useradd --no-create-home --shell /bin/false prometheus || true

# Download and install Prometheus
cd /tmp
wget -q https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz
tar xf prometheus-2.45.0.linux-amd64.tar.gz

# Install binaries
cp prometheus-2.45.0.linux-amd64/prometheus /usr/local/bin/
cp prometheus-2.45.0.linux-amd64/promtool /usr/local/bin/

# Create directories
mkdir -p /etc/prometheus /var/lib/prometheus
cp -r prometheus-2.45.0.linux-amd64/consoles /etc/prometheus
cp -r prometheus-2.45.0.linux-amd64/console_libraries /etc/prometheus

# Create configuration
cat > /etc/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100', '46.250.243.123:9100', '185.21.217.89:9100']

  - job_name: 'mcp-services'
    static_configs:
      - targets: ['46.250.243.123:3000', '46.250.243.123:3001', '46.250.243.123:3002']
EOF

# Create systemd service
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

# Set permissions
chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
chown prometheus:prometheus /usr/local/bin/prometheus /usr/local/bin/promtool

# Start Prometheus
systemctl daemon-reload
systemctl enable prometheus
systemctl start prometheus

# Cleanup
rm -rf /tmp/prometheus-2.45.0.linux-amd64*

echo "Prometheus installed and configured"
ENDSSH

# Step 4: Install Node Exporters
echo -e "${YELLOW}Installing Node Exporters...${NC}"
for server in $VMI03_IP $VMI01_IP; do
    echo "Installing Node Exporter on $server..."
    sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=accept-new root@$server << 'ENDSSH'
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

echo "Node Exporter installed"
ENDSSH
done

# Step 5: Install Grafana on VMI03
echo -e "${YELLOW}Installing Grafana on VMI03...${NC}"
sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=accept-new root@$VMI03_IP << 'ENDSSH'
# Install Grafana
apt-get install -y software-properties-common wget
wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
add-apt-repository -y 'deb https://packages.grafana.com/oss/deb stable main'
apt-get update -qq
apt-get install -y grafana

# Configure Grafana
cat > /etc/grafana/grafana.ini << 'EOF'
[server]
http_port = 3000

[security]
admin_user = admin
admin_password = GrafanaAdmin2024!

[auth.anonymous]
enabled = true
org_role = Viewer

[users]
allow_sign_up = false
EOF

# Start Grafana
systemctl daemon-reload
systemctl enable grafana-server
systemctl start grafana-server

echo "Grafana installed and configured"

# Wait for Grafana to start
sleep 10

# Add Prometheus data source
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

echo "Prometheus data source added to Grafana"
ENDSSH

# Step 6: Create health check script
echo -e "${YELLOW}Creating health check script...${NC}"
sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=accept-new root@$VMI03_IP << 'ENDSSH'
cat > /usr/local/bin/health_check.sh << 'EOF'
#!/bin/bash

echo "=== Service Health Check ==="

# Check HAProxy
if systemctl is-active --quiet haproxy; then
    echo "✓ HAProxy: Running"
else
    echo "✗ HAProxy: Not running"
fi

# Check Prometheus
if curl -s http://localhost:9090/-/healthy > /dev/null; then
    echo "✓ Prometheus: Healthy"
else
    echo "✗ Prometheus: Not healthy"
fi

# Check Grafana
if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "✓ Grafana: Healthy"
else
    echo "✗ Grafana: Not healthy"
fi

# Check Node Exporter
if curl -s http://localhost:9100/metrics > /dev/null; then
    echo "✓ Node Exporter: Running"
else
    echo "✗ Node Exporter: Not running"
fi

# Check MCP services
echo ""
echo "=== MCP Services ==="
for service in "orchestrator:3000" "perplexity:3001" "it-service:3002"; do
    name=$(echo $service | cut -d: -f1)
    port=$(echo $service | cut -d: -f2)
    if curl -s http://46.250.243.123:$port/health > /dev/null 2>&1; then
        echo "✓ MCP $name: Healthy"
    else
        echo "✗ MCP $name: Not responding"
    fi
done
EOF

chmod +x /usr/local/bin/health_check.sh
echo "Health check script created"

# Run health check
/usr/local/bin/health_check.sh
ENDSSH

# Step 7: Configure firewall
echo -e "${YELLOW}Configuring firewall...${NC}"
sshpass -p "$ROOT_PASS" ssh -o StrictHostKeyChecking=accept-new root@$VMI03_IP << 'ENDSSH'
# Open required ports
ufw allow 80/tcp comment 'HTTP' || true
ufw allow 443/tcp comment 'HTTPS' || true
ufw allow 3000/tcp comment 'Grafana' || true
ufw allow 8404/tcp comment 'HAProxy Stats' || true
ufw allow 9090/tcp comment 'Prometheus' || true
ufw allow 9100/tcp comment 'Node Exporter' || true
echo "Firewall configured"
ENDSSH

# Final status
echo -e "${GREEN}======================================"
echo "Deployment Complete!"
echo "======================================"
echo ""
echo "Access URLs:"
echo "  HAProxy Stats: http://$VMI03_IP:8404"
echo "    Username: admin"
echo "    Password: HAProxyStats2024!"
echo ""
echo "  Prometheus: http://$VMI03_IP:9090"
echo ""
echo "  Grafana: http://$VMI03_IP:3000"
echo "    Username: admin"
echo "    Password: GrafanaAdmin2024!"
echo ""
echo "Health Check: ssh root@$VMI03_IP '/usr/local/bin/health_check.sh'"
echo "======================================"
echo -e "${NC}"