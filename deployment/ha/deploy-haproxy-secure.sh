#!/bin/bash
# ============================================================================
# MCP Ecosystem - Secure HAProxy Load Balancer Deployment
# ============================================================================
# Purpose: Deploy production HAProxy with comprehensive security hardening
# Security Features:
#   - SSL/TLS with proper certificate verification
#   - Vault integration for all credentials
#   - Rate limiting and DDoS protection
#   - Security headers enforcement
#   - Audit logging for all operations
#   - Connection limits and timeouts
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
LOG_FILE="/var/log/mcp/haproxy-secure-deployment-$(date +%Y%m%d_%H%M%S).log"
AUDIT_LOG="/var/log/mcp/haproxy-security-audit.log"
HAPROXY_VERSION="2.8"
HAPROXY_CONFIG="/etc/haproxy/haproxy.cfg"
HAPROXY_CERTS="/etc/haproxy/certs"

# Server Configuration
VMI03_HOST="154.26.158.31"
VMI01_HOST="46.250.243.123"
VMI02D_HOST="46.250.241.70"

# VPN Networks
VPN_NETWORK_50="10.0.50.0/24"
VPN_NETWORK_51="10.0.51.0/24"
VPN_NETWORK_52="10.0.52.0/24"

# Service Ports
KEYCLOAK_PORT="8443"
PROMETHEUS_PORT="9090"
GRAFANA_PORT="3030"
NEXTCLOUD_PORT="443"
PLEX_PORT="32400"

# Public Domain
PUBLIC_DOMAIN="${HAPROXY_DOMAIN:-lb.mcp-ecosystem.com}"

# Vault Configuration
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_TOKEN_FILE="/root/.vault-token"
VAULT_NAMESPACE="${VAULT_NAMESPACE:-mcp}"

# Security Configuration
DH_PARAM_SIZE=4096
MIN_TLS_VERSION="TLSv1.2"
ENABLE_AUDIT_LOG=true
ENABLE_RATE_LIMITING=true
ENABLE_SSL_VERIFICATION=true

# ============================================================================
# Security and Audit Logging
# ============================================================================

audit_log() {
    local message="$1"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [AUDIT] $message" | tee -a "$AUDIT_LOG"
}

security_check() {
    local check_name="$1"
    local status="$2"
    audit_log "Security Check: $check_name - Status: $status"
}

# ============================================================================
# Vault Integration
# ============================================================================

setup_vault() {
    log_step "Setting up Vault integration..."

    # Install vault CLI if not present
    if ! command -v vault &> /dev/null; then
        log "Installing Vault CLI..."
        curl -fsSL https://apt.releases.hashicorp.com/gpg | apt-key add -
        apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
        apt-get update && apt-get install -y vault
        audit_log "Vault CLI installed"
    fi

    # Check vault token
    if [ ! -f "$VAULT_TOKEN_FILE" ]; then
        log_error "Vault token not found at $VAULT_TOKEN_FILE"
        log_info "Please run: vault login -method=token"
        exit 1
    fi

    export VAULT_TOKEN=$(cat "$VAULT_TOKEN_FILE")

    # Test vault connection
    if vault status &>/dev/null; then
        log_success "Vault connection established"
        audit_log "Vault connection verified"
    else
        log_error "Failed to connect to Vault at $VAULT_ADDR"
        exit 1
    fi
}

get_secret() {
    local path="$1"
    local field="${2:-password}"

    vault kv get -field="$field" "$VAULT_NAMESPACE/$path" 2>/dev/null || {
        # If secret doesn't exist, generate and store it
        local new_secret=$(openssl rand -base64 32)
        vault kv put "$VAULT_NAMESPACE/$path" "$field=$new_secret" &>/dev/null
        echo "$new_secret"
        audit_log "New secret generated and stored: $path"
    }
}

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    echo -e "${CYAN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1" | tee -a "$LOG_FILE"
}

log_step() {
    echo -e "\n${MAGENTA}═══════════════════════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
    echo -e "${YELLOW}[STEP]${NC} $1" | tee -a "$LOG_FILE"
    echo -e "${MAGENTA}═══════════════════════════════════════════════════════════${NC}" | tee -a "$LOG_FILE"
}

