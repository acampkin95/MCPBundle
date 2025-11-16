#!/bin/bash
################################################################################
# deploy-elasticsearch.sh - Install Elasticsearch + Kibana on VMI03
#
# Usage: ./deploy-elasticsearch.sh
#
# Security: Centralized log storage and analytics engine with Kibana
#           visualization interface for SOC operations
################################################################################

set -euo pipefail

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly LOG_FILE="/var/log/soc-elasticsearch-deploy.log"
readonly BACKUP_DIR="/opt/mcp/backups/elasticsearch"

# VM Configuration
readonly VMI03_IP="154.26.158.31"
readonly ELASTIC_VERSION="8.15"

################################################################################
# Logging Functions
################################################################################

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $*" | tee -a "${LOG_FILE}" >&2
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $*" | tee -a "${LOG_FILE}"
}

log_info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO:${NC} $*" | tee -a "${LOG_FILE}"
}

################################################################################
# Error Handling
################################################################################

cleanup_on_error() {
    local exit_code=$?
    if [[ ${exit_code} -ne 0 ]]; then
        log_error "Deployment failed with exit code ${exit_code}"
        log_warn "Check logs at ${LOG_FILE}"
    fi
}

trap cleanup_on_error EXIT

################################################################################
# Validation Functions
################################################################################

check_ssh_access() {
    local ip=$1
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "root@${ip}" "echo 'SSH OK'" &>/dev/null; then
        log_error "Cannot SSH to root@${ip}. Check SSH keys and access."
        return 1
    fi
    log "SSH access verified for ${ip}"
    return 0
}

################################################################################
# Elasticsearch Installation
################################################################################

deploy_elasticsearch() {
    local ip=$1

    log_info "Deploying Elasticsearch + Kibana to VMI03 (${ip})"

    ssh "root@${ip}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

echo "=== Installing Elasticsearch and Kibana ==="

# Install dependencies
apt-get update
apt-get install -y curl gnupg lsb-release apt-transport-https openjdk-17-jdk

# Backup existing configuration
mkdir -p /opt/mcp/backups/elasticsearch
if [[ -d /etc/elasticsearch ]]; then
    cp -r /etc/elasticsearch /opt/mcp/backups/elasticsearch/elasticsearch.backup.$(date +%Y%m%d_%H%M%S)
fi
if [[ -d /etc/kibana ]]; then
    cp -r /etc/kibana /opt/mcp/backups/elasticsearch/kibana.backup.$(date +%Y%m%d_%H%M%S)
fi

# Add Elasticsearch GPG key and repository
curl -fsSL https://artifacts.elastic.co/GPG-KEY-elasticsearch | \
    gpg --dearmor -o /usr/share/keyrings/elasticsearch-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/elasticsearch-keyring.gpg] \
https://artifacts.elastic.co/packages/8.x/apt stable main" | \
    tee /etc/apt/sources.list.d/elastic-8.x.list

# Update package list
apt-get update

# Install Elasticsearch
echo "=== Installing Elasticsearch ==="
apt-get install -y elasticsearch

# Configure Elasticsearch
cat > /etc/elasticsearch/elasticsearch.yml <<'EOF'
# Elasticsearch Configuration for MCP SOC

cluster.name: mcp-soc-cluster
node.name: vmi03-elasticsearch

# Paths
path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch

# Network
network.host: 127.0.0.1
http.port: 9200

# Discovery
discovery.type: single-node

# Security
xpack.security.enabled: true
xpack.security.enrollment.enabled: true

xpack.security.http.ssl:
  enabled: false

xpack.security.transport.ssl:
  enabled: true
  verification_mode: certificate
  keystore.path: certs/transport.p12
  truststore.path: certs/transport.p12

# Monitoring
xpack.monitoring.collection.enabled: true

# Memory
bootstrap.memory_lock: true

# Indexing
action.auto_create_index: true

# Performance
indices.memory.index_buffer_size: 30%
indices.queries.cache.size: 10%

# Index lifecycle
xpack.ilm.enabled: true

# Watcher (alerting)
xpack.watcher.enabled: true
EOF

# Configure JVM heap size (50% of available RAM, max 4GB recommended)
TOTAL_MEM=$(free -g | awk '/^Mem:/{print $2}')
HEAP_SIZE=$((TOTAL_MEM / 2))
if [[ ${HEAP_SIZE} -gt 4 ]]; then
    HEAP_SIZE=4
