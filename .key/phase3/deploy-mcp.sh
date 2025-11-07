#!/bin/bash
################################################################################
# MCP Ecosystem - Master Deployment Script (Phase 3)
#
# This script orchestrates the complete deployment of the MCP ecosystem to VMI01
# including ITJSST-MCP, MCP-Orchestrator, and Perplexity-MCP
#
# Usage: ./deploy-mcp.sh [OPTIONS]
#
# Options:
#   --skip-tests       Skip test suite execution
#   --skip-build       Skip build step (use existing builds)
#   --skip-verify      Skip infrastructure verification
#   --dry-run          Perform dry run without actual deployment
#   --rollback         Rollback to previous deployment
#   --version VERSION  Deploy specific version (default: auto-increment)
#
# Environment Variables:
#   VMI01_HOST         Target server (default: 46.250.243.123)
#   VMI01_USER         SSH user (default: root)
#   VMI01_SSH_KEY      SSH key path (default: ~/.ssh/id_rsa)
################################################################################

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PHASE3_DIR="${SCRIPT_DIR}"

# Default values
VMI01_HOST="${VMI01_HOST:-46.250.243.123}"
VMI01_USER="${VMI01_USER:-root}"
VMI01_SSH_KEY="${VMI01_SSH_KEY:-${HOME}/.ssh/id_rsa}"
DEPLOYMENT_DIR="/opt/mcp"
BACKUP_DIR="/opt/mcp/backups"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Flags
SKIP_TESTS=false
SKIP_BUILD=false
SKIP_VERIFY=false
DRY_RUN=false
DO_ROLLBACK=false
DEPLOY_VERSION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-verify)
            SKIP_VERIFY=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rollback)
            DO_ROLLBACK=true
            shift
            ;;
        --version)
            DEPLOY_VERSION="$2"
            shift 2
            ;;
        -h|--help)
            grep '^#' "$0" | grep -v '#!/bin/bash' | sed 's/^# //'
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_step() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$*${NC}"
    echo -e "${CYAN}========================================${NC}"
}

get_version() {
    if [ -n "$DEPLOY_VERSION" ]; then
        echo "$DEPLOY_VERSION"
    elif [ -f "${PROJECT_ROOT}/VERSION" ]; then
        cat "${PROJECT_ROOT}/VERSION"
    else
        echo "0.2.0"
    fi
}

increment_version() {
    local version=$1
    local major=$(echo "$version" | cut -d. -f1)
    local minor=$(echo "$version" | cut -d. -f2)
    local patch=$(echo "$version" | cut -d. -f3)
    patch=$((patch + 1))
    echo "${major}.${minor}.${patch}"
}

check_ssh_connection() {
    log_info "Testing SSH connection to ${VMI01_HOST}..."
    if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -i "${VMI01_SSH_KEY}" \
         "${VMI01_USER}@${VMI01_HOST}" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        log_error "Cannot connect to ${VMI01_HOST} via SSH"
        log_error "Please check: SSH key (${VMI01_SSH_KEY}), network, and server status"
        exit 1
    fi
    log_success "SSH connection verified"
}

check_dependencies() {
    log_info "Checking local dependencies..."
    local missing_deps=()

    command -v node >/dev/null 2>&1 || missing_deps+=("node")
    command -v npm >/dev/null 2>&1 || missing_deps+=("npm")
    command -v tar >/dev/null 2>&1 || missing_deps+=("tar")
    command -v ssh >/dev/null 2>&1 || missing_deps+=("ssh")
    command -v scp >/dev/null 2>&1 || missing_deps+=("scp")

    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        exit 1
    fi

    log_success "All local dependencies satisfied"
}

################################################################################
# Main Deployment Flow
################################################################################

