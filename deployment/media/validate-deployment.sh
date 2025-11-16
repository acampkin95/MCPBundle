#!/bin/bash
#==============================================================================
# Media Server Deployment Validation Script
#==============================================================================
# Purpose: Validate all media server components on VMI02D
# Target: VMI02D (46.250.241.70)
# Version: 1.0.0
# Date: 2025-11-08
#==============================================================================

set -euo pipefail

#==============================================================================
# COLORS AND FORMATTING
#==============================================================================
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'
readonly BOLD='\033[1m'

#==============================================================================
# CONFIGURATION
#==============================================================================
readonly TARGET_HOST="46.250.241.70"
readonly DB_HOST="46.250.243.123"

#==============================================================================
# LOGGING FUNCTIONS
#==============================================================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $*"
}

log_error() {
    echo -e "${RED}[✗]${NC} $*"
}

log_section() {
    echo -e "\n${CYAN}${BOLD}=== $* ===${NC}\n"
}

#==============================================================================
# VALIDATION FUNCTIONS
#==============================================================================
check_ssh_access() {
    log_section "Checking SSH Access"

    if ssh -o ConnectTimeout=5 root@${TARGET_HOST} 'exit' 2>/dev/null; then
        log_success "SSH access to ${TARGET_HOST} successful"
        return 0
    else
        log_error "Cannot connect to ${TARGET_HOST} via SSH"
        return 1
    fi
}

validate_nextcloud() {
    log_section "Validating NextCloud"

    local checks_passed=0
    local checks_total=6

    # Check Nginx service
    if ssh root@${TARGET_HOST} 'systemctl is-active --quiet nginx' 2>/dev/null; then
        log_success "Nginx service is running"
        ((checks_passed++))
    else
        log_error "Nginx service is not running"
    fi

    # Check PHP-FPM service
    if ssh root@${TARGET_HOST} 'systemctl is-active --quiet php8.3-fpm' 2>/dev/null; then
        log_success "PHP-FPM service is running"
        ((checks_passed++))
    else
        log_error "PHP-FPM service is not running"
    fi

    # Check NextCloud directory
    if ssh root@${TARGET_HOST} 'test -d /var/www/nextcloud' 2>/dev/null; then
        log_success "NextCloud directory exists"
        ((checks_passed++))
    else
        log_error "NextCloud directory not found"
    fi

    # Check data directory
    if ssh root@${TARGET_HOST} 'test -d /nextcloud' 2>/dev/null; then
        log_success "Data directory exists"
        ((checks_passed++))
    else
        log_error "Data directory not found"
    fi

    # Check plex-ingest directory
    if ssh root@${TARGET_HOST} 'test -d /nextcloud/plex-ingest' 2>/dev/null; then
        log_success "Plex ingest directory exists"
        ((checks_passed++))
    else
        log_error "Plex ingest directory not found"
    fi

    # Check web interface
    if ssh root@${TARGET_HOST} 'curl -ks https://localhost/ | grep -q nextcloud' 2>/dev/null; then
        log_success "Web interface is responding"
        ((checks_passed++))
    else
        log_warning "Web interface may not be responding correctly"
    fi

    echo -e "\nNextCloud: ${checks_passed}/${checks_total} checks passed"
    return $((checks_total - checks_passed))
}

validate_plex() {
    log_section "Validating Plex Media Server"

    local checks_passed=0
    local checks_total=5

    # Check service
    if ssh root@${TARGET_HOST} 'systemctl is-active --quiet plexmediaserver' 2>/dev/null; then
        log_success "Plex service is running"
        ((checks_passed++))
    else
        log_error "Plex service is not running"
    fi

    # Check movies directory
    if ssh root@${TARGET_HOST} 'test -d /opt/plex/movies' 2>/dev/null; then
        log_success "Movies directory exists"
        ((checks_passed++))
    else
        log_error "Movies directory not found"
    fi

    # Check transcode directory
    if ssh root@${TARGET_HOST} 'test -d /opt/plex/transcode' 2>/dev/null; then
        log_success "Transcode directory exists"
        ((checks_passed++))
    else
        log_error "Transcode directory not found"
    fi

    # Check web interface
    if ssh root@${TARGET_HOST} 'curl -sf http://localhost:32400/web/index.html' &>/dev/null; then
        log_success "Web interface is responding"
        ((checks_passed++))
    else
        log_warning "Web interface may not be responding"
    fi

    # Check health check timer
    if ssh root@${TARGET_HOST} 'systemctl is-active --quiet plex-health-check.timer' 2>/dev/null; then
        log_success "Health check timer is active"
        ((checks_passed++))
    else
        log_warning "Health check timer is not active"
    fi

    echo -e "\nPlex: ${checks_passed}/${checks_total} checks passed"
    return $((checks_total - checks_passed))
}

