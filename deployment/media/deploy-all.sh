#!/bin/bash

# VMI02D Complete Media Stack Deployment
# One-command deployment orchestrator
# Version: 1.0.0
# Date: November 8, 2025

set -euo pipefail

# Configuration
REMOTE_HOST="${1:-46.250.241.70}"
REMOTE_USER="${2:-root}"
SSH_KEY="${3:-ssh-keys/vmi02-acdev-vmi02-id_ed25519}"
CF_EMAIL="${CF_EMAIL:-}"
CF_API_KEY="${CF_API_KEY:-}"
CF_ZONE_ID="${CF_ZONE_ID:-}"

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Functions
log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
info() { echo -e "${BLUE}[INFO]${NC} $1"; }
section() { echo -e "\n${CYAN}=== $1 ===${NC}\n"; }

# Banner
display_banner() {
    clear
    echo -e "${CYAN}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║           VMI02D MEDIA STACK DEPLOYMENT v2.0              ║"
    echo "║                                                            ║"
    echo "║  Nextcloud + Plex + H265 Transcoding Pipeline             ║"
    echo "║  data.acdev.host | plex.acdev.host                        ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
}

# Check prerequisites
check_prerequisites() {
    section "Checking Prerequisites"

    # Check SSH key
    if [ ! -f "$SSH_KEY" ]; then
        error "SSH key not found: $SSH_KEY"
        echo "Please ensure you have the correct SSH key."
        exit 1
    fi
    log "✓ SSH key found: $SSH_KEY"

    # Check deployment scripts
    local scripts=("deploy-media-stack.sh" "configure-cloudflare-dns.sh" "test-media-stack.sh")
    for script in "${scripts[@]}"; do
        if [ ! -f "$SCRIPT_DIR/$script" ]; then
            error "Required script not found: $script"
            exit 1
        fi
    done
    log "✓ All deployment scripts found"

    # Check CloudFlare credentials if DNS configuration is requested
    if [ -n "$CF_EMAIL" ] && [ -n "$CF_API_KEY" ] && [ -n "$CF_ZONE_ID" ]; then
        log "✓ CloudFlare credentials configured"
        CONFIGURE_DNS=true
    else
        warning "CloudFlare credentials not set. DNS configuration will be skipped."
        echo "To enable DNS configuration, set:"
        echo "  export CF_EMAIL='your-email@example.com'"
        echo "  export CF_API_KEY='your-api-key'"
        echo "  export CF_ZONE_ID='your-zone-id'"
        CONFIGURE_DNS=false
    fi
}

# Test SSH connectivity
test_connectivity() {
    section "Testing Connectivity"

    info "Testing network connectivity to $REMOTE_HOST..."
    if ping -c 2 -W 2 "$REMOTE_HOST" >/dev/null 2>&1; then
        log "✓ Host is reachable via ICMP"
    else
        warning "Host not responding to ping (may be normal)"
    fi

    info "Testing SSH connectivity..."
    if ssh -i "$SSH_KEY" -o ConnectTimeout=10 -o BatchMode=yes \
        "$REMOTE_USER@$REMOTE_HOST" "echo 'SSH connection successful'" 2>/dev/null; then
        log "✓ SSH connection successful"
    else
        error "Cannot establish SSH connection to $REMOTE_USER@$REMOTE_HOST"
        echo ""
        echo "Troubleshooting steps:"
        echo "1. Check if the server is running: ping $REMOTE_HOST"
        echo "2. Verify SSH service: nc -zv $REMOTE_HOST 22"
        echo "3. Check firewall/fail2ban: Your IP might be blocked"
        echo "4. Try alternative access: SSH via VMI01 or VMI03 as jump host"
        echo ""
        echo "Alternative access methods:"
        echo "  # Via VMI01"
        echo "  ssh -i ssh-keys/vmi01-acdev-vmi01-id_ed25519 root@46.250.243.123"
        echo "  ssh root@10.0.0.2  # From VMI01"
        echo ""
        exit 1
    fi
}

