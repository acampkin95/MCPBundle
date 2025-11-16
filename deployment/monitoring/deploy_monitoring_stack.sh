#!/bin/bash

# Infrastructure Monitoring Stack Deployment
# HAProxy, Prometheus, Grafana, and Exporters

set -e

# Configuration
VMI03_IP="154.26.158.31"
VMI01_IP="46.250.243.123"
VMI02D_IP="185.21.217.89"
ROOT_PASS="${ROOT_PASS:-${MCP_ROOT_PASSWORD:-}}"

if [[ -z "${ROOT_PASS:-}" ]]; then
    echo "Set ROOT_PASS or MCP_ROOT_PASSWORD from Vault before running." >&2
    exit 1
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Starting Infrastructure Monitoring Stack Deployment${NC}"

# Function to execute commands on remote server
execute_remote() {
    local server=$1
    local command=$2
    SSHPASS="$ROOT_PASS" sshpass -e ssh -o StrictHostKeyChecking=no root@$server "$command"
}

# Function to copy files to remote server
copy_to_remote() {
    local server=$1
    local local_file=$2
    local remote_file=$3
    SSHPASS="$ROOT_PASS" sshpass -e scp -o StrictHostKeyChecking=no "$local_file" root@$server:"$remote_file"
}

# ============================================
# 1. Deploy HAProxy on VMI03
# ============================================

echo -e "${YELLOW}Deploying HAProxy on VMI03...${NC}"

# Install HAProxy
execute_remote $VMI03_IP "
    apt-get update
    apt-get install -y haproxy certbot
    systemctl stop haproxy
"

# Create HAProxy configuration
cat > haproxy.cfg << 'EOF'
global
    log /dev/log local0
    log /dev/log local1 notice
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

    # SSL/TLS configuration
    tune.ssl.default-dh-param 2048
    ssl-default-bind-ciphers ECDHE+AESGCM:ECDHE+AES256:ECDHE+AES128:!PSK:!DHE:!RSA:!DSS:!aNull:!MD5
    ssl-default-bind-options no-sslv3 no-tlsv10 no-tlsv11

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    option  http-server-close
    option  forwardfor except 127.0.0.0/8
    option  redispatch
    retries 3
    timeout http-request    10s
    timeout queue           1m
    timeout connect         10s
    timeout client          1m
    timeout server          1m
    timeout http-keep-alive 10s
    timeout check           10s
    maxconn                 3000

# Statistics
stats enable
stats uri /stats
stats realm HAProxy\ Statistics
stats auth admin:MonitoringAdmin2024!
stats refresh 30s
stats show-legends
stats show-node

# Frontend for HTTP
frontend http_front
    bind *:80
    redirect scheme https if !{ ssl_fc }

# Frontend for HTTPS (will add SSL after certbot)
frontend https_front
    bind *:443

    # ACL for different services
    acl is_orchestrator path_beg /orchestrator
    acl is_perplexity path_beg /perplexity
    acl is_it_service path_beg /it-service

    # Use backends based on ACL
    use_backend orchestrator_backend if is_orchestrator
    use_backend perplexity_backend if is_perplexity
    use_backend it_backend if is_it_service
    default_backend orchestrator_backend

# Backend for MCP Orchestrator
backend orchestrator_backend
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server orchestrator1 46.250.243.123:3000 check inter 5s rise 2 fall 3

# Backend for Perplexity MCP
backend perplexity_backend
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server perplexity1 46.250.243.123:3001 check inter 5s rise 2 fall 3

# Backend for IT MCP
backend it_backend
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server it_service1 46.250.243.123:3002 check inter 5s rise 2 fall 3

# Stats page
listen stats
    bind *:8404
    stats enable
    stats uri /
    stats realm HAProxy\ Statistics
    stats auth admin:HAProxyStats2024!
    stats admin if TRUE
EOF

# Copy HAProxy configuration
copy_to_remote $VMI03_IP "haproxy.cfg" "/etc/haproxy/haproxy.cfg"

# Start HAProxy
execute_remote $VMI03_IP "
    systemctl enable haproxy
    systemctl start haproxy
    systemctl status haproxy --no-pager
"

# ============================================
# 2. Deploy Prometheus on VMI03
# ============================================

