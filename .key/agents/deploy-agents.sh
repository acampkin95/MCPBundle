#!/bin/bash

###############################################################################
# MCP Monitoring Agents - Automated Deployment Script
# Deploys 6 monitoring agents across 3 VMs
###############################################################################

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_BASE="/opt/mcp-agents"
LOG_DIR="/var/log/mcp-agents"
LIB_DIR="/var/lib/mcp-agents"
CONFIG_DIR="/etc/mcp-agents"
AGENT_USER="mcp-agent"
AGENT_GROUP="mcp-agent"

# VM Configuration
VMI01_HOST="46.250.243.123"
VMI02D_HOST="your_vmi02d_ip"
VMI03_HOST="your_vmi03_ip"
SSH_KEY="${HOME}/.ssh/id_rsa"

# Agent Definitions
declare -A AGENTS=(
    ["vmi01"]="db-optimizer-agent app-health-agent"
    ["vmi02d"]="storage-mgmt-agent service-health-agent"
    ["vmi03"]="network-sec-agent identity-mgmt-agent"
)

declare -A AGENT_PORTS=(
    ["db-optimizer-agent"]="9100"
    ["app-health-agent"]="9101"
    ["storage-mgmt-agent"]="9200"
    ["service-health-agent"]="9201"
    ["network-sec-agent"]="9300"
    ["identity-mgmt-agent"]="9301"
)

###############################################################################
# Utility Functions
###############################################################################

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

check_prerequisites() {
    log_info "Checking prerequisites..."

    local missing_tools=()

    for tool in node npm tsc ssh rsync systemctl; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi

    # Check Node.js version
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        log_error "Node.js version must be >= 18.x (current: $(node -v))"
        exit 1
    fi

    log_success "All prerequisites met"
}

create_system_user() {
    local host=$1

    log_info "Creating system user on $host..."

    ssh -i "$SSH_KEY" "root@$host" bash <<'EOF'
if ! id -u mcp-agent &>/dev/null; then
    useradd -r -s /bin/false -d /opt/mcp-agents -m mcp-agent
    echo "User created"
else
    echo "User already exists"
fi

# Create required directories
mkdir -p /opt/mcp-agents
mkdir -p /var/log/mcp-agents
mkdir -p /var/lib/mcp-agents
mkdir -p /etc/mcp-agents

# Set ownership
chown -R mcp-agent:mcp-agent /opt/mcp-agents
chown -R mcp-agent:mcp-agent /var/log/mcp-agents
chown -R mcp-agent:mcp-agent /var/lib/mcp-agents
chown -R mcp-agent:mcp-agent /etc/mcp-agents

# Set permissions
chmod 755 /opt/mcp-agents
chmod 755 /var/log/mcp-agents
chmod 755 /var/lib/mcp-agents
chmod 750 /etc/mcp-agents
EOF

    log_success "System user created on $host"
}

build_agent() {
    local agent_name=$1
    local agent_path="${SCRIPT_DIR}/$2/${agent_name}"

    log_info "Building ${agent_name}..."

    if [ ! -d "$agent_path" ]; then
        log_error "Agent directory not found: $agent_path"
        return 1
    fi

    cd "$agent_path"

    # Install dependencies
    if [ ! -d "node_modules" ]; then
        log_info "Installing dependencies for ${agent_name}..."
        npm install --production
    fi

    # Build TypeScript
    log_info "Compiling TypeScript for ${agent_name}..."
    npm run build

    if [ ! -d "dist" ]; then
        log_error "Build failed for ${agent_name}"
        return 1
    fi

    log_success "Built ${agent_name}"
    cd - > /dev/null
}

