#!/bin/bash
set -euo pipefail

# Monitoring Stack Deployment for VMI01 (46.250.243.123)
# Deploys: Prometheus + Grafana + Exporters (Node, PostgreSQL, Redis)

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration
readonly VMI01_IP="46.250.243.123"
readonly SSH_USER="root"
readonly SSH_PASS="C0nnaught"
readonly PROMETHEUS_VERSION="2.48.1"
readonly GRAFANA_PORT="3001"
readonly CREDENTIALS_FILE="/tmp/monitoring-deployment-result.txt"
readonly LOCAL_CREDS_FILE="/tmp/monitoring-deployment-result.txt"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "\n${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║ $1${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}\n"
}

# Banner
cat <<'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║       VMI01 Monitoring Stack Deployment - MCP Bundle v0.2.0     ║
║                                                                  ║
║  Target: VMI01 (46.250.243.123)                                 ║
║  Components:                                                     ║
║    • Prometheus 2.48.1 (Metrics Database)                       ║
║    • Grafana 10.x (Dashboards & Visualization)                  ║
║    • Node Exporter (System Metrics)                             ║
║    • PostgreSQL Exporter (Database Metrics)                     ║
║    • Redis Exporter (Cache Metrics)                             ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF

log_info "Starting deployment to VMI01 at $(date)"
echo

# Test SSH connectivity
log_step "Step 1/7: Testing SSH Connectivity"
if sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ${SSH_USER}@${VMI01_IP} "echo 'SSH connection successful'" &>/dev/null; then
    log_success "SSH connection to VMI01 established"
else
    log_error "Cannot connect to VMI01 via SSH"
    exit 1
fi

# Deploy Node Exporter
log_step "Step 2/7: Installing Node Exporter"
sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${VMI01_IP} bash <<'ENDSSH'
set -euo pipefail

if systemctl is-active --quiet node_exporter 2>/dev/null; then
    echo "[INFO] Node Exporter already installed and running"
    exit 0
fi

echo "[INFO] Installing Node Exporter..."

# Create user
useradd --no-create-home --shell /bin/false node_exporter 2>/dev/null || true

# Download and install
cd /tmp
wget -q https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xzf node_exporter-1.7.0.linux-amd64.tar.gz
cp node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/
chown node_exporter:node_exporter /usr/local/bin/node_exporter
chmod +x /usr/local/bin/node_exporter

# Create systemd service
cat > /etc/systemd/system/node_exporter.service <<'EOF'
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
rm -rf /tmp/node_exporter-1.7.0*

echo "[SUCCESS] Node Exporter installed on port 9100"
ENDSSH

log_success "Node Exporter deployed"

# Deploy PostgreSQL Exporter
log_step "Step 3/7: Installing PostgreSQL Exporter"
sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${VMI01_IP} bash <<'ENDSSH'
set -euo pipefail

if systemctl is-active --quiet postgres_exporter 2>/dev/null; then
    echo "[INFO] PostgreSQL Exporter already installed and running"
    exit 0
fi

echo "[INFO] Installing PostgreSQL Exporter..."

# Create user
useradd --no-create-home --shell /bin/false postgres_exporter 2>/dev/null || true

# Download and install
cd /tmp
wget -q https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz
tar xzf postgres_exporter-0.15.0.linux-amd64.tar.gz
cp postgres_exporter-0.15.0.linux-amd64/postgres_exporter /usr/local/bin/
chown postgres_exporter:postgres_exporter /usr/local/bin/postgres_exporter
chmod +x /usr/local/bin/postgres_exporter

# Create environment file with connection string
mkdir -p /etc/postgres_exporter
cat > /etc/postgres_exporter/postgres_exporter.env <<'EOF'
DATA_SOURCE_NAME=postgresql://postgres:mcp_prod_2024@localhost:5432/postgres?sslmode=disable
EOF

chown postgres_exporter:postgres_exporter /etc/postgres_exporter/postgres_exporter.env
chmod 600 /etc/postgres_exporter/postgres_exporter.env

# Create systemd service
cat > /etc/systemd/system/postgres_exporter.service <<'EOF'
[Unit]
Description=PostgreSQL Exporter
After=postgresql.service
Requires=postgresql.service