echo -e "${YELLOW}Deploying Prometheus on VMI03...${NC}"

execute_remote $VMI03_IP "
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

    # Copy console files
    cp -r prometheus-2.45.0.linux-amd64/consoles /etc/prometheus
    cp -r prometheus-2.45.0.linux-amd64/console_libraries /etc/prometheus

    # Set permissions
    chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
    chown prometheus:prometheus /usr/local/bin/prometheus /usr/local/bin/promtool

    # Cleanup
    rm -rf prometheus-2.45.0.linux-amd64*
"

# Create Prometheus configuration
cat > prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets: []

# Load rules once and periodically evaluate them
rule_files:
  - "alert_rules.yml"

# Scrape configurations
scrape_configs:
  # Prometheus itself
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter - VMI03
  - job_name: 'node-vmi03'
    static_configs:
      - targets: ['localhost:9100']
        labels:
          instance: 'vmi03-gateway'
          environment: 'production'

  # Node Exporter - VMI01
  - job_name: 'node-vmi01'
    static_configs:
      - targets: ['46.250.243.123:9100']
        labels:
          instance: 'vmi01-services'
          environment: 'production'

  # Node Exporter - VMI02D
  - job_name: 'node-vmi02d'
    static_configs:
      - targets: ['185.21.217.89:9100']
        labels:
          instance: 'vmi02d-database'
          environment: 'production'

  # PostgreSQL Exporter - VMI01
  - job_name: 'postgres-vmi01'
    static_configs:
      - targets: ['46.250.243.123:9187']
        labels:
          instance: 'vmi01-postgres'
          environment: 'production'

  # PostgreSQL Exporter - VMI02D
  - job_name: 'postgres-vmi02d'
    static_configs:
      - targets: ['185.21.217.89:9187']
        labels:
          instance: 'vmi02d-postgres'
          environment: 'production'

  # HAProxy Exporter
  - job_name: 'haproxy'
    static_configs:
      - targets: ['localhost:9101']
        labels:
          instance: 'haproxy-lb'

  # MCP Services
  - job_name: 'mcp-orchestrator'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['46.250.243.123:3000']
        labels:
          service: 'mcp-orchestrator'

  - job_name: 'mcp-perplexity'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['46.250.243.123:3001']
        labels:
          service: 'mcp-perplexity'

  - job_name: 'mcp-it-service'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['46.250.243.123:3002']
        labels:
          service: 'mcp-it-service'
EOF