deploy_agent() {
    local vm=$1
    local agent_name=$2
    local host=$3
    local agent_path="${SCRIPT_DIR}/${vm}/${agent_name}"

    log_info "Deploying ${agent_name} to ${host}..."

    # Create tarball
    local tarball="/tmp/${agent_name}.tar.gz"
    tar -czf "$tarball" \
        -C "${SCRIPT_DIR}/${vm}" \
        --exclude="node_modules" \
        --exclude="*.log" \
        --exclude=".git" \
        "${agent_name}"

    # Copy to remote
    scp -i "$SSH_KEY" "$tarball" "root@${host}:/tmp/"

    # Extract and install on remote
    ssh -i "$SSH_KEY" "root@${host}" bash <<EOF
cd "${INSTALL_BASE}"
tar -xzf "/tmp/${agent_name}.tar.gz"
rm "/tmp/${agent_name}.tar.gz"

cd "${INSTALL_BASE}/${agent_name}"

# Install dependencies
npm install --production

# Set ownership
chown -R mcp-agent:mcp-agent "${INSTALL_BASE}/${agent_name}"

# Set permissions
find . -type f -name "*.js" -exec chmod 755 {} \;
chmod 640 config/config.yaml

echo "Agent deployed successfully"
EOF

    rm "$tarball"
    log_success "Deployed ${agent_name} to ${host}"
}

configure_agent() {
    local vm=$1
    local agent_name=$2
    local host=$3

    log_info "Configuring ${agent_name} on ${host}..."

    # Prompt for credentials
    echo -e "\n${YELLOW}Configuration for ${agent_name}:${NC}"
    read -sp "PostgreSQL Password: " db_password
    echo
    read -sp "Redis Password (or press Enter to skip): " redis_password
    echo

    # Create environment file
    ssh -i "$SSH_KEY" "root@${host}" bash <<EOF
cat > "/etc/mcp-agents/${agent_name}.env" <<ENVEOF
# MCP Agent Environment Configuration
# Generated: $(date -u +"%Y-%m-%d %H:%M:%S UTC")

NODE_ENV=production
CONFIG_PATH="${INSTALL_BASE}/${agent_name}/config/config.yaml"
DB_PASSWORD=${db_password}
REDIS_PASSWORD=${redis_password}
ENVEOF

chmod 600 "/etc/mcp-agents/${agent_name}.env"
chown mcp-agent:mcp-agent "/etc/mcp-agents/${agent_name}.env"

echo "Environment configured"
EOF

    log_success "Configured ${agent_name}"
}

install_systemd_service() {
    local agent_name=$1
    local host=$2
    local service_file="${SCRIPT_DIR}/*/${agent_name}/${agent_name}.service"

    log_info "Installing systemd service for ${agent_name} on ${host}..."

    # Find service file
    local service_path=$(find "${SCRIPT_DIR}" -name "${agent_name}.service" | head -n1)

    if [ -z "$service_path" ]; then
        log_error "Service file not found for ${agent_name}"
        return 1
    fi

    # Copy service file
    scp -i "$SSH_KEY" "$service_path" "root@${host}:/etc/systemd/system/"

    # Enable and start service
    ssh -i "$SSH_KEY" "root@${host}" bash <<EOF
systemctl daemon-reload
systemctl enable ${agent_name}
systemctl start ${agent_name}

# Wait for service to start
sleep 3

# Check status
if systemctl is-active --quiet ${agent_name}; then
    echo "Service started successfully"
    systemctl status ${agent_name} --no-pager -l
else
    echo "Service failed to start"
    journalctl -u ${agent_name} -n 20 --no-pager
    exit 1
fi
EOF

    log_success "Installed systemd service for ${agent_name}"
}

verify_agent() {
    local agent_name=$1
    local host=$2
    local port=${AGENT_PORTS[$agent_name]}

    log_info "Verifying ${agent_name} on ${host}..."

    # Check health endpoint
    local health_check=$(ssh -i "$SSH_KEY" "root@${host}" \
        "curl -s -o /dev/null -w '%{http_code}' http://localhost:${port}/health" || echo "000")

    if [ "$health_check" = "200" ]; then
        log_success "${agent_name} health check passed"

        # Show health status
        ssh -i "$SSH_KEY" "root@${host}" "curl -s http://localhost:${port}/health | jq ."
        return 0
    else
        log_error "${agent_name} health check failed (HTTP $health_check)"

        # Show logs
        ssh -i "$SSH_KEY" "root@${host}" "journalctl -u ${agent_name} -n 50 --no-pager"
        return 1
    fi
}

