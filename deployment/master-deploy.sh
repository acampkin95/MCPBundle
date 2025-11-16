#!/bin/bash
################################################################################
# MCP Bundle Master Deployment Script
# Orchestrates full infrastructure deployment across VMI01, VMI02D, VMI03
# Integrates: MCP services, SOC security stack, media services, web hosting
################################################################################

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Server IPs
VMI01="46.250.243.123"
VMI02D="46.250.241.70"
VMI03="154.26.158.31"

# Deployment phases
PHASE_0_SOC_SECURITY=true
PHASE_1_FOUNDATION=true
PHASE_2_VMI03_SECURITY_HUB=true
PHASE_3_VMI03_SERVICES=true
PHASE_4_VMI02D_SERVICES=true
PHASE_5_BACKUP_INTEGRATION=true
PHASE_6_TESTING=true

# Logging
DEPLOY_LOG="/tmp/mcp-master-deploy-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$DEPLOY_LOG")
exec 2>&1

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓${NC} $*"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠${NC} $*"
}

################################################################################
# Phase 0: SOC Security Stack (All Servers)
################################################################################
deploy_phase_0() {
    log "=========================================="
    log "PHASE 0: SOC Security Stack Deployment"
    log "=========================================="

    for SERVER in "$VMI01" "$VMI02D" "$VMI03"; do
        log "Deploying SOC stack to $SERVER..."

        # Deploy nftables base configuration
        ./deployment/soc/deploy-nftables.sh "$SERVER" &

        # Deploy Suricata IPS
        ./deployment/soc/deploy-suricata.sh "$SERVER" &

        # Deploy CrowdSec
        ./deployment/soc/deploy-crowdsec.sh "$SERVER" &

        # Deploy Falco EDR
        ./deployment/soc/deploy-falco.sh "$SERVER" &
    done

    wait
    log_success "SOC security agents deployed to all servers"

    # Deploy Wazuh manager on VMI03
    log "Deploying Wazuh manager on VMI03..."
    ./deployment/soc/deploy-wazuh-manager.sh "$VMI03"
    log_success "Wazuh manager deployed"

    # Deploy Wazuh agents on VMI01 and VMI02D
    for SERVER in "$VMI01" "$VMI02D"; do
        log "Deploying Wazuh agent on $SERVER..."
        ./deployment/soc/deploy-wazuh-agent.sh "$SERVER" "$VMI03" &
    done

    wait
    log_success "Phase 0 complete: SOC security stack operational"
}

################################################################################
# Phase 1: Foundation Services
################################################################################
deploy_phase_1() {
    log "=========================================="
    log "PHASE 1: Foundation Services"
    log "=========================================="

    # System updates (parallel)
    for SERVER in "$VMI01" "$VMI02D" "$VMI03"; do
        log "Running system updates on $SERVER..."
        ssh root@"$SERVER" "apt update && apt upgrade -y && apt autoremove -y" &
    done
    wait
    log_success "System updates complete"

    # Deploy WireGuard VPN mesh
    log "Deploying WireGuard VPN mesh..."
    ./deployment/wireguard/deploy-configs.sh
    ./deployment/wireguard/test-connectivity.sh
    log_success "WireGuard VPN mesh operational"

    # Deploy Redis on VMI01
    log "Configuring Redis on VMI01..."
    ./deployment/redis/configure-redis.sh "$VMI01"
    log_success "Redis configured"

    # Deploy MCP services on VMI01
    log "Deploying MCP services on VMI01..."
    ./deployment/scripts/deploy-mcp-services.sh
    log_success "MCP services deployed"

    log_success "Phase 1 complete: Foundation services operational"
}

################################################################################
# Phase 2: VMI03 Security Hub
################################################################################
deploy_phase_2() {
    log "=========================================="
    log "PHASE 2: VMI03 Security Hub"
    log "=========================================="

    # Deploy Elasticsearch + Kibana
    log "Deploying Elasticsearch and Kibana..."
    ./deployment/soc/deploy-elasticsearch.sh "$VMI03" &

    # Deploy TheHive + Cortex
    log "Deploying TheHive and Cortex..."
    ./deployment/soc/deploy-thehive-cortex.sh "$VMI03" &

    # Deploy AdGuard Home
    log "Deploying AdGuard Home..."
    ./deployment/dns/deploy-adguard.sh "$VMI03" &

    wait
    log_success "Phase 2 complete: Security Hub operational"
}

################################################################################
# Phase 3: VMI03 Core Services
################################################################################
deploy_phase_3() {
    log "=========================================="
    log "PHASE 3: VMI03 Core Services"
    log "=========================================="

    # Migrate Keycloak from Docker to native
    log "Deploying native Keycloak..."
    ./deployment/keycloak/deploy-native-keycloak.sh "$VMI03"
    log_success "Keycloak deployed natively"

    # Deploy HAProxy
    log "Deploying HAProxy load balancer..."
    ./deployment/ha/deploy-haproxy.sh "$VMI03"
    log_success "HAProxy deployed"

    # Deploy monitoring stack
    log "Deploying Prometheus and Grafana..."
    ./deployment/monitoring/deploy-prometheus.sh "$VMI03" &
    ./deployment/monitoring/deploy-grafana.sh "$VMI03" &

    wait
    log_success "Phase 3 complete: VMI03 core services operational"
}