# Create alert rules
cat > alert_rules.yml << 'EOF'
groups:
  - name: system_alerts
    interval: 30s
    rules:
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage on {{ $labels.instance }}"
          description: "CPU usage is above 80% (current value: {{ $value }}%)"

      - alert: HighMemoryUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage on {{ $labels.instance }}"
          description: "Memory usage is above 85% (current value: {{ $value }}%)"

      - alert: LowDiskSpace
        expr: (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 < 20
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Low disk space on {{ $labels.instance }}"
          description: "Disk space is below 20% (current value: {{ $value }}%)"

      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Service down: {{ $labels.job }}"
          description: "{{ $labels.instance }} has been down for more than 1 minute"

  - name: database_alerts
    interval: 30s
    rules:
      - alert: PostgreSQLDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL down on {{ $labels.instance }}"
          description: "PostgreSQL database is not responding"

      - alert: PostgreSQLReplicationLag
        expr: pg_replication_lag > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "PostgreSQL replication lag on {{ $labels.instance }}"
          description: "Replication lag is {{ $value }} seconds"

      - alert: PostgreSQLTooManyConnections
        expr: sum by (instance) (pg_stat_activity_count) > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Too many PostgreSQL connections on {{ $labels.instance }}"
          description: "{{ $value }} active connections"

  - name: mcp_service_alerts
    interval: 30s
    rules:
      - alert: MCPServiceDown
        expr: up{job=~"mcp-.*"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "MCP service down: {{ $labels.service }}"
          description: "{{ $labels.service }} has been down for more than 1 minute"

      - alert: MCPHighResponseTime
        expr: http_request_duration_seconds{quantile="0.99"} > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time for {{ $labels.service }}"
          description: "99th percentile response time is {{ $value }} seconds"
EOF

# Copy Prometheus configuration files
copy_to_remote $VMI03_IP "prometheus.yml" "/etc/prometheus/prometheus.yml"
copy_to_remote $VMI03_IP "alert_rules.yml" "/etc/prometheus/alert_rules.yml"

# Create Prometheus systemd service
cat > prometheus.service << 'EOF'
[Unit]
Description=Prometheus
Wants=network-online.target
After=network-online.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus \
    --config.file /etc/prometheus/prometheus.yml \
    --storage.tsdb.path /var/lib/prometheus/ \
    --storage.tsdb.retention.time=30d \
    --storage.tsdb.retention.size=10GB \
    --web.console.templates=/etc/prometheus/consoles \
    --web.console.libraries=/etc/prometheus/console_libraries \
    --web.enable-lifecycle \
    --web.enable-admin-api

Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

copy_to_remote $VMI03_IP "prometheus.service" "/etc/systemd/system/prometheus.service"

# Start Prometheus
execute_remote $VMI03_IP "
    chown -R prometheus:prometheus /etc/prometheus /var/lib/prometheus
    systemctl daemon-reload
    systemctl enable prometheus
    systemctl start prometheus
    systemctl status prometheus --no-pager
"

# ============================================
# 3. Install Node Exporters on all VMs
# ============================================

echo -e "${YELLOW}Installing Node Exporters on all VMs...${NC}"

for server in $VMI03_IP $VMI01_IP $VMI02D_IP; do
    echo "Installing Node Exporter on $server..."
    execute_remote $server "
        # Create node_exporter user
        useradd --no-create-home --shell /bin/false node_exporter || true

        # Download and install
        cd /tmp
        wget -q https://github.com/prometheus/node_exporter/releases/download/v1.6.0/node_exporter-1.6.0.linux-amd64.tar.gz
        tar xf node_exporter-1.6.0.linux-amd64.tar.gz

        # Install binary
        cp node_exporter-1.6.0.linux-amd64/node_exporter /usr/local/bin/
        chown node_exporter:node_exporter /usr/local/bin/node_exporter

        # Cleanup
        rm -rf node_exporter-1.6.0.linux-amd64*

        # Create systemd service
        cat > /etc/systemd/system/node_exporter.service << 'EEOF'
[Unit]
Description=Node Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
EEOF

        # Start service
        systemctl daemon-reload
        systemctl enable node_exporter
        systemctl start node_exporter
        systemctl status node_exporter --no-pager
    "
done

# ============================================
# 4. Install PostgreSQL Exporters
# ============================================

echo -e "${YELLOW}Installing PostgreSQL Exporters...${NC}"

# Install on VMI01
execute_remote $VMI01_IP "
    # Download postgres_exporter
    cd /tmp
    wget -q https://github.com/prometheus-community/postgres_exporter/releases/download/v0.13.2/postgres_exporter-0.13.2.linux-amd64.tar.gz
    tar xf postgres_exporter-0.13.2.linux-amd64.tar.gz

    # Install binary
    cp postgres_exporter-0.13.2.linux-amd64/postgres_exporter /usr/local/bin/

    # Create user
    useradd --no-create-home --shell /bin/false postgres_exporter || true
    chown postgres_exporter:postgres_exporter /usr/local/bin/postgres_exporter

    # Create environment file
    cat > /etc/postgres_exporter.env << 'EEOF'
DATA_SOURCE_NAME=\"postgresql://postgres:your_password@localhost:5432/postgres?sslmode=disable\"
EEOF

    # Create systemd service
    cat > /etc/systemd/system/postgres_exporter.service << 'EEOF'
[Unit]
Description=PostgreSQL Exporter
After=network.target

[Service]
User=postgres_exporter
Group=postgres_exporter
Type=simple
EnvironmentFile=/etc/postgres_exporter.env
ExecStart=/usr/local/bin/postgres_exporter

[Install]
WantedBy=multi-user.target
EEOF

    # Start service
    systemctl daemon-reload
    systemctl enable postgres_exporter
    systemctl start postgres_exporter

    # Cleanup
    rm -rf postgres_exporter-0.13.2.linux-amd64*
"

# Install on VMI02D
execute_remote $VMI02D_IP "
    # Download postgres_exporter
    cd /tmp
    wget -q https://github.com/prometheus-community/postgres_exporter/releases/download/v0.13.2/postgres_exporter-0.13.2.linux-amd64.tar.gz
    tar xf postgres_exporter-0.13.2.linux-amd64.tar.gz

    # Install binary
    cp postgres_exporter-0.13.2.linux-amd64/postgres_exporter /usr/local/bin/

    # Create user
    useradd --no-create-home --shell /bin/false postgres_exporter || true
    chown postgres_exporter:postgres_exporter /usr/local/bin/postgres_exporter

    # Create environment file
    cat > /etc/postgres_exporter.env << 'EEOF'
DATA_SOURCE_NAME=\"postgresql://postgres:your_password@localhost:5432/postgres?sslmode=disable\"
EEOF

    # Create systemd service
    cat > /etc/systemd/system/postgres_exporter.service << 'EEOF'
[Unit]
Description=PostgreSQL Exporter
After=network.target

[Service]
User=postgres_exporter
Group=postgres_exporter
Type=simple
EnvironmentFile=/etc/postgres_exporter.env
ExecStart=/usr/local/bin/postgres_exporter

[Install]
WantedBy=multi-user.target
EEOF

    # Start service
    systemctl daemon-reload
    systemctl enable postgres_exporter
    systemctl start postgres_exporter

    # Cleanup
    rm -rf postgres_exporter-0.13.2.linux-amd64*
"

# ============================================
# 5. Install HAProxy Exporter on VMI03
# ============================================

echo -e "${YELLOW}Installing HAProxy Exporter...${NC}"

execute_remote $VMI03_IP "
    # Download HAProxy exporter
    cd /tmp
    wget -q https://github.com/prometheus/haproxy_exporter/releases/download/v0.15.0/haproxy_exporter-0.15.0.linux-amd64.tar.gz
    tar xf haproxy_exporter-0.15.0.linux-amd64.tar.gz

    # Install binary
    cp haproxy_exporter-0.15.0.linux-amd64/haproxy_exporter /usr/local/bin/

    # Create user
    useradd --no-create-home --shell /bin/false haproxy_exporter || true
    chown haproxy_exporter:haproxy_exporter /usr/local/bin/haproxy_exporter

    # Create systemd service
    cat > /etc/systemd/system/haproxy_exporter.service << 'EEOF'
[Unit]
Description=HAProxy Exporter
After=network.target

[Service]
User=haproxy_exporter
Group=haproxy_exporter
Type=simple
ExecStart=/usr/local/bin/haproxy_exporter --haproxy.scrape-uri=\"http://admin:HAProxyStats2024!@localhost:8404/stats;csv\"

[Install]
WantedBy=multi-user.target
EEOF

    # Start service
    systemctl daemon-reload
    systemctl enable haproxy_exporter
    systemctl start haproxy_exporter

    # Cleanup
    rm -rf haproxy_exporter-0.15.0.linux-amd64*
"

# ============================================
# 6. Deploy Grafana on VMI03
# ============================================

echo -e "${YELLOW}Deploying Grafana on VMI03...${NC}"

execute_remote $VMI03_IP "
    # Install Grafana
    apt-get install -y software-properties-common
    wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
    add-apt-repository 'deb https://packages.grafana.com/oss/deb stable main'
    apt-get update
    apt-get install -y grafana

    # Configure Grafana
    cat > /etc/grafana/grafana.ini << 'EEOF'
[server]
protocol = http
http_port = 3000
domain = localhost
root_url = http://localhost:3000
enable_gzip = true

[database]
type = sqlite3

[session]
provider = file

[analytics]
reporting_enabled = false

[security]
admin_user = admin
admin_password = GrafanaAdmin2024!
secret_key = SW2YcwKHoNRdK8VrszmFWIkGKdDfr3eD
disable_gravatar = true

[users]
allow_sign_up = false
default_theme = dark

[auth]
disable_login_form = false

[auth.anonymous]
enabled = true
org_name = Main Org.
org_role = Viewer

[log]
mode = console
level = info

[alerting]
enabled = true

[unified_alerting]
enabled = true

[smtp]
enabled = false
EEOF

    # Start Grafana
    systemctl daemon-reload
    systemctl enable grafana-server
    systemctl start grafana-server
    systemctl status grafana-server --no-pager
"

# ============================================
# 7. Configure Grafana Data Sources and Dashboards
# ============================================

echo -e "${YELLOW}Configuring Grafana data sources and dashboards...${NC}"

# Create Prometheus data source configuration
cat > prometheus-datasource.json << 'EOF'
{
  "name": "Prometheus",
  "type": "prometheus",
  "access": "proxy",
  "url": "http://localhost:9090",
  "basicAuth": false,
  "isDefault": true,
  "jsonData": {
    "httpMethod": "POST",
    "keepCookies": [],
    "timeInterval": "15s"
  }
}
EOF

# Add Prometheus data source to Grafana
execute_remote $VMI03_IP "
    sleep 10  # Wait for Grafana to fully start

    # Add Prometheus data source
    curl -X POST \
      -H 'Content-Type: application/json' \
      -u 'admin:GrafanaAdmin2024!' \
      -d '{
        \"name\": \"Prometheus\",
        \"type\": \"prometheus\",
        \"access\": \"proxy\",
        \"url\": \"http://localhost:9090\",
        \"basicAuth\": false,
        \"isDefault\": true,
        \"jsonData\": {
          \"httpMethod\": \"POST\",
          \"timeInterval\": \"15s\"
        }
      }' \
      http://localhost:3000/api/datasources

    # Import Node Exporter Dashboard
    curl -X POST \
      -H 'Content-Type: application/json' \
      -u 'admin:GrafanaAdmin2024!' \
      -d '{
        \"dashboard\": {
          \"id\": null,
          \"uid\": null,
          \"title\": \"Node Exporter Full\"
        },
        \"overwrite\": true,
        \"inputs\": [{
          \"name\": \"DS_PROMETHEUS\",
          \"type\": \"datasource\",
          \"pluginId\": \"prometheus\",
          \"value\": \"Prometheus\"
        }]
      }' \
      http://localhost:3000/api/dashboards/import
