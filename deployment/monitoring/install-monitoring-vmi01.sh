#!/bin/bash
set -euo pipefail

#
# VMI01 Monitoring Stack Installation Script
# Run this script directly on VMI01 (46.250.243.123) as root
#
# Usage: bash install-monitoring-vmi01.sh
#

# Color codes
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Configuration
readonly PROMETHEUS_VERSION="2.48.1"
readonly GRAFANA_PORT="3001"
readonly VMI01_IP="46.250.243.123"
readonly CREDENTIALS_FILE="/tmp/monitoring-deployment-result.txt"

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

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

# Banner
cat <<'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║       VMI01 Monitoring Stack Installation - MCP Bundle v0.2.0   ║
║                                                                  ║
║  Components:                                                     ║
║    • Prometheus 2.48.1 (Metrics Database)                       ║
║    • Grafana 10.x (Dashboards & Visualization)                  ║
║    • Node Exporter (System Metrics)                             ║
║    • PostgreSQL Exporter (Database Metrics)                     ║
║    • Redis Exporter (Cache Metrics)                             ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF

log_info "Starting installation on VMI01 at $(date)"
echo

# Step 1: Install Node Exporter
log_step "Step 1/5: Installing Node Exporter"

if systemctl is-active --quiet node_exporter 2>/dev/null; then
    log_info "Node Exporter already installed and running"
else
    log_info "Installing Node Exporter..."

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

    log_success "Node Exporter installed on port 9100"
fi

# Step 2: Install PostgreSQL Exporter
log_step "Step 2/5: Installing PostgreSQL Exporter"

if systemctl is-active --quiet postgres_exporter 2>/dev/null; then
    log_info "PostgreSQL Exporter already installed and running"
else
    log_info "Installing PostgreSQL Exporter..."

    # Create user
    useradd --no-create-home --shell /bin/false postgres_exporter 2>/dev/null || true

    # Download and install
    cd /tmp
    wget -q https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz
    tar xzf postgres_exporter-0.15.0.linux-amd64.tar.gz
    cp postgres_exporter-0.15.0.linux-amd64/postgres_exporter /usr/local/bin/
    chown postgres_exporter:postgres_exporter /usr/local/bin/postgres_exporter
    chmod +x /usr/local/bin/postgres_exporter

    # Create environment file
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

    log_success "PostgreSQL Exporter installed on port 9187"
fi

# Step 3: Install Redis Exporter
log_step "Step 3/5: Installing Redis Exporter"

if systemctl is-active --quiet redis_exporter 2>/dev/null; then
    log_info "Redis Exporter already installed and running"
else
    log_info "Installing Redis Exporter..."

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

    log_success "Redis Exporter installed on port 9121"
fi

# Step 4: Install Prometheus
log_step "Step 4/5: Installing Prometheus"

PROMETHEUS_USER="prometheus"
PROMETHEUS_HOME="/opt/prometheus"
PROMETHEUS_DATA="${PROMETHEUS_HOME}/data"
PROMETHEUS_CONFIG="${PROMETHEUS_HOME}/prometheus.yml"
PROMETHEUS_RULES="${PROMETHEUS_HOME}/rules"

if systemctl is-active --quiet prometheus 2>/dev/null; then
    log_info "Prometheus already installed and running"
else
    log_info "Installing Prometheus ${PROMETHEUS_VERSION}..."

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

    log_success "Prometheus installed on port 9090"
fi

# Step 5: Install Grafana
log_step "Step 5/5: Installing Grafana"

GRAFANA_HOME="/opt/grafana"
ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+' | head -c 20)

if systemctl is-active --quiet grafana-server 2>/dev/null; then
    log_info "Grafana already installed and running"
    ADMIN_PASSWORD="<existing installation - check /opt/grafana/credentials.txt>"
else
    log_info "Installing Grafana..."

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
    mkdir -p "${GRAFANA_HOME}"
    mkdir -p "${GRAFANA_HOME}/dashboards"
    mkdir -p "${GRAFANA_HOME}/provisioning/datasources"
    mkdir -p "${GRAFANA_HOME}/provisioning/dashboards"

    # Configure Grafana
    cat > /etc/grafana/grafana.ini <<EOF
