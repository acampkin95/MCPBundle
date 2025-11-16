#!/bin/bash
# ============================================================================
# MCP Ecosystem - HAProxy Load Balancer Deployment
# ============================================================================
# Purpose: Deploy production-ready HAProxy on VMI03 as gateway
# Features:
#   - HAProxy 2.8+ installation from PPA
#   - SSL/TLS termination (Let's Encrypt or self-signed)
#   - HTTP to HTTPS redirection
#   - SNI-based routing
#   - Backend health checks
#   - Load balancing across VMI01 and VMI02D services
#   - Stats interface with authentication
#   - Rate limiting and connection management
#   - TLS 1.3 with strong ciphers
#   - Security headers (HSTS, CSP, X-Frame-Options)
#   - Automated SSL certificate management
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/var/log/mcp/haproxy-deployment-$(date +%Y%m%d_%H%M%S).log"
HAPROXY_VERSION="2.8"
HAPROXY_CONFIG="/etc/haproxy/haproxy.cfg"
HAPROXY_CERTS_DIR="/etc/haproxy/certs"
HAPROXY_ERRORS_DIR="/etc/haproxy/errors"

# Server Configuration
VMI01_HOST="46.250.243.123"      # Primary MCP Services
VMI02D_HOST="46.250.241.70"      # Storage Layer (NextCloud, Plex)
VMI03_HOST="154.26.158.31"       # Gateway (this server)
VMI01_VPN="10.0.50.1"            # VPN addresses for internal traffic
VMI02D_VPN="10.0.51.1"
VMI03_VPN="10.0.52.1"

# Service Ports
HAPROXY_HTTP_PORT="80"
HAPROXY_HTTPS_PORT="443"
HAPROXY_STATS_PORT="8404"

# Backend Services
MCP_ORCHESTRATOR_PORT="3000"
PERPLEXITY_MCP_PORT="3001"
IT_MCP_PORT="3002"
GRAFANA_PORT="3000"              # Local Grafana on VMI03
KEYCLOAK_PORT="8080"             # Local Keycloak on VMI03
NEXTCLOUD_PORT="443"             # VMI02D
PLEX_PORT="32400"                # VMI02D

# SSL Configuration
USE_LETSENCRYPT="${USE_LETSENCRYPT:-false}"
DOMAIN_NAME="${DOMAIN_NAME:-mcp.local}"
SSL_DOMAINS="${SSL_DOMAINS:-}"   # Comma-separated additional domains

# Stats Authentication
STATS_USER="admin"
STATS_PASSWORD=$(openssl rand -base64 24)

# Rate Limiting
RATE_LIMIT_CONNECTIONS="1000"
RATE_LIMIT_REQUESTS="100"

# ============================================================================
# Logging Functions
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

log_info() {
    echo -e "${MAGENTA}ℹ${NC} $*" | tee -a "$LOG_FILE"
}

# ============================================================================
# Error Handling and Rollback
# ============================================================================

cleanup_on_error() {
    log_error "Deployment failed. Initiating rollback..."

    # Restore backup configuration if exists
    if [ -f "$HAPROXY_CONFIG.backup" ]; then
        log_warning "Restoring previous HAProxy configuration..."
        cp "$HAPROXY_CONFIG.backup" "$HAPROXY_CONFIG"
        systemctl reload haproxy 2>/dev/null || true
    fi

    log_error "Rollback complete. Check log: $LOG_FILE"
    exit 1
}

trap cleanup_on_error ERR

# ============================================================================
# Pre-flight Checks
# ============================================================================

preflight_checks() {
    log_step "Running pre-flight checks..."

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root"
        exit 1
    fi

    # Check system resources
    local mem_gb=$(free -g | awk '/^Mem:/{print $2}')
    if [ "$mem_gb" -lt 2 ]; then
        log_warning "System has less than 2GB RAM. HAProxy may perform poorly under load."
    else
        log_success "Memory check: ${mem_gb}GB available"
    fi

    # Check if ports are available
    for port in $HAPROXY_HTTP_PORT $HAPROXY_HTTPS_PORT $HAPROXY_STATS_PORT; do
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            log_warning "Port $port is already in use"
        else
            log_success "Port $port is available"
        fi
    done

    # Check connectivity to backend servers
    for host in "$VMI01_HOST" "$VMI02D_HOST"; do
        if ping -c 1 -W 2 "$host" &>/dev/null; then
            log_success "Connectivity to $host: OK"
        else
            log_warning "Cannot reach $host via ping"
        fi
    done

    # Check if HAProxy is already installed
    if command -v haproxy &>/dev/null; then
        local current_version=$(haproxy -v | head -1 | grep -oP '\d+\.\d+')
        log_info "HAProxy already installed: version $current_version"
    else
        log_info "HAProxy not installed"
    fi

    log_success "Pre-flight checks completed"
}