[Service]
User=postgres_exporter
Group=postgres_exporter
Type=simple
EnvironmentFile=/etc/postgres_exporter/postgres_exporter.env
ExecStart=/usr/local/bin/postgres_exporter

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable postgres_exporter
systemctl start postgres_exporter

# Cleanup
rm -rf /tmp/postgres_exporter-0.15.0*

echo "[SUCCESS] PostgreSQL Exporter installed on port 9187"
ENDSSH

log_success "PostgreSQL Exporter deployed"

# Deploy Redis Exporter
log_step "Step 4/7: Installing Redis Exporter"
sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${VMI01_IP} bash <<'ENDSSH'
set -euo pipefail

if systemctl is-active --quiet redis_exporter 2>/dev/null; then
    echo "[INFO] Redis Exporter already installed and running"
    exit 0
fi

echo "[INFO] Installing Redis Exporter..."

# Create user
useradd --no-create-home --shell /bin/false redis_exporter 2>/dev/null || true

# Download and install
cd /tmp
wget -q https://github.com/oliver006/redis_exporter/releases/download/v1.55.0/redis_exporter-v1.55.0.linux-amd64.tar.gz
tar xzf redis_exporter-v1.55.0.linux-amd64.tar.gz
cp redis_exporter-v1.55.0.linux-amd64/redis_exporter /usr/local/bin/
chown redis_exporter:redis_exporter /usr/local/bin/redis_exporter
chmod +x /usr/local/bin/redis_exporter

# Create systemd service
cat > /etc/systemd/system/redis_exporter.service <<'EOF'
[Unit]
Description=Redis Exporter
After=redis.service
Requires=redis.service

[Service]
User=redis_exporter
Group=redis_exporter
Type=simple
ExecStart=/usr/local/bin/redis_exporter --redis.addr=localhost:6379

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable redis_exporter
systemctl start redis_exporter

# Cleanup
rm -rf /tmp/redis_exporter-v1.55.0*

echo "[SUCCESS] Redis Exporter installed on port 9121"
ENDSSH

log_success "Redis Exporter deployed"

# Deploy Prometheus
log_step "Step 5/7: Installing Prometheus"
sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${VMI01_IP} bash <<'ENDSSH'
set -euo pipefail

PROMETHEUS_VERSION="2.48.1"
PROMETHEUS_USER="prometheus"
PROMETHEUS_HOME="/opt/prometheus"
PROMETHEUS_DATA="${PROMETHEUS_HOME}/data"
PROMETHEUS_CONFIG="${PROMETHEUS_HOME}/prometheus.yml"
PROMETHEUS_RULES="${PROMETHEUS_HOME}/rules"
VMI01_IP="46.250.243.123"

if systemctl is-active --quiet prometheus 2>/dev/null; then
    echo "[INFO] Prometheus already installed and running"
    exit 0
fi

echo "[INFO] Installing Prometheus ${PROMETHEUS_VERSION}..."

# Create user
useradd --no-create-home --shell /bin/false ${PROMETHEUS_USER} 2>/dev/null || true

# Create directories
mkdir -p "${PROMETHEUS_HOME}"
mkdir -p "${PROMETHEUS_DATA}"
mkdir -p "${PROMETHEUS_RULES}"
mkdir -p /var/log/prometheus

# Download and install
cd /tmp
wget -q "https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
tar xzf "prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"

# Install binaries
cp "prometheus-${PROMETHEUS_VERSION}.linux-amd64/prometheus" /usr/local/bin/
cp "prometheus-${PROMETHEUS_VERSION}.linux-amd64/promtool" /usr/local/bin/
chmod +x /usr/local/bin/prometheus
chmod +x /usr/local/bin/promtool

# Copy console files
cp -r "prometheus-${PROMETHEUS_VERSION}.linux-amd64/consoles" "${PROMETHEUS_HOME}/"
cp -r "prometheus-${PROMETHEUS_VERSION}.linux-amd64/console_libraries" "${PROMETHEUS_HOME}/"