main() {
    log_step "MCP ECOSYSTEM DEPLOYMENT - PHASE 3"

    echo "Target Server: ${VMI01_HOST}"
    echo "SSH User: ${VMI01_USER}"
    echo "Project Root: ${PROJECT_ROOT}"
    echo ""

    # Handle rollback
    if [ "$DO_ROLLBACK" = true ]; then
        log_step "ROLLBACK MODE"
        "${PHASE3_DIR}/rollback-mcp.sh"
        exit $?
    fi

    # Pre-flight checks
    log_step "STEP 1: PRE-FLIGHT CHECKS"
    check_dependencies
    check_ssh_connection

    # Verify infrastructure
    if [ "$SKIP_VERIFY" = false ]; then
        log_step "STEP 2: VERIFY INFRASTRUCTURE"
        if ! "${PHASE3_DIR}/verify-infrastructure.sh"; then
            log_error "Infrastructure verification failed"
            exit 1
        fi
    else
        log_warning "Skipping infrastructure verification (--skip-verify)"
    fi

    # Determine version
    CURRENT_VERSION=$(get_version)
    if [ -z "$DEPLOY_VERSION" ]; then
        NEW_VERSION=$(increment_version "$CURRENT_VERSION")
    else
        NEW_VERSION="$DEPLOY_VERSION"
    fi

    log_info "Current version: ${CURRENT_VERSION}"
    log_info "Deploying version: ${NEW_VERSION}"

    if [ "$DRY_RUN" = false ]; then
        read -p "Continue with deployment of version ${NEW_VERSION}? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Deployment cancelled by user"
            exit 0
        fi
    fi

    # Build MCP components
    if [ "$SKIP_BUILD" = false ]; then
        log_step "STEP 3: BUILD MCP COMPONENTS"
        if ! "${PHASE3_DIR}/build-mcp.sh" "$NEW_VERSION"; then
            log_error "Build failed"
            exit 1
        fi
    else
        log_warning "Skipping build step (--skip-build)"
    fi

    # Run tests
    if [ "$SKIP_TESTS" = false ]; then
        log_step "STEP 4: RUN TEST SUITES"
        if ! "${PHASE3_DIR}/test-mcp.sh"; then
            log_error "Tests failed"
            log_warning "Use --skip-tests to bypass test failures (not recommended for production)"
            exit 1
        fi
    else
        log_warning "Skipping tests (--skip-tests)"
    fi

    # Package for deployment
    log_step "STEP 5: CREATE DEPLOYMENT PACKAGES"
    if ! "${PHASE3_DIR}/package-mcp.sh" "$NEW_VERSION"; then
        log_error "Packaging failed"
        exit 1
    fi

    if [ "$DRY_RUN" = true ]; then
        log_warning "DRY RUN MODE - Stopping before upload"
        log_info "Build artifacts ready for deployment in: ${PROJECT_ROOT}/dist/${NEW_VERSION}"
        exit 0
    fi

    # Upload to VMI01
    log_step "STEP 6: UPLOAD TO VMI01"
    if ! "${PHASE3_DIR}/upload-mcp.sh" "$NEW_VERSION"; then
        log_error "Upload failed"
        exit 1
    fi

    # Install on VMI01
    log_step "STEP 7: INSTALL ON VMI01"
    if ! ssh -o StrictHostKeyChecking=no -i "${VMI01_SSH_KEY}" \
         "${VMI01_USER}@${VMI01_HOST}" \
         "bash -s" < "${PHASE3_DIR}/install-mcp.sh" "$NEW_VERSION"; then
        log_error "Installation failed"
        log_warning "Rolling back..."
        "${PHASE3_DIR}/rollback-mcp.sh"
        exit 1
    fi

    # Health checks
    log_step "STEP 8: HEALTH CHECKS"
    sleep 10  # Give services time to start

    if ! "${PHASE3_DIR}/health-check-mcp.sh"; then
        log_error "Health checks failed"
        log_warning "Services may not be running correctly"
        log_warning "Check logs: ssh ${VMI01_USER}@${VMI01_HOST} 'pm2 logs'"
        exit 1
    fi

    # Update VERSION file
    echo "$NEW_VERSION" > "${PROJECT_ROOT}/VERSION"

    # Success
    log_step "DEPLOYMENT COMPLETE"
    log_success "MCP Ecosystem v${NEW_VERSION} deployed successfully to ${VMI01_HOST}"
    echo ""
    echo -e "${CYAN}Access Points:${NC}"
    echo "  MCP Orchestrator: http://${VMI01_HOST}:9090/health"
    echo "  Grafana:          http://${VMI01_HOST}:3000"
    echo "  Prometheus:       http://${VMI01_HOST}:9091"
    echo "  Jaeger:           http://${VMI01_HOST}:16686"
    echo ""
    echo -e "${CYAN}Quick Commands:${NC}"
    echo "  View logs:    ssh ${VMI01_USER}@${VMI01_HOST} 'pm2 logs'"
    echo "  Check status: ssh ${VMI01_USER}@${VMI01_HOST} 'pm2 status'"
    echo "  Restart all:  ssh ${VMI01_USER}@${VMI01_HOST} 'pm2 restart all'"
    echo "  Rollback:     ./deploy-mcp.sh --rollback"
    echo ""

    # Save deployment metadata
    cat > "${PROJECT_ROOT}/dist/${NEW_VERSION}/DEPLOYMENT.json" << EOF
{
  "version": "${NEW_VERSION}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "target": "${VMI01_HOST}",
  "user": "${VMI01_USER}",
  "components": {
    "itjsst-mcp": "deployed",
    "mcp-orchestrator": "deployed",
    "perplexity-mcp": "deployed"
  },
  "previous_version": "${CURRENT_VERSION}"
}
EOF

    log_info "Deployment metadata saved to dist/${NEW_VERSION}/DEPLOYMENT.json"
}

# Trap errors
trap 'log_error "Deployment failed at line $LINENO"' ERR

# Run main
main "$@"
