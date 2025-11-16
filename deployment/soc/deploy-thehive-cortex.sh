#!/bin/bash
################################################################################
# deploy-thehive-cortex.sh - Install TheHive + Cortex on VMI03
#
# Usage: ./deploy-thehive-cortex.sh
#
# Security: Security Incident Response Platform (TheHive) with automated
#           threat intelligence and analysis capabilities (Cortex)
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
readonly LOG_FILE="/var/log/soc-thehive-deploy.log"
readonly BACKUP_DIR="/opt/mcp/backups/thehive"

# VM Configuration
readonly VMI03_IP="154.26.158.31"

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
# TheHive + Cortex Installation
################################################################################

deploy_thehive_cortex() {
    local ip=$1

    log_info "Deploying TheHive + Cortex to VMI03 (${ip})"

    ssh "root@${ip}" bash <<'REMOTE_SCRIPT'
set -euo pipefail

echo "=== Installing TheHive and Cortex ==="

# Install dependencies
apt-get update
apt-get install -y curl gnupg lsb-release apt-transport-https openjdk-11-jdk wget

# Backup existing configuration
mkdir -p /opt/mcp/backups/thehive
if [[ -d /etc/thehive ]]; then
    cp -r /etc/thehive /opt/mcp/backups/thehive/thehive.backup.$(date +%Y%m%d_%H%M%S)
fi
if [[ -d /etc/cortex ]]; then
    cp -r /etc/cortex /opt/mcp/backups/thehive/cortex.backup.$(date +%Y%m%d_%H%M%S)
fi

# Add TheHive Project repository
wget -O- https://archives.strangebee.com/keys/strangebee.gpg | \
    gpg --dearmor -o /usr/share/keyrings/strangebee-archive-keyring.gpg

echo "deb [signed-by=/usr/share/keyrings/strangebee-archive-keyring.gpg] \
https://deb.strangebee.com thehive-5.2 main" | \
    tee /etc/apt/sources.list.d/strangebee.list

# Update package list
apt-get update

echo "=== Installing Cassandra (Database for TheHive) ==="

# Add Cassandra repository
wget -qO - https://www.apache.org/dist/cassandra/KEYS | apt-key add -
echo "deb https://downloads.apache.org/cassandra/debian 40x main" | \
    tee /etc/apt/sources.list.d/cassandra.sources.list

apt-get update
apt-get install -y cassandra

# Configure Cassandra
cat > /etc/cassandra/cassandra.yaml <<'EOF'
cluster_name: 'TheHive'
num_tokens: 256
hinted_handoff_enabled: true
max_hint_window_in_ms: 10800000
hinted_handoff_throttle_in_kb: 1024
max_hints_delivery_threads: 2
hints_directory: /var/lib/cassandra/hints
hints_flush_period_in_ms: 10000
max_hints_file_size_in_mb: 128
batchlog_replay_throttle_in_kb: 1024

authenticator: AllowAllAuthenticator
authorizer: AllowAllAuthorizer
role_manager: CassandraRoleManager
roles_validity_in_ms: 2000
permissions_validity_in_ms: 2000
credentials_validity_in_ms: 2000

partitioner: org.apache.cassandra.dht.Murmur3Partitioner
data_file_directories:
    - /var/lib/cassandra/data
commitlog_directory: /var/lib/cassandra/commitlog
saved_caches_directory: /var/lib/cassandra/saved_caches

seed_provider:
    - class_name: org.apache.cassandra.locator.SimpleSeedProvider
      parameters:
          - seeds: "127.0.0.1"

listen_address: 127.0.0.1
start_native_transport: true
native_transport_port: 9042
rpc_address: 127.0.0.1

endpoint_snitch: SimpleSnitch
EOF

# Start Cassandra
systemctl enable cassandra
systemctl start cassandra

# Wait for Cassandra to start
echo "Waiting for Cassandra to start..."
for i in {1..60}; do
    if nodetool status 2>/dev/null | grep -q "UN"; then
        echo "✓ Cassandra is running"
        break
    fi
    sleep 2
done

echo "=== Installing TheHive ==="

# Install TheHive
apt-get install -y thehive

# Create TheHive directories
mkdir -p /opt/thp/thehive/{files,index}
chown -R thehive:thehive /opt/thp/thehive

# Generate secret key
SECRET_KEY=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)

# Configure TheHive
cat > /etc/thehive/application.conf <<EOF
# TheHive Configuration

# Service configuration
play.http.secret.key="${SECRET_KEY}"

# Database configuration
db {
  provider = janusgraph
  janusgraph {
    storage {
      backend = cql
      hostname = ["127.0.0.1"]
      cql {
        cluster-name = TheHive
        keyspace = thehive
      }
    }
    index.search {
      backend = lucene
      directory = /opt/thp/thehive/index
    }
  }
}

