#!/bin/bash
#==============================================================================
# Plex Media Server Production Deployment Script for VMI02D
#==============================================================================
# Purpose: Deploy Plex Media Server with hardware transcoding and library setup
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
readonly NC='\033[0m' # No Color
readonly BOLD='\033[1m'

#==============================================================================
# CONFIGURATION
#==============================================================================
readonly SCRIPT_VERSION="1.0.0"
readonly PLEX_MEDIA_DIR="/opt/plex/movies"
readonly PLEX_TRANSCODE_DIR="/opt/plex/transcode"
readonly PLEX_CONFIG_DIR="/var/lib/plexmediaserver"
readonly PLEX_PORT="32400"
readonly PLEX_WEB_PORT="32400"

# Network Configuration
readonly ALLOWED_NETWORKS="46.250.241.0/24,46.250.243.0/24,154.26.158.0/24,10.0.50.0/24,10.0.51.0/24,10.0.52.0/24"

# Hardware Acceleration
readonly ENABLE_HARDWARE_ACCEL="true"

# Plex Claim Token (optional - for linking to account)
# Get from: https://www.plex.tv/claim/
readonly PLEX_CLAIM="${PLEX_CLAIM:-}"

#==============================================================================
# LOGGING FUNCTIONS
#==============================================================================
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
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

log_section() {
    echo -e "\n${CYAN}${BOLD}==>${NC} ${BOLD}$*${NC}\n"
}

#==============================================================================
# ERROR HANDLING
#==============================================================================
error_exit() {
    log_error "$1"
    exit 1
}

cleanup_on_error() {
    log_warning "Cleaning up after error..."
    # Add cleanup tasks if needed
}

trap cleanup_on_error ERR

#==============================================================================
# VALIDATION FUNCTIONS
#==============================================================================
check_root() {
    if [[ $EUID -ne 0 ]]; then
        error_exit "This script must be run as root"
    fi
}