"

# ============================================
# 8. Create Health Check Scripts
# ============================================

echo -e "${YELLOW}Creating health check scripts...${NC}"

# Create health check script
cat > health_check.sh << 'EOF'
#!/bin/bash

# MCP Services Health Check Script

set -e

# Configuration
MCP_ORCHESTRATOR="http://46.250.243.123:3000/health"
MCP_PERPLEXITY="http://46.250.243.123:3001/health"
MCP_IT_SERVICE="http://46.250.243.123:3002/health"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "======================================"
echo "MCP Services Health Check"
echo "======================================"

# Function to check service
check_service() {
    local name=$1
    local url=$2

    response=$(curl -s -o /dev/null -w "%{http_code}" $url 2>/dev/null || echo "000")

    if [ "$response" == "200" ]; then
        echo -e "${GREEN}✓${NC} $name: ${GREEN}Healthy${NC}"
        return 0
    else
        echo -e "${RED}✗${NC} $name: ${RED}Unhealthy (HTTP $response)${NC}"
        return 1
    fi
}

# Check services
check_service "MCP Orchestrator" "$MCP_ORCHESTRATOR"
check_service "MCP Perplexity" "$MCP_PERPLEXITY"
check_service "MCP IT Service" "$MCP_IT_SERVICE"

# Check HAProxy
haproxy_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8404/stats 2>/dev/null || echo "000")
if [ "$haproxy_status" == "200" ] || [ "$haproxy_status" == "401" ]; then
    echo -e "${GREEN}✓${NC} HAProxy: ${GREEN}Running${NC}"