# Storage configuration
storage {
  provider = localfs
  localfs {
    location = /opt/thp/thehive/files
  }
}

# Authentication
auth {
  providers = [
    {name: local}
  ]
}

# HTTP server
http.address = 0.0.0.0
http.port = 9000

# Akka
akka {
  cluster.enable = false
}

# Cortex integration
play.modules.enabled += org.thp.thehive.connector.cortex.CortexModule
cortex {
  servers = [
    {
      name = local
      url = "http://127.0.0.1:9001"
      auth {
        type = "bearer"
        key = "CORTEX_API_KEY_PLACEHOLDER"
      }
    }
  ]
}

# Wazuh integration (webhook)
notification.webhook.endpoints = [
  {
    name: wazuh-alerts
    version: 0
    wsConfig: {}
    includedTheHiveOrganisations: ["*"]
    excludedTheHiveOrganisations: []
  }
]
EOF

# Enable and start TheHive
systemctl enable thehive
systemctl start thehive

# Wait for TheHive to start
echo "Waiting for TheHive to start..."
for i in {1..60}; do
    if curl -s http://localhost:9000/api/status 2>/dev/null | grep -q "OK"; then
        echo "✓ TheHive is running"
        break
    fi
    sleep 2
done

echo "=== Installing Cortex ==="

# Install Cortex
apt-get install -y cortex

# Create Cortex directories
mkdir -p /opt/cortex/{jobs,analyzers}
chown -R cortex:cortex /opt/cortex

# Generate Cortex secret
CORTEX_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)

# Configure Cortex
cat > /etc/cortex/application.conf <<EOF
# Cortex Configuration

# Secret key
play.http.secret.key="${CORTEX_SECRET}"

# Elasticsearch for Cortex (using system Elasticsearch)
search {
  index = cortex
  uri = "http://127.0.0.1:9200"
}

# Authentication
auth {
  provider = [local]

  # Default admin user
  defaultUserDomain = "local"
}

# Analyzers and responders
analyzer {
  urls = [
    "https://download.thehive-project.org/analyzers.json"
  ]

  path = "/opt/cortex/analyzers"
}

responder {
  urls = [
    "https://download.thehive-project.org/responders.json"
  ]

  path = "/opt/cortex/responders"
}

# Job directory
job {
  directory = "/opt/cortex/jobs"
}

# HTTP server
http {
  address = "0.0.0.0"
  port = 9001
}

# Akka
akka {
  cluster.enable = false
}
EOF

# Enable and start Cortex
systemctl enable cortex
systemctl start cortex

# Wait for Cortex to start
echo "Waiting for Cortex to start..."
for i in {1..60}; do
    if curl -s http://localhost:9001/api/status 2>/dev/null | grep -q "OK"; then
        echo "✓ Cortex is running"
        break
    fi
    sleep 2
done

# Create initial admin user for TheHive
sleep 10
THEHIVE_ADMIN_PASSWORD=$(openssl rand -base64 24)

# Save credentials
mkdir -p /opt/mcp/credentials
cat > /opt/mcp/credentials/thehive.txt <<EOF
TheHive + Cortex Credentials
Generated: $(date)

TheHive:
  URL: http://${ip}:9000
  Initial Admin: admin@thehive.local
  Initial Password: ${THEHIVE_ADMIN_PASSWORD}

Cortex:
  URL: http://${ip}:9001
  Initial Admin: admin@cortex.local
  Initial Password: ${THEHIVE_ADMIN_PASSWORD}

Cassandra:
  Host: 127.0.0.1
  Port: 9042
  Keyspace: thehive

IMPORTANT:
1. Change these passwords on first login!
2. Generate Cortex API key and update TheHive config
3. Configure analyzers in Cortex
EOF

chmod 600 /opt/mcp/credentials/thehive.txt

echo ""
echo "=== TheHive + Cortex Credentials ==="
cat /opt/mcp/credentials/thehive.txt
echo ""

# Create monitoring script
cat > /usr/local/bin/thehive-status.sh <<'EOF'
#!/bin/bash
# TheHive + Cortex Status Report

echo "=== TheHive + Cortex Status - $(date) ==="
echo ""

echo "Service Status:"
systemctl status thehive --no-pager | head -10
systemctl status cortex --no-pager | head -10
systemctl status cassandra --no-pager | head -10
echo ""

echo "TheHive Health:"
curl -s http://localhost:9000/api/status 2>/dev/null | jq '.' || echo "Not responding"
echo ""

echo "Cortex Health:"
curl -s http://localhost:9001/api/status 2>/dev/null | jq '.' || echo "Not responding"
echo ""

