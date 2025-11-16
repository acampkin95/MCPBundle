#!/bin/bash
set -euo pipefail

# Master Monitoring Stack Deployment Script
# Deploys Prometheus, Grafana, and AdGuard Home on VMI03

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color

# Configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROMETHEUS_SCRIPT="${SCRIPT_DIR}/deploy-prometheus.sh"
readonly GRAFANA_SCRIPT="${SCRIPT_DIR}/deploy-grafana.sh"
readonly ADGUARD_SCRIPT="$(dirname "${SCRIPT_DIR}")/dns/deploy-adguard.sh"
readonly LOG_DIR="/var/log/mcp-deployment"
readonly TIMESTAMP="$(date +%Y%m%d_%H%M%S)"

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

# Error handler
cleanup_on_error() {
    log_error "Deployment failed. Check logs in ${LOG_DIR}"
    exit 1
}

trap cleanup_on_error ERR

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root"
   exit 1
fi

# Create log directory
mkdir -p "${LOG_DIR}"

# Print banner
cat <<'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║        MCP Bundle v0.2.0 - Monitoring Stack Deployment          ║
║                                                                  ║
║  Components:                                                     ║
║    • Prometheus 2.48+ (Time-series metrics database)            ║
║    • Grafana 10.x (Visualization and dashboards)                ║
║    • AdGuard Home 0.107+ (DNS filtering and ad blocking)        ║
║                                                                  ║
║  Target: VMI03 (154.26.158.31)                                  ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
EOF

echo
log_info "Starting monitoring stack deployment at $(date)"
log_info "Deployment logs will be saved to: ${LOG_DIR}"
echo

# Validate scripts exist
log_info "Validating deployment scripts..."
if [[ ! -f "${PROMETHEUS_SCRIPT}" ]]; then
    log_error "Prometheus deployment script not found: ${PROMETHEUS_SCRIPT}"
    exit 1
fi

if [[ ! -f "${GRAFANA_SCRIPT}" ]]; then
    log_error "Grafana deployment script not found: ${GRAFANA_SCRIPT}"
    exit 1
fi

if [[ ! -f "${ADGUARD_SCRIPT}" ]]; then
    log_error "AdGuard deployment script not found: ${ADGUARD_SCRIPT}"
    exit 1
fi

log_success "All deployment scripts found"

# Check for required commands
log_info "Checking system requirements..."
for cmd in curl wget systemctl; do
    if ! command -v ${cmd} &> /dev/null; then
        log_error "Required command not found: ${cmd}"
        exit 1
    fi
done
log_success "System requirements met"

# Confirmation prompt
echo
log_warn "This will deploy the following components on VMI03:"
echo "  1. Prometheus (port 9090) - Metrics collection and storage"
echo "  2. Grafana (port 3030) - Dashboards and visualization"
echo "  3. AdGuard Home (port 53, 3030) - DNS filtering"
echo
read -p "Continue with deployment? (yes/no): " -r
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_warn "Deployment cancelled by user"
    exit 0
fi

# Step 1: Deploy Prometheus
log_step "Step 1/3: Deploying Prometheus"
log_info "Running Prometheus deployment..."
if bash "${PROMETHEUS_SCRIPT}" 2>&1 | tee "${LOG_DIR}/prometheus_${TIMESTAMP}.log"; then
    log_success "Prometheus deployment completed"
else
    log_error "Prometheus deployment failed"
    exit 1
fi

# Wait for Prometheus to stabilize
sleep 3

# Step 2: Deploy Grafana
log_step "Step 2/3: Deploying Grafana"
log_info "Running Grafana deployment..."
if bash "${GRAFANA_SCRIPT}" 2>&1 | tee "${LOG_DIR}/grafana_${TIMESTAMP}.log"; then
    log_success "Grafana deployment completed"
else
    log_error "Grafana deployment failed"
    exit 1
fi

# Wait for Grafana to stabilize
sleep 3

# Step 3: Deploy AdGuard Home
log_step "Step 3/3: Deploying AdGuard Home"
log_info "Running AdGuard Home deployment..."
if bash "${ADGUARD_SCRIPT}" 2>&1 | tee "${LOG_DIR}/adguard_${TIMESTAMP}.log"; then
    log_success "AdGuard Home deployment completed"
else
    log_error "AdGuard Home deployment failed"
    exit 1
fi

# Wait for all services to stabilize
log_info "Waiting for all services to stabilize..."
sleep 5

# Verify all services are running
log_step "Verifying Service Status"

check_service() {
    local service=$1
    local display_name=$2

    if systemctl is-active --quiet "${service}"; then
        log_success "${display_name} is running"
        return 0
    else
        log_error "${display_name} is not running"
        return 1
    fi
}

all_running=true
check_service "prometheus" "Prometheus" || all_running=false
check_service "grafana-server" "Grafana" || all_running=false
check_service "adguard-home" "AdGuard Home" || all_running=false