setup_database_schema() {
    log_info "Setting up database schema..."

    ssh -i "$SSH_KEY" "root@${VMI01_HOST}" bash <<'EOF'
sudo -u postgres psql -d mcp_ecosystem <<SQLEOF
-- Create agent_heartbeats table
CREATE TABLE IF NOT EXISTS mcp_ecosystem.agent_heartbeats (
    id SERIAL PRIMARY KEY,
    agent_id VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL,
    metadata JSONB,
    last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_status
    ON mcp_ecosystem.agent_heartbeats(status);
CREATE INDEX IF NOT EXISTS idx_agent_heartbeats_last
    ON mcp_ecosystem.agent_heartbeats(last_heartbeat);

-- Create system_metrics table
CREATE TABLE IF NOT EXISTS mcp_ecosystem.system_metrics (
    id BIGSERIAL PRIMARY KEY,
    agent_id VARCHAR(100) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    metric_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_agent
    ON mcp_ecosystem.system_metrics(agent_id);
CREATE INDEX IF NOT EXISTS idx_system_metrics_type
    ON mcp_ecosystem.system_metrics(metric_type);
CREATE INDEX IF NOT EXISTS idx_system_metrics_created
    ON mcp_ecosystem.system_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_system_metrics_data
    ON mcp_ecosystem.system_metrics USING GIN(metric_data);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON mcp_ecosystem.agent_heartbeats TO mcp_orchestrator;
GRANT SELECT, INSERT ON mcp_ecosystem.system_metrics TO mcp_orchestrator;
GRANT USAGE, SELECT ON SEQUENCE mcp_ecosystem.agent_heartbeats_id_seq TO mcp_orchestrator;
GRANT USAGE, SELECT ON SEQUENCE mcp_ecosystem.system_metrics_id_seq TO mcp_orchestrator;

-- Enable pg_stat_statements extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SQLEOF

echo "Database schema created successfully"
EOF

    log_success "Database schema setup complete"
}

install_prometheus_pushgateway() {
    local host=$1

    log_info "Installing Prometheus Pushgateway on ${host}..."

    ssh -i "$SSH_KEY" "root@${host}" bash <<'EOF'
# Check if already installed
if systemctl is-active --quiet pushgateway; then
    echo "Pushgateway already installed"
    exit 0
fi

# Download and install
cd /tmp
wget https://github.com/prometheus/pushgateway/releases/download/v1.7.0/pushgateway-1.7.0.linux-amd64.tar.gz
tar -xzf pushgateway-1.7.0.linux-amd64.tar.gz
mv pushgateway-1.7.0.linux-amd64/pushgateway /usr/local/bin/
rm -rf pushgateway-1.7.0.linux-amd64*

# Create systemd service
cat > /etc/systemd/system/pushgateway.service <<SERVICEEOF
[Unit]
Description=Prometheus Pushgateway
After=network.target

[Service]
Type=simple
User=prometheus
Group=prometheus
ExecStart=/usr/local/bin/pushgateway \
    --web.listen-address=:9091 \
    --persistence.file=/var/lib/prometheus/pushgateway.data

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEEOF

# Create user and directories
useradd -r -s /bin/false prometheus || true
mkdir -p /var/lib/prometheus
chown prometheus:prometheus /var/lib/prometheus

# Start service
systemctl daemon-reload
systemctl enable pushgateway
systemctl start pushgateway

echo "Pushgateway installed successfully"
EOF

    log_success "Prometheus Pushgateway installed"
}

###############################################################################
# Deployment Functions
###############################################################################

deploy_vmi01_agents() {
    log_info "Deploying VMI01 agents to ${VMI01_HOST}..."

    create_system_user "$VMI01_HOST"

    for agent in ${AGENTS[vmi01]}; do
        build_agent "$agent" "vmi01"
        deploy_agent "vmi01" "$agent" "$VMI01_HOST"
        configure_agent "vmi01" "$agent" "$VMI01_HOST"
        install_systemd_service "$agent" "$VMI01_HOST"
        verify_agent "$agent" "$VMI01_HOST"
    done

    log_success "VMI01 agents deployed"
}

deploy_vmi02d_agents() {
    log_info "Deploying VMI02D agents to ${VMI02D_HOST}..."

    create_system_user "$VMI02D_HOST"

    for agent in ${AGENTS[vmi02d]}; do
        build_agent "$agent" "vmi02d"
        deploy_agent "vmi02d" "$agent" "$VMI02D_HOST"
        configure_agent "vmi02d" "$agent" "$VMI02D_HOST"
        install_systemd_service "$agent" "$VMI02D_HOST"
        verify_agent "$agent" "$VMI02D_HOST"
    done

    log_success "VMI02D agents deployed"
}

deploy_vmi03_agents() {
    log_info "Deploying VMI03 agents to ${VMI03_HOST}..."

    create_system_user "$VMI03_HOST"

    for agent in ${AGENTS[vmi03]}; do
        build_agent "$agent" "vmi03"
        deploy_agent "vmi03" "$agent" "$VMI03_HOST"
        configure_agent "vmi03" "$agent" "$VMI03_HOST"
        install_systemd_service "$agent" "$VMI03_HOST"
        verify_agent "$agent" "$VMI03_HOST"
    done

    log_success "VMI03 agents deployed"
}

###############################################################################
# Main Deployment
###############################################################################

show_banner() {
    echo -e "${BLUE}"
    cat <<'BANNER'
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         MCP Monitoring Agents Deployment Tool            ║
║                                                           ║
║  Automated deployment of 6 monitoring agents across      ║
║  3 VMs for comprehensive infrastructure monitoring       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
BANNER
    echo -e "${NC}\n"
}

show_summary() {
    echo -e "\n${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              Deployment Summary                           ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}\n"

    echo -e "${BLUE}VMI01 (${VMI01_HOST}):${NC}"
    echo "  - DB Optimizer Agent     (port 9100)"
    echo "  - App Health Agent       (port 9101)"
    echo ""

    echo -e "${BLUE}VMI02D (${VMI02D_HOST}):${NC}"
    echo "  - Storage Mgmt Agent     (port 9200)"
    echo "  - Service Health Agent   (port 9201)"
    echo ""

    echo -e "${BLUE}VMI03 (${VMI03_HOST}):${NC}"
    echo "  - Network Security Agent (port 9300)"
    echo "  - Identity Mgmt Agent    (port 9301)"
    echo ""

    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Configure Prometheus to scrape Pushgateway (http://${VMI01_HOST}:9091)"
    echo "2. Import Grafana dashboards from docs/grafana/"
    echo "3. Review agent logs: journalctl -u <agent-name> -f"
    echo "4. Test health endpoints: curl http://localhost:910X/health"
    echo "5. Monitor metrics: curl http://localhost:910X/metrics"
    echo ""
}

main() {
    show_banner

    # Parse command line arguments
    local mode="${1:-all}"

    case "$mode" in
        all)
            log_info "Deploying all agents..."
            check_prerequisites
            setup_database_schema
            install_prometheus_pushgateway "$VMI01_HOST"
            deploy_vmi01_agents
            deploy_vmi02d_agents
            deploy_vmi03_agents
            show_summary
            ;;
        vmi01)
            check_prerequisites
            setup_database_schema
            install_prometheus_pushgateway "$VMI01_HOST"
            deploy_vmi01_agents
            ;;
        vmi02d)
            check_prerequisites
            deploy_vmi02d_agents
            ;;
        vmi03)
            check_prerequisites
            deploy_vmi03_agents
            ;;
        *)
            echo "Usage: $0 {all|vmi01|vmi02d|vmi03}"
            echo ""
            echo "Examples:"
            echo "  $0 all      # Deploy all agents to all VMs"
            echo "  $0 vmi01    # Deploy only VMI01 agents"
            echo "  $0 vmi02d   # Deploy only VMI02D agents"
            echo "  $0 vmi03    # Deploy only VMI03 agents"
            exit 1
            ;;
    esac

    log_success "Deployment complete!"
}

# Run main function
main "$@"