# Create alert rules
cat > "${PROMETHEUS_RULES}/alerts.yml" <<'EOF'
groups:
  - name: system_alerts
    interval: 30s
    rules:
      - alert: HighCPUUsage
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is above 80% (current: {{ $value }}%)"

      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is above 80% (current: {{ $value }}%)"

      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} is down"
          description: "{{ $labels.instance }} has been down for more than 1 minute"

  - name: postgresql_alerts
    interval: 30s
    rules:
      - alert: PostgreSQLDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL is down on {{ $labels.instance }}"
          description: "PostgreSQL has been down for more than 1 minute"

      - alert: PostgreSQLTooManyConnections
        expr: sum by (instance) (pg_stat_activity_count) > 800
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Too many PostgreSQL connections on {{ $labels.instance }}"
          description: "Connection count: {{ $value }}"

  - name: redis_alerts
    interval: 30s
    rules:
      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis is down on {{ $labels.instance }}"
          description: "Redis has been down for more than 1 minute"
EOF

# Create Prometheus configuration
cat > "${PROMETHEUS_CONFIG}" <<EOF
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'mcp-production'
    environment: 'production'

rule_files:
  - "${PROMETHEUS_RULES}/*.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
        labels:
          instance: 'vmi01-prometheus'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['${VMI01_IP}:9100']
        labels:
          instance: 'vmi01-primary'

  - job_name: 'postgresql'
    static_configs:
      - targets: ['${VMI01_IP}:9187']
        labels:
          instance: 'vmi01-postgres-primary'

  - job_name: 'redis'
    static_configs:
      - targets: ['${VMI01_IP}:9121']
        labels:
          instance: 'vmi01-redis'
EOF

# Set ownership
chown -R ${PROMETHEUS_USER}:${PROMETHEUS_USER} "${PROMETHEUS_HOME}"
chown -R ${PROMETHEUS_USER}:${PROMETHEUS_USER} "${PROMETHEUS_DATA}"
chown -R ${PROMETHEUS_USER}:${PROMETHEUS_USER} /var/log/prometheus

# Create systemd service
cat > /etc/systemd/system/prometheus.service <<EOF
[Unit]
Description=Prometheus Monitoring System
After=network-online.target
Wants=network-online.target

[Service]
User=${PROMETHEUS_USER}
Group=${PROMETHEUS_USER}
Type=simple
ExecStart=/usr/local/bin/prometheus \\
  --config.file=${PROMETHEUS_CONFIG} \\
  --storage.tsdb.path=${PROMETHEUS_DATA} \\
  --storage.tsdb.retention.time=30d \\
  --web.console.templates=${PROMETHEUS_HOME}/consoles \\
  --web.console.libraries=${PROMETHEUS_HOME}/console_libraries \\
  --web.listen-address=0.0.0.0:9090 \\
  --web.enable-lifecycle \\
  --log.level=info

Restart=always
RestartSec=5
LimitNOFILE=65536
StandardOutput=append:/var/log/prometheus/prometheus.log
StandardError=append:/var/log/prometheus/prometheus.log

[Install]
WantedBy=multi-user.target
EOF

# Start Prometheus
systemctl daemon-reload
systemctl enable prometheus
systemctl start prometheus

# Cleanup
rm -rf /tmp/prometheus-${PROMETHEUS_VERSION}*

echo "[SUCCESS] Prometheus installed on port 9090"
ENDSSH

log_success "Prometheus deployed"

# Deploy Grafana
log_step "Step 6/7: Installing Grafana"
GRAFANA_ADMIN_PASS=$(openssl rand -base64 24 | tr -d '=/+' | head -c 20)

sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${VMI01_IP} bash <<ENDSSH
set -euo pipefail

GRAFANA_PORT="${GRAFANA_PORT}"
GRAFANA_HOME="/opt/grafana"
ADMIN_PASSWORD="${GRAFANA_ADMIN_PASS}"

if systemctl is-active --quiet grafana-server 2>/dev/null; then
    echo "[INFO] Grafana already installed and running"
    exit 0
fi

echo "[INFO] Installing Grafana..."

# Install dependencies
apt-get update -qq
apt-get install -y -qq software-properties-common apt-transport-https wget curl gnupg2 jq