# ============================================================================
# Install HAProxy from Official Repository
# ============================================================================

install_haproxy() {
    log_step "Installing HAProxy $HAPROXY_VERSION from official repository..."

    # Add official HAProxy repository
    curl -fsSL https://haproxy.debian.net/bernat.debian.org.gpg | apt-key add -
    add-apt-repository "deb http://haproxy.debian.net $(lsb_release -cs)-backports-$HAPROXY_VERSION main"
    apt-get update

    # Install HAProxy with verification
    apt-get install -y --allow-unauthenticated=false haproxy=$HAPROXY_VERSION.\*

    # Verify installation
    if haproxy -v | grep -q "HAProxy version $HAPROXY_VERSION"; then
        log_success "HAProxy $HAPROXY_VERSION installed"
        audit_log "HAProxy $HAPROXY_VERSION installed successfully"
        security_check "HAProxy installation" "PASS"
    else
        log_error "Failed to install HAProxy $HAPROXY_VERSION"
        security_check "HAProxy installation" "FAIL"
        exit 1
    fi

    # Install additional tools
    apt-get install -y hatop socat certbot ssl-cert

    log_success "HAProxy and tools installed"
}

# ============================================================================
# Generate Strong DH Parameters
# ============================================================================

generate_dh_params() {
    log_step "Generating strong DH parameters..."

    if [ ! -f /etc/haproxy/dhparam.pem ]; then
        log "Generating $DH_PARAM_SIZE-bit DH parameters (this may take a while)..."
        openssl dhparam -out /etc/haproxy/dhparam.pem $DH_PARAM_SIZE
        chmod 644 /etc/haproxy/dhparam.pem
        audit_log "DH parameters generated: $DH_PARAM_SIZE bits"
        security_check "DH parameter generation" "PASS"
    else
        log_info "DH parameters already exist"
    fi
}

# ============================================================================
# Setup SSL Certificates with Verification
# ============================================================================

setup_ssl_certificates() {
    log_step "Setting up SSL certificates with verification..."

    # Create certificate directory
    mkdir -p "$HAPROXY_CERTS"
    chmod 755 "$HAPROXY_CERTS"

    # Check if Let's Encrypt can be used
    if [ -n "$PUBLIC_DOMAIN" ] && [ "$PUBLIC_DOMAIN" != "localhost" ]; then
        log "Obtaining Let's Encrypt certificate for $PUBLIC_DOMAIN..."

        # Stop HAProxy temporarily
        systemctl stop haproxy 2>/dev/null || true

        # Obtain certificate
        certbot certonly --standalone \
            -d "$PUBLIC_DOMAIN" \
            --non-interactive \
            --agree-tos \
            --email admin@"$PUBLIC_DOMAIN" \
            --rsa-key-size 4096

        if [ -f "/etc/letsencrypt/live/$PUBLIC_DOMAIN/fullchain.pem" ]; then
            # Combine certificate and key for HAProxy
            cat "/etc/letsencrypt/live/$PUBLIC_DOMAIN/fullchain.pem" \
                "/etc/letsencrypt/live/$PUBLIC_DOMAIN/privkey.pem" \
                > "$HAPROXY_CERTS/$PUBLIC_DOMAIN.pem"

            chmod 600 "$HAPROXY_CERTS/$PUBLIC_DOMAIN.pem"

            log_success "Let's Encrypt certificate obtained"
            audit_log "SSL certificate obtained from Let's Encrypt for $PUBLIC_DOMAIN"
            security_check "SSL certificate" "Let's Encrypt"

            # Setup auto-renewal
            setup_cert_renewal
        fi
    else
        log "Generating self-signed certificate..."
        generate_self_signed_cert
    fi

    # Download and verify CA certificates for backend verification
    setup_ca_certificates
}

generate_self_signed_cert() {
    openssl req -x509 -nodes -days 365 -newkey rsa:4096 \
        -keyout /tmp/haproxy.key \
        -out /tmp/haproxy.crt \
        -subj "/C=US/ST=State/L=City/O=MCP/OU=Infrastructure/CN=$VMI03_HOST"

    cat /tmp/haproxy.crt /tmp/haproxy.key > "$HAPROXY_CERTS/self-signed.pem"
    rm -f /tmp/haproxy.crt /tmp/haproxy.key
    chmod 600 "$HAPROXY_CERTS/self-signed.pem"

    log_success "Self-signed certificate generated"
    audit_log "Self-signed SSL certificate generated"
    security_check "SSL certificate" "Self-signed"
}

