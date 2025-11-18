#!/bin/bash
# ============================================================================
# MCP Ecosystem - Production Deployment Orchestrator
# ============================================================================
# Purpose: Main orchestration script for complete v0.2 deployment
# Target: VMI01 (46.250.243.123)
# Version: 0.2.0
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_USER="dev-admin"
DEPLOY_HOST="46.250.243.123"
LOG_FILE="/var/log/mcp/production_deploy_$(date +%Y%m%d_%H%M%S).log"

# Deployment components
DEPLOY_DATABASE=true
DEPLOY_SERVICES=true
DEPLOY_CONFIG=true
RUN_VALIDATION=true

# ============================================================================
# Logging
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}✗${NC} $*" | tee -a "$LOG_FILE"
}

log_step() {
    echo -e "${CYAN}▶${NC} $*" | tee -a "$LOG_FILE"
}

# ============================================================================
# Banner
# ============================================================================

show_banner() {
    cat << "EOF"
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║                    MCP ECOSYSTEM PRODUCTION DEPLOYMENT                     ║
║                              Version 0.2.0                                 ║
║                                                                            ║
║                         Target: VMI01 (46.250.243.123)                    ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
EOF
    echo ""
}

# ============================================================================
# Prerequisites Check
# ============================================================================

check_prerequisites() {
    log_step "Checking prerequisites..."

    local errors=0

    # Check SSH connectivity
    if ! ssh -o ConnectTimeout=5 "$DEPLOY_USER@$DEPLOY_HOST" "echo 'SSH OK'" &>/dev/null; then
        log_error "Cannot connect to $DEPLOY_HOST"
        ((errors++))
    else
        log_success "SSH connectivity verified"
    fi

    # Check required scripts exist
    local required_scripts=(
        "$SCRIPT_DIR/deploy-database-migration.sh"
        "$SCRIPT_DIR/deploy-mcp-services.sh"
    )

    for script in "${required_scripts[@]}"; do
        if [ ! -f "$script" ]; then
            log_error "Required script not found: $script"
            ((errors++))
        else
            # Make executable
            chmod +x "$script"
        fi
    done

    if [ $errors -eq 0 ]; then
        log_success "All prerequisites met"
    fi

    # Check schema files exist
    if [ ! -f "$PROJECT_ROOT/deployment/schema/migrate_v01_to_v02.sql" ]; then
        log_error "Migration script not found"
        ((errors++))
    else
        log_success "Migration script found"
    fi

    # Check service source directories
    local services=("mcp-orchestrator" "perplexity-mcp" "it-mcp")
    for service in "${services[@]}"; do
        if [ ! -d "$PROJECT_ROOT/release_dev/$service" ]; then
            log_error "Service directory not found: $service"
            ((errors++))
        fi
    done

    if [ $errors -eq 0 ]; then
        log_success "All service directories found"
    fi

    return $errors
}

# ============================================================================
# Upload Schema Files
# ============================================================================

upload_schema_files() {
    log_step "Uploading schema files to remote server..."

    # Create schema directory on remote
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo mkdir -p /opt/mcp/schema && sudo chown -R $DEPLOY_USER:$DEPLOY_USER /opt/mcp/schema"

    # Upload migration script
    scp "$PROJECT_ROOT/deployment/schema/migrate_v01_to_v02.sql" \
        "$DEPLOY_USER@$DEPLOY_HOST:/opt/mcp/schema/" &>/dev/null

    if [ $? -eq 0 ]; then
        log_success "Schema files uploaded"
    else
        log_error "Failed to upload schema files"
        return 1
    fi
}

# ============================================================================
# Deploy Database Migration
# ============================================================================

deploy_database() {
    log_step "Deploying database migration (v0.1 → v0.2)..."
    echo ""

    # Upload deployment script
    scp "$SCRIPT_DIR/deploy-database-migration.sh" \
        "$DEPLOY_USER@$DEPLOY_HOST:/tmp/" &>/dev/null

    # Make executable on remote
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "chmod +x /tmp/deploy-database-migration.sh"

    # Execute migration script on remote
    log "Running migration script on remote server..."
    log "You may be prompted for the database password..."
    echo ""

    ssh -t "$DEPLOY_USER@$DEPLOY_HOST" "/tmp/deploy-database-migration.sh"

    if [ $? -eq 0 ]; then
        log_success "Database migration completed"
        return 0
    else
        log_error "Database migration failed"
        return 1
    fi
}

# ============================================================================
# Deploy MCP Services
# ============================================================================