check_os() {
    if [[ ! -f /etc/os-release ]]; then
        error_exit "Cannot detect OS version"
    fi

    . /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        log_warning "This script is designed for Ubuntu. Detected: $ID $VERSION_ID"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

check_network() {
    log_info "Checking network connectivity..."

    if ! ping -c 1 -W 5 8.8.8.8 &>/dev/null; then
        error_exit "No internet connectivity"
    fi

    log_success "Network connectivity verified"
}

check_disk_space() {
    log_info "Checking disk space..."

    local available_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')

    if [[ $available_gb -lt 100 ]]; then
        log_warning "Low disk space. Recommended: 500GB+, available: ${available_gb}GB"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        log_success "Disk space sufficient: ${available_gb}GB available"
    fi
}

check_hardware_accel() {
    log_info "Checking for hardware acceleration support..."

    # Check for Intel Quick Sync
    if [[ -d /dev/dri ]]; then
        log_success "Intel Quick Sync (DRI) devices found"
        ls -la /dev/dri/
        return 0
    fi

    # Check for NVIDIA GPU
    if command -v nvidia-smi &>/dev/null; then
        log_success "NVIDIA GPU detected"
        nvidia-smi --query-gpu=name --format=csv,noheader
        return 0
    fi

    # Check for AMD GPU
    if lspci | grep -i "VGA.*AMD" &>/dev/null; then
        log_info "AMD GPU detected"
        return 0
    fi

    log_warning "No hardware acceleration detected - will use software transcoding"
    return 1
}

#==============================================================================
# INSTALLATION FUNCTIONS
#==============================================================================
install_prerequisites() {
    log_section "Installing prerequisites..."

    # Update package lists
    log_info "Updating package lists..."
    apt-get update

    # Install required packages
    log_info "Installing required packages..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        curl \
        wget \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        vainfo \
        intel-media-va-driver-non-free \
        i965-va-driver \
        mesa-va-drivers

    log_success "Prerequisites installed"
}

add_plex_repository() {
    log_section "Adding Plex repository..."

    # Add Plex GPG key
    log_info "Adding Plex GPG key..."
    curl -fsSL https://downloads.plex.tv/plex-keys/PlexSign.key | gpg --dearmor -o /usr/share/keyrings/plex-archive-keyring.gpg

    # Add Plex repository
    log_info "Adding Plex repository..."
    echo "deb [signed-by=/usr/share/keyrings/plex-archive-keyring.gpg] https://downloads.plex.tv/repo/deb public main" \
        > /etc/apt/sources.list.d/plexmediaserver.list

    # Update package lists
    apt-get update

    log_success "Plex repository added"
}

install_plex() {
    log_section "Installing Plex Media Server..."

    # Install Plex
    log_info "Installing plexmediaserver package..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y plexmediaserver

    # Stop service for configuration
    systemctl stop plexmediaserver

    log_success "Plex Media Server installed"
}

create_directories() {
    log_section "Creating directory structure..."

    # Create media directories
    log_info "Creating media directories..."
    mkdir -p "$PLEX_MEDIA_DIR"
    mkdir -p "$PLEX_TRANSCODE_DIR"

    # Set ownership
    log_info "Setting ownership..."
    chown -R plex:plex "$PLEX_MEDIA_DIR"
    chown -R plex:plex "$PLEX_TRANSCODE_DIR"
    chown -R plex:plex "$PLEX_CONFIG_DIR"

    # Set permissions
    chmod 755 "$PLEX_MEDIA_DIR"
    chmod 755 "$PLEX_TRANSCODE_DIR"

    log_success "Directories created: $PLEX_MEDIA_DIR, $PLEX_TRANSCODE_DIR"
}

configure_hardware_acceleration() {
    log_section "Configuring hardware acceleration..."

    if [[ ! -d /dev/dri ]]; then
        log_warning "No DRI devices found - skipping hardware acceleration"
        return 0
    fi

    # Add plex user to render and video groups
    log_info "Adding plex user to video groups..."
    usermod -aG render plex || true
    usermod -aG video plex || true

    # Set permissions on DRI devices
    log_info "Setting DRI device permissions..."
    chmod -R 777 /dev/dri/

    # Create udev rule for persistent permissions
    cat > /etc/udev/rules.d/99-plex-dri.rules <<'EOF'
KERNEL=="renderD*", GROUP="render", MODE="0666"
KERNEL=="card*", GROUP="video", MODE="0666"
EOF

    # Reload udev rules
    udevadm control --reload-rules
    udevadm trigger

    # Verify hardware acceleration
    log_info "Testing hardware acceleration..."
    if sudo -u plex vainfo &>/dev/null; then
        log_success "Hardware acceleration configured successfully"
    else
        log_warning "Hardware acceleration may not be available"
    fi

    log_success "Hardware acceleration setup completed"
}

configure_plex() {
    log_section "Configuring Plex Media Server..."

    # Configure transcoder settings
    local preferences_file="${PLEX_CONFIG_DIR}/Library/Application Support/Plex Media Server/Preferences.xml"

    # Create preferences directory if it doesn't exist
    mkdir -p "$(dirname "$preferences_file")"
    chown -R plex:plex "$(dirname "$preferences_file")"

    # Set transcoder temporary directory
    log_info "Configuring transcoder temporary directory..."
    if [[ -f "$preferences_file" ]]; then
        # Update existing preferences
        sed -i "s|TranscoderTempDirectory=\"[^\"]*\"|TranscoderTempDirectory=\"${PLEX_TRANSCODE_DIR}\"|" "$preferences_file" || true
    else
        # Create new preferences file
        cat > "$preferences_file" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<Preferences TranscoderTempDirectory="${PLEX_TRANSCODE_DIR}" />
EOF
        chown plex:plex "$preferences_file"
    fi

    # Configure allowed networks
    log_info "Configuring allowed networks..."

    # Note: Network configuration is better done through the web UI after first login
    # We'll document this in the summary

    log_success "Plex configuration completed"
}

configure_systemd() {
    log_section "Configuring systemd service..."

    # Create systemd override directory
    mkdir -p /etc/systemd/system/plexmediaserver.service.d

    # Create override configuration
    cat > /etc/systemd/system/plexmediaserver.service.d/override.conf <<EOF
[Unit]
Description=Plex Media Server
After=network-online.target

[Service]
# Resource Limits
MemoryLimit=8G
CPUQuota=400%

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${PLEX_CONFIG_DIR}
ReadWritePaths=${PLEX_MEDIA_DIR}
ReadWritePaths=${PLEX_TRANSCODE_DIR}

# Hardware Acceleration
SupplementaryGroups=render video

# Restart Policy
Restart=always
RestartSec=10s

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    log_success "Systemd service configured"
}

create_health_check() {
    log_section "Creating health check script..."

    cat > /usr/local/bin/plex-health-check.sh <<'EOF'
#!/bin/bash
#==============================================================================
# Plex Media Server Health Check
#==============================================================================

set -euo pipefail

readonly PLEX_URL="http://localhost:32400"
readonly LOG_FILE="/var/log/plex-health-check.log"

check_plex() {
    if curl -sf "${PLEX_URL}/web/index.html" &>/dev/null; then
        echo "[$(date)] Plex is healthy" >> "$LOG_FILE"
        return 0
    else
        echo "[$(date)] Plex is unhealthy - attempting restart" >> "$LOG_FILE"
        systemctl restart plexmediaserver
        return 1
    fi
}

# Main execution
if ! check_plex; then
    sleep 30
    if check_plex; then
        echo "[$(date)] Plex recovered after restart" >> "$LOG_FILE"
    else
        echo "[$(date)] Plex failed to recover" >> "$LOG_FILE"
        exit 1
    fi
fi
EOF

    chmod +x /usr/local/bin/plex-health-check.sh

    # Create systemd timer for health checks
    cat > /etc/systemd/system/plex-health-check.service <<EOF
[Unit]
Description=Plex Health Check

[Service]
Type=oneshot
ExecStart=/usr/local/bin/plex-health-check.sh
EOF

    cat > /etc/systemd/system/plex-health-check.timer <<EOF
[Unit]
Description=Plex Health Check Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
Unit=plex-health-check.service

[Install]
WantedBy=timers.target
EOF

    # Enable and start timer
    systemctl daemon-reload
    systemctl enable plex-health-check.timer
    systemctl start plex-health-check.timer

    log_success "Health check configured"
}

configure_firewall() {
    log_section "Configuring firewall..."

    if command -v ufw &>/dev/null; then
        log_info "Configuring UFW firewall rules..."

        # Allow Plex from specific networks
        IFS=',' read -ra NETWORKS <<< "$ALLOWED_NETWORKS"
        for network in "${NETWORKS[@]}"; do
            ufw allow from "$network" to any port "$PLEX_PORT" comment "Plex from $network"
        done

        # Allow GDM (Plex discovery)
        ufw allow 32410/udp comment "Plex GDM 1"
        ufw allow 32412/udp comment "Plex GDM 2"
        ufw allow 32413/udp comment "Plex GDM 3"
        ufw allow 32414/udp comment "Plex GDM 4"

        log_success "Firewall rules configured"
    else
        log_warning "UFW not installed - skipping firewall configuration"
    fi
}

start_plex() {
    log_section "Starting Plex Media Server..."

    # Enable service
    systemctl enable plexmediaserver

    # Start service
    systemctl start plexmediaserver

    # Wait for Plex to start
    log_info "Waiting for Plex to start..."
    sleep 10

    # Check status
    if systemctl is-active --quiet plexmediaserver; then
        log_success "Plex Media Server is running"
    else
        log_error "Plex Media Server failed to start"
        journalctl -u plexmediaserver -n 50
        return 1
    fi
}

verify_installation() {
    log_section "Verifying installation..."

    local checks_passed=0
    local checks_total=6

    # Check 1: Service running
    if systemctl is-active --quiet plexmediaserver; then
        log_success "Plex service is running"
        ((checks_passed++))
    else
        log_error "Plex service is not running"
    fi

    # Check 2: Web interface responding
    if curl -sf http://localhost:${PLEX_PORT}/web/index.html &>/dev/null; then
        log_success "Web interface is responding"
        ((checks_passed++))
    else
        log_error "Web interface is not responding"
    fi

    # Check 3: Media directory exists
    if [[ -d "$PLEX_MEDIA_DIR" ]]; then
        log_success "Media directory exists"
        ((checks_passed++))
    else
        log_error "Media directory not found"
    fi

    # Check 4: Transcode directory exists
    if [[ -d "$PLEX_TRANSCODE_DIR" ]]; then
        log_success "Transcode directory exists"
        ((checks_passed++))
    else
        log_error "Transcode directory not found"
    fi

    # Check 5: Hardware acceleration available
    if sudo -u plex vainfo &>/dev/null; then
        log_success "Hardware acceleration available"
        ((checks_passed++))
    else
        log_warning "Hardware acceleration not available (software transcoding will be used)"
    fi

    # Check 6: Health check timer active
    if systemctl is-active --quiet plex-health-check.timer; then
        log_success "Health check timer is active"
        ((checks_passed++))
    else
        log_error "Health check timer is not active"
    fi

    echo
    log_info "Verification: ${checks_passed}/${checks_total} checks passed"

    if [[ $checks_passed -ge 4 ]]; then
        log_success "Essential verification checks passed!"
        return 0
    else
        log_warning "Some verification checks failed"
        return 1
    fi
}

create_library_setup_script() {
    log_section "Creating library setup helper script..."

    cat > /usr/local/bin/plex-add-movies-library.sh <<EOF
#!/bin/bash
#==============================================================================
# Plex Movies Library Setup Helper
#==============================================================================

cat <<'INSTRUCTIONS'
To add the Movies library through the web interface:

1. Access Plex Web: http://46.250.241.70:32400/web

2. Complete initial setup wizard:
   - Sign in with your Plex account
   - Name your server (e.g., "VMI02D Media Server")

3. Add Movies Library:
   - Click "+" to add library
   - Select "Movies" as library type
   - Click "Add Folders"
   - Enter path: ${PLEX_MEDIA_DIR}
   - Click "Add"

4. Configure Advanced Settings:
   - Enable "Scan my library automatically"
   - Enable "Run a partial scan when changes are detected"
   - Set "Minimum video bitrate": 1000 Kbps
   - Click "Add Library"

5. Configure Transcoding (Settings > Transcoder):
   - Transcoder temporary directory: ${PLEX_TRANSCODE_DIR}
   - Transcoder quality: Automatic
   - Enable hardware acceleration: Yes (if available)
   - Maximum simultaneous video transcode: 2

6. Configure Network (Settings > Network):
   - List of IP addresses allowed without auth: ${ALLOWED_NETWORKS}

7. Test library:
   - Add a test video to ${PLEX_MEDIA_DIR}
   - Click "Scan Library Files"
   - Verify video appears in library

INSTRUCTIONS
EOF

    chmod +x /usr/local/bin/plex-add-movies-library.sh

    log_success "Library setup helper created at /usr/local/bin/plex-add-movies-library.sh"
}

save_credentials() {
    log_section "Saving configuration information..."

    local creds_file="/root/plex-deployment-info.txt"

    cat > "$creds_file" <<EOF
Plex Media Server Deployment Information
=========================================
Date: $(date)
Server: VMI02D (46.250.241.70)

Access Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Web Interface:     http://46.250.241.70:${PLEX_PORT}/web
Internal Access:   http://localhost:${PLEX_PORT}/web

Directory Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Media Directory:   ${PLEX_MEDIA_DIR}
Transcode Dir:     ${PLEX_TRANSCODE_DIR}
Config Directory:  ${PLEX_CONFIG_DIR}

Service Information:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Service Name:      plexmediaserver
Log File:          /var/log/plex-health-check.log
Health Check:      /usr/local/bin/plex-health-check.sh

Allowed Networks:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${ALLOWED_NETWORKS}

Useful Commands:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Service Status:    systemctl status plexmediaserver
View Logs:         journalctl -u plexmediaserver -f
Restart Service:   systemctl restart plexmediaserver
Health Check:      /usr/local/bin/plex-health-check.sh
Setup Library:     /usr/local/bin/plex-add-movies-library.sh

Next Steps:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Access web interface: http://46.250.241.70:${PLEX_PORT}/web
2. Complete initial setup wizard
3. Add Movies library pointing to ${PLEX_MEDIA_DIR}
4. Enable hardware transcoding in Settings > Transcoder
5. Configure allowed networks in Settings > Network
6. Run /usr/local/bin/plex-add-movies-library.sh for instructions
EOF

    chmod 600 "$creds_file"

    log_success "Configuration saved to $creds_file"
}

print_summary() {
    log_section "Deployment Summary"

    cat <<EOF

${GREEN}Plex Media Server has been successfully deployed!${NC}

${BOLD}Access Information:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Web Interface:     http://46.250.241.70:${PLEX_PORT}/web
Status:            $(systemctl is-active plexmediaserver || echo "INACTIVE")

${BOLD}Directory Information:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Movies Library:    ${PLEX_MEDIA_DIR}
Transcoding:       ${PLEX_TRANSCODE_DIR}
Configuration:     ${PLEX_CONFIG_DIR}

${BOLD}Hardware Acceleration:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status:            $(sudo -u plex vainfo &>/dev/null && echo "ENABLED" || echo "SOFTWARE ONLY")

${BOLD}Next Steps:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Access web interface and complete initial setup
2. Sign in with your Plex account
3. Add Movies library: ${PLEX_MEDIA_DIR}
4. Enable hardware transcoding in Settings > Transcoder
5. Configure network settings for allowed clients
6. Run deploy-transcoding.sh for automated transcoding
7. Test by uploading a video to /nextcloud/plex-ingest

${BOLD}Helper Scripts:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Library Setup:     /usr/local/bin/plex-add-movies-library.sh
Health Check:      /usr/local/bin/plex-health-check.sh

${BOLD}Service Commands:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status:            systemctl status plexmediaserver
Restart:           systemctl restart plexmediaserver
Logs:              journalctl -u plexmediaserver -f

${BOLD}Configuration File:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Location:          /root/plex-deployment-info.txt

EOF
}

#==============================================================================
# MAIN EXECUTION
#==============================================================================
main() {
    log_section "Plex Media Server Deployment v${SCRIPT_VERSION}"

    # Pre-flight checks
    check_root
    check_os
    check_network
    check_disk_space
    check_hardware_accel || true

    # Installation steps
    install_prerequisites
    add_plex_repository
    install_plex
    create_directories
    configure_hardware_acceleration
    configure_plex
    configure_systemd
    create_health_check
    configure_firewall
    start_plex
    create_library_setup_script
    save_credentials

    # Verification
    verify_installation

    # Summary
    print_summary

    log_success "Plex Media Server deployment completed successfully!"
}

# Run main function
main "$@"
