#!/bin/bash
set -euo pipefail

# Prometheus Deployment Script for VMI03 (154.26.158.31)
# Production-ready installation with comprehensive monitoring configuration

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
readonly PROMETHEUS_VERSION="2.48.1"
readonly PROMETHEUS_USER="prometheus"
readonly PROMETHEUS_HOME="/opt/prometheus"
readonly PROMETHEUS_DATA="${PROMETHEUS_HOME}/data"
readonly PROMETHEUS_CONFIG="${PROMETHEUS_HOME}/prometheus.yml"
readonly PROMETHEUS_RULES="${PROMETHEUS_HOME}/rules"
readonly PROMETHEUS_BIN="/usr/local/bin/prometheus"
readonly PROMETHEUS_PORT="9090"
readonly RETENTION_DAYS="30d"

# VM IPs
readonly VMI01_IP="46.250.243.123"
readonly VMI02D_IP="46.250.241.70"
readonly VMI03_IP="154.26.158.31"

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

# Error handler
cleanup_on_error() {
    log_error "Deployment failed. Rolling back changes..."
    systemctl stop prometheus 2>/dev/null || true
    systemctl disable prometheus 2>/dev/null || true
    exit 1
}

trap cleanup_on_error ERR

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

log_info "Starting Prometheus ${PROMETHEUS_VERSION} deployment on VMI03..."

# Create prometheus user if it doesn't exist
if ! id "${PROMETHEUS_USER}" &>/dev/null; then
    log_info "Creating prometheus user..."
    useradd --no-create-home --shell /bin/false "${PROMETHEUS_USER}"
    log_success "Prometheus user created"
else
    log_info "Prometheus user already exists"
fi

# Create directory structure
log_info "Creating directory structure..."
mkdir -p "${PROMETHEUS_HOME}"
mkdir -p "${PROMETHEUS_DATA}"
mkdir -p "${PROMETHEUS_RULES}"
mkdir -p /var/log/prometheus
mkdir -p /tmp/prometheus_install

# Download and install Prometheus
log_info "Downloading Prometheus ${PROMETHEUS_VERSION}..."
cd /tmp/prometheus_install

if [[ ! -f "prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz" ]]; then
    wget "https://github.com/prometheus/prometheus/releases/download/v${PROMETHEUS_VERSION}/prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz" \
        -O "prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"
    log_success "Downloaded Prometheus archive"
else
    log_info "Prometheus archive already exists, skipping download"
fi

log_info "Extracting Prometheus..."
tar xzf "prometheus-${PROMETHEUS_VERSION}.linux-amd64.tar.gz"

log_info "Installing Prometheus binaries..."
cp "prometheus-${PROMETHEUS_VERSION}.linux-amd64/prometheus" /usr/local/bin/
cp "prometheus-${PROMETHEUS_VERSION}.linux-amd64/promtool" /usr/local/bin/
chmod +x /usr/local/bin/prometheus
chmod +x /usr/local/bin/promtool

# Copy console files
cp -r "prometheus-${PROMETHEUS_VERSION}.linux-amd64/consoles" "${PROMETHEUS_HOME}/"
cp -r "prometheus-${PROMETHEUS_VERSION}.linux-amd64/console_libraries" "${PROMETHEUS_HOME}/"

log_success "Prometheus binaries installed"

