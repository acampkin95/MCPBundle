#!/bin/bash
set -euo pipefail

# Grafana Deployment Script for VMI03 (154.26.158.31)
# Production-ready installation with Keycloak SSO and pre-built dashboards

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
readonly GRAFANA_VERSION="10.2.3"
readonly GRAFANA_HOME="/opt/grafana"
readonly GRAFANA_DATA="${GRAFANA_HOME}/data"
readonly GRAFANA_CONFIG="/etc/grafana/grafana.ini"
readonly GRAFANA_PORT="3030"
readonly GRAFANA_DOMAIN="grafana.mcp.local"
readonly CREDENTIALS_FILE="${GRAFANA_HOME}/credentials.txt"

# VM IPs
readonly VMI01_IP="46.250.243.123"
readonly VMI03_IP="154.26.158.31"

# Database configuration
readonly DB_HOST="${VMI01_IP}"
readonly DB_PORT="5432"
readonly DB_NAME="grafana"
readonly DB_USER="grafana"
readonly DB_PASSWORD="$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)"

# Keycloak configuration
readonly KEYCLOAK_URL="http://${VMI03_IP}:8080"
readonly KEYCLOAK_REALM="mcp"
readonly KEYCLOAK_CLIENT_ID="grafana"
readonly KEYCLOAK_CLIENT_SECRET="$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)"

# Admin credentials
readonly ADMIN_USER="admin"
readonly ADMIN_PASSWORD="$(openssl rand -base64 32 | tr -d '=/+' | head -c 32)"

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
    systemctl stop grafana-server 2>/dev/null || true
    systemctl disable grafana-server 2>/dev/null || true
    exit 1
}

trap cleanup_on_error ERR

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

log_info "Starting Grafana ${GRAFANA_VERSION} deployment on VMI03..."

# Install dependencies
log_info "Installing dependencies..."
apt-get update -qq
apt-get install -y -qq \
    software-properties-common \
    apt-transport-https \
    wget \
    curl \
    gnupg2 \
    postgresql-client \
    jq
log_success "Dependencies installed"

# Add Grafana GPG key and repository
log_info "Adding Grafana repository..."
if [[ ! -f /usr/share/keyrings/grafana.gpg ]]; then
    wget -q -O - https://apt.grafana.com/gpg.key | gpg --dearmor | tee /usr/share/keyrings/grafana.gpg > /dev/null
fi

if [[ ! -f /etc/apt/sources.list.d/grafana.list ]]; then
    echo "deb [signed-by=/usr/share/keyrings/grafana.gpg] https://apt.grafana.com stable main" | \
        tee /etc/apt/sources.list.d/grafana.list
fi
log_success "Grafana repository added"

# Install Grafana
log_info "Installing Grafana..."
apt-get update -qq
apt-get install -y -qq grafana
log_success "Grafana installed"

# Create directory structure
log_info "Creating directory structure..."
mkdir -p "${GRAFANA_HOME}"
mkdir -p "${GRAFANA_DATA}"
mkdir -p "${GRAFANA_HOME}/dashboards"
mkdir -p "${GRAFANA_HOME}/provisioning/datasources"
mkdir -p "${GRAFANA_HOME}/provisioning/dashboards"
mkdir -p /var/log/grafana
log_success "Directory structure created"

# Create Grafana database on VMI01
log_info "Creating Grafana database on VMI01..."
if command -v psql &> /dev/null; then
    # Create database and user
    PGPASSWORD="${POSTGRES_PASSWORD:-mcp_prod_2024}" psql -h "${DB_HOST}" -U postgres -c "CREATE DATABASE ${DB_NAME};" 2>/dev/null || \
        log_warn "Database ${DB_NAME} may already exist"

    PGPASSWORD="${POSTGRES_PASSWORD:-mcp_prod_2024}" psql -h "${DB_HOST}" -U postgres -c \
        "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" 2>/dev/null || \
        log_warn "User ${DB_USER} may already exist"

    PGPASSWORD="${POSTGRES_PASSWORD:-mcp_prod_2024}" psql -h "${DB_HOST}" -U postgres -c \
        "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

    log_success "Grafana database created"