validate_transcoding() {
    log_section "Validating Transcoding Service"

    local checks_passed=0
    local checks_total=6

    # Check service
    if ssh root@${TARGET_HOST} 'systemctl is-active --quiet transcoding-daemon' 2>/dev/null; then
        log_success "Transcoding daemon is running"
        ((checks_passed++))
    else
        log_error "Transcoding daemon is not running"
    fi

    # Check FFmpeg
    if ssh root@${TARGET_HOST} 'command -v ffmpeg' &>/dev/null; then
        log_success "FFmpeg is installed"
        ((checks_passed++))
    else
        log_error "FFmpeg is not installed"
    fi

    # Check Python dependencies
    if ssh root@${TARGET_HOST} 'python3 -c "import watchdog, psycopg2, redis"' 2>/dev/null; then
        log_success "Python dependencies are installed"
        ((checks_passed++))
    else
        log_error "Python dependencies are missing"
    fi

    # Check daemon script
    if ssh root@${TARGET_HOST} 'test -x /usr/local/bin/transcoding-daemon.py' 2>/dev/null; then
        log_success "Daemon script exists and is executable"
        ((checks_passed++))
    else
        log_error "Daemon script not found or not executable"
    fi

    # Check management scripts
    if ssh root@${TARGET_HOST} 'test -x /usr/local/bin/transcoding-status.sh' 2>/dev/null; then
        log_success "Management scripts exist"
        ((checks_passed++))
    else
        log_error "Management scripts not found"
    fi

    # Check log directory
    if ssh root@${TARGET_HOST} 'test -d /var/log/transcoding' 2>/dev/null; then
        log_success "Log directory exists"
        ((checks_passed++))
    else
        log_error "Log directory not found"
    fi

    echo -e "\nTranscoding: ${checks_passed}/${checks_total} checks passed"
    return $((checks_total - checks_passed))
}

validate_database() {
    log_section "Validating Database Connectivity"

    local checks_passed=0
    local checks_total=2

    # Check PostgreSQL connectivity from VMI02D
    if ssh root@${TARGET_HOST} 'PGPASSWORD="" psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c "SELECT 1"' &>/dev/null; then
        log_success "Database connection to VMI01 successful"
        ((checks_passed++))
    else
        log_error "Cannot connect to database on VMI01"
    fi

    # Check transcoding_jobs table
    if ssh root@${TARGET_HOST} 'PGPASSWORD="" psql -h 46.250.243.123 -U mcp_admin -d mcp_ecosystem -c "SELECT COUNT(*) FROM transcoding_jobs"' &>/dev/null; then
        log_success "Transcoding jobs table exists"
        ((checks_passed++))
    else
        log_warning "Transcoding jobs table may not exist yet (will be created on first use)"
    fi

    echo -e "\nDatabase: ${checks_passed}/${checks_total} checks passed"
    return $((checks_total - checks_passed))
}

validate_network() {
    log_section "Validating Network Configuration"

    local checks_passed=0
    local checks_total=4

    # Check port 80 (HTTP)
    if ssh root@${TARGET_HOST} 'ss -tuln | grep -q ":80 "' 2>/dev/null; then
        log_success "Port 80 (HTTP) is listening"
        ((checks_passed++))
    else
        log_warning "Port 80 (HTTP) not listening"
    fi

    # Check port 443 (HTTPS)
    if ssh root@${TARGET_HOST} 'ss -tuln | grep -q ":443 "' 2>/dev/null; then
        log_success "Port 443 (HTTPS) is listening"
        ((checks_passed++))
    else
        log_warning "Port 443 (HTTPS) not listening"
    fi

    # Check port 32400 (Plex)
    if ssh root@${TARGET_HOST} 'ss -tuln | grep -q ":32400 "' 2>/dev/null; then
        log_success "Port 32400 (Plex) is listening"
        ((checks_passed++))
    else
        log_error "Port 32400 (Plex) not listening"
    fi

    # Check Redis
    if ssh root@${TARGET_HOST} 'redis-cli ping' &>/dev/null; then
        log_success "Redis is responding"
        ((checks_passed++))
    else
        log_warning "Redis may not be responding"
    fi

    echo -e "\nNetwork: ${checks_passed}/${checks_total} checks passed"
    return $((checks_total - checks_passed))
}

check_disk_space() {
    log_section "Checking Disk Space"

    echo -e "${BOLD}Disk Usage:${NC}"
    ssh root@${TARGET_HOST} 'df -h | grep -E "Filesystem|/$|/nextcloud|/opt/plex"' || true

    echo -e "\n${BOLD}Directory Sizes:${NC}"
    ssh root@${TARGET_HOST} 'du -sh /var/www/nextcloud /nextcloud /opt/plex 2>/dev/null' || true
}