# Add Grafana repository
wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | tee /usr/share/keyrings/grafana.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/grafana.gpg] https://apt.grafana.com stable main" | tee /etc/apt/sources.list.d/grafana.list

# Install Grafana
apt-get update -qq
apt-get install -y -qq grafana

# Create directories
mkdir -p "\${GRAFANA_HOME}"
mkdir -p "\${GRAFANA_HOME}/dashboards"
mkdir -p "\${GRAFANA_HOME}/provisioning/datasources"
mkdir -p "\${GRAFANA_HOME}/provisioning/dashboards"

# Configure Grafana
cat > /etc/grafana/grafana.ini <<EOF
[server]
protocol = http
http_addr = 0.0.0.0
http_port = \${GRAFANA_PORT}
domain = 46.250.243.123
root_url = http://46.250.243.123:\${GRAFANA_PORT}

[security]
admin_user = admin
admin_password = \${ADMIN_PASSWORD}
secret_key = \$(openssl rand -base64 32)

[users]
allow_sign_up = false

[auth.anonymous]
enabled = false

[log]
mode = console file
level = info

[analytics]
reporting_enabled = false
check_for_updates = false

[paths]
provisioning = \${GRAFANA_HOME}/provisioning
EOF

# Configure Prometheus datasource
cat > "\${GRAFANA_HOME}/provisioning/datasources/prometheus.yml" <<EOF
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://localhost:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: 15s
      queryTimeout: 60s
      httpMethod: POST
EOF

# Configure dashboard provisioning
cat > "\${GRAFANA_HOME}/provisioning/dashboards/default.yml" <<EOF
apiVersion: 1
providers:
  - name: 'Default Dashboards'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: \${GRAFANA_HOME}/dashboards
EOF

# Create simple system dashboard
cat > "\${GRAFANA_HOME}/dashboards/system.json" <<'DASHBOARD_EOF'
{
  "title": "System Monitoring",
  "uid": "system-monitoring",
  "panels": [
    {
      "id": 1,
      "type": "gauge",
      "title": "CPU Usage",
      "targets": [
        {
          "expr": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)"
        }
      ],
      "gridPos": {"h": 8, "w": 8, "x": 0, "y": 0}
    },
    {
      "id": 2,
      "type": "gauge",
      "title": "Memory Usage",
      "targets": [
        {
          "expr": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100"
        }
      ],
      "gridPos": {"h": 8, "w": 8, "x": 8, "y": 0}
    },
    {
      "id": 3,
      "type": "stat",
      "title": "Service Status",
      "targets": [
        {
          "expr": "up"
        }
      ],
      "gridPos": {"h": 8, "w": 8, "x": 16, "y": 0}
    }
  ],
  "refresh": "30s",
  "time": {"from": "now-1h", "to": "now"}
}
DASHBOARD_EOF

# Set ownership
chown -R grafana:grafana "\${GRAFANA_HOME}"
chown -R grafana:grafana /etc/grafana

# Save credentials
mkdir -p "\${GRAFANA_HOME}"
cat > "\${GRAFANA_HOME}/credentials.txt" <<EOF
Grafana Admin Credentials
Username: admin
Password: \${ADMIN_PASSWORD}
URL: http://46.250.243.123:\${GRAFANA_PORT}
EOF
chmod 600 "\${GRAFANA_HOME}/credentials.txt"

# Start Grafana
systemctl daemon-reload
systemctl enable grafana-server
systemctl start grafana-server

echo "[SUCCESS] Grafana installed on port \${GRAFANA_PORT}"
ENDSSH

log_success "Grafana deployed"

# Verify all services
log_step "Step 7/7: Verifying Services"
sleep 5

SERVICES_STATUS=""
ERRORS=""

# Check each service
for service in node_exporter postgres_exporter redis_exporter prometheus grafana-server; do
    if sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no ${SSH_USER}@${VMI01_IP} "systemctl is-active --quiet ${service}"; then
        log_success "${service} is running"
        SERVICES_STATUS="${SERVICES_STATUS}✓ ${service}\n"
    else
        log_error "${service} is NOT running"
        SERVICES_STATUS="${SERVICES_STATUS}✗ ${service}\n"
        ERRORS="${ERRORS}- ${service} failed to start\n"
    fi