else
    log_warn "PostgreSQL client not available, database creation skipped"
    log_warn "Create database manually: CREATE DATABASE ${DB_NAME};"
fi

# Configure Grafana
log_info "Configuring Grafana..."
cat > "${GRAFANA_CONFIG}" <<EOF
[server]
protocol = http
http_addr = 0.0.0.0
http_port = ${GRAFANA_PORT}
domain = ${GRAFANA_DOMAIN}
root_url = http://${VMI03_IP}:${GRAFANA_PORT}
enable_gzip = true

[database]
type = postgres
host = ${DB_HOST}:${DB_PORT}
name = ${DB_NAME}
user = ${DB_USER}
password = ${DB_PASSWORD}
ssl_mode = disable
max_idle_conn = 25
max_open_conn = 100
conn_max_lifetime = 14400

[session]
provider = postgres
provider_config = user=${DB_USER} password=${DB_PASSWORD} host=${DB_HOST} port=${DB_PORT} dbname=${DB_NAME} sslmode=disable

[security]
admin_user = ${ADMIN_USER}
admin_password = ${ADMIN_PASSWORD}
secret_key = $(openssl rand -base64 32)
disable_gravatar = true
cookie_secure = false
cookie_samesite = lax

[users]
allow_sign_up = false
allow_org_create = false
auto_assign_org = true
auto_assign_org_role = Viewer

[auth]
disable_login_form = false
oauth_auto_login = false

[auth.generic_oauth]
enabled = true
name = Keycloak
allow_sign_up = true
client_id = ${KEYCLOAK_CLIENT_ID}
client_secret = ${KEYCLOAK_CLIENT_SECRET}
scopes = openid profile email
auth_url = ${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth
token_url = ${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token
api_url = ${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/userinfo
role_attribute_path = contains(roles[*], 'admin') && 'Admin' || contains(roles[*], 'editor') && 'Editor' || 'Viewer'
allow_assign_grafana_admin = true

[auth.anonymous]
enabled = false

[smtp]
enabled = false
# Configure SMTP settings later if needed
# host = smtp.gmail.com:587
# user = your-email@gmail.com
# password = your-app-password
# from_address = grafana@mcp.local
# from_name = Grafana MCP

[alerting]
enabled = true
execute_alerts = true

[unified_alerting]
enabled = true

[log]
mode = console file
level = info
filters =

[log.console]
level = info
format = json

[log.file]
level = info
format = json
log_rotate = true
max_lines = 1000000
max_size_shift = 28
daily_rotate = true
max_days = 30

[metrics]
enabled = true

[analytics]
reporting_enabled = false
check_for_updates = false

[snapshots]
external_enabled = false

[paths]
data = ${GRAFANA_DATA}
logs = /var/log/grafana
plugins = /var/lib/grafana/plugins
provisioning = ${GRAFANA_HOME}/provisioning
EOF

log_success "Grafana configuration created"

# Configure Prometheus datasource
log_info "Configuring Prometheus datasource..."
cat > "${GRAFANA_HOME}/provisioning/datasources/prometheus.yml" <<EOF
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://${VMI03_IP}:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: 15s
      queryTimeout: 60s
      httpMethod: POST
      prometheusType: Prometheus
      prometheusVersion: 2.48.0
      incrementalQuerying: true
      disableRecordingRules: false
      customQueryParameters: ''
    version: 1
EOF

log_success "Prometheus datasource configured"

# Configure dashboard provisioning
log_info "Configuring dashboard provisioning..."
cat > "${GRAFANA_HOME}/provisioning/dashboards/default.yml" <<EOF
apiVersion: 1

providers:
  - name: 'MCP Dashboards'
    orgId: 1
    folder: 'MCP'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: ${GRAFANA_HOME}/dashboards
      foldersFromFilesStructure: true
EOF

log_success "Dashboard provisioning configured"

# Create Node Exporter Full dashboard
log_info "Creating Node Exporter Full dashboard..."
cat > "${GRAFANA_HOME}/dashboards/node-exporter-full.json" <<'DASHBOARD_EOF'
{
  "annotations": {
    "list": [
      {
        "builtIn": 1,
        "datasource": "-- Grafana --",
        "enable": true,
        "hide": true,
        "iconColor": "rgba(0, 211, 255, 1)",
        "name": "Annotations & Alerts",
        "type": "dashboard"
      }
    ]
  },
  "editable": true,
  "gnetId": 1860,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          },
          "unit": "percent"
        }
      },
      "gridPos": {
        "h": 8,
        "w": 6,
        "x": 0,
        "y": 0
      },
      "id": 1,
      "options": {
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "showThresholdLabels": false,
        "showThresholdMarkers": true
      },
      "pluginVersion": "10.2.0",
      "targets": [
        {
          "expr": "100 - (avg(rate(node_cpu_seconds_total{mode=\"idle\",instance=\"$instance\"}[5m])) * 100)",
          "refId": "A"
        }
      ],
      "title": "CPU Usage",
      "type": "gauge"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          },
          "unit": "percent"
        }
      },
      "gridPos": {
        "h": 8,
        "w": 6,
        "x": 6,
        "y": 0
      },
      "id": 2,
      "options": {
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "showThresholdLabels": false,
        "showThresholdMarkers": true
      },
      "pluginVersion": "10.2.0",
      "targets": [
        {
          "expr": "(1 - (node_memory_MemAvailable_bytes{instance=\"$instance\"} / node_memory_MemTotal_bytes{instance=\"$instance\"})) * 100",
          "refId": "A"
        }
      ],
      "title": "Memory Usage",
      "type": "gauge"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 38,
  "style": "dark",
  "tags": ["node-exporter", "system"],
  "templating": {
    "list": [
      {
        "current": {},
        "datasource": "Prometheus",
        "definition": "label_values(node_uname_info, instance)",
        "hide": 0,
        "includeAll": false,
        "label": "Instance",
        "multi": false,
        "name": "instance",
        "options": [],
        "query": "label_values(node_uname_info, instance)",
        "refresh": 1,
        "regex": "",
        "skipUrlSync": false,
        "sort": 1,
        "type": "query"
      }
    ]
  },
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "",
  "title": "Node Exporter Full",
  "uid": "node-exporter-full",
  "version": 1
}
DASHBOARD_EOF