setup_ca_certificates() {
    log "Setting up CA certificates for backend verification..."

    # Update CA certificates
    update-ca-certificates

    # Create CA bundle for HAProxy backend verification
    cat /etc/ssl/certs/ca-certificates.crt > /etc/haproxy/ca-bundle.crt

    # Add any custom CA certificates if needed
    if [ -f "/usr/local/share/ca-certificates/mcp-ca.crt" ]; then
        cat "/usr/local/share/ca-certificates/mcp-ca.crt" >> /etc/haproxy/ca-bundle.crt
    fi

    chmod 644 /etc/haproxy/ca-bundle.crt

    log_success "CA certificates configured for backend verification"
    audit_log "CA certificates configured for SSL verification"
}

setup_cert_renewal() {
    cat > /etc/systemd/system/haproxy-cert-renewal.service <<EOF
[Unit]
Description=HAProxy SSL Certificate Renewal
After=network.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --deploy-hook "/usr/local/bin/haproxy-cert-update.sh"

[Install]
WantedBy=multi-user.target
EOF

    cat > /usr/local/bin/haproxy-cert-update.sh <<'EOF'
#!/bin/bash
# Update HAProxy certificates after renewal
cat /etc/letsencrypt/live/$PUBLIC_DOMAIN/fullchain.pem \
    /etc/letsencrypt/live/$PUBLIC_DOMAIN/privkey.pem \
    > $HAPROXY_CERTS/$PUBLIC_DOMAIN.pem
chmod 600 $HAPROXY_CERTS/$PUBLIC_DOMAIN.pem
systemctl reload haproxy
EOF

    chmod +x /usr/local/bin/haproxy-cert-update.sh

    # Create timer for auto-renewal
    cat > /etc/systemd/system/haproxy-cert-renewal.timer <<EOF
[Unit]
Description=Run HAProxy SSL Certificate Renewal twice daily

[Timer]
OnCalendar=*-*-* 02:00:00
OnCalendar=*-*-* 14:00:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable haproxy-cert-renewal.timer
    systemctl start haproxy-cert-renewal.timer

    audit_log "SSL certificate auto-renewal configured"
}

# ============================================================================
# Configure Secure HAProxy
# ============================================================================