################################################################################
# Phase 4: VMI02D Media Services
################################################################################
deploy_phase_4() {
    log "=========================================="
    log "PHASE 4: VMI02D Media Services"
    log "=========================================="

    # Deploy NextCloud
    log "Deploying NextCloud..."
    ./deployment/media/deploy-nextcloud.sh "$VMI02D"
    log_success "NextCloud deployed"

    # Deploy Plex Media Server
    log "Deploying Plex Media Server..."
    ./deployment/media/deploy-plex.sh "$VMI02D"
    log_success "Plex deployed"

    # Deploy transcoding automation
    log "Setting up video transcoding automation..."
    ./deployment/media/deploy-transcoding.sh "$VMI02D"
    log_success "Transcoding automation configured"

    log_success "Phase 4 complete: Media services operational"
}

################################################################################
# Phase 5: Backup & Integration
################################################################################
deploy_phase_5() {
    log "=========================================="
    log "PHASE 5: Backup & Integration"
    log "=========================================="

    # Configure Wasabi S3 backups
    log "Configuring Wasabi S3 backups with GFS rotation..."
    ./deployment/backup-dr/configure-wasabi-s3.sh

    # Configure 6-hour snapshots
    log "Configuring 6-hour snapshot schedule..."
    ./deployment/backup-dr/configure-snapshots.sh

    # Deploy automated maintenance
    for SERVER in "$VMI01" "$VMI02D" "$VMI03"; do
        log "Deploying maintenance automation on $SERVER..."
        ./deployment/automation/deploy-maintenance.sh "$SERVER" &
    done

    wait
    log_success "Phase 5 complete: Backup and automation operational"
}

################################################################################
# Phase 6: Testing & Validation
################################################################################
deploy_phase_6() {
    log "=========================================="
    log "PHASE 6: Testing & Validation"
    log "=========================================="

    # Run integration tests
    log "Running integration test suite..."
    ./deployment/tests/mcp-integration-tests.sh

    # Run security validation
    log "Running security validation..."
    ./deployment/tests/security-validation.sh

    # Verify backups
    log "Verifying backup integrity..."
    ./deployment/tests/backup-validation.sh

    log_success "Phase 6 complete: All tests passed"
}

################################################################################
# Main Execution
################################################################################
main() {
    log "=========================================="
    log "MCP Bundle Master Deployment"
    log "Started: $(date)"
    log "=========================================="

    # Check prerequisites
    log "Checking prerequisites..."
    command -v ssh >/dev/null 2>&1 || { log_error "ssh not found"; exit 1; }
    command -v scp >/dev/null 2>&1 || { log_error "scp not found"; exit 1; }

    # Verify SSH connectivity
    for SERVER in "$VMI01" "$VMI02D" "$VMI03"; do
        if ! ssh -o ConnectTimeout=5 root@"$SERVER" "echo 'Connected'" >/dev/null 2>&1; then
            log_error "Cannot connect to $SERVER"
            exit 1
        fi
    done
    log_success "All servers reachable"

    # Execute phases
    [[ "$PHASE_0_SOC_SECURITY" == true ]] && deploy_phase_0
    [[ "$PHASE_1_FOUNDATION" == true ]] && deploy_phase_1
    [[ "$PHASE_2_VMI03_SECURITY_HUB" == true ]] && deploy_phase_2
    [[ "$PHASE_3_VMI03_SERVICES" == true ]] && deploy_phase_3
    [[ "$PHASE_4_VMI02D_SERVICES" == true ]] && deploy_phase_4
    [[ "$PHASE_5_BACKUP_INTEGRATION" == true ]] && deploy_phase_5
    [[ "$PHASE_6_TESTING" == true ]] && deploy_phase_6

    log "=========================================="
    log_success "DEPLOYMENT COMPLETE"
    log "Completed: $(date)"
    log "Log file: $DEPLOY_LOG"
    log "=========================================="

    # Print summary
    cat <<EOF

📊 DEPLOYMENT SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ SOC Security Stack (Suricata, CrowdSec, Wazuh, Falco)
✓ WireGuard VPN Mesh + User VPN
✓ VMI03 Security Hub (Elasticsearch, Kibana, TheHive, Cortex)
✓ AdGuard Home DNS
✓ Native Keycloak SSO
✓ HAProxy Load Balancer
✓ Prometheus + Grafana Monitoring
✓ MCP Services (Orchestrator, Perplexity, IT-MCP)
✓ Redis Coordination Layer
✓ NextCloud File Storage
✓ Plex Media Server
✓ Automated Video Transcoding
✓ Wasabi S3 Backups (6h snapshots, GFS rotation)
✓ Automated Maintenance Agents

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 NEXT STEPS:

1. Deploy VPN Invite System:
   ./deployment/vpn/deploy-invite-system.sh

2. Deploy Web Hosting Platform:
   ./deployment/webhosting/deploy-platform.sh

3. Access Management Interfaces:
   - Grafana: https://154.26.158.31:3000
   - Kibana: https://154.26.158.31:5601
   - TheHive: https://154.26.158.31:9000
   - Keycloak: https://154.26.158.31:8443
   - AdGuard: https://154.26.158.31:3030
   - NextCloud: https://46.250.241.70:443
   - Plex: https://46.250.241.70:32400

4. Review logs: tail -f $DEPLOY_LOG

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

# Execute
main "$@"