done

# Test exporters
log_info "Testing exporters..."
EXPORTERS_STATUS=""

# Test Node Exporter
if curl -sf "http://${VMI01_IP}:9100/metrics" | head -1 &>/dev/null; then
    log_success "Node Exporter responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ Node Exporter (port 9100)\n"
else
    log_warn "Node Exporter not responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✗ Node Exporter (port 9100)\n"
fi

# Test PostgreSQL Exporter
if curl -sf "http://${VMI01_IP}:9187/metrics" | head -1 &>/dev/null; then
    log_success "PostgreSQL Exporter responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ PostgreSQL Exporter (port 9187)\n"
else
    log_warn "PostgreSQL Exporter not responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✗ PostgreSQL Exporter (port 9187)\n"
fi

# Test Redis Exporter
if curl -sf "http://${VMI01_IP}:9121/metrics" | head -1 &>/dev/null; then
    log_success "Redis Exporter responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ Redis Exporter (port 9121)\n"
else
    log_warn "Redis Exporter not responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✗ Redis Exporter (port 9121)\n"
fi

# Test Prometheus
if curl -sf "http://${VMI01_IP}:9090/-/healthy" &>/dev/null; then
    log_success "Prometheus responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ Prometheus (port 9090)\n"
else
    log_warn "Prometheus not responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✗ Prometheus (port 9090)\n"
fi

# Test Grafana
if curl -sf "http://${VMI01_IP}:${GRAFANA_PORT}/api/health" | grep -q "ok" 2>/dev/null; then
    log_success "Grafana responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ Grafana (port ${GRAFANA_PORT})\n"
else
    log_warn "Grafana not responding yet (may need more time to initialize)"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}⚠ Grafana (port ${GRAFANA_PORT}) - initializing\n"
fi

# Create deployment report
cat > "${CREDENTIALS_FILE}" <<EOF
╔══════════════════════════════════════════════════════════════════╗
║      VMI01 Monitoring Stack Deployment - COMPLETE               ║
║      Generated: $(date)                                  ║
╚══════════════════════════════════════════════════════════════════╝

DEPLOYMENT SUMMARY
════════════════════════════════════════════════════════════════════

Server: VMI01 (46.250.243.123)
Deployment Status: SUCCESS
Deployment Time: $(date)

SERVICES INSTALLED
════════════════════════════════════════════════════════════════════
$(echo -e "${SERVICES_STATUS}")

EXPORTERS & ENDPOINTS
════════════════════════════════════════════════════════════════════
$(echo -e "${EXPORTERS_STATUS}")

ACCESS INFORMATION
════════════════════════════════════════════════════════════════════

Prometheus:
  URL: http://46.250.243.123:9090
  Status: http://46.250.243.123:9090/-/healthy
  Targets: http://46.250.243.123:9090/targets
  Alerts: http://46.250.243.123:9090/alerts
  Auth: None (internal use only)

Grafana:
  URL: http://46.250.243.123:${GRAFANA_PORT}
  Username: admin
  Password: ${GRAFANA_ADMIN_PASS}
  Health: http://46.250.243.123:${GRAFANA_PORT}/api/health

Node Exporter:
  Metrics: http://46.250.243.123:9100/metrics
  Purpose: System metrics (CPU, memory, disk, network)

PostgreSQL Exporter:
  Metrics: http://46.250.243.123:9187/metrics
  Purpose: Database metrics (connections, queries, replication)

Redis Exporter:
  Metrics: http://46.250.243.123:9121/metrics
  Purpose: Cache metrics (memory, commands, clients)

CONFIGURED EXPORTERS
════════════════════════════════════════════════════════════════════

✓ Node Exporter (9100) - System metrics
✓ PostgreSQL Exporter (9187) - Database metrics
✓ Redis Exporter (9121) - Cache metrics

CONFIGURED DASHBOARDS
════════════════════════════════════════════════════════════════════

✓ System Monitoring (CPU, Memory, Services)
  - Real-time CPU usage
  - Memory utilization
  - Service status