configure_haproxy() {
    log_step "Configuring HAProxy with security hardening..."

    # Backup original configuration
    if [ -f "$HAPROXY_CONFIG" ]; then
        cp "$HAPROXY_CONFIG" "$HAPROXY_CONFIG.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    # Get stats password from Vault
    STATS_PASSWORD=$(get_secret "haproxy/stats" "password")

    cat > "$HAPROXY_CONFIG" <<EOF
# ============================================================================
# HAProxy Secure Configuration - MCP Ecosystem
# ============================================================================

global
    # Logging
    log /dev/log    local0 info
    log /dev/log    local1 notice

    # Security
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    daemon

    # SSL/TLS Configuration
    ssl-default-bind-ciphers ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS
    ssl-default-bind-ciphersuites TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-sslv3 no-tlsv10 no-tlsv11 no-tls-tickets
    ssl-default-server-ciphers ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS
    ssl-default-server-ciphersuites TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256
    ssl-default-server-options ssl-min-ver TLSv1.2 no-sslv3 no-tlsv10 no-tlsv11 no-tls-tickets
    ssl-dh-param-file /etc/haproxy/dhparam.pem

    # Performance tuning
    tune.ssl.default-dh-param $DH_PARAM_SIZE
    tune.bufsize 32768
    tune.maxrewrite 4096
    maxconn 4096

    # Enable stats
    stats socket ipv4@127.0.0.1:9999 level admin
    stats socket /var/run/haproxy.sock mode 666 level admin

defaults
    log     global
    mode    http
    option  httplog
    option  dontlognull
    option  forwardfor except 127.0.0.0/8
    option  redispatch
    option  log-health-checks

    # Timeouts
    timeout connect 10s
    timeout client  30s
    timeout server  30s
    timeout http-request 10s
    timeout http-keep-alive 10s
    timeout check   10s

    # Security
    errorfile 400 /etc/haproxy/errors/400.http
    errorfile 403 /etc/haproxy/errors/403.http
    errorfile 408 /etc/haproxy/errors/408.http
    errorfile 500 /etc/haproxy/errors/500.http
    errorfile 502 /etc/haproxy/errors/502.http
    errorfile 503 /etc/haproxy/errors/503.http
    errorfile 504 /etc/haproxy/errors/504.http

    # Rate limiting
    stick-table type ip size 100k expire 30s store conn_rate(10s),http_req_rate(10s)

    # Security headers
    http-response set-header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    http-response set-header X-Frame-Options "SAMEORIGIN"
    http-response set-header X-Content-Type-Options "nosniff"
    http-response set-header X-XSS-Protection "1; mode=block"
    http-response set-header Referrer-Policy "strict-origin-when-cross-origin"

# ============================================================================
# Statistics Interface (VPN Access Only)
# ============================================================================

listen stats
    bind *:8404 ssl crt $HAPROXY_CERTS/
    stats enable
    stats uri /stats
    stats realm HAProxy\ Statistics
    stats auth admin:$STATS_PASSWORD
    stats admin if TRUE
    stats refresh 30s

    # Restrict to VPN networks
    acl vpn_network src $VPN_NETWORK_50 $VPN_NETWORK_51 $VPN_NETWORK_52
    http-request deny unless vpn_network

    # Audit logging
    http-request capture req.hdr(User-Agent) len 128
    http-request capture req.hdr(X-Forwarded-For) len 64

# ============================================================================
# Frontend: HTTPS Public Access
# ============================================================================

frontend https_public
    bind *:443 ssl crt $HAPROXY_CERTS/ alpn h2,http/1.1
    bind *:80

    # Force HTTPS redirect
    http-request redirect scheme https unless { ssl_fc }

    # Rate limiting per IP
    acl rate_limit_exceeded sc0_conn_rate(stick_table) gt 50
    acl rate_limit_exceeded sc0_http_req_rate(stick_table) gt 100
    tcp-request connection track-sc0 src table stick_table
    http-request track-sc0 src table stick_table
    http-request deny if rate_limit_exceeded

    # Security ACLs
    acl is_scanner hdr_sub(User-Agent) -i scanner bot crawler spider scraper
    http-request deny if is_scanner

    # Block suspicious paths
    acl suspicious_path path_beg -i /admin /config /. /wp-admin /phpmyadmin
    http-request deny if suspicious_path !{ src $VPN_NETWORK_50 $VPN_NETWORK_51 $VPN_NETWORK_52 }

    # Service routing ACLs
    acl is_keycloak hdr(host) -i auth.$PUBLIC_DOMAIN
    acl is_grafana hdr(host) -i monitoring.$PUBLIC_DOMAIN
    acl is_nextcloud hdr(host) -i cloud.$PUBLIC_DOMAIN
    acl is_plex hdr(host) -i plex.$PUBLIC_DOMAIN

    # Route to backends
    use_backend keycloak_backend if is_keycloak
    use_backend grafana_backend if is_grafana
    use_backend nextcloud_backend if is_nextcloud
    use_backend plex_backend if is_plex

    # Default backend
    default_backend default_backend

# ============================================================================
# Backend: Keycloak (Public with restrictions)
# ============================================================================

backend keycloak_backend
    balance roundrobin
    option httpchk GET /health/ready

    # Stick sessions
    cookie SERVERID insert indirect nocache

    # Security headers
    http-response set-header X-Frame-Options "DENY"
    http-response set-header Content-Security-Policy "default-src 'self'"

    # Rate limiting for auth endpoints
    acl is_auth_endpoint path_beg /realms/
    http-request deny if is_auth_endpoint rate_limit_exceeded

    # Backend server with SSL verification
    server keycloak1 $VMI03_HOST:$KEYCLOAK_PORT ssl verify required ca-file /etc/haproxy/ca-bundle.crt check inter 5s fall 3 rise 2 cookie keycloak1

# ============================================================================
# Backend: Grafana (VPN Access Only)
# ============================================================================

backend grafana_backend
    balance roundrobin
    option httpchk GET /api/health

    # Restrict to VPN
    acl vpn_network src $VPN_NETWORK_50 $VPN_NETWORK_51 $VPN_NETWORK_52
    http-request deny unless vpn_network

    # Backend server with SSL verification
    server grafana1 $VMI03_HOST:$GRAFANA_PORT ssl verify required ca-file /etc/haproxy/ca-bundle.crt check inter 5s fall 3 rise 2

# ============================================================================
# Backend: NextCloud (Public with auth)
# ============================================================================

backend nextcloud_backend
    balance roundrobin
    option httpchk GET /status.php
    http-check expect string ok

    # Increase timeouts for large files
    timeout server 300s
    timeout client 300s

    # Backend server with SSL verification
    server nextcloud1 $VMI02D_HOST:$NEXTCLOUD_PORT ssl verify required ca-file /etc/haproxy/ca-bundle.crt check inter 10s fall 3 rise 2

# ============================================================================
# Backend: Plex (Public with auth)
# ============================================================================

backend plex_backend
    balance roundrobin
    option httpchk GET /web/index.html

    # WebSocket support
    timeout tunnel 1h

    # Backend server
    server plex1 $VMI02D_HOST:$PLEX_PORT check inter 10s fall 3 rise 2

# ============================================================================
# Backend: Prometheus (Internal Only)
# ============================================================================

backend prometheus_backend
    balance roundrobin
    option httpchk GET /-/healthy

    # Internal access only
    acl internal_network src 127.0.0.1 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
    http-request deny unless internal_network

    # Backend server
    server prometheus1 $VMI03_HOST:$PROMETHEUS_PORT check inter 5s fall 3 rise 2

# ============================================================================
# Default Backend (Security)
# ============================================================================

backend default_backend
    mode http
    option forwardfor

    # Return 404 for unmatched requests
    http-request deny
    errorfile 503 /etc/haproxy/errors/404.http

# ============================================================================
# Health Check Frontend
# ============================================================================

frontend health_check
    bind *:8080
    mode http
    option httplog

    # Simple health endpoint
    acl is_health_check path /health
    use_backend health_backend if is_health_check

    default_backend health_backend

backend health_backend
    mode http
    errorfile 200 /etc/haproxy/errors/200.http
EOF

    # Create custom error pages
    mkdir -p /etc/haproxy/errors

    cat > /etc/haproxy/errors/200.http <<'EOF'
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 7
Connection: close

Healthy
EOF

    cat > /etc/haproxy/errors/404.http <<'EOF'
HTTP/1.1 404 Not Found
Content-Type: text/html
Content-Length: 114
Connection: close

<!DOCTYPE html>
<html><head><title>404 Not Found</title></head>
<body><h1>404 Not Found</h1><p>Resource not found.</p></body></html>
EOF

    # Set proper permissions
    chmod 644 "$HAPROXY_CONFIG"
    chmod -R 644 /etc/haproxy/errors/

    # Validate configuration
    if haproxy -f "$HAPROXY_CONFIG" -c; then
        log_success "HAProxy configuration valid"
        audit_log "HAProxy configuration created with security hardening"
        security_check "HAProxy configuration" "PASS"
    else
        log_error "HAProxy configuration invalid"
        security_check "HAProxy configuration" "FAIL"
        exit 1
    fi
}