# ============================================================================
# Install HAProxy
# ============================================================================

install_haproxy() {
    log_step "Installing HAProxy $HAPROXY_VERSION..."

    # Update package list
    apt-get update -qq

    # Add HAProxy PPA for latest version
    if ! grep -q "haproxy" /etc/apt/sources.list.d/* 2>/dev/null; then
        log "Adding HAProxy PPA..."
        apt-get install -y software-properties-common
        add-apt-repository -y ppa:vbernat/haproxy-$HAPROXY_VERSION
        apt-get update -qq
    fi

    # Install HAProxy
    log "Installing HAProxy..."
    DEBIAN_FRONTEND=noninteractive apt-get install -y haproxy

    # Verify installation
    if command -v haproxy &>/dev/null; then
        local version=$(haproxy -v | head -1)
        log_success "HAProxy installed: $version"
    else
        log_error "HAProxy installation failed"
        exit 1
    fi

    # Install additional dependencies
    log "Installing additional dependencies..."
    apt-get install -y \
        certbot \
        ssl-cert \
        socat \
        netcat \
        curl \
        jq

    log_success "Dependencies installed"
}

# ============================================================================
# Configure SSL Certificates
# ============================================================================

configure_ssl() {
    log_step "Configuring SSL/TLS certificates..."

    # Create certificates directory
    mkdir -p "$HAPROXY_CERTS_DIR"

    if [ "$USE_LETSENCRYPT" = "true" ] && [ -n "$DOMAIN_NAME" ] && [ "$DOMAIN_NAME" != "mcp.local" ]; then
        log "Obtaining Let's Encrypt certificates for $DOMAIN_NAME..."

        # Stop HAProxy if running
        systemctl stop haproxy 2>/dev/null || true

        # Obtain certificate
        certbot certonly --standalone \
            -d "$DOMAIN_NAME" \
            ${SSL_DOMAINS:+-d $(echo "$SSL_DOMAINS" | tr ',' ' ' | sed 's/ / -d /g')} \
            --non-interactive \
            --agree-tos \
            --email "admin@${DOMAIN_NAME}" \
            --http-01-port 80

        if [ $? -eq 0 ]; then
            # Combine certificate and key for HAProxy
            cat "/etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem" \
                "/etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem" \
                > "$HAPROXY_CERTS_DIR/$DOMAIN_NAME.pem"

            chmod 600 "$HAPROXY_CERTS_DIR/$DOMAIN_NAME.pem"
            log_success "Let's Encrypt certificate obtained"
            CERT_TYPE="letsencrypt"
            SSL_CERT_FILE="$HAPROXY_CERTS_DIR/$DOMAIN_NAME.pem"
        else
            log_warning "Let's Encrypt failed, falling back to self-signed"
            USE_LETSENCRYPT=false
        fi
    fi

    if [ "$USE_LETSENCRYPT" != "true" ]; then
        log "Generating self-signed certificate..."

        # Generate self-signed certificate
        openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
            -keyout "$HAPROXY_CERTS_DIR/selfsigned.key" \
            -out "$HAPROXY_CERTS_DIR/selfsigned.crt" \
            -subj "/C=US/ST=State/L=City/O=MCP Ecosystem/CN=$DOMAIN_NAME"

        # Combine for HAProxy
        cat "$HAPROXY_CERTS_DIR/selfsigned.crt" \
            "$HAPROXY_CERTS_DIR/selfsigned.key" \
            > "$HAPROXY_CERTS_DIR/default.pem"

        chmod 600 "$HAPROXY_CERTS_DIR/default.pem"
        log_success "Self-signed certificate generated"
        CERT_TYPE="self-signed"
        SSL_CERT_FILE="$HAPROXY_CERTS_DIR/default.pem"
    fi

    # Generate DH parameters for enhanced security (this takes a while)
    if [ ! -f "$HAPROXY_CERTS_DIR/dhparams.pem" ]; then
        log "Generating DH parameters (this may take several minutes)..."
        openssl dhparam -out "$HAPROXY_CERTS_DIR/dhparams.pem" 2048
        log_success "DH parameters generated"
    fi

    log_success "SSL/TLS configuration complete (type: $CERT_TYPE)"
}

# ============================================================================
# Create Error Pages
# ============================================================================

create_error_pages() {
    log_step "Creating custom error pages..."

    mkdir -p "$HAPROXY_ERRORS_DIR"

    # 503 Service Unavailable
    cat > "$HAPROXY_ERRORS_DIR/503.http" <<'EOF'
HTTP/1.1 503 Service Unavailable
Content-Type: text/html
Cache-Control: no-cache
Connection: close

<!DOCTYPE html>
<html>
<head>
    <title>Service Unavailable</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .error { background: white; border-radius: 8px; padding: 40px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #e74c3c; margin: 0 0 20px 0; }
        p { color: #666; margin: 10px 0; }
        .code { color: #999; font-size: 0.9em; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="error">
        <h1>⚠ Service Temporarily Unavailable</h1>
        <p>The service you requested is currently unavailable.</p>
        <p>Our team has been notified and is working to resolve the issue.</p>
        <p class="code">Error Code: 503 | HAProxy Gateway</p>
    </div>
</body>
</html>
EOF

    # 502 Bad Gateway
    cat > "$HAPROXY_ERRORS_DIR/502.http" <<'EOF'
HTTP/1.1 502 Bad Gateway
Content-Type: text/html
Cache-Control: no-cache
Connection: close

<!DOCTYPE html>
<html>
<head>
    <title>Bad Gateway</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .error { background: white; border-radius: 8px; padding: 40px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #e67e22; margin: 0 0 20px 0; }
        p { color: #666; margin: 10px 0; }
        .code { color: #999; font-size: 0.9em; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="error">
        <h1>⚠ Gateway Error</h1>
        <p>Unable to connect to the backend service.</p>
        <p>Please try again in a few moments.</p>
        <p class="code">Error Code: 502 | HAProxy Gateway</p>
    </div>
</body>
</html>
EOF

    chmod 644 "$HAPROXY_ERRORS_DIR"/*.http
    log_success "Error pages created"
}

# ============================================================================
# Configure HAProxy
# ============================================================================

configure_haproxy() {
    log_step "Configuring HAProxy..."

    # Backup existing configuration
    if [ -f "$HAPROXY_CONFIG" ]; then
        cp "$HAPROXY_CONFIG" "$HAPROXY_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
        log_info "Existing configuration backed up"
    fi

    # Create HAProxy configuration
    cat > "$HAPROXY_CONFIG" <<EOF
# ============================================================================
# HAProxy Configuration - MCP Ecosystem Gateway (VMI03)
# ============================================================================
# Generated: $(date)
# HAProxy Version: $HAPROXY_VERSION
# ============================================================================

global
    # Process Management
    daemon
    maxconn $RATE_LIMIT_CONNECTIONS
    user haproxy
    group haproxy
    chroot /var/lib/haproxy

    # Logging
    log /dev/log local0
    log /dev/log local1 notice

    # Stats Socket
    stats socket /run/haproxy/admin.sock mode 660 level admin expose-fd listeners
    stats timeout 30s

    # SSL/TLS Configuration
    ssl-default-bind-ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384
    ssl-default-bind-ciphersuites TLS_AES_128_GCM_SHA256:TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-tls-tickets
    ssl-dh-param-file $HAPROXY_CERTS_DIR/dhparams.pem

    # Performance Tuning
    tune.ssl.default-dh-param 2048
    tune.bufsize 32768

defaults
    # Logging
    log     global
    mode    http
    option  httplog
    option  dontlognull

    # Timeouts
    timeout connect 5s
    timeout client  50s
    timeout server  50s
    timeout http-request 10s
    timeout http-keep-alive 10s
    timeout queue 30s

    # Error Pages
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 $HAPROXY_ERRORS_DIR/502.http
    errorfile 503 $HAPROXY_ERRORS_DIR/503.http
    errorfile 504 /etc/haproxy/errors/504.http

    # HTTP Options
    option forwardfor
    option http-server-close
    option redispatch
    retries 3

# ============================================================================
# Statistics Interface
# ============================================================================

listen stats
    bind *:$HAPROXY_STATS_PORT ssl crt $SSL_CERT_FILE
    mode http
    stats enable
    stats uri /stats
    stats realm HAProxy\ Statistics
    stats auth $STATS_USER:$STATS_PASSWORD
    stats refresh 30s
    stats show-legends
    stats show-node
    stats admin if TRUE

# ============================================================================
# HTTP to HTTPS Redirect
# ============================================================================

frontend http_redirect
    bind *:$HAPROXY_HTTP_PORT
    mode http

    # Redirect all HTTP to HTTPS
    http-request redirect scheme https code 301 unless { path_beg /.well-known/acme-challenge/ }

    # Allow ACME challenge for Let's Encrypt
    acl acme_challenge path_beg /.well-known/acme-challenge/
    use_backend letsencrypt_backend if acme_challenge

# ============================================================================
# HTTPS Frontend (SSL Termination)
# ============================================================================

frontend https_frontend
    bind *:$HAPROXY_HTTPS_PORT ssl crt $SSL_CERT_FILE alpn h2,http/1.1
    mode http

    # Security Headers
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    http-response set-header X-Frame-Options "SAMEORIGIN"
    http-response set-header X-Content-Type-Options "nosniff"
    http-response set-header X-XSS-Protection "1; mode=block"
    http-response set-header Referrer-Policy "strict-origin-when-cross-origin"
    http-response set-header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"

    # Rate Limiting
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    http-request track-sc0 src
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt $RATE_LIMIT_REQUESTS }

    # Logging
    capture request header Host len 64
    capture request header User-Agent len 128

    # ACLs for routing
    acl is_keycloak hdr(host) -i keycloak.$DOMAIN_NAME
    acl is_keycloak hdr(host) -i $VMI03_HOST:$KEYCLOAK_PORT
    acl is_grafana hdr(host) -i grafana.$DOMAIN_NAME
    acl is_nextcloud hdr(host) -i nextcloud.$DOMAIN_NAME
    acl is_nextcloud hdr(host) -i cloud.$DOMAIN_NAME
    acl is_plex hdr(host) -i plex.$DOMAIN_NAME

    # Path-based routing
    acl path_orchestrator path_beg /api/orchestrator
    acl path_perplexity path_beg /api/perplexity
    acl path_itmcp path_beg /api/itmcp

    # Backend Selection
    use_backend keycloak_backend if is_keycloak
    use_backend grafana_backend if is_grafana
    use_backend nextcloud_backend if is_nextcloud
    use_backend plex_backend if is_plex
    use_backend mcp_orchestrator_backend if path_orchestrator
    use_backend perplexity_mcp_backend if path_perplexity
    use_backend it_mcp_backend if path_itmcp

    # Default backend
    default_backend mcp_orchestrator_backend

# ============================================================================
# Backend: MCP Orchestrator (VMI01:3000)
# ============================================================================

backend mcp_orchestrator_backend
    mode http
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200

    # Connection limits
    default-server inter 3s fall 3 rise 2 maxconn 50

    # Servers
    server orchestrator1 $VMI01_HOST:$MCP_ORCHESTRATOR_PORT check ssl verify none
    server orchestrator1_vpn $VMI01_VPN:$MCP_ORCHESTRATOR_PORT check ssl verify none backup

# ============================================================================
# Backend: Perplexity MCP (VMI01:3001)
# ============================================================================

backend perplexity_mcp_backend
    mode http
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200

    default-server inter 3s fall 3 rise 2 maxconn 50

    server perplexity1 $VMI01_HOST:$PERPLEXITY_MCP_PORT check ssl verify none
    server perplexity1_vpn $VMI01_VPN:$PERPLEXITY_MCP_PORT check ssl verify none backup

# ============================================================================
# Backend: IT-MCP (VMI01:3002)
# ============================================================================

backend it_mcp_backend
    mode http
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200

    default-server inter 3s fall 3 rise 2 maxconn 50

    server itmcp1 $VMI01_HOST:$IT_MCP_PORT check ssl verify none
    server itmcp1_vpn $VMI01_VPN:$IT_MCP_PORT check ssl verify none backup

# ============================================================================
# Backend: Keycloak (VMI03 Local:8080)
# ============================================================================

backend keycloak_backend
    mode http
    balance roundrobin
    option httpchk GET /health/ready
    http-check expect status 200

    # Keycloak-specific timeouts
    timeout server 90s

    default-server inter 5s fall 3 rise 2 maxconn 100

    server keycloak_local localhost:$KEYCLOAK_PORT check

# ============================================================================
# Backend: Grafana (VMI03 Local:3000)
# ============================================================================

backend grafana_backend
    mode http
    balance roundrobin
    option httpchk GET /api/health
    http-check expect status 200

    default-server inter 5s fall 3 rise 2 maxconn 50

    server grafana_local localhost:$GRAFANA_PORT check

# ============================================================================
# Backend: NextCloud (VMI02D:443)
# ============================================================================

backend nextcloud_backend
    mode http
    balance roundrobin
    option httpchk GET /status.php
    http-check expect status 200

    # NextCloud-specific settings
    timeout server 300s

    default-server inter 10s fall 3 rise 2 maxconn 100

    server nextcloud1 $VMI02D_HOST:$NEXTCLOUD_PORT check ssl verify none
    server nextcloud1_vpn $VMI02D_VPN:$NEXTCLOUD_PORT check ssl verify none backup

# ============================================================================
# Backend: Plex Media Server (VMI02D:32400)
# ============================================================================

backend plex_backend
    mode http
    balance roundrobin
    option httpchk GET /web/index.html
    http-check expect status 200

    # Plex-specific settings (large files, streaming)
    timeout server 600s

    default-server inter 10s fall 3 rise 2 maxconn 200

    server plex1 $VMI02D_HOST:$PLEX_PORT check ssl verify none
    server plex1_vpn $VMI02D_VPN:$PLEX_PORT check ssl verify none backup

# ============================================================================
# Backend: Let's Encrypt ACME Challenge
# ============================================================================

backend letsencrypt_backend
    mode http
    server letsencrypt 127.0.0.1:54321

# ============================================================================
# End of Configuration
# ============================================================================
EOF

    # Validate configuration
    log "Validating HAProxy configuration..."
    if haproxy -c -f "$HAPROXY_CONFIG"; then
        log_success "HAProxy configuration is valid"
    else
        log_error "HAProxy configuration validation failed"
        exit 1
    fi

    # Set permissions
    chmod 644 "$HAPROXY_CONFIG"

    log_success "HAProxy configuration created"
}

# ============================================================================
# Create SSL Certificate Management Script
# ============================================================================

create_ssl_management_script() {
    log_step "Creating SSL certificate management script..."

    cat > /usr/local/bin/haproxy-ssl-renew.sh <<'EOF'
#!/bin/bash
# HAProxy SSL Certificate Renewal Script

set -euo pipefail

HAPROXY_CERTS_DIR="/etc/haproxy/certs"
DOMAIN_NAME="__DOMAIN_NAME__"
USE_LETSENCRYPT="__USE_LETSENCRYPT__"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a /var/log/mcp/ssl-renewal.log
}

if [ "$USE_LETSENCRYPT" = "true" ]; then
    log "Renewing Let's Encrypt certificate for $DOMAIN_NAME..."

    # Renew certificate
    certbot renew --quiet --post-hook "cat /etc/letsencrypt/live/$DOMAIN_NAME/fullchain.pem /etc/letsencrypt/live/$DOMAIN_NAME/privkey.pem > $HAPROXY_CERTS_DIR/$DOMAIN_NAME.pem && systemctl reload haproxy"

    if [ $? -eq 0 ]; then
        log "Certificate renewed successfully"
    else
        log "ERROR: Certificate renewal failed"
        exit 1
    fi
else
    log "Using self-signed certificate, no renewal needed"
fi
EOF

    # Replace placeholders
    sed -i "s|__DOMAIN_NAME__|$DOMAIN_NAME|g" /usr/local/bin/haproxy-ssl-renew.sh
    sed -i "s|__USE_LETSENCRYPT__|$USE_LETSENCRYPT|g" /usr/local/bin/haproxy-ssl-renew.sh

    chmod +x /usr/local/bin/haproxy-ssl-renew.sh

    # Create cron job for automatic renewal
    if [ "$USE_LETSENCRYPT" = "true" ]; then
        echo "0 3 * * 0 root /usr/local/bin/haproxy-ssl-renew.sh >> /var/log/mcp/ssl-renewal.log 2>&1" \
            > /etc/cron.d/haproxy-ssl-renewal
        log_success "SSL renewal cron job created (runs weekly)"
    fi

    log_success "SSL management script created"
}

# ============================================================================
# Configure Firewall
# ============================================================================

configure_firewall() {
    log_step "Configuring firewall rules..."

    if command -v ufw &>/dev/null; then
        # Allow HAProxy ports
        ufw allow $HAPROXY_HTTP_PORT/tcp comment "HAProxy HTTP"
        ufw allow $HAPROXY_HTTPS_PORT/tcp comment "HAProxy HTTPS"
        ufw allow $HAPROXY_STATS_PORT/tcp comment "HAProxy Stats"

        # Enable if not already enabled
        ufw --force enable

        log_success "Firewall rules configured"
    else
        log_warning "UFW not installed, skipping firewall configuration"
    fi
}

# ============================================================================
# Enable and Start HAProxy
# ============================================================================

start_haproxy() {
    log_step "Starting HAProxy service..."

    # Enable HAProxy service
    systemctl enable haproxy

    # Start HAProxy
    systemctl start haproxy

    # Wait for service to be ready
    sleep 3

    # Check status
    if systemctl is-active --quiet haproxy; then
        log_success "HAProxy is running"

        # Test health endpoints
        if curl -sk "https://localhost:$HAPROXY_STATS_PORT/stats" &>/dev/null; then
            log_success "Stats interface is accessible"
        fi
    else
        log_error "HAProxy failed to start"
        systemctl status haproxy --no-pager
        exit 1
    fi
}

# ============================================================================
# Create Health Check Script
# ============================================================================

create_health_check() {
    log_step "Creating health check script..."

    cat > /usr/local/bin/haproxy-health-check.sh <<'EOF'
#!/bin/bash
# HAProxy Health Check Script

HAPROXY_STATS_URL="https://localhost:8404/stats"
STATS_USER="__STATS_USER__"
STATS_PASSWORD="__STATS_PASSWORD__"

# Check if HAProxy is running
if ! systemctl is-active --quiet haproxy; then
    echo "ERROR: HAProxy service is not running"
    systemctl restart haproxy
    exit 1
fi

# Check stats endpoint
if curl -sk -u "$STATS_USER:$STATS_PASSWORD" "$HAPROXY_STATS_URL" >/dev/null 2>&1; then
    echo "OK: HAProxy is healthy"
    exit 0
else
    echo "WARNING: HAProxy stats endpoint not responding"
    exit 1
fi
EOF

    # Replace placeholders
    sed -i "s|__STATS_USER__|$STATS_USER|g" /usr/local/bin/haproxy-health-check.sh
    sed -i "s|__STATS_PASSWORD__|$STATS_PASSWORD|g" /usr/local/bin/haproxy-health-check.sh

    chmod +x /usr/local/bin/haproxy-health-check.sh

    # Create cron job
    echo "*/5 * * * * root /usr/local/bin/haproxy-health-check.sh >> /var/log/mcp/haproxy-health.log 2>&1" \
        > /etc/cron.d/haproxy-health

    log_success "Health check script created"
}