[server]
protocol = http
http_addr = 0.0.0.0
http_port = ${GRAFANA_PORT}
domain = ${VMI01_IP}
root_url = http://${VMI01_IP}:${GRAFANA_PORT}

[security]
admin_user = admin
admin_password = ${ADMIN_PASSWORD}
secret_key = $(openssl rand -base64 32)

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
provisioning = ${GRAFANA_HOME}/provisioning
EOF

    # Configure Prometheus datasource
    cat > "${GRAFANA_HOME}/provisioning/datasources/prometheus.yml" <<'EOF'
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
    cat > "${GRAFANA_HOME}/provisioning/dashboards/default.yml" <<EOF
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
      path: ${GRAFANA_HOME}/dashboards
EOF

    # Create basic system dashboard
    cat > "${GRAFANA_HOME}/dashboards/system.json" <<'DASHBOARD_EOF'
{
  "title": "System Monitoring",
  "uid": "system-monitoring",
  "panels": [
    {
      "id": 1,
      "type": "gauge",
      "title": "CPU Usage",
      "targets": [{
        "expr": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)"
      }],
      "gridPos": {"h": 8, "w": 8, "x": 0, "y": 0}
    },
    {
      "id": 2,
      "type": "gauge",
      "title": "Memory Usage",
      "targets": [{
        "expr": "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100"
      }],
      "gridPos": {"h": 8, "w": 8, "x": 8, "y": 0}
    },
    {
      "id": 3,
      "type": "stat",
      "title": "Service Status",
      "targets": [{"expr": "up"}],
      "gridPos": {"h": 8, "w": 8, "x": 16, "y": 0}
    }
  ],
  "refresh": "30s",
  "time": {"from": "now-1h", "to": "now"}
}
DASHBOARD_EOF

    # Set ownership
    chown -R grafana:grafana "${GRAFANA_HOME}"
    chown -R grafana:grafana /etc/grafana

    # Save credentials
    cat > "${GRAFANA_HOME}/credentials.txt" <<EOF
Grafana Admin Credentials
Username: admin
Password: ${ADMIN_PASSWORD}
URL: http://${VMI01_IP}:${GRAFANA_PORT}
EOF
    chmod 600 "${GRAFANA_HOME}/credentials.txt"

    # Start Grafana
    systemctl daemon-reload
    systemctl enable grafana-server
    systemctl start grafana-server

    log_success "Grafana installed on port ${GRAFANA_PORT}"
fi

# Wait for services to stabilize
log_step "Verifying Installation"
sleep 5

# Check service status
log_info "Checking service status..."
SERVICES_OK=0
SERVICES_TOTAL=5

for service in node_exporter postgres_exporter redis_exporter prometheus grafana-server; do
    if systemctl is-active --quiet ${service}; then
        log_success "${service} is running"
        ((SERVICES_OK++))
    else
        log_error "${service} is NOT running"
    fi
done

# Test exporters
log_info "Testing exporters..."
EXPORTERS_STATUS=""

if curl -sf http://localhost:9100/metrics | head -1 &>/dev/null; then
    log_success "Node Exporter responding on port 9100"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ Node Exporter (9100)\n"
else
    log_warn "Node Exporter not responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✗ Node Exporter (9100)\n"
fi

if curl -sf http://localhost:9187/metrics | head -1 &>/dev/null; then
    log_success "PostgreSQL Exporter responding on port 9187"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ PostgreSQL Exporter (9187)\n"
else
    log_warn "PostgreSQL Exporter not responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✗ PostgreSQL Exporter (9187)\n"
fi

if curl -sf http://localhost:9121/metrics | head -1 &>/dev/null; then
    log_success "Redis Exporter responding on port 9121"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ Redis Exporter (9121)\n"
else
    log_warn "Redis Exporter not responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✗ Redis Exporter (9121)\n"
fi

if curl -sf http://localhost:9090/-/healthy &>/dev/null; then
    log_success "Prometheus responding on port 9090"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ Prometheus (9090)\n"
else
    log_warn "Prometheus not responding"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✗ Prometheus (9090)\n"
fi

if curl -sf http://localhost:${GRAFANA_PORT}/api/health | grep -q "ok" 2>/dev/null; then
    log_success "Grafana responding on port ${GRAFANA_PORT}"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}✓ Grafana (${GRAFANA_PORT})\n"