fi
if [[ ${HEAP_SIZE} -lt 1 ]]; then
    HEAP_SIZE=1
fi

cat > /etc/elasticsearch/jvm.options.d/heap.options <<EOF
-Xms${HEAP_SIZE}g
-Xmx${HEAP_SIZE}g
EOF

# Enable memory locking for Elasticsearch
mkdir -p /etc/systemd/system/elasticsearch.service.d
cat > /etc/systemd/system/elasticsearch.service.d/override.conf <<'EOF'
[Service]
LimitMEMLOCK=infinity
LimitNPROC=4096
LimitNOFILE=65535
EOF

# Reload systemd
systemctl daemon-reload

# Enable and start Elasticsearch
systemctl enable elasticsearch
systemctl start elasticsearch

# Wait for Elasticsearch to start
echo "Waiting for Elasticsearch to start..."
for i in {1..60}; do
    if curl -s http://localhost:9200 >/dev/null 2>&1; then
        echo "✓ Elasticsearch is running"
        break
    fi
    sleep 2
done

# Reset elastic user password and save it
ELASTIC_PASSWORD=$(openssl rand -base64 32)
/usr/share/elasticsearch/bin/elasticsearch-reset-password -u elastic -b -s <<< "${ELASTIC_PASSWORD}"

# Save credentials
mkdir -p /opt/mcp/credentials
cat > /opt/mcp/credentials/elasticsearch.txt <<EOF
Elasticsearch Credentials
Generated: $(date)

Username: elastic
Password: ${ELASTIC_PASSWORD}
URL: http://localhost:9200

IMPORTANT: Save these credentials securely!
EOF

chmod 600 /opt/mcp/credentials/elasticsearch.txt

echo ""
echo "=== Elasticsearch Credentials ==="
cat /opt/mcp/credentials/elasticsearch.txt
echo ""

# Create Wazuh user for Elasticsearch
/usr/share/elasticsearch/bin/elasticsearch-users useradd wazuh -p "$(openssl rand -base64 24)" -r superuser || true

echo "=== Installing Kibana ==="

# Install Kibana
apt-get install -y kibana

# Configure Kibana
cat > /etc/kibana/kibana.yml <<EOF
# Kibana Configuration

server.port: 5601
server.host: "0.0.0.0"
server.name: "mcp-soc-kibana"

elasticsearch.hosts: ["http://localhost:9200"]
elasticsearch.username: "elastic"
elasticsearch.password: "${ELASTIC_PASSWORD}"

# Logging
logging:
  appenders:
    file:
      type: file
      fileName: /var/log/kibana/kibana.log
      layout:
        type: json
  root:
    appenders:
      - default
      - file
    level: info

# Security
xpack.security.enabled: true
xpack.encryptedSavedObjects.encryptionKey: "$(openssl rand -base64 32)"
xpack.reporting.encryptionKey: "$(openssl rand -base64 32)"
xpack.security.encryptionKey: "$(openssl rand -base64 32)"

# Monitoring
monitoring.enabled: true
monitoring.kibana.collection.enabled: true

# Telemetry
telemetry.enabled: false
telemetry.optIn: false

# Index patterns
kibana.index: ".kibana"
kibana.defaultAppId: "discover"

# Saved objects
savedObjects.maxImportPayloadBytes: 26214400
EOF

# Create Kibana log directory
mkdir -p /var/log/kibana
chown kibana:kibana /var/log/kibana

# Enable and start Kibana
systemctl enable kibana
systemctl start kibana

# Wait for Kibana to start
echo "Waiting for Kibana to start..."
for i in {1..60}; do
    if curl -s http://localhost:5601/api/status >/dev/null 2>&1; then
        echo "✓ Kibana is running"
        break
    fi
    sleep 2
done

# Create index templates for SOC data
cat > /tmp/soc-index-template.json <<'EOF'
{
  "index_patterns": ["soc-*"],
  "template": {
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0,
      "index.lifecycle.name": "soc-ilm-policy",
      "index.lifecycle.rollover_alias": "soc-logs"
    },
    "mappings": {
      "properties": {
        "@timestamp": {
          "type": "date"
        },
        "severity": {
          "type": "keyword"
        },
        "source": {
          "type": "keyword"
        },
        "message": {
          "type": "text"
        },
        "host": {
          "properties": {
            "name": {
              "type": "keyword"
            },
            "ip": {
              "type": "ip"
            }
          }
        }
      }
    }
  }
}
EOF