if [[ "${all_running}" == "false" ]]; then
    log_error "One or more services failed to start"
    log_info "Check service logs with: journalctl -u <service-name> -n 50"
    exit 1
fi

# Collect credentials
log_step "Collecting Credentials"

PROMETHEUS_CREDS=""
GRAFANA_CREDS=""
ADGUARD_CREDS=""

if [[ -f "/opt/grafana/credentials.txt" ]]; then
    GRAFANA_CREDS=$(cat "/opt/grafana/credentials.txt")
fi

if [[ -f "/opt/adguard/credentials.txt" ]]; then
    ADGUARD_CREDS=$(cat "/opt/adguard/credentials.txt")
fi

# Create combined credentials file
CREDENTIALS_FILE="/opt/mcp-monitoring-credentials.txt"
cat > "${CREDENTIALS_FILE}" <<EOF
╔══════════════════════════════════════════════════════════════════╗
║      MCP Bundle v0.2.0 - Monitoring Stack Credentials           ║
║      Generated: $(date)                                 ║
╚══════════════════════════════════════════════════════════════════╝

KEEP THIS FILE SECURE!

═══════════════════════════════════════════════════════════════════
PROMETHEUS
═══════════════════════════════════════════════════════════════════
Web UI:     http://154.26.158.31:9090
Config:     /opt/prometheus/prometheus.yml
Health:     /opt/prometheus/health-check.sh

No authentication required (internal use only)

═══════════════════════════════════════════════════════════════════
GRAFANA
═══════════════════════════════════════════════════════════════════
${GRAFANA_CREDS}

═══════════════════════════════════════════════════════════════════
ADGUARD HOME
═══════════════════════════════════════════════════════════════════
${ADGUARD_CREDS}

═══════════════════════════════════════════════════════════════════
QUICK ACCESS URLS
═══════════════════════════════════════════════════════════════════
Prometheus:     http://154.26.158.31:9090
Grafana:        http://154.26.158.31:3030
AdGuard Home:   http://154.26.158.31:3030

Note: Grafana and AdGuard share port 3030 on different paths.
Check HAProxy configuration for proper routing.

═══════════════════════════════════════════════════════════════════
NEXT STEPS
═══════════════════════════════════════════════════════════════════
1. Configure exporters on VMI01 and VMI02D:
   - Node Exporter (port 9100)
   - PostgreSQL Exporter (port 9187)
   - Redis Exporter (port 9121)

2. Set up Keycloak SSO for Grafana:
   - See: /opt/grafana/KEYCLOAK_SETUP.md

3. Update WireGuard client configs:
   - See: /opt/adguard/wireguard-dns-update.txt

4. Configure HAProxy for HTTPS access

5. Set up alert notifications in Grafana

6. Import additional dashboards from grafana.com

7. Monitor service health:
   - systemctl status prometheus grafana-server adguard-home

═══════════════════════════════════════════════════════════════════
EOF

chmod 600 "${CREDENTIALS_FILE}"
log_success "Credentials saved to ${CREDENTIALS_FILE}"

# Print deployment summary
cat <<EOF

${GREEN}╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║      Monitoring Stack Deployment Complete!                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝${NC}

${BLUE}Deployment Summary:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${GREEN}✓${NC} Prometheus    http://154.26.158.31:9090
${GREEN}✓${NC} Grafana       http://154.26.158.31:3030
${GREEN}✓${NC} AdGuard Home  http://154.26.158.31:3030

${BLUE}Services Status:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

systemctl status prometheus --no-pager | grep "Active:"
systemctl status grafana-server --no-pager | grep "Active:"
systemctl status adguard-home --no-pager | grep "Active:"

cat <<EOF

${BLUE}Credentials:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All credentials saved to: ${CREDENTIALS_FILE}

View with: cat ${CREDENTIALS_FILE}

${BLUE}Deployment Logs:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prometheus:   ${LOG_DIR}/prometheus_${TIMESTAMP}.log
Grafana:      ${LOG_DIR}/grafana_${TIMESTAMP}.log
AdGuard Home: ${LOG_DIR}/adguard_${TIMESTAMP}.log

${BLUE}Health Checks:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prometheus:   /opt/prometheus/health-check.sh
Grafana:      curl http://localhost:3030/api/health
AdGuard Home: /opt/adguard/health-check.sh

${BLUE}Next Steps:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Deploy exporters on VMI01 and VMI02D
2. Configure Keycloak SSO for Grafana
3. Update WireGuard DNS settings
4. Set up Grafana alert notifications
5. Configure HAProxy for production access

${YELLOW}Important:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Secure the credentials file: ${CREDENTIALS_FILE}
• Configure firewall rules if not already done
• Set up HTTPS/TLS for production use
• Review and customize Prometheus alert rules
• Test DNS filtering with AdGuard Home

${GREEN}Deployment completed successfully at $(date)${NC}

EOF

log_success "All monitoring stack components deployed and running!"
log_info "Check ${CREDENTIALS_FILE} for all access credentials"