else
    log_warn "Grafana still initializing (this is normal)"
    EXPORTERS_STATUS="${EXPORTERS_STATUS}⚠ Grafana (${GRAFANA_PORT}) - initializing\n"
fi

# Create deployment report
cat > "${CREDENTIALS_FILE}" <<EOF
╔══════════════════════════════════════════════════════════════════╗
║      VMI01 Monitoring Stack Installation - COMPLETE             ║
║      Generated: $(date)                                  ║
╚══════════════════════════════════════════════════════════════════╝

INSTALLATION SUMMARY
════════════════════════════════════════════════════════════════════

Server: VMI01 (${VMI01_IP})
Services Running: ${SERVICES_OK}/${SERVICES_TOTAL}
Installation Time: $(date)

SERVICES STATUS
════════════════════════════════════════════════════════════════════
$(systemctl status node_exporter postgres_exporter redis_exporter prometheus grafana-server --no-pager | grep "Active:" | sed 's/^/  /')

EXPORTERS & ENDPOINTS
════════════════════════════════════════════════════════════════════
$(echo -e "${EXPORTERS_STATUS}")

ACCESS INFORMATION
════════════════════════════════════════════════════════════════════

Prometheus:
  URL: http://${VMI01_IP}:9090
  Status: http://${VMI01_IP}:9090/-/healthy
  Targets: http://${VMI01_IP}:9090/targets
  Alerts: http://${VMI01_IP}:9090/alerts

Grafana:
  URL: http://${VMI01_IP}:${GRAFANA_PORT}
  Username: admin
  Password: ${ADMIN_PASSWORD}
  Health: http://${VMI01_IP}:${GRAFANA_PORT}/api/health

Exporters:
  Node Exporter: http://${VMI01_IP}:9100/metrics
  PostgreSQL Exporter: http://${VMI01_IP}:9187/metrics
  Redis Exporter: http://${VMI01_IP}:9121/metrics

NEXT STEPS
════════════════════════════════════════════════════════════════════

1. Access Grafana: http://${VMI01_IP}:${GRAFANA_PORT}
   Login with: admin / ${ADMIN_PASSWORD}

2. View Prometheus targets: http://${VMI01_IP}:9090/targets

3. Change Grafana admin password after first login

4. Import additional dashboards from grafana.com:
   - Node Exporter Full (ID: 1860)
   - PostgreSQL Database (ID: 9628)
   - Redis Dashboard (ID: 11835)

5. Set up alert notifications in Grafana

SERVICE MANAGEMENT
════════════════════════════════════════════════════════════════════

Check status:
  systemctl status <service-name>

Restart service:
  systemctl restart <service-name>

View logs:
  journalctl -u <service-name> -f

Service names:
  - node_exporter
  - postgres_exporter
  - redis_exporter
  - prometheus
  - grafana-server

CREDENTIALS
════════════════════════════════════════════════════════════════════

Grafana credentials also saved to: /opt/grafana/credentials.txt

⚠ SECURITY: Keep this file secure and change the Grafana password!

════════════════════════════════════════════════════════════════════
Installation completed at: $(date)
════════════════════════════════════════════════════════════════════
EOF

chmod 600 "${CREDENTIALS_FILE}"

# Display summary
cat <<EOF

${GREEN}╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║      Monitoring Stack Installation COMPLETE!                    ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Services Running: ${SERVICES_OK}/${SERVICES_TOTAL}${NC}

${BLUE}Quick Access:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${GREEN}Prometheus:${NC}  http://${VMI01_IP}:9090
${GREEN}Grafana:${NC}     http://${VMI01_IP}:${GRAFANA_PORT}
               Username: admin
               Password: ${ADMIN_PASSWORD}

${BLUE}Detailed Report:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Full installation details: ${CREDENTIALS_FILE}

${YELLOW}⚠ IMPORTANT:${NC}
1. Change Grafana password after first login
2. Keep credentials file secure
3. Grafana credentials also in: /opt/grafana/credentials.txt

${GREEN}Installation completed successfully!${NC}

EOF

log_success "Monitoring stack installed on VMI01!"
log_info "Access report: ${CREDENTIALS_FILE}"