# Create alert rules
log_info "Creating alert rules..."
cat > "${PROMETHEUS_RULES}/alerts.yml" <<'EOF'
groups:
  - name: system_alerts
    interval: 30s
    rules:
      # High CPU Usage
      - alert: HighCPUUsage
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is above 80% (current value: {{ $value }}%)"

      # Critical CPU Usage
      - alert: CriticalCPUUsage
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 95
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Critical CPU usage on {{ $labels.instance }}"
          description: "CPU usage is above 95% (current value: {{ $value }}%)"

      # High Memory Usage
      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is above 80% (current value: {{ $value }}%)"

      # Critical Memory Usage
      - alert: CriticalMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Critical memory usage on {{ $labels.instance }}"
          description: "Memory usage is above 90% (current value: {{ $value }}%)"

      # High Disk Usage
      - alert: HighDiskUsage
        expr: (1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100 > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High disk usage on {{ $labels.instance }}"
          description: "Disk usage is above 80% (current value: {{ $value }}%)"

      # Critical Disk Usage
      - alert: CriticalDiskUsage
        expr: (1 - (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"})) * 100 > 90
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Critical disk usage on {{ $labels.instance }}"
          description: "Disk usage is above 90% (current value: {{ $value }}%)"

      # Node Down
      - alert: InstanceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Instance {{ $labels.instance }} is down"
          description: "{{ $labels.instance }} of job {{ $labels.job }} has been down for more than 1 minute"

  - name: postgresql_alerts
    interval: 30s
    rules:
      # PostgreSQL Down
      - alert: PostgreSQLDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL is down on {{ $labels.instance }}"
          description: "PostgreSQL instance has been down for more than 1 minute"

      # Replication Lag
      - alert: PostgreSQLReplicationLag
        expr: pg_replication_lag > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL replication lag on {{ $labels.instance }}"
          description: "Replication lag is {{ $value }} seconds"

      # Critical Replication Lag
      - alert: PostgreSQLCriticalReplicationLag
        expr: pg_replication_lag > 60
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Critical PostgreSQL replication lag on {{ $labels.instance }}"
          description: "Replication lag is {{ $value }} seconds (critical threshold)"

      # Too Many Connections
      - alert: PostgreSQLTooManyConnections
        expr: sum by (instance) (pg_stat_activity_count) > 800
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Too many PostgreSQL connections on {{ $labels.instance }}"
          description: "Connection count is {{ $value }} (threshold: 800)"

      # Database Size Growing
      - alert: PostgreSQLDatabaseSizeGrowth
        expr: rate(pg_database_size_bytes[1h]) > 1073741824
        for: 30m
        labels:
          severity: warning
        annotations:
          summary: "High database growth rate on {{ $labels.instance }}"
          description: "Database is growing faster than 1GB/hour"

  - name: redis_alerts
    interval: 30s
    rules:
      # Redis Down
      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Redis is down on {{ $labels.instance }}"
          description: "Redis instance has been down for more than 1 minute"

      # High Memory Usage
      - alert: RedisHighMemoryUsage
        expr: (redis_memory_used_bytes / redis_memory_max_bytes) * 100 > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Redis high memory usage on {{ $labels.instance }}"
          description: "Redis memory usage is above 80% (current: {{ $value }}%)"

      # Too Many Clients
      - alert: RedisTooManyClients
        expr: redis_connected_clients > 800
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Too many Redis clients on {{ $labels.instance }}"
          description: "Connected clients: {{ $value }} (threshold: 800)"

  - name: mcp_alerts
    interval: 30s
    rules:
      # MCP Service Down
      - alert: MCPServiceDown
        expr: up{job=~"mcp-.*"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "MCP service {{ $labels.job }} is down"
          description: "MCP service has been unavailable for more than 2 minutes"

      # High Request Latency
      - alert: MCPHighLatency
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job=~"mcp-.*"}[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High request latency on {{ $labels.job }}"
          description: "95th percentile latency is {{ $value }}s"

      # High Error Rate
      - alert: MCPHighErrorRate
        expr: rate(http_requests_total{job=~"mcp-.*",status=~"5.."}[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate on {{ $labels.job }}"
          description: "Error rate is {{ $value }} errors/second"

  - name: haproxy_alerts
    interval: 30s
    rules:
      # HAProxy Backend Down
      - alert: HAProxyBackendDown
        expr: haproxy_backend_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "HAProxy backend {{ $labels.backend }} is down"
          description: "Backend has been down for more than 1 minute"

      # High Backend Response Time
      - alert: HAProxyHighResponseTime
        expr: haproxy_backend_response_time_average_seconds > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time on {{ $labels.backend }}"
          description: "Average response time is {{ $value }}s"

      # Server Down
      - alert: HAProxyServerDown
        expr: haproxy_server_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "HAProxy server {{ $labels.server }} in {{ $labels.backend }} is down"
          description: "Server has been down for more than 1 minute"
EOF

log_success "Alert rules created"

# Create Prometheus configuration
log_info "Creating Prometheus configuration..."
cat > "${PROMETHEUS_CONFIG}" <<EOF
# Prometheus Configuration for MCP Bundle v0.2.0
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'mcp-production'
    environment: 'production'

# Alertmanager configuration (optional, configure later)
# alerting:
#   alertmanagers:
#     - static_configs:
#         - targets:
#           - localhost:9093

# Load alert rules
rule_files:
  - "${PROMETHEUS_RULES}/*.yml"

# Scrape configurations
scrape_configs:
  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:${PROMETHEUS_PORT}']
        labels:
          instance: 'vmi03-prometheus'

  # Node Exporters - System Metrics
  - job_name: 'node-exporter'
    static_configs:
      - targets:
          - '${VMI01_IP}:9100'
          - '${VMI02D_IP}:9100'
          - '${VMI03_IP}:9100'
        labels:
          environment: 'production'
    relabel_configs:
      - source_labels: [__address__]
        regex: '${VMI01_IP}:.*'
        target_label: instance
        replacement: 'vmi01-primary'
      - source_labels: [__address__]
        regex: '${VMI02D_IP}:.*'
        target_label: instance
        replacement: 'vmi02d-standby'
      - source_labels: [__address__]
        regex: '${VMI03_IP}:.*'
        target_label: instance
        replacement: 'vmi03-gateway'

  # PostgreSQL Exporters
  - job_name: 'postgresql'
    static_configs:
      - targets:
          - '${VMI01_IP}:9187'
          - '${VMI02D_IP}:9187'
        labels:
          environment: 'production'
    relabel_configs:
      - source_labels: [__address__]
        regex: '${VMI01_IP}:.*'
        target_label: instance
        replacement: 'vmi01-postgres-primary'
      - source_labels: [__address__]
        regex: '${VMI02D_IP}:.*'
        target_label: instance
        replacement: 'vmi02d-postgres-standby'

  # Redis Exporter
  - job_name: 'redis'
    static_configs:
      - targets:
          - '${VMI01_IP}:9121'
        labels:
          environment: 'production'
          instance: 'vmi01-redis'

  # HAProxy Exporter
  - job_name: 'haproxy'
    static_configs:
      - targets:
          - '${VMI03_IP}:9101'
        labels:
          environment: 'production'
          instance: 'vmi03-haproxy'

  # MCP Service Metrics
  - job_name: 'mcp-orchestrator'
    metrics_path: '/metrics'
    static_configs:
      - targets:
          - '${VMI01_IP}:3000'
        labels:
          environment: 'production'
          instance: 'vmi01-mcp-orchestrator'
          service: 'orchestrator'

  - job_name: 'mcp-perplexity'
    metrics_path: '/metrics'
    static_configs:
      - targets:
          - '${VMI01_IP}:3001'
        labels:
          environment: 'production'
          instance: 'vmi01-mcp-perplexity'
          service: 'perplexity'

  - job_name: 'mcp-itjsst'
    metrics_path: '/metrics'
    static_configs:
      - targets:
          - '${VMI01_IP}:3002'
        labels:
          environment: 'production'
          instance: 'vmi01-mcp-itjsst'
          service: 'itjsst'

  # Additional exporters (configure after deployment)
  # - job_name: 'nginx'
  #   static_configs:
  #     - targets:
  #         - '${VMI03_IP}:9113'

  # - job_name: 'blackbox'
  #   metrics_path: /probe
  #   params:
  #     module: [http_2xx]
  #   static_configs:
  #     - targets:
  #         - https://${VMI03_IP}/health
  #   relabel_configs:
  #     - source_labels: [__address__]
  #       target_label: __param_target
  #     - source_labels: [__param_target]
  #       target_label: instance
  #     - target_label: __address__
  #       replacement: ${VMI03_IP}:9115
EOF

log_success "Prometheus configuration created"

# Validate configuration
log_info "Validating Prometheus configuration..."
if promtool check config "${PROMETHEUS_CONFIG}"; then
    log_success "Configuration is valid"
else
    log_error "Configuration validation failed"
    exit 1
fi

# Set ownership
log_info "Setting file permissions..."
chown -R "${PROMETHEUS_USER}:${PROMETHEUS_USER}" "${PROMETHEUS_HOME}"
chown -R "${PROMETHEUS_USER}:${PROMETHEUS_USER}" "${PROMETHEUS_DATA}"
chown -R "${PROMETHEUS_USER}:${PROMETHEUS_USER}" /var/log/prometheus
chmod 755 "${PROMETHEUS_HOME}"
chmod 755 "${PROMETHEUS_DATA}"
log_success "Permissions set"

# Create systemd service
log_info "Creating systemd service..."
cat > /etc/systemd/system/prometheus.service <<EOF
[Unit]
Description=Prometheus Monitoring System
Documentation=https://prometheus.io/docs/introduction/overview/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${PROMETHEUS_USER}
Group=${PROMETHEUS_USER}
ExecReload=/bin/kill -HUP \$MAINPID
ExecStart=${PROMETHEUS_BIN} \\
  --config.file=${PROMETHEUS_CONFIG} \\
  --storage.tsdb.path=${PROMETHEUS_DATA} \\
  --storage.tsdb.retention.time=${RETENTION_DAYS} \\
  --web.console.templates=${PROMETHEUS_HOME}/consoles \\
  --web.console.libraries=${PROMETHEUS_HOME}/console_libraries \\
  --web.listen-address=0.0.0.0:${PROMETHEUS_PORT} \\
  --web.enable-lifecycle \\
  --web.enable-admin-api \\
  --log.level=info \\
  --log.format=json

SyslogIdentifier=prometheus
Restart=always
RestartSec=5
LimitNOFILE=65536
StandardOutput=append:/var/log/prometheus/prometheus.log
StandardError=append:/var/log/prometheus/prometheus.log

[Install]
WantedBy=multi-user.target
EOF

log_success "Systemd service created"

# Create logrotate configuration
log_info "Configuring log rotation..."
cat > /etc/logrotate.d/prometheus <<'EOF'
/var/log/prometheus/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    missingok
    create 0644 prometheus prometheus
    postrotate
        systemctl reload prometheus > /dev/null 2>&1 || true
    endscript
}
EOF

log_success "Log rotation configured"

# Create health check script
log_info "Creating health check script..."
cat > "${PROMETHEUS_HOME}/health-check.sh" <<'EOF'
#!/bin/bash
# Prometheus Health Check Script

set -euo pipefail

readonly PROMETHEUS_URL="http://localhost:9090"
readonly PROMETHEUS_HEALTHY="${PROMETHEUS_URL}/-/healthy"
readonly PROMETHEUS_READY="${PROMETHEUS_URL}/-/ready"

check_health() {
    local url=$1
    local name=$2

    if curl -sf "${url}" > /dev/null; then
        echo "[OK] ${name}"
        return 0
    else
        echo "[FAIL] ${name}"
        return 1
    fi
}

echo "=== Prometheus Health Check ==="
echo

# Check if Prometheus is healthy
check_health "${PROMETHEUS_HEALTHY}" "Prometheus Health"
health_status=$?

# Check if Prometheus is ready
check_health "${PROMETHEUS_READY}" "Prometheus Ready"
ready_status=$?

# Check metrics endpoint
if curl -sf "${PROMETHEUS_URL}/metrics" | grep -q "prometheus_build_info"; then
    echo "[OK] Metrics Endpoint"
    metrics_status=0
else
    echo "[FAIL] Metrics Endpoint"
    metrics_status=1
fi

# Check targets
targets_up=$(curl -sf "${PROMETHEUS_URL}/api/v1/targets" | grep -o '"health":"up"' | wc -l)
targets_down=$(curl -sf "${PROMETHEUS_URL}/api/v1/targets" | grep -o '"health":"down"' | wc -l)
echo "[INFO] Targets: ${targets_up} UP, ${targets_down} DOWN"

# Overall status
echo
if [[ ${health_status} -eq 0 && ${ready_status} -eq 0 && ${metrics_status} -eq 0 ]]; then
    echo "=== Overall Status: HEALTHY ==="
    exit 0
else
    echo "=== Overall Status: UNHEALTHY ==="
    exit 1
fi
EOF

chmod +x "${PROMETHEUS_HOME}/health-check.sh"
log_success "Health check script created"

# Reload systemd and start service
log_info "Enabling and starting Prometheus service..."
systemctl daemon-reload
systemctl enable prometheus
systemctl restart prometheus

# Wait for service to start
sleep 5

# Check service status
if systemctl is-active --quiet prometheus; then
    log_success "Prometheus service is running"
else
    log_error "Prometheus service failed to start"
    journalctl -u prometheus -n 50 --no-pager
    exit 1
fi

# Run health check
log_info "Running health check..."
if "${PROMETHEUS_HOME}/health-check.sh"; then
    log_success "Health check passed"
else
    log_warn "Health check failed - some targets may not be available yet"
fi

# Configure firewall (if UFW is active)
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
    log_info "Configuring firewall..."
    # Allow Prometheus port from internal network
    ufw allow from 10.0.50.0/24 to any port ${PROMETHEUS_PORT} comment 'Prometheus from WireGuard'
    ufw allow from 10.0.51.0/24 to any port ${PROMETHEUS_PORT} comment 'Prometheus from WireGuard'
    ufw allow from 10.0.52.0/24 to any port ${PROMETHEUS_PORT} comment 'Prometheus from WireGuard'
    log_success "Firewall rules added"
fi

# Cleanup
rm -rf /tmp/prometheus_install

# Print summary
cat <<EOF

${GREEN}╔════════════════════════════════════════════════════════════════╗
║          Prometheus Deployment Complete!                      ║
╚════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Installation Details:${NC}
  Version:        ${PROMETHEUS_VERSION}
  Home Directory: ${PROMETHEUS_HOME}
  Data Directory: ${PROMETHEUS_DATA}
  Configuration:  ${PROMETHEUS_CONFIG}
  Web UI:         http://${VMI03_IP}:${PROMETHEUS_PORT}
  Retention:      ${RETENTION_DAYS}

${BLUE}Service Management:${NC}
  Status:         systemctl status prometheus
  Start:          systemctl start prometheus
  Stop:           systemctl stop prometheus
  Restart:        systemctl restart prometheus
  Logs:           journalctl -u prometheus -f
  Health Check:   ${PROMETHEUS_HOME}/health-check.sh

${BLUE}Configuration:${NC}
  Config File:    ${PROMETHEUS_CONFIG}
  Alert Rules:    ${PROMETHEUS_RULES}/alerts.yml
  Validate:       promtool check config ${PROMETHEUS_CONFIG}
  Reload:         curl -X POST http://localhost:${PROMETHEUS_PORT}/-/reload

${BLUE}Monitoring Targets:${NC}
  Node Exporters:     VMI01, VMI02D, VMI03 (:9100)
  PostgreSQL:         VMI01, VMI02D (:9187)
  Redis:              VMI01 (:9121)
  HAProxy:            VMI03 (:9101)
  MCP Services:       VMI01 (:3000-3002)

${BLUE}Next Steps:${NC}
  1. Verify targets: http://${VMI03_IP}:${PROMETHEUS_PORT}/targets
  2. Check alerts: http://${VMI03_IP}:${PROMETHEUS_PORT}/alerts
  3. Configure exporters on target machines
  4. Set up Alertmanager (optional)
  5. Integrate with Grafana for visualization

${YELLOW}Note:${NC} Ensure all exporters are running on target machines.
${YELLOW}Note:${NC} Configure HAProxy to expose Prometheus securely if needed.

EOF

log_success "Prometheus deployment completed successfully!"