# ============================================================================
# Save Configuration Details
# ============================================================================

save_configuration() {
    log_step "Saving configuration details..."

    cat > /root/haproxy-configuration.txt <<EOF
=========================================================
HAPROXY DEPLOYMENT CONFIGURATION
=========================================================
Deployment Date: $(date)
Server: VMI03 ($VMI03_HOST)
HAProxy Version: $(haproxy -v | head -1)
=========================================================

ENDPOINTS
---------
HTTP:              http://$VMI03_HOST:$HAPROXY_HTTP_PORT (redirects to HTTPS)
HTTPS:             https://$VMI03_HOST:$HAPROXY_HTTPS_PORT
Stats Interface:   https://$VMI03_HOST:$HAPROXY_STATS_PORT/stats

STATS AUTHENTICATION
--------------------
Username:          $STATS_USER
Password:          $STATS_PASSWORD

SSL/TLS CONFIGURATION
---------------------
Certificate Type:  $CERT_TYPE
Certificate File:  $SSL_CERT_FILE
Domain Name:       $DOMAIN_NAME

BACKEND SERVICES
----------------
MCP Orchestrator:  $VMI01_HOST:$MCP_ORCHESTRATOR_PORT (path: /api/orchestrator)
Perplexity MCP:    $VMI01_HOST:$PERPLEXITY_MCP_PORT (path: /api/perplexity)
IT-MCP:            $VMI01_HOST:$IT_MCP_PORT (path: /api/itmcp)
Keycloak:          localhost:$KEYCLOAK_PORT (host: keycloak.$DOMAIN_NAME)
Grafana:           localhost:$GRAFANA_PORT (host: grafana.$DOMAIN_NAME)
NextCloud:         $VMI02D_HOST:$NEXTCLOUD_PORT (host: nextcloud.$DOMAIN_NAME)
Plex:              $VMI02D_HOST:$PLEX_PORT (host: plex.$DOMAIN_NAME)

RATE LIMITING
-------------
Max Connections:   $RATE_LIMIT_CONNECTIONS
Max Requests/10s:  $RATE_LIMIT_REQUESTS

CONFIGURATION FILES
-------------------
Main Config:       $HAPROXY_CONFIG
Backup Config:     $HAPROXY_CONFIG.backup.*
SSL Certs:         $HAPROXY_CERTS_DIR/
Error Pages:       $HAPROXY_ERRORS_DIR/

MANAGEMENT COMMANDS
-------------------
Start:             systemctl start haproxy
Stop:              systemctl stop haproxy
Restart:           systemctl restart haproxy
Reload Config:     systemctl reload haproxy
Status:            systemctl status haproxy
Logs:              journalctl -u haproxy -f
Validate Config:   haproxy -c -f $HAPROXY_CONFIG

HEALTH CHECKS
-------------
Manual Check:      /usr/local/bin/haproxy-health-check.sh
SSL Renewal:       /usr/local/bin/haproxy-ssl-renew.sh
Cron Jobs:         /etc/cron.d/haproxy-*

MONITORING
----------
Stats Page:        https://$VMI03_HOST:$HAPROXY_STATS_PORT/stats
Stats Socket:      /run/haproxy/admin.sock
Health Log:        /var/log/mcp/haproxy-health.log
SSL Renewal Log:   /var/log/mcp/ssl-renewal.log

SECURITY FEATURES
-----------------
- TLS 1.2+ only (TLS 1.3 preferred)
- Strong cipher suites
- HTTP Strict Transport Security (HSTS)
- X-Frame-Options, X-Content-Type-Options
- Content Security Policy (CSP)
- Rate limiting per IP
- DH parameters for forward secrecy

DNS CONFIGURATION
-----------------
For proper routing, configure these DNS records:

A Records:
  $DOMAIN_NAME                    -> $VMI03_HOST
  keycloak.$DOMAIN_NAME           -> $VMI03_HOST
  grafana.$DOMAIN_NAME            -> $VMI03_HOST
  nextcloud.$DOMAIN_NAME          -> $VMI03_HOST
  cloud.$DOMAIN_NAME              -> $VMI03_HOST
  plex.$DOMAIN_NAME               -> $VMI03_HOST

=========================================================
⚠️  IMPORTANT NOTES
=========================================================
- Stats interface is password protected
- All HTTP traffic is redirected to HTTPS
- Backend servers are accessed via VPN as backup
- Health checks run every 5 minutes
- SSL certificates ${USE_LETSENCRYPT:+auto-renew weekly}${USE_LETSENCRYPT:-are self-signed}
- Logs are stored in /var/log/haproxy/
- Keep HAProxy updated for security patches
=========================================================
EOF

    chmod 600 /root/haproxy-configuration.txt
    log_success "Configuration saved to /root/haproxy-configuration.txt"
}