else
    echo -e "${RED}✗${NC} HAProxy: ${RED}Not responding${NC}"
fi

# Check Prometheus
prometheus_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9090/-/healthy 2>/dev/null || echo "000")
if [ "$prometheus_status" == "200" ]; then
    echo -e "${GREEN}✓${NC} Prometheus: ${GREEN}Running${NC}"
else
    echo -e "${RED}✗${NC} Prometheus: ${RED}Not responding${NC}"
fi

# Check Grafana
grafana_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null || echo "000")
if [ "$grafana_status" == "200" ]; then
    echo -e "${GREEN}✓${NC} Grafana: ${GREEN}Running${NC}"
else
    echo -e "${RED}✗${NC} Grafana: ${RED}Not responding${NC}"
fi

echo "======================================"
EOF

# Copy health check script to VMI03
copy_to_remote $VMI03_IP "health_check.sh" "/usr/local/bin/health_check.sh"
execute_remote $VMI03_IP "chmod +x /usr/local/bin/health_check.sh"

# Create database health check script
cat > db_health_check.sh << 'EOF'
#!/bin/bash

# Database Health Check Script

# Check PostgreSQL on VMI01
echo "Checking PostgreSQL on VMI01..."
PGPASSWORD=your_password psql -h 46.250.243.123 -U postgres -c "SELECT 1" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ PostgreSQL on VMI01: Healthy"
else
    echo "✗ PostgreSQL on VMI01: Not responding"