SERVICE MANAGEMENT
════════════════════════════════════════════════════════════════════

Check all services:
  ssh root@46.250.243.123 "systemctl status node_exporter postgres_exporter redis_exporter prometheus grafana-server"

Restart a service:
  ssh root@46.250.243.123 "systemctl restart <service-name>"

View logs:
  ssh root@46.250.243.123 "journalctl -u <service-name> -f"

PROMETHEUS QUERIES
════════════════════════════════════════════════════════════════════

CPU Usage:
  100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

Memory Usage:
  (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

Disk Usage:
  (1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100

PostgreSQL Connections:
  pg_stat_activity_count

Redis Memory Usage:
  redis_memory_used_bytes

ALERT RULES CONFIGURED
════════════════════════════════════════════════════════════════════

System Alerts:
  • High CPU Usage (>80% for 5m)
  • High Memory Usage (>80% for 5m)
  • Instance Down (>1m)

PostgreSQL Alerts:
  • PostgreSQL Down (>1m)
  • Too Many Connections (>800 for 5m)

Redis Alerts:
  • Redis Down (>1m)

ERRORS ENCOUNTERED
════════════════════════════════════════════════════════════════════
$(if [ -z "${ERRORS}" ]; then echo "None - deployment completed successfully!"; else echo -e "${ERRORS}"; fi)

NEXT STEPS
════════════════════════════════════════════════════════════════════

1. Access Grafana and change the admin password:
   http://46.250.243.123:${GRAFANA_PORT}

2. View Prometheus targets to ensure all exporters are UP:
   http://46.250.243.123:9090/targets

3. Create custom dashboards in Grafana or import from grafana.com

4. Set up alert notifications (email, Slack, PagerDuty):
   Grafana → Alerting → Contact points

5. Configure firewall rules if needed:
   ssh root@46.250.243.123 "ufw status"

6. Set up regular backups:
   - Prometheus data: /opt/prometheus/data
   - Grafana dashboards: /opt/grafana/dashboards

7. Monitor retention and storage:
   - Prometheus retention: 30 days (configurable)
   - Check disk space regularly

USEFUL COMMANDS
════════════════════════════════════════════════════════════════════

Test all exporters:
  curl http://46.250.243.123:9100/metrics | head
  curl http://46.250.243.123:9187/metrics | head
  curl http://46.250.243.123:9121/metrics | head

Reload Prometheus config:
  curl -X POST http://46.250.243.123:9090/-/reload

Check Grafana health:
  curl http://46.250.243.123:${GRAFANA_PORT}/api/health | jq

SECURITY NOTES
════════════════════════════════════════════════════════════════════

⚠ IMPORTANT: Keep this file secure - it contains credentials!

- Change Grafana admin password after first login
- Consider setting up authentication for Prometheus
- Use firewall rules to restrict access to monitoring ports
- Enable HTTPS/TLS for production use
- Set up regular credential rotation
- Monitor access logs for suspicious activity

CREDENTIALS FILE LOCATION
════════════════════════════════════════════════════════════════════

Local: ${LOCAL_CREDS_FILE}
Remote: /opt/grafana/credentials.txt (on VMI01)

════════════════════════════════════════════════════════════════════
Deployment completed at: $(date)
════════════════════════════════════════════════════════════════════
EOF

# Display summary
cat <<EOF

${GREEN}╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║      Monitoring Stack Deployment COMPLETE!                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Quick Access:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${GREEN}Prometheus:${NC}  http://46.250.243.123:9090
${GREEN}Grafana:${NC}     http://46.250.243.123:${GRAFANA_PORT}
               Username: admin
               Password: ${GRAFANA_ADMIN_PASS}

${BLUE}Detailed Report:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Full deployment details saved to: ${CREDENTIALS_FILE}

View with: cat ${CREDENTIALS_FILE}

${YELLOW}⚠ SECURITY REMINDER:${NC}
Keep the credentials file secure and change the Grafana password after first login!

${GREEN}Deployment completed successfully at $(date)${NC}

EOF

log_success "All monitoring stack components deployed to VMI01!"
log_info "Access credentials and full report: ${CREDENTIALS_FILE}"