# Upload scripts to server
upload_scripts() {
    section "Uploading Deployment Scripts"

    info "Creating remote deployment directory..."
    ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "mkdir -p /opt/media-deployment"

    info "Uploading scripts..."
    local scripts=("deploy-media-stack.sh" "test-media-stack.sh")
    for script in "${scripts[@]}"; do
        if scp -i "$SSH_KEY" "$SCRIPT_DIR/$script" \
            "$REMOTE_USER@$REMOTE_HOST:/opt/media-deployment/" >/dev/null 2>&1; then
            log "✓ Uploaded: $script"
        else
            error "Failed to upload: $script"
            exit 1
        fi
    done

    # Make scripts executable
    ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
        "chmod +x /opt/media-deployment/*.sh"
    log "✓ Scripts are executable"
}

# Run deployment
run_deployment() {
    section "Running Media Stack Deployment"

    info "This will install:"
    echo "  • Docker and Docker Compose"
    echo "  • Nextcloud with PostgreSQL and Redis"
    echo "  • Plex Media Server"
    echo "  • FFMPEG with H265 support"
    echo "  • Video processing pipeline"
    echo "  • Nginx reverse proxy"
    echo "  • SOC monitoring integration"
    echo ""

    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        warning "Deployment cancelled"
        exit 0
    fi

    info "Starting deployment (this may take 10-15 minutes)..."

    # Run deployment script
    if ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
        "cd /opt/media-deployment && ./deploy-media-stack.sh" 2>&1 | tee deployment.log; then
        log "✓ Media stack deployment completed"
    else
        error "Deployment failed. Check deployment.log for details"
        exit 1
    fi
}

# Configure CloudFlare DNS
configure_dns() {
    if [ "$CONFIGURE_DNS" != "true" ]; then
        warning "Skipping DNS configuration (credentials not provided)"
        return
    fi

    section "Configuring CloudFlare DNS"

    info "Uploading DNS configuration script..."
    scp -i "$SSH_KEY" "$SCRIPT_DIR/configure-cloudflare-dns.sh" \
        "$REMOTE_USER@$REMOTE_HOST:/opt/media-deployment/" >/dev/null 2>&1

    info "Configuring DNS records..."
    ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
        "cd /opt/media-deployment && \
         CF_EMAIL='$CF_EMAIL' CF_API_KEY='$CF_API_KEY' CF_ZONE_ID='$CF_ZONE_ID' \
         ./configure-cloudflare-dns.sh" 2>&1 | tee dns-config.log

    log "✓ DNS configuration completed"
}

# Run validation tests
run_tests() {
    section "Running Validation Tests"

    info "Running comprehensive tests..."

    if ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
        "cd /opt/media-deployment && ./test-media-stack.sh --quick" 2>&1 | tee test-results.log; then
        log "✓ All tests passed"
    else
        warning "Some tests failed. Review test-results.log for details"
    fi
}

# Get service information
get_service_info() {
    section "Service Information"

    info "Retrieving service details..."

    ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" bash <<'EOF'
    echo ""
    echo "NEXTCLOUD:"
    echo "  URL: https://data.acdev.host"
    echo "  Admin: admin / AdminPass2025!"
    echo "  Drop Folder: /Videos/DropFolder"

    if docker ps | grep -q nextcloud; then
        echo "  Status: Running"
    else
        echo "  Status: Not running"
    fi

    echo ""
    echo "PLEX MEDIA SERVER:"
    echo "  URL: https://plex.acdev.host"

    PLEX_PORT=$(ss -tlnp | grep Plex | grep -oP ':\K[0-9]{5}' | head -1)
    if [ -n "$PLEX_PORT" ]; then
        echo "  Direct Port: $PLEX_PORT"
        echo "  Status: Running"
    else
        echo "  Status: Not running"
    fi

    echo ""
    echo "VIDEO PROCESSING:"
    if systemctl is-active video-watcher >/dev/null 2>&1; then
        echo "  Watcher: Active"
    else
        echo "  Watcher: Inactive"
    fi

    echo "  Queue: $(ls -1 /mnt/transcode/queue 2>/dev/null | wc -l) videos pending"
    echo "  Processed: $(ls -1 /mnt/plex/movies 2>/dev/null | wc -l) videos in library"

    echo ""
    echo "SYSTEM RESOURCES:"
    echo "  CPU Load: $(uptime | awk '{print $10}')"
    echo "  Memory: $(free -h | grep Mem | awk '{print $3 "/" $2}')"
    echo "  Disk: $(df -h /mnt | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
EOF
}