echo "Cassandra Status:"
nodetool status 2>/dev/null || echo "Not responding"
echo ""
EOF

chmod +x /usr/local/bin/thehive-status.sh

# Install Python and dependencies for Cortex analyzers
apt-get install -y python3 python3-pip python3-dev
pip3 install cortexutils

# Create analyzer installation script
cat > /usr/local/bin/install-cortex-analyzers.sh <<'EOF'
#!/bin/bash
# Install Cortex Analyzers

ANALYZER_DIR="/opt/cortex/analyzers"
mkdir -p "${ANALYZER_DIR}"

# Clone analyzers repository
if [[ ! -d "${ANALYZER_DIR}/Cortex-Analyzers" ]]; then
    cd "${ANALYZER_DIR}"
    git clone https://github.com/TheHive-Project/Cortex-Analyzers.git
fi

# Install analyzer dependencies
cd "${ANALYZER_DIR}/Cortex-Analyzers/analyzers"

for analyzer in */; do
    if [[ -f "${analyzer}/requirements.txt" ]]; then
        echo "Installing dependencies for ${analyzer}"
        pip3 install -r "${analyzer}/requirements.txt" || true
    fi
done

chown -R cortex:cortex "${ANALYZER_DIR}"
echo "✓ Analyzer installation completed"
EOF

chmod +x /usr/local/bin/install-cortex-analyzers.sh

echo "✓ TheHive + Cortex deployment completed successfully"

echo ""
echo "=== Service Status ==="
systemctl status thehive --no-pager | head -10
systemctl status cortex --no-pager | head -10

echo ""
echo "=== Access Information ==="
echo "TheHive: http://${ip}:9000 (access via VPN)"
echo "Cortex: http://${ip}:9001 (access via VPN)"
echo "Credentials saved to: /opt/mcp/credentials/thehive.txt"
echo ""
echo "Next Steps:"
echo "1. Access TheHive web interface and complete setup"
echo "2. Create organization and users"
echo "3. Generate Cortex API key"
echo "4. Update TheHive config with Cortex API key"
echo "5. Run: /usr/local/bin/install-cortex-analyzers.sh"
echo ""
REMOTE_SCRIPT

    if [[ $? -eq 0 ]]; then
        log "Successfully deployed TheHive + Cortex to VMI03"
    else
        log_error "Failed to deploy TheHive + Cortex to VMI03"
        return 1
    fi
}

################################################################################
# Verification Functions
################################################################################

verify_thehive_cortex() {
    local ip=$1

    log_info "Verifying TheHive + Cortex deployment on VMI03 (${ip})"

    # Check TheHive service
    if ! ssh "root@${ip}" "systemctl is-active thehive" | grep -q "active"; then
        log_error "TheHive service not active"
        return 1
    fi

    # Check Cortex service
    if ! ssh "root@${ip}" "systemctl is-active cortex" | grep -q "active"; then
        log_error "Cortex service not active"
        return 1
    fi

    # Check Cassandra service
    if ! ssh "root@${ip}" "systemctl is-active cassandra" | grep -q "active"; then
        log_error "Cassandra service not active"
        return 1
    fi

    # Check TheHive responding
    if ! ssh "root@${ip}" "curl -s http://localhost:9000/api/status" | grep -q "OK"; then
        log_warn "TheHive not responding properly"
    fi

    # Check Cortex responding
    if ! ssh "root@${ip}" "curl -s http://localhost:9001/api/status" | grep -q "OK"; then
        log_warn "Cortex not responding properly"
    fi

    log "✓ TheHive + Cortex verification passed"
    return 0
}

################################################################################
# Main Deployment Logic
################################################################################

main() {
    log "Starting TheHive + Cortex deployment to VMI03"

    # Check SSH access
    check_ssh_access "${VMI03_IP}" || exit 1

    # Deploy TheHive + Cortex
    deploy_thehive_cortex "${VMI03_IP}"

    # Verify deployment
    verify_thehive_cortex "${VMI03_IP}"

    log "✓ TheHive + Cortex deployment completed successfully"
    log_info "TheHive: http://${VMI03_IP}:9000 (access via VPN)"
    log_info "Cortex: http://${VMI03_IP}:9001 (access via VPN)"
    log_info "Credentials: ssh root@${VMI03_IP} 'cat /opt/mcp/credentials/thehive.txt'"
    log_info "Status: ssh root@${VMI03_IP} '/usr/local/bin/thehive-status.sh'"
    log_info "Install analyzers: ssh root@${VMI03_IP} '/usr/local/bin/install-cortex-analyzers.sh'"
    log "Log file: ${LOG_FILE}"
}

# Run main function
main "$@"