log_success "Node Exporter Full dashboard created"

# Create PostgreSQL dashboard
log_info "Creating PostgreSQL dashboard..."
cat > "${GRAFANA_HOME}/dashboards/postgresql.json" <<'DASHBOARD_EOF'
{
  "annotations": {
    "list": []
  },
  "editable": true,
  "gnetId": 9628,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "axisLabel": "",
            "axisPlacement": "auto",
            "barAlignment": 0,
            "drawStyle": "line",
            "fillOpacity": 10,
            "gradientMode": "none",
            "hideFrom": {
              "tooltip": false,
              "viz": false,
              "legend": false
            },
            "lineInterpolation": "linear",
            "lineWidth": 1,
            "pointSize": 5,
            "scaleDistribution": {
              "type": "linear"
            },
            "showPoints": "never",
            "spanNulls": false,
            "stacking": {
              "group": "A",
              "mode": "none"
            },
            "thresholdsStyle": {
              "mode": "off"
            }
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              }
            ]
          },
          "unit": "short"
        }
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 0
      },
      "id": 3,
      "options": {
        "legend": {
          "calcs": [],
          "displayMode": "list",
          "placement": "bottom"
        },
        "tooltip": {
          "mode": "single"
        }
      },
      "pluginVersion": "10.2.0",
      "targets": [
        {
          "expr": "pg_stat_activity_count{instance=\"$instance\"}",
          "legendFormat": "Active Connections",
          "refId": "A"
        }
      ],
      "title": "PostgreSQL Connections",
      "type": "timeseries"
    },
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "yellow",
                "value": 10
              },
              {
                "color": "red",
                "value": 60
              }
            ]
          },
          "unit": "s"
        }
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 12,
        "y": 0
      },
      "id": 4,
      "options": {
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "showThresholdLabels": false,
        "showThresholdMarkers": true
      },
      "pluginVersion": "10.2.0",
      "targets": [
        {
          "expr": "pg_replication_lag{instance=\"$instance\"}",
          "refId": "A"
        }
      ],
      "title": "Replication Lag",
      "type": "gauge"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 38,
  "style": "dark",
  "tags": ["postgresql", "database"],
  "templating": {
    "list": [
      {
        "current": {},
        "datasource": "Prometheus",
        "definition": "label_values(pg_up, instance)",
        "hide": 0,
        "includeAll": false,
        "label": "Instance",
        "multi": false,
        "name": "instance",
        "options": [],
        "query": "label_values(pg_up, instance)",
        "refresh": 1,
        "regex": "",
        "skipUrlSync": false,
        "sort": 1,
        "type": "query"
      }
    ]
  },
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "",
  "title": "PostgreSQL Monitoring",
  "uid": "postgresql-monitoring",
  "version": 1
}
DASHBOARD_EOF