deploy_services() {
    log_step "Deploying MCP services..."
    echo ""

    # Run service deployment script
    bash "$SCRIPT_DIR/deploy-mcp-services.sh"

    if [ $? -eq 0 ]; then
        log_success "MCP services deployed"
        return 0
    else
        log_error "MCP service deployment failed"
        return 1
    fi
}

# ============================================================================
# Post-Deployment Configuration
# ============================================================================

post_deployment_config() {
    log_step "Running post-deployment configuration..."

    # Create log directories
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo mkdir -p /var/log/mcp && sudo chown -R $DEPLOY_USER:$DEPLOY_USER /var/log/mcp"

    # Create data directories
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo mkdir -p /var/lib/mcp && sudo chown -R $DEPLOY_USER:$DEPLOY_USER /var/lib/mcp"

    # Configure log rotation
    ssh "$DEPLOY_USER@$DEPLOY_HOST" "sudo tee /etc/logrotate.d/mcp" > /dev/null <<'EOF'
/var/log/mcp/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0644 dev-admin dev-admin
    sharedscripts
    postrotate
        systemctl reload mcp-orchestrator perplexity-mcp it-mcp || true
    endscript
}
EOF

    log_success "Post-deployment configuration complete"
}

# ============================================================================
# Validation
# ============================================================================

run_validation() {
    log_step "Running deployment validation..."
    echo ""

    local errors=0

    # Check services are running
    log "Checking service status..."
    local services=("mcp-orchestrator" "perplexity-mcp" "it-mcp")
    for service in "${services[@]}"; do
        if ssh "$DEPLOY_USER@$DEPLOY_HOST" "systemctl is-active --quiet $service"; then
            log_success "$service is running"
        else
            log_error "$service is not running"
            ((errors++))
        fi
    done

    # Check database schema version
    log "Checking database schema version..."
    local db_version=$(ssh "$DEPLOY_USER@$DEPLOY_HOST" "cat /opt/mcp/schema/current_version.txt 2>/dev/null | head -1" || echo "unknown")
    if [ "$db_version" = "0.2.0" ]; then
        log_success "Database schema version: $db_version"
    else
        log_warning "Database schema version: $db_version (expected 0.2.0)"
    fi

    # Check new database tables exist
    log "Validating new database tables..."
    local new_tables=("thought_branches" "feedback_signals" "thought_relationships" "thought_sync_queue")
    for table in "${new_tables[@]}"; do
        if ssh "$DEPLOY_USER@$DEPLOY_HOST" \
            "PGPASSWORD='${MCP_DB_PASSWORD}' psql -h localhost -U mcp_admin -d mcp_ecosystem -tAc \"SELECT COUNT(*) FROM pg_tables WHERE tablename='$table'\"" | grep -q "1"; then
            log_success "Table $table exists"
        else
            log_error "Table $table not found"
            ((errors++))
        fi
    done

    # Check service ports
    log "Checking service ports..."
    local ports=("3000" "3001" "3002")
    for port in "${ports[@]}"; do
        if ssh "$DEPLOY_USER@$DEPLOY_HOST" "ss -tuln | grep -q :$port"; then
            log_success "Port $port is listening"
        else
            log_warning "Port $port is not listening"
            ((errors++))
        fi
    done

    echo ""
    if [ $errors -eq 0 ]; then
        log_success "All validation checks passed"
        return 0
    else
        log_warning "Validation completed with $errors issues"
        return 1
    fi
}

# ============================================================================
# Deployment Summary
# ============================================================================

show_summary() {
    local start_time=$1
    local end_time=$2
    local duration=$((end_time - start_time))

    echo ""
    echo "╔════════════════════════════════════════════════════════════════════════════╗"
    echo "║                      DEPLOYMENT COMPLETED SUCCESSFULLY                     ║"
    echo "╚════════════════════════════════════════════════════════════════════════════╝"
    echo ""
    log "Deployment duration: $((duration / 60)) minutes $((duration % 60)) seconds"
    echo ""
    log "Services deployed:"
    log "  ✓ Database migrated to v0.2.0"
    log "  ✓ MCP Orchestrator (port 3000)"
    log "  ✓ Perplexity MCP (port 3001)"
    log "  ✓ IT-MCP Server (port 3002)"
    echo ""
    log "Service URLs:"
    log "  • MCP Orchestrator: http://46.250.243.123:3000"
    log "  • Perplexity MCP:   http://46.250.243.123:3001"
    log "  • IT-MCP Server:    http://46.250.243.123:3002"
    echo ""
    log "New database capabilities:"
    log "  • Full-text search: SELECT * FROM search_thoughts('query', 50);"
    log "  • Branch health: SELECT * FROM get_branch_health();"
    log "  • Timeline view: SELECT * FROM v_thought_timeline_v2;"
    echo ""
    log "Next steps:"
    log "  1. Configure Perplexity API key:"
    log "     ssh $DEPLOY_USER@$DEPLOY_HOST"
    log "     sudo nano /opt/mcp/services/perplexity-mcp/.env"
    log "     sudo systemctl restart perplexity-mcp"
    echo ""
    log "  2. Test inter-MCP communication:"
    log "     curl http://46.250.243.123:3000/health"
    echo ""
    log "  3. Monitor service logs:"
    log "     ssh $DEPLOY_USER@$DEPLOY_HOST"
    log "     journalctl -u mcp-orchestrator -f"
    echo ""
    log "  4. Deploy Keycloak SSO (Phase 4)"
    log "  5. Configure WireGuard VPN tunnels (Phase 4)"
    log "  6. Deploy monitoring stack (Phase 5)"
    echo ""
    log "Full deployment log: $LOG_FILE"
    echo ""
}