# Display summary
display_summary() {
    section "Deployment Complete!"

    echo -e "${GREEN}✓ Media stack successfully deployed on $REMOTE_HOST${NC}"
    echo ""
    echo "Access URLs:"
    echo "  • Nextcloud: https://data.acdev.host"
    echo "  • Plex: https://plex.acdev.host"
    echo ""
    echo "Default Credentials (CHANGE THESE!):"
    echo "  • Nextcloud: admin / AdminPass2025!"
    echo ""
    echo "Next Steps:"
    echo "  1. Change default passwords"
    echo "  2. Complete Plex initial setup"
    echo "  3. Test video upload to Nextcloud drop folder"
    echo "  4. Monitor transcoding: tail -f /var/log/transcode.log"
    echo ""
    echo "Management Commands:"
    echo "  • SSH to server: ssh -i $SSH_KEY $REMOTE_USER@$REMOTE_HOST"
    echo "  • View logs: ssh ... 'tail -f /var/log/transcode.log'"
    echo "  • Check status: ssh ... 'systemctl status video-watcher'"
    echo "  • Run tests: ssh ... 'cd /opt/media-deployment && ./test-media-stack.sh'"
    echo ""
    echo "Logs saved to:"
    echo "  • deployment.log"
    if [ "$CONFIGURE_DNS" == "true" ]; then
        echo "  • dns-config.log"
    fi
    echo "  • test-results.log"
    echo ""
}

# Cleanup on exit
cleanup() {
    if [ -n "${SSH_AGENT_PID:-}" ]; then
        kill "$SSH_AGENT_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT

# Main execution
main() {
    display_banner

    # Check prerequisites
    check_prerequisites

    # Test connectivity
    test_connectivity

    # Upload scripts
    upload_scripts

    # Run deployment
    run_deployment

    # Configure DNS
    configure_dns

    # Run tests
    run_tests

    # Get service info
    get_service_info

    # Display summary
    display_summary

    log "Deployment completed successfully!"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            echo "Usage: $0 [REMOTE_HOST] [REMOTE_USER] [SSH_KEY]"
            echo ""
            echo "Deploy complete media stack to VMI02D"
            echo ""
            echo "Arguments:"
            echo "  REMOTE_HOST   Target server IP (default: 46.250.241.70)"
            echo "  REMOTE_USER   SSH user (default: root)"
            echo "  SSH_KEY       Path to SSH key (default: ssh-keys/vmi02-acdev-vmi02-id_ed25519)"
            echo ""
            echo "Environment variables:"
            echo "  CF_EMAIL      CloudFlare email for DNS configuration"
            echo "  CF_API_KEY    CloudFlare API key"
            echo "  CF_ZONE_ID    CloudFlare zone ID"
            echo ""
            echo "Examples:"
            echo "  # Deploy with defaults"
            echo "  ./deploy-all.sh"
            echo ""
            echo "  # Deploy with custom host"
            echo "  ./deploy-all.sh 192.168.1.100"
            echo ""
            echo "  # Deploy with DNS configuration"
            echo "  CF_EMAIL='user@example.com' CF_API_KEY='key' CF_ZONE_ID='zone' ./deploy-all.sh"
            exit 0
            ;;
        *)
            break
            ;;
    esac
done

# Run main function
main "$@"