show_service_status() {
    log_section "Service Status Summary"

    echo -e "${BOLD}NextCloud Services:${NC}"
    ssh root@${TARGET_HOST} 'systemctl status nginx --no-pager --lines=0' 2>/dev/null || log_error "Nginx status unavailable"
    ssh root@${TARGET_HOST} 'systemctl status php8.3-fpm --no-pager --lines=0' 2>/dev/null || log_error "PHP-FPM status unavailable"

    echo -e "\n${BOLD}Plex Service:${NC}"
    ssh root@${TARGET_HOST} 'systemctl status plexmediaserver --no-pager --lines=0' 2>/dev/null || log_error "Plex status unavailable"

    echo -e "\n${BOLD}Transcoding Service:${NC}"
    ssh root@${TARGET_HOST} 'systemctl status transcoding-daemon --no-pager --lines=0' 2>/dev/null || log_error "Transcoding status unavailable"
}

show_credentials() {
    log_section "Retrieving Credentials"

    echo -e "${BOLD}Configuration Files:${NC}"

    if ssh root@${TARGET_HOST} 'test -f /root/nextcloud-db-credentials.txt' 2>/dev/null; then
        log_success "NextCloud credentials available"
        echo -e "\n${CYAN}NextCloud Credentials:${NC}"
        ssh root@${TARGET_HOST} 'cat /root/nextcloud-db-credentials.txt' 2>/dev/null || true
    else
        log_warning "NextCloud credentials file not found"
    fi

    if ssh root@${TARGET_HOST} 'test -f /root/plex-deployment-info.txt' 2>/dev/null; then
        log_success "Plex configuration available"
    else
        log_warning "Plex configuration file not found"
    fi

    if ssh root@${TARGET_HOST} 'test -f /root/transcoding-deployment-info.txt' 2>/dev/null; then
        log_success "Transcoding configuration available"
    else
        log_warning "Transcoding configuration file not found"
    fi
}

show_quick_access() {
    log_section "Quick Access Information"

    cat <<EOF
${BOLD}Web Interfaces:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NextCloud:  https://${TARGET_HOST}/
Plex:       http://${TARGET_HOST}:32400/web

${BOLD}SSH Commands:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status:     ssh root@${TARGET_HOST} '/usr/local/bin/transcoding-status.sh'
Logs:       ssh root@${TARGET_HOST} '/usr/local/bin/transcoding-logs.sh -f'
Upload:     scp video.mp4 root@${TARGET_HOST}:/nextcloud/plex-ingest/

${BOLD}Management:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Restart All: ssh root@${TARGET_HOST} 'systemctl restart nginx php8.3-fpm plexmediaserver transcoding-daemon'
View Creds:  ssh root@${TARGET_HOST} 'cat /root/*-credentials.txt /root/*-info.txt'

EOF
}

print_summary() {
    log_section "Validation Summary"

    local total_errors=$1

    if [[ $total_errors -eq 0 ]]; then
        cat <<EOF
${GREEN}${BOLD}✓ ALL VALIDATION CHECKS PASSED!${NC}

Your media server deployment on VMI02D is fully operational.

${BOLD}Next Steps:${NC}
1. Access NextCloud: https://${TARGET_HOST}/
2. Complete NextCloud setup wizard
3. Access Plex: http://${TARGET_HOST}:32400/web
4. Sign in to Plex and add Movies library
5. Test transcoding by uploading a video
6. Monitor logs: ssh root@${TARGET_HOST} '/usr/local/bin/transcoding-logs.sh -f'

${GREEN}Deployment Status: SUCCESSFUL${NC}
EOF
    else
        cat <<EOF
${YELLOW}${BOLD}⚠ VALIDATION COMPLETED WITH WARNINGS${NC}

Some checks did not pass. Review the errors above.

Total issues found: ${total_errors}

${BOLD}Common Solutions:${NC}
- Services not running: systemctl restart <service>
- Missing directories: Re-run deployment script
- Database connection: Check pg_hba.conf on VMI01
- Network issues: Check firewall rules

${YELLOW}Deployment Status: NEEDS ATTENTION${NC}
EOF
    fi
}

#==============================================================================
# MAIN EXECUTION
#==============================================================================
main() {
    echo -e "${CYAN}${BOLD}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║   Media Server Deployment Validation for VMI02D          ║
╚═══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"

    # Check SSH access first
    if ! check_ssh_access; then
        log_error "Cannot proceed without SSH access"
        exit 1
    fi

    # Run all validations
    local total_errors=0

    validate_nextcloud || total_errors=$((total_errors + $?))
    validate_plex || total_errors=$((total_errors + $?))
    validate_transcoding || total_errors=$((total_errors + $?))
    validate_database || total_errors=$((total_errors + $?))
    validate_network || total_errors=$((total_errors + $?))

    # Additional checks
    check_disk_space
    show_service_status
    show_credentials
    show_quick_access

    # Print summary
    print_summary "$total_errors"

    # Exit with appropriate code
    if [[ $total_errors -eq 0 ]]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"