fi

# Check PostgreSQL on VMI02D
echo "Checking PostgreSQL on VMI02D..."
PGPASSWORD=your_password psql -h 185.21.217.89 -U postgres -c "SELECT 1" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ PostgreSQL on VMI02D: Healthy"
else
    echo "✗ PostgreSQL on VMI02D: Not responding"
fi

# Check replication status (if configured)
echo "Checking replication status..."
PGPASSWORD=your_password psql -h 46.250.243.123 -U postgres -c "SELECT * FROM pg_stat_replication;" 2>/dev/null
EOF

copy_to_remote $VMI03_IP "db_health_check.sh" "/usr/local/bin/db_health_check.sh"
execute_remote $VMI03_IP "chmod +x /usr/local/bin/db_health_check.sh"

# ============================================
# 9. Set up Monitoring Cron Jobs
# ============================================

echo -e "${YELLOW}Setting up monitoring cron jobs...${NC}"

execute_remote $VMI03_IP "
    # Add health check cron job
    (crontab -l 2>/dev/null || true; echo '*/5 * * * * /usr/local/bin/health_check.sh > /var/log/health_check.log 2>&1') | crontab -

    # Add database health check cron job
    (crontab -l 2>/dev/null || true; echo '*/10 * * * * /usr/local/bin/db_health_check.sh > /var/log/db_health_check.log 2>&1') | crontab -
"

# ============================================
# 10. Configure Firewall Rules
# ============================================

echo -e "${YELLOW}Configuring firewall rules...${NC}"

execute_remote $VMI03_IP "
    # Configure UFW firewall rules
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'
    ufw allow 3000/tcp comment 'Grafana'
    ufw allow 8404/tcp comment 'HAProxy Stats'
    ufw allow 9090/tcp comment 'Prometheus'
    ufw allow 9100/tcp comment 'Node Exporter'
    ufw allow 9101/tcp comment 'HAProxy Exporter'

    # Reload firewall
    ufw --force enable
    ufw status verbose
"

# ============================================
# Final Status Check
# ============================================

echo -e "${GREEN}======================================"
echo "Deployment Complete!"
echo "======================================${NC}"

echo -e "${YELLOW}Service Status:${NC}"
execute_remote $VMI03_IP "/usr/local/bin/health_check.sh"

echo -e "${GREEN}======================================"
echo "Access Information"
echo "======================================${NC}"
echo ""
echo "HAProxy Stats Page:"
echo "  URL: http://$VMI03_IP:8404"
echo "  Username: admin"
echo "  Password: HAProxyStats2024!"
echo ""
echo "Prometheus:"
echo "  URL: http://$VMI03_IP:9090"
echo ""
echo "Grafana:"
echo "  URL: http://$VMI03_IP:3000"
echo "  Username: admin"
echo "  Password: GrafanaAdmin2024!"
echo ""
echo "Load Balancer (HAProxy):"
echo "  HTTP: http://$VMI03_IP"
echo "  HTTPS: https://$VMI03_IP"
echo ""
echo -e "${YELLOW}Health Check Commands:${NC}"
echo "  /usr/local/bin/health_check.sh"
echo "  /usr/local/bin/db_health_check.sh"
echo ""
echo -e "${GREEN}Monitoring Stack Deployment Complete!${NC}"
EOF

# Make deployment script executable
chmod +x /Users/alex/Projects/MCP Bundle/deployment/monitoring/deploy_monitoring_stack.sh

echo "Deployment script created at: /Users/alex/Projects/MCP Bundle/deployment/monitoring/deploy_monitoring_stack.sh"