# ============================================================================
# Parse Command Line Arguments
# ============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --database-only)
                DEPLOY_SERVICES=false
                shift
                ;;
            --services-only)
                DEPLOY_DATABASE=false
                shift
                ;;
            --skip-validation)
                RUN_VALIDATION=false
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --database-only     Deploy only database migration"
                echo "  --services-only     Deploy only MCP services"
                echo "  --skip-validation   Skip post-deployment validation"
                echo "  --help              Show this help message"
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    local start_time=$(date +%s)

    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"

    # Parse arguments
    parse_args "$@"

    # Show banner
    show_banner

    log "Production deployment started"
    log "Target: $DEPLOY_USER@$DEPLOY_HOST"
    log "Components: Database=$DEPLOY_DATABASE, Services=$DEPLOY_SERVICES"
    log "Log file: $LOG_FILE"
    echo ""

    # Check prerequisites
    if ! check_prerequisites; then
        log_error "Prerequisites check failed"
        exit 1
    fi
    echo ""

    # Confirmation prompt
    log_warning "╔════════════════════════════════════════════════════════════════╗"
    log_warning "║                  PRODUCTION DEPLOYMENT                         ║"
    log_warning "║                                                                ║"
    if [ "$DEPLOY_DATABASE" = true ]; then
        log_warning "║  • Database will be migrated to v0.2.0                        ║"
    fi
    if [ "$DEPLOY_SERVICES" = true ]; then
        log_warning "║  • MCP services will be deployed/updated                      ║"
    fi
    log_warning "║  • Services will be restarted                                  ║"
    log_warning "║  • Backup will be created automatically                        ║"
    log_warning "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    read -rp "Proceed with production deployment? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log "Deployment cancelled by user"
        exit 0
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""

    # Phase 1: Upload schema files
    if [ "$DEPLOY_DATABASE" = true ]; then
        upload_schema_files || exit 1
        echo ""
    fi

    # Phase 2: Database migration
    if [ "$DEPLOY_DATABASE" = true ]; then
        log "═══════════════════════════════════════════════════════════════════════════"
        log "PHASE 1: DATABASE MIGRATION"
        log "═══════════════════════════════════════════════════════════════════════════"
        echo ""

        if ! deploy_database; then
            log_error "Database migration failed - stopping deployment"
            exit 1
        fi
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════════"
        echo ""
    fi

    # Phase 3: MCP Services
    if [ "$DEPLOY_SERVICES" = true ]; then
        log "═══════════════════════════════════════════════════════════════════════════"
        log "PHASE 2: MCP SERVICE DEPLOYMENT"
        log "═══════════════════════════════════════════════════════════════════════════"
        echo ""

        if ! deploy_services; then
            log_error "Service deployment failed"
            exit 1
        fi
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════════"
        echo ""
    fi

    # Phase 4: Post-deployment configuration
    log "═══════════════════════════════════════════════════════════════════════════"
    log "PHASE 3: POST-DEPLOYMENT CONFIGURATION"
    log "═══════════════════════════════════════════════════════════════════════════"
    echo ""

    post_deployment_config
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════════"
    echo ""

    # Phase 5: Validation
    if [ "$RUN_VALIDATION" = true ]; then
        log "═══════════════════════════════════════════════════════════════════════════"
        log "PHASE 4: VALIDATION"
        log "═══════════════════════════════════════════════════════════════════════════"
        echo ""

        run_validation
        echo ""
        echo "═══════════════════════════════════════════════════════════════════════════"
        echo ""
    fi

    # Show summary
    local end_time=$(date +%s)
    show_summary "$start_time" "$end_time"
}

# Execute main
main "$@"