# Create ILM policy for log retention
cat > /tmp/soc-ilm-policy.json <<'EOF'
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "7d",
            "max_size": "50gb"
          }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
EOF

# Apply index template and ILM policy
sleep 10
curl -X PUT "localhost:9200/_index_template/soc-template" \
    -H 'Content-Type: application/json' \
    -u "elastic:${ELASTIC_PASSWORD}" \
    -d @/tmp/soc-index-template.json || true

curl -X PUT "localhost:9200/_ilm/policy/soc-ilm-policy" \
    -H 'Content-Type: application/json' \
    -u "elastic:${ELASTIC_PASSWORD}" \
    -d @/tmp/soc-ilm-policy.json || true

# Create monitoring script
cat > /usr/local/bin/elasticsearch-status.sh <<EOF
#!/bin/bash
# Elasticsearch Status Report

echo "=== Elasticsearch Status - \$(date) ==="
echo ""

echo "Cluster Health:"
curl -s -u "elastic:${ELASTIC_PASSWORD}" "http://localhost:9200/_cluster/health?pretty"
echo ""

echo "Node Stats:"
curl -s -u "elastic:${ELASTIC_PASSWORD}" "http://localhost:9200/_nodes/stats?pretty" | head -50
echo ""

echo "Indices:"
curl -s -u "elastic:${ELASTIC_PASSWORD}" "http://localhost:9200/_cat/indices?v"
echo ""
EOF

chmod +x /usr/local/bin/elasticsearch-status.sh

# Create health check cron job
cat > /etc/cron.hourly/elasticsearch-health <<'EOF'
#!/bin/bash
# Elasticsearch Health Check

STATUS=$(curl -s http://localhost:9200/_cluster/health | jq -r '.status')

if [[ "${STATUS}" != "green" ]] && [[ "${STATUS}" != "yellow" ]]; then
    echo "WARNING: Elasticsearch cluster status is ${STATUS}" | \
        logger -t elasticsearch-health -p user.warning
fi
EOF

chmod +x /etc/cron.hourly/elasticsearch-health

echo "✓ Elasticsearch and Kibana deployment completed successfully"

echo ""
echo "=== Service Status ==="
systemctl status elasticsearch --no-pager | head -10
systemctl status kibana --no-pager | head -10

echo ""
echo "=== Access Information ==="
echo "Elasticsearch: http://localhost:9200"
echo "Kibana: http://vmi03-ip:5601"
echo "Credentials saved to: /opt/mcp/credentials/elasticsearch.txt"
echo ""
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed Elasticsearch + Kibana to VMI03"
    else
        log_error "Failed to deploy Elasticsearch + Kibana to VMI03"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_elasticsearch() {
    local ip=$1

    log_info "Verifying Elasticsearch deployment on VMI03 (${ip})"

    # Check Elasticsearch service
    if ! ssh "root@${ip}" "systemctl is-active elasticsearch" | grep -q "active"; then
        log_error "Elasticsearch service not active"
        return 1
    fi

    # Check Kibana service
    if ! ssh "root@${ip}" "systemctl is-active kibana" | grep -q "active"; then
        log_error "Kibana service not active"
        return 1
    fi

    # Check Elasticsearch responding
    if ! ssh "root@${ip}" "curl -s http://localhost:9200/_cluster/health" | grep -q "cluster_name"; then
        log_error "Elasticsearch not responding"
        return 1
    fi

    # Check Kibana responding
    if ! ssh "root@${ip}" "curl -s http://localhost:5601/api/status" | grep -q "available"; then
        log_warn "Kibana may still be starting up"
    fi

    log "✓ Elasticsearch verification passed"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    log "Starting Elasticsearch + Kibana deployment to VMI03"

    # Check SSH access
    check_ssh_access "${VMI03_IP}" || exit 1

    # Deploy Elasticsearch
    deploy_elasticsearch "${VMI03_IP}"

    # Verify deployment
    verify_elasticsearch "${VMI03_IP}"

    log "✓ Elasticsearch + Kibana deployment completed successfully"
    log_info "Elasticsearch: http://localhost:9200 (VMI03)"
    log_info "Kibana: http://${VMI03_IP}:5601 (access via VPN)"
    log_info "Credentials: ssh root@${VMI03_IP} 'cat /opt/mcp/credentials/elasticsearch.txt'"
    log_info "Status: ssh root@${VMI03_IP} '/usr/local/bin/elasticsearch-status.sh'"
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