# ============================================================================
# Generate Summary Report
# ============================================================================

generate_summary() {
    echo ""
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         HAPROXY DEPLOYMENT COMPLETED SUCCESSFULLY              ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log_success "HAProxy Version: $(haproxy -v | head -1)"
    log_success "Configuration: $HAPROXY_CONFIG"
    echo ""

    log "Access Points:"
    log "  HTTPS:         https://$VMI03_HOST:$HAPROXY_HTTPS_PORT"
    log "  HTTP:          http://$VMI03_HOST:$HAPROXY_HTTP_PORT (→ HTTPS)"
    log "  Stats:         https://$VMI03_HOST:$HAPROXY_STATS_PORT/stats"
    echo ""

    log "Stats Authentication:"
    log "  Username:      $STATS_USER"
    log "  Password:      $STATS_PASSWORD"
    echo ""

    log "SSL/TLS:"
    log "  Type:          $CERT_TYPE"
    log "  Domain:        $DOMAIN_NAME"
    log "  Cert File:     $SSL_CERT_FILE"
    echo ""

    log "Backend Routing:"
    log "  keycloak.$DOMAIN_NAME    → localhost:$KEYCLOAK_PORT"
    log "  grafana.$DOMAIN_NAME     → localhost:$GRAFANA_PORT"
    log "  nextcloud.$DOMAIN_NAME   → $VMI02D_HOST:$NEXTCLOUD_PORT"
    log "  plex.$DOMAIN_NAME        → $VMI02D_HOST:$PLEX_PORT"
    log "  /api/orchestrator        → $VMI01_HOST:$MCP_ORCHESTRATOR_PORT"
    log "  /api/perplexity          → $VMI01_HOST:$PERPLEXITY_MCP_PORT"
    log "  /api/itmcp               → $VMI01_HOST:$IT_MCP_PORT"
    echo ""

    log "Service Management:"
    log "  Status:        systemctl status haproxy"
    log "  Reload:        systemctl reload haproxy"
    log "  Logs:          journalctl -u haproxy -f"
    echo ""

    log_warning "Next Steps:"
    log "  1. Configure DNS records for subdomains"
    log "  2. Test backend connectivity to all services"
    log "  3. Review and adjust rate limits if needed"
    log "  4. Set up monitoring alerts for HAProxy"
    log "  5. Test SSL certificate renewal process"
    log "  6. Configure application backends to use HAProxy"
    echo ""

    log_info "Configuration file: /root/haproxy-configuration.txt"
    log_info "Deployment log: $LOG_FILE"
    echo ""
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║       MCP Ecosystem - HAProxy Load Balancer Deployment        ║"
    echo "║                  VMI03 Gateway (154.26.158.31)                 ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    # Create log directory
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p /var/log/mcp

    log "Deployment started at $(date)"
    echo ""

    # Pre-flight checks
    preflight_checks
    echo ""

    # Confirmation
    log_warning "This will deploy HAProxy with the following configuration:"
    log "  - HAProxy Version: $HAPROXY_VERSION"
    log "  - HTTPS Port: $HAPROXY_HTTPS_PORT"
    log "  - Stats Port: $HAPROXY_STATS_PORT"
    log "  - SSL: $CERT_TYPE ($DOMAIN_NAME)"
    log "  - Backend Servers: VMI01 ($VMI01_HOST), VMI02D ($VMI02D_HOST)"
    echo ""

    read -rp "Proceed with deployment? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Deployment cancelled by user"
        exit 0
    fi
    echo ""

    # Execute deployment steps
    install_haproxy
    echo ""

    configure_ssl
    echo ""

    create_error_pages
    echo ""

    configure_haproxy
    echo ""

    create_ssl_management_script
    echo ""

    configure_firewall
    echo ""

    start_haproxy
    echo ""

    create_health_check
    echo ""

    save_configuration
    echo ""

    # Generate summary
    generate_summary

    log_success "HAProxy deployment completed successfully!"
}

# Run main function
main "$@"