log_success "PostgreSQL dashboard created"

# Create MCP Services dashboard
log_info "Creating MCP Services dashboard..."
cat > "${GRAFANA_HOME}/dashboards/mcp-services.json" <<'DASHBOARD_EOF'
{
  "annotations": {
    "list": []
  },
  "editable": true,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [
            {
              "options": {
                "0": {
                  "color": "red",
                  "text": "DOWN"
                },
                "1": {
                  "color": "green",
                  "text": "UP"
                }
              },
              "type": "value"
            }
          ],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "red",
                "value": null
              },
              {
                "color": "green",
                "value": 1
              }
            ]
          }
        }
      },
      "gridPos": {
        "h": 4,
        "w": 8,
        "x": 0,
        "y": 0
      },
      "id": 5,
      "options": {
        "colorMode": "background",
        "graphMode": "none",
        "justifyMode": "auto",
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "textMode": "value_and_name"
      },
      "pluginVersion": "10.2.0",
      "targets": [
        {
          "expr": "up{job=\"mcp-orchestrator\"}",
          "legendFormat": "Orchestrator",
          "refId": "A"
        },
        {
          "expr": "up{job=\"mcp-perplexity\"}",
          "legendFormat": "Perplexity",
          "refId": "B"
        },
        {
          "expr": "up{job=\"mcp-itjsst\"}",
          "legendFormat": "IT-JSST",
          "refId": "C"
        }
      ],
      "title": "MCP Service Status",
      "type": "stat"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 38,
  "style": "dark",
  "tags": ["mcp", "services"],
  "templating": {
    "list": []
  },
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "",
  "title": "MCP Services Dashboard",
  "uid": "mcp-services",
  "version": 1
}
DASHBOARD_EOF

log_success "MCP Services dashboard created"

# Create HAProxy dashboard
log_info "Creating HAProxy dashboard..."
cat > "${GRAFANA_HOME}/dashboards/haproxy.json" <<'DASHBOARD_EOF'
{
  "annotations": {
    "list": []
  },
  "editable": true,
  "gnetId": 367,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "palette-classic"
          },
          "custom": {
            "axisLabel": "",
            "axisPlacement": "auto",
            "barAlignment": 0,
            "drawStyle": "line",
            "fillOpacity": 10,
            "gradientMode": "none",
            "hideFrom": {
              "tooltip": false,
              "viz": false,
              "legend": false
            },
            "lineInterpolation": "linear",
            "lineWidth": 1,
            "pointSize": 5,
            "scaleDistribution": {
              "type": "linear"
            },
            "showPoints": "never",
            "spanNulls": false,
            "stacking": {
              "group": "A",
              "mode": "none"
            },
            "thresholdsStyle": {
              "mode": "off"
            }
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              }
            ]
          },
          "unit": "reqps"
        }
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 0
      },
      "id": 6,
      "options": {
        "legend": {
          "calcs": [],
          "displayMode": "list",
          "placement": "bottom"
        },
        "tooltip": {
          "mode": "single"
        }
      },
      "pluginVersion": "10.2.0",
      "targets": [
        {
          "expr": "rate(haproxy_frontend_http_requests_total[5m])",
          "legendFormat": "{{ frontend }}",
          "refId": "A"
        }
      ],
      "title": "HAProxy Request Rate",
      "type": "timeseries"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 38,
  "style": "dark",
  "tags": ["haproxy", "loadbalancer"],
  "templating": {
    "list": []
  },
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "",
  "title": "HAProxy Dashboard",
  "uid": "haproxy-dashboard",
  "version": 1
}
DASHBOARD_EOF