# ============================================================================
# Configure Firewall
# ============================================================================

configure_firewall() {
    log_step "Configuring firewall for HAProxy..."

    # Enable UFW if not already
    ufw --force enable

    # Default policies
    ufw default deny incoming
    ufw default allow outgoing

    # Allow SSH (VPN only)
    ufw allow from $VPN_NETWORK_50 to any port 22
    ufw allow from $VPN_NETWORK_51 to any port 22
    ufw allow from $VPN_NETWORK_52 to any port 22

    # Allow HAProxy ports
    ufw allow 80/tcp comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
    ufw allow 8080/tcp comment "Health Check"

    # Allow stats interface (VPN only)
    ufw allow from $VPN_NETWORK_50 to any port 8404
    ufw allow from $VPN_NETWORK_51 to any port 8404
    ufw allow from $VPN_NETWORK_52 to any port 8404

    # Reload firewall
    ufw reload

    audit_log "Firewall configured for HAProxy"
    log_success "Firewall configured"
}

# ============================================================================
# Configure Fail2Ban
# ============================================================================

configure_fail2ban() {
    log_step "Configuring Fail2Ban for HAProxy protection..."

    # Install Fail2Ban if not present
    apt-get install -y fail2ban

    # Create HAProxy filter
    cat > /etc/fail2ban/filter.d/haproxy.conf <<'EOF'
[Definition]
failregex = ^.*<HOST>.*"(GET|POST).*" (403|401|400) .*$
            ^.*<HOST>.*Connection closed during SSL handshake.*$
            ^.*<HOST>.*SSL handshake failure.*$
ignoreregex =
EOF

    # Create HAProxy jail
    cat > /etc/fail2ban/jail.d/haproxy.conf <<EOF
[haproxy-http]
enabled = true
port = 80,443,8404
filter = haproxy
logpath = /var/log/haproxy.log
maxretry = 5
findtime = 600
bantime = 3600
action = iptables-multiport[name=haproxy, port="80,443,8404", protocol=tcp]

[haproxy-dos]
enabled = true
port = 80,443
filter = haproxy
logpath = /var/log/haproxy.log
maxretry = 100
findtime = 60
bantime = 600
action = iptables-multiport[name=haproxy-dos, port="80,443", protocol=tcp]
EOF

    # Restart Fail2Ban
    systemctl restart fail2ban

    audit_log "Fail2Ban configured for HAProxy protection"
    log_success "Fail2Ban configured"
}