log_success "HAProxy dashboard created"

# Create Redis dashboard
log_info "Creating Redis dashboard..."
cat > "${GRAFANA_HOME}/dashboards/redis.json" <<'DASHBOARD_EOF'
{
  "annotations": {
    "list": []
  },
  "editable": true,
  "gnetId": 11835,
  "graphTooltip": 0,
  "id": null,
  "links": [],
  "panels": [
    {
      "datasource": "Prometheus",
      "fieldConfig": {
        "defaults": {
          "color": {
            "mode": "thresholds"
          },
          "mappings": [],
          "thresholds": {
            "mode": "absolute",
            "steps": [
              {
                "color": "green",
                "value": null
              },
              {
                "color": "red",
                "value": 80
              }
            ]
          },
          "unit": "percent"
        }
      },
      "gridPos": {
        "h": 8,
        "w": 12,
        "x": 0,
        "y": 0
      },
      "id": 7,
      "options": {
        "orientation": "auto",
        "reduceOptions": {
          "calcs": ["lastNotNull"],
          "fields": "",
          "values": false
        },
        "showThresholdLabels": false,
        "showThresholdMarkers": true
      },
      "pluginVersion": "10.2.0",
      "targets": [
        {
          "expr": "(redis_memory_used_bytes / redis_memory_max_bytes) * 100",
          "refId": "A"
        }
      ],
      "title": "Redis Memory Usage",
      "type": "gauge"
    }
  ],
  "refresh": "30s",
  "schemaVersion": 38,
  "style": "dark",
  "tags": ["redis", "cache"],
  "templating": {
    "list": []
  },
  "time": {
    "from": "now-1h",
    "to": "now"
  },
  "timepicker": {},
  "timezone": "",
  "title": "Redis Dashboard",
  "uid": "redis-dashboard",
  "version": 1
}
DASHBOARD_EOF

log_success "Redis dashboard created"

# Set ownership
log_info "Setting file permissions..."
chown -R grafana:grafana "${GRAFANA_HOME}"
chown -R grafana:grafana "${GRAFANA_DATA}"
chown -R grafana:grafana /var/log/grafana
chown -R grafana:grafana /etc/grafana
chmod 640 "${GRAFANA_CONFIG}"
log_success "Permissions set"

# Save credentials
log_info "Saving credentials..."
cat > "${CREDENTIALS_FILE}" <<EOF
# Grafana Credentials - Generated $(date)
# KEEP THIS FILE SECURE!

Admin Username: ${ADMIN_USER}
Admin Password: ${ADMIN_PASSWORD}

Database Host: ${DB_HOST}
Database Name: ${DB_NAME}
Database User: ${DB_USER}
Database Password: ${DB_PASSWORD}

Keycloak Client ID: ${KEYCLOAK_CLIENT_ID}
Keycloak Client Secret: ${KEYCLOAK_CLIENT_SECRET}
Keycloak URL: ${KEYCLOAK_URL}
Keycloak Realm: ${KEYCLOAK_REALM}

Web UI: http://${VMI03_IP}:${GRAFANA_PORT}
EOF

chmod 600 "${CREDENTIALS_FILE}"
chown root:root "${CREDENTIALS_FILE}"
log_success "Credentials saved to ${CREDENTIALS_FILE}"

# Enable and start service
log_info "Enabling and starting Grafana service..."
systemctl daemon-reload
systemctl enable grafana-server
systemctl restart grafana-server

# Wait for service to start
sleep 10

# Check service status
if systemctl is-active --quiet grafana-server; then
    log_success "Grafana service is running"
else
    log_error "Grafana service failed to start"
    journalctl -u grafana-server -n 50 --no-pager
    exit 1
fi

# Configure firewall (if UFW is active)
if command -v ufw &> /dev/null && ufw status | grep -q "Status: active"; then
    log_info "Configuring firewall..."
    # Allow Grafana port from internal network
    ufw allow from 10.0.50.0/24 to any port ${GRAFANA_PORT} comment 'Grafana from WireGuard'
    ufw allow from 10.0.51.0/24 to any port ${GRAFANA_PORT} comment 'Grafana from WireGuard'
    ufw allow from 10.0.52.0/24 to any port ${GRAFANA_PORT} comment 'Grafana from WireGuard'
    log_success "Firewall rules added"
fi

# Create Keycloak client configuration instructions
log_info "Creating Keycloak client configuration instructions..."
cat > "${GRAFANA_HOME}/KEYCLOAK_SETUP.md" <<EOF
# Keycloak SSO Setup for Grafana

## 1. Create Grafana Client in Keycloak

1. Login to Keycloak admin console: ${KEYCLOAK_URL}
2. Select realm: ${KEYCLOAK_REALM}
3. Go to Clients -> Create Client
4. Client ID: ${KEYCLOAK_CLIENT_ID}
5. Client Protocol: openid-connect
6. Click Save

## 2. Configure Client Settings

- Access Type: confidential
- Standard Flow Enabled: ON
- Direct Access Grants Enabled: ON
- Valid Redirect URIs: http://${VMI03_IP}:${GRAFANA_PORT}/login/generic_oauth
- Web Origins: http://${VMI03_IP}:${GRAFANA_PORT}

## 3. Configure Client Secret

1. Go to Credentials tab
2. Copy the secret and update grafana.ini with:
   client_secret = ${KEYCLOAK_CLIENT_SECRET}

## 4. Configure Roles

Create roles in Keycloak:
- admin (maps to Grafana Admin)
- editor (maps to Grafana Editor)
- viewer (maps to Grafana Viewer)

Assign roles to users as needed.

## 5. Restart Grafana

systemctl restart grafana-server
EOF

chown grafana:grafana "${GRAFANA_HOME}/KEYCLOAK_SETUP.md"
log_success "Keycloak setup instructions created"

# Health check
log_info "Running health check..."
sleep 5
if curl -sf "http://localhost:${GRAFANA_PORT}/api/health" | jq -e '.database == "ok"' > /dev/null; then
    log_success "Health check passed"
else
    log_warn "Health check failed - service may still be initializing"
fi

# Print summary
cat <<EOF

${GREEN}╔════════════════════════════════════════════════════════════════╗
║           Grafana Deployment Complete!                        ║
╚════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Installation Details:${NC}
  Version:        ${GRAFANA_VERSION}
  Home Directory: ${GRAFANA_HOME}
  Configuration:  ${GRAFANA_CONFIG}
  Web UI:         http://${VMI03_IP}:${GRAFANA_PORT}
  Credentials:    ${CREDENTIALS_FILE}

${BLUE}Login Credentials:${NC}
  Username:       ${ADMIN_USER}
  Password:       ${ADMIN_PASSWORD}

${BLUE}Database:${NC}
  Host:           ${DB_HOST}:${DB_PORT}
  Database:       ${DB_NAME}
  User:           ${DB_USER}

${BLUE}Service Management:${NC}
  Status:         systemctl status grafana-server
  Start:          systemctl start grafana-server
  Stop:           systemctl stop grafana-server
  Restart:        systemctl restart grafana-server
  Logs:           journalctl -u grafana-server -f

${BLUE}Dashboards:${NC}
  - Node Exporter Full (System Metrics)
  - PostgreSQL Monitoring
  - MCP Services Dashboard
  - HAProxy Dashboard
  - Redis Dashboard

${BLUE}Next Steps:${NC}
  1. Login to Grafana: http://${VMI03_IP}:${GRAFANA_PORT}
  2. Configure Keycloak SSO (see ${GRAFANA_HOME}/KEYCLOAK_SETUP.md)
  3. Set up alert notifications (email/Slack/PagerDuty)
  4. Configure HAProxy for HTTPS access
  5. Import additional dashboards from grafana.com

${YELLOW}Security Notes:${NC}
  - Change admin password after first login
  - Configure HTTPS/TLS for production use
  - Restrict access via firewall or HAProxy
  - Enable audit logging for compliance
  - Credentials stored in: ${CREDENTIALS_FILE}

${YELLOW}Keycloak Integration:${NC}
  Follow instructions in: ${GRAFANA_HOME}/KEYCLOAK_SETUP.md

EOF

log_success "Grafana deployment completed successfully!"