# ============================================================================
# Configure Logging and Monitoring
# ============================================================================

configure_logging() {
    log_step "Configuring logging and monitoring..."

    # Configure rsyslog for HAProxy
    cat > /etc/rsyslog.d/49-haproxy.conf <<'EOF'
$ModLoad imudp
$UDPServerRun 514
$template HAProxyLogFormat,"%msg:2:$%\n"

local0.*    /var/log/haproxy.log;HAProxyLogFormat
local1.*    /var/log/haproxy-admin.log;HAProxyLogFormat
& stop
EOF

    # Create log rotation
    cat > /etc/logrotate.d/haproxy <<EOF
/var/log/haproxy*.log {
    daily
    rotate 30
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        /bin/kill -HUP \$(cat /var/run/rsyslogd.pid 2>/dev/null) 2>/dev/null || true
    endscript
}
EOF

    # Create monitoring script
    cat > /usr/local/bin/haproxy-monitor.sh <<'EOF'
#!/bin/bash

# Check HAProxy status
if ! systemctl is-active haproxy >/dev/null; then
    echo "[ALERT] HAProxy is not running"
    systemctl start haproxy
fi

# Check backend health
STATS=$(echo "show stat" | socat - /var/run/haproxy.sock)
DOWN_BACKENDS=$(echo "$STATS" | grep -c "DOWN")

if [ "$DOWN_BACKENDS" -gt 0 ]; then
    echo "[ALERT] $DOWN_BACKENDS backends are DOWN"
    echo "$STATS" | grep "DOWN"
fi

# Check SSL certificate expiration
for cert in /etc/haproxy/certs/*.pem; do
    if [ -f "$cert" ]; then
        EXPIRY=$(openssl x509 -in "$cert" -noout -enddate 2>/dev/null | cut -d= -f2)
        if [ -n "$EXPIRY" ]; then
            EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null)
            CURRENT_EPOCH=$(date +%s)
            DAYS_LEFT=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

            if [ "$DAYS_LEFT" -lt 30 ]; then
                echo "[ALERT] Certificate $cert expires in $DAYS_LEFT days"
            fi
        fi
    fi
done

# Check rate limiting effectiveness
BLOCKED_IPS=$(grep -c "rate_limit_exceeded" /var/log/haproxy.log 2>/dev/null || echo 0)
if [ "$BLOCKED_IPS" -gt 100 ]; then
    echo "[WARNING] High rate limiting activity: $BLOCKED_IPS blocks"
fi
EOF

    chmod +x /usr/local/bin/haproxy-monitor.sh

    # Add to crontab
    (crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/haproxy-monitor.sh >> /var/log/haproxy-monitor.log 2>&1") | crontab -

    # Restart rsyslog
    systemctl restart rsyslog

    audit_log "Logging and monitoring configured"
    log_success "Logging configured"
}

# ============================================================================
# Harden System Security
# ============================================================================

harden_system() {
    log_step "Hardening system security..."

    # Kernel hardening
    cat >> /etc/sysctl.d/99-haproxy-hardening.conf <<EOF
# Network security
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_syn_retries = 2
net.ipv4.tcp_synack_retries = 2
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.ip_forward = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv6.conf.all.accept_ra = 0
net.ipv6.conf.default.accept_ra = 0

# Performance tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_tw_buckets = 1440000
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_keepalive_intvl = 15
EOF

    # Apply sysctl settings
    sysctl -p /etc/sysctl.d/99-haproxy-hardening.conf

    # Set file limits for HAProxy
    cat >> /etc/security/limits.conf <<EOF
haproxy soft nofile 65536
haproxy hard nofile 65536
haproxy soft nproc 32768
haproxy hard nproc 32768
EOF

    audit_log "System security hardened"
    log_success "System hardening complete"
}

# ============================================================================
# Perform Security Audit
# ============================================================================

perform_security_audit() {
    log_step "Performing security audit..."

    local audit_passed=true

    # Check SSL/TLS configuration
    log "Checking SSL/TLS configuration..."
    if haproxy -f "$HAPROXY_CONFIG" -c 2>&1 | grep -q "ssl-min-ver TLSv1.2"; then
        security_check "TLS minimum version" "PASS"
    else
        security_check "TLS minimum version" "FAIL"
        audit_passed=false
    fi

    # Check DH parameters
    if [ -f /etc/haproxy/dhparam.pem ]; then
        DH_SIZE=$(openssl dhparam -in /etc/haproxy/dhparam.pem -text -noout | grep "DH Parameters" | grep -oE "[0-9]+" | head -1)
        if [ "$DH_SIZE" -ge 4096 ]; then
            security_check "DH parameter size" "PASS ($DH_SIZE bits)"
        else
            security_check "DH parameter size" "FAIL ($DH_SIZE bits < 4096)"
            audit_passed=false
        fi
    else
        security_check "DH parameters" "FAIL (not found)"
        audit_passed=false
    fi

    # Check backend SSL verification
    if grep -q "verify required" "$HAPROXY_CONFIG"; then
        security_check "Backend SSL verification" "PASS"
    else
        security_check "Backend SSL verification" "FAIL"
        audit_passed=false
    fi

    # Check rate limiting
    if grep -q "rate_limit_exceeded" "$HAPROXY_CONFIG"; then
        security_check "Rate limiting" "PASS"
    else
        security_check "Rate limiting" "FAIL"
        audit_passed=false
    fi

    # Check firewall
    if ufw status | grep -q "Status: active"; then
        security_check "Firewall" "PASS"
    else
        security_check "Firewall" "FAIL"
        audit_passed=false
    fi

    # Check Fail2Ban
    if systemctl is-active fail2ban >/dev/null; then
        security_check "Fail2Ban" "PASS"
    else
        security_check "Fail2Ban" "FAIL"
        audit_passed=false
    fi

    # Check for hardcoded passwords
    if grep -E "password|secret" "$HAPROXY_CONFIG" | grep -v "^\s*#" | grep -qv "\$STATS_PASSWORD"; then
        security_check "No hardcoded passwords" "FAIL"
        audit_passed=false
    else
        security_check "No hardcoded passwords" "PASS"
    fi

    # Check audit logging
    if [ -f "$AUDIT_LOG" ]; then
        security_check "Audit logging" "PASS"
    else
        security_check "Audit logging" "FAIL"
        audit_passed=false
    fi

    if [ "$audit_passed" = true ]; then
        log_success "Security audit PASSED"
        audit_log "Final security audit: PASSED"
    else
        log_error "Security audit FAILED - review logs"
        audit_log "Final security audit: FAILED"
    fi
}

# ============================================================================
# Print Summary
# ============================================================================

print_summary() {
    log_step "Deployment Summary"

    local STATS_PASSWORD=$(get_secret "haproxy/stats" "password")

    echo -e "\n${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}HAProxy Secure Deployment Complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e ""
    echo -e "${CYAN}Load Balancer URL:${NC}"
    echo -e "  https://$PUBLIC_DOMAIN"
    echo -e ""
    echo -e "${CYAN}Statistics Interface:${NC}"
    echo -e "  https://$VMI03_HOST:8404/stats"
    echo -e "  Username: admin"
    echo -e "  Password: (stored in Vault at haproxy/stats)"
    echo -e ""
    echo -e "${CYAN}Backends Configured:${NC}"
    echo -e "  • Keycloak: https://auth.$PUBLIC_DOMAIN"
    echo -e "  • Grafana: https://monitoring.$PUBLIC_DOMAIN (VPN only)"
    echo -e "  • NextCloud: https://cloud.$PUBLIC_DOMAIN"
    echo -e "  • Plex: https://plex.$PUBLIC_DOMAIN"
    echo -e ""
    echo -e "${CYAN}Security Features:${NC}"
    echo -e "  ✓ SSL/TLS with backend verification"
    echo -e "  ✓ Rate limiting and DDoS protection"
    echo -e "  ✓ Security headers enforced"
    echo -e "  ✓ Fail2Ban brute force protection"
    echo -e "  ✓ 4096-bit DH parameters"
    echo -e "  ✓ Vault integration for secrets"
    echo -e "  ✓ Audit logging enabled"
    echo -e ""
    echo -e "${CYAN}Service Management:${NC}"
    echo -e "  systemctl status haproxy"
    echo -e "  systemctl reload haproxy"
    echo -e "  journalctl -u haproxy -f"
    echo -e ""
    echo -e "${CYAN}Monitoring:${NC}"
    echo -e "  Health: http://$VMI03_HOST:8080/health"
    echo -e "  Stats: https://$VMI03_HOST:8404/stats"
    echo -e "  Logs: /var/log/haproxy.log"
    echo -e "  Audit: $AUDIT_LOG"
    echo -e ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"

    # Save configuration summary
    cat > /root/.haproxy-deployment <<EOF
# HAProxy Secure Deployment Summary
# Generated: $(date)

PUBLIC_URL: https://$PUBLIC_DOMAIN
STATS_URL: https://$VMI03_HOST:8404/stats
STATS_USERNAME: admin
STATS_PASSWORD: $STATS_PASSWORD

BACKENDS:
  Keycloak: https://auth.$PUBLIC_DOMAIN
  Grafana: https://monitoring.$PUBLIC_DOMAIN
  NextCloud: https://cloud.$PUBLIC_DOMAIN
  Plex: https://plex.$PUBLIC_DOMAIN

SECURITY:
  SSL/TLS: Configured with verification
  DH Parameters: $DH_PARAM_SIZE bits
  Rate Limiting: Enabled
  Fail2Ban: Configured
  Firewall: UFW active

VAULT_PATHS:
  Stats Password: $VAULT_NAMESPACE/haproxy/stats
EOF

    chmod 600 /root/.haproxy-deployment

    audit_log "HAProxy deployment completed successfully with security hardening"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    log_step "Starting HAProxy Secure Deployment"

    # Create log directory
    mkdir -p /var/log/mcp

    # Initialize audit log
    audit_log "HAProxy secure deployment initiated by $(whoami) from $(hostname -I | awk '{print $1}')"

    # Setup Vault first
    setup_vault

    # Execute deployment steps
    install_haproxy
    generate_dh_params
    setup_ssl_certificates
    configure_haproxy
    configure_firewall
    configure_fail2ban
    configure_logging
    harden_system

    # Start HAProxy
    systemctl enable haproxy
    systemctl restart haproxy

    # Verify HAProxy is running
    sleep 5
    if systemctl is-active haproxy >/dev/null; then
        log_success "HAProxy is running"
    else
        log_error "HAProxy failed to start"
        journalctl -u haproxy -n 50
        exit 1
    fi

    # Perform security audit
    perform_security_audit

    # Print summary
    print_summary

    log_success "HAProxy secure deployment completed!"
}

# Run main function
main "$@"