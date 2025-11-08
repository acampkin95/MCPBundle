#!/bin/bash
#==============================================================================
# NextCloud Production Deployment Script for VMI02D
#==============================================================================
# Purpose: Deploy NextCloud with PostgreSQL, Nginx, PHP-FPM, SSL, and Keycloak SSO
# Target: VMI02D (46.250.241.70)
# Database: VMI01 (46.250.243.123)
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
readonly NEXTCLOUD_VERSION="28.0.2"
readonly NEXTCLOUD_DOMAIN="nextcloud.vmi02d.local"
readonly NEXTCLOUD_DIR="/var/www/nextcloud"
readonly NEXTCLOUD_DATA_DIR="/nextcloud"
readonly PLEX_INGEST_DIR="/nextcloud/plex-ingest"

# PostgreSQL Configuration (VMI01)
readonly DB_HOST="46.250.243.123"
readonly DB_PORT="5432"
readonly DB_NAME="nextcloud"
readonly DB_USER="nextcloud_user"
readonly DB_PASSWORD="$(openssl rand -base64 32)"

# Admin Configuration
readonly NC_ADMIN_USER="admin"
readonly NC_ADMIN_PASS="$(openssl rand -base64 24)"

# Keycloak Configuration (VMI03)
readonly KEYCLOAK_URL="https://154.26.158.31:8443"
readonly KEYCLOAK_REALM="mcp-ecosystem"

# Email Configuration
readonly MAIL_DOMAIN="vmi02d.local"

# PHP Configuration
readonly PHP_VERSION="8.3"
readonly PHP_MEMORY_LIMIT="512M"
readonly PHP_UPLOAD_MAX_FILESIZE="10G"
readonly PHP_MAX_EXECUTION_TIME="3600"

# Storage Quotas
readonly DEFAULT_QUOTA="100GB"
readonly PLEX_USER_QUOTA="unlimited"

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
    if [[ "$ID" != "ubuntu" ]] || [[ "${VERSION_ID}" != "24.04" ]]; then
        log_warning "This script is designed for Ubuntu 24.04. Detected: $ID $VERSION_ID"
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

    if ! nc -z -w 5 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
        error_exit "Cannot reach PostgreSQL server at $DB_HOST:$DB_PORT"
    fi

    log_success "Network connectivity verified"
}

check_disk_space() {
    log_info "Checking disk space..."

    local available_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')

    if [[ $available_gb -lt 50 ]]; then
        error_exit "Insufficient disk space. Need at least 50GB, have ${available_gb}GB"
    fi

    log_success "Disk space sufficient: ${available_gb}GB available"
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
        nginx \
        postgresql-client \
        php${PHP_VERSION}-fpm \
        php${PHP_VERSION}-gd \
        php${PHP_VERSION}-mysql \
        php${PHP_VERSION}-curl \
        php${PHP_VERSION}-mbstring \
        php${PHP_VERSION}-intl \
        php${PHP_VERSION}-gmp \
        php${PHP_VERSION}-bcmath \
        php${PHP_VERSION}-xml \
        php${PHP_VERSION}-imagick \
        php${PHP_VERSION}-zip \
        php${PHP_VERSION}-pgsql \
        php${PHP_VERSION}-apcu \
        php${PHP_VERSION}-redis \
        php${PHP_VERSION}-ldap \
        redis-server \
        unzip \
        wget \
        curl \
        certbot \
        python3-certbot-nginx \
        jq \
        netcat-openbsd

    log_success "Prerequisites installed"
}

configure_php() {
    log_section "Configuring PHP ${PHP_VERSION}..."

    local php_ini="/etc/php/${PHP_VERSION}/fpm/php.ini"
    local pool_conf="/etc/php/${PHP_VERSION}/fpm/pool.d/www.conf"

    # Backup original configuration
    cp "$php_ini" "${php_ini}.backup"

    # Configure PHP settings
    log_info "Updating PHP configuration..."
    sed -i "s/memory_limit = .*/memory_limit = ${PHP_MEMORY_LIMIT}/" "$php_ini"
    sed -i "s/upload_max_filesize = .*/upload_max_filesize = ${PHP_UPLOAD_MAX_FILESIZE}/" "$php_ini"
    sed -i "s/post_max_size = .*/post_max_size = ${PHP_UPLOAD_MAX_FILESIZE}/" "$php_ini"
    sed -i "s/max_execution_time = .*/max_execution_time = ${PHP_MAX_EXECUTION_TIME}/" "$php_ini"
    sed -i "s/max_input_time = .*/max_input_time = ${PHP_MAX_EXECUTION_TIME}/" "$php_ini"
    sed -i "s/;date.timezone.*/date.timezone = UTC/" "$php_ini"
    sed -i "s/;opcache.enable=.*/opcache.enable=1/" "$php_ini"
    sed -i "s/;opcache.memory_consumption=.*/opcache.memory_consumption=128/" "$php_ini"
    sed -i "s/;opcache.interned_strings_buffer=.*/opcache.interned_strings_buffer=16/" "$php_ini"
    sed -i "s/;opcache.max_accelerated_files=.*/opcache.max_accelerated_files=10000/" "$php_ini"
    sed -i "s/;opcache.revalidate_freq=.*/opcache.revalidate_freq=1/" "$php_ini"
    sed -i "s/;opcache.save_comments=.*/opcache.save_comments=1/" "$php_ini"

    # Configure PHP-FPM pool
    sed -i "s/pm.max_children = .*/pm.max_children = 120/" "$pool_conf"
    sed -i "s/pm.start_servers = .*/pm.start_servers = 12/" "$pool_conf"
    sed -i "s/pm.min_spare_servers = .*/pm.min_spare_servers = 6/" "$pool_conf"
    sed -i "s/pm.max_spare_servers = .*/pm.max_spare_servers = 18/" "$pool_conf"

    # Restart PHP-FPM
    systemctl restart php${PHP_VERSION}-fpm
    systemctl enable php${PHP_VERSION}-fpm

    log_success "PHP configured and restarted"
}

create_database() {
    log_section "Creating PostgreSQL database..."

    # Check if database exists
    if PGPASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=" \
       psql -h "$DB_HOST" -U mcp_admin -d postgres -tAc \
       "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
        log_warning "Database '$DB_NAME' already exists, skipping creation"
    else
        log_info "Creating database '$DB_NAME'..."
        PGPASSWORD="TeBsn4f2cS0O7vfdvYFTb37L6SdJFL+mpOgksTwgHy0=" \
        psql -h "$DB_HOST" -U mcp_admin -d postgres <<EOF
CREATE DATABASE ${DB_NAME};
CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};
ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};
EOF
        log_success "Database created"
    fi

    # Save credentials
    local creds_file="/root/nextcloud-db-credentials.txt"
    cat > "$creds_file" <<EOF
NextCloud Database Credentials
=============================
Database Host: ${DB_HOST}
Database Port: ${DB_PORT}
Database Name: ${DB_NAME}
Database User: ${DB_USER}
Database Password: ${DB_PASSWORD}

Connection String:
postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

Admin Credentials:
==================
Username: ${NC_ADMIN_USER}
Password: ${NC_ADMIN_PASS}
EOF
    chmod 600 "$creds_file"
    log_success "Credentials saved to $creds_file"
}

download_nextcloud() {
    log_section "Downloading NextCloud ${NEXTCLOUD_VERSION}..."

    local tmp_dir="/tmp/nextcloud-install"
    mkdir -p "$tmp_dir"
    cd "$tmp_dir"

    # Download NextCloud
    log_info "Downloading NextCloud archive..."
    wget -q --show-progress \
        "https://download.nextcloud.com/server/releases/nextcloud-${NEXTCLOUD_VERSION}.zip"

    # Verify checksum (optional but recommended)
    log_info "Downloading checksum..."
    wget -q "https://download.nextcloud.com/server/releases/nextcloud-${NEXTCLOUD_VERSION}.zip.sha256"

    if sha256sum -c "nextcloud-${NEXTCLOUD_VERSION}.zip.sha256" --status; then
        log_success "Checksum verified"
    else
        error_exit "Checksum verification failed"
    fi

    # Extract NextCloud
    log_info "Extracting NextCloud..."
    unzip -q "nextcloud-${NEXTCLOUD_VERSION}.zip"

    # Move to web directory
    log_info "Installing to ${NEXTCLOUD_DIR}..."
    if [[ -d "$NEXTCLOUD_DIR" ]]; then
        log_warning "Backing up existing installation..."
        mv "$NEXTCLOUD_DIR" "${NEXTCLOUD_DIR}.backup.$(date +%Y%m%d-%H%M%S)"
    fi

    mv nextcloud "$NEXTCLOUD_DIR"

    # Create data directory
    log_info "Creating data directories..."
    mkdir -p "$NEXTCLOUD_DATA_DIR"
    mkdir -p "$PLEX_INGEST_DIR"

    # Set permissions
    log_info "Setting permissions..."
    chown -R www-data:www-data "$NEXTCLOUD_DIR"
    chown -R www-data:www-data "$NEXTCLOUD_DATA_DIR"
    chmod -R 755 "$NEXTCLOUD_DIR"
    chmod 777 "$PLEX_INGEST_DIR"  # Full permissions for Plex ingest

    # Cleanup
    cd /
    rm -rf "$tmp_dir"

    log_success "NextCloud installed to ${NEXTCLOUD_DIR}"
}

configure_nginx() {
    log_section "Configuring Nginx..."

    # Create Nginx configuration
    cat > /etc/nginx/sites-available/nextcloud <<'EOF'
upstream php-handler {
    server unix:/run/php/php8.3-fpm.sock;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name _;

    # ACME challenge for Let's Encrypt
    location ^~ /.well-known/acme-challenge {
        default_type text/plain;
        root /var/www/nextcloud;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name _;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/nextcloud.vmi02d.local/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nextcloud.vmi02d.local/privkey.pem;

    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;

    # Add headers
    add_header Strict-Transport-Security "max-age=15768000; includeSubDomains" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Remove X-Powered-By
    fastcgi_hide_header X-Powered-By;

    # Path to NextCloud
    root /var/www/nextcloud;

    # Client body size (for large file uploads)
    client_max_body_size 10G;
    client_body_timeout 300s;
    fastcgi_buffers 64 4K;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_comp_level 4;
    gzip_min_length 256;
    gzip_proxied expired no-cache no-store private no_last_modified no_etag auth;
    gzip_types application/atom+xml application/javascript application/json application/ld+json application/manifest+json application/rss+xml application/vnd.geo+json application/vnd.ms-fontobject application/x-font-ttf application/x-web-app-manifest+json application/xhtml+xml application/xml font/opentype image/bmp image/svg+xml image/x-icon text/cache-manifest text/css text/plain text/vcard text/vnd.rim.location.xloc text/vtt text/x-component text/x-cross-domain-policy;

    # Index
    index index.php index.html /index.php$request_uri;

    # Default charset
    charset utf-8;

    location = /robots.txt {
        allow all;
        log_not_found off;
        access_log off;
    }

    location ^~ /.well-known {
        location = /.well-known/carddav { return 301 /remote.php/dav/; }
        location = /.well-known/caldav  { return 301 /remote.php/dav/; }
        location = /.well-known/webfinger { return 301 /index.php/.well-known/webfinger; }
        location = /.well-known/nodeinfo { return 301 /index.php/.well-known/nodeinfo; }

        location /.well-known/acme-challenge    { try_files $uri $uri/ =404; }
        location /.well-known/pki-validation    { try_files $uri $uri/ =404; }

        return 301 /index.php$request_uri;
    }

    location ~ ^/(?:build|tests|config|lib|3rdparty|templates|data)(?:$|/)  { return 404; }
    location ~ ^/(?:\.|autotest|occ|issue|indie|db_|console)                { return 404; }

    location ~ \.php(?:$|/) {
        rewrite ^/(?!index|remote|public|cron|core\/ajax\/update|status|ocs\/v[12]|updater\/.+|oc[ms]-provider\/.+|.+\/richdocumentscode\/proxy) /index.php$request_uri;

        fastcgi_split_path_info ^(.+?\.php)(/.*)$;
        set $path_info $fastcgi_path_info;

        try_files $fastcgi_script_name =404;

        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param PATH_INFO $path_info;
        fastcgi_param HTTPS on;

        fastcgi_param modHeadersAvailable true;
        fastcgi_param front_controller_active true;
        fastcgi_pass php-handler;

        fastcgi_intercept_errors on;
        fastcgi_request_buffering off;

        fastcgi_max_temp_file_size 0;

        fastcgi_read_timeout 3600;
        fastcgi_send_timeout 3600;
    }

    location ~ \.(?:css|js|svg|gif|png|jpg|ico|wasm|tflite|map)$ {
        try_files $uri /index.php$request_uri;
        add_header Cache-Control "public, max-age=15778463, immutable";
        access_log off;
    }

    location ~ \.woff2?$ {
        try_files $uri /index.php$request_uri;
        expires 7d;
        access_log off;
    }

    location /remote {
        return 301 /remote.php$request_uri;
    }

    location / {
        try_files $uri $uri/ /index.php$request_uri;
    }
}
EOF

    # Enable site
    ln -sf /etc/nginx/sites-available/nextcloud /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    # Test Nginx configuration
    if nginx -t; then
        log_success "Nginx configuration valid"
        systemctl restart nginx
        systemctl enable nginx
    else
        error_exit "Nginx configuration test failed"
    fi
}

configure_ssl() {
    log_section "Configuring SSL with Let's Encrypt..."

    # Note: This is a placeholder for self-signed cert since Let's Encrypt requires a valid domain
    log_info "Creating self-signed certificate for internal use..."

    mkdir -p /etc/letsencrypt/live/nextcloud.vmi02d.local

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout /etc/letsencrypt/live/nextcloud.vmi02d.local/privkey.pem \
        -out /etc/letsencrypt/live/nextcloud.vmi02d.local/fullchain.pem \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=${NEXTCLOUD_DOMAIN}"

    log_success "Self-signed certificate created"
    log_info "For production, run: certbot --nginx -d your-domain.com"
}

install_nextcloud() {
    log_section "Installing NextCloud via occ..."

    # Run NextCloud installation
    log_info "Running automated setup..."

    sudo -u www-data php ${NEXTCLOUD_DIR}/occ maintenance:install \
        --database="pgsql" \
        --database-host="${DB_HOST}:${DB_PORT}" \
        --database-name="${DB_NAME}" \
        --database-user="${DB_USER}" \
        --database-pass="${DB_PASSWORD}" \
        --admin-user="${NC_ADMIN_USER}" \
        --admin-pass="${NC_ADMIN_PASS}" \
        --data-dir="${NEXTCLOUD_DATA_DIR}"

    log_success "NextCloud installed"

    # Configure trusted domains
    log_info "Configuring trusted domains..."
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ config:system:set trusted_domains 0 --value="46.250.241.70"
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ config:system:set trusted_domains 1 --value="${NEXTCLOUD_DOMAIN}"

    # Configure database
    log_info "Optimizing database settings..."
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ db:add-missing-indices
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ db:add-missing-columns
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ db:add-missing-primary-keys

    # Configure caching
    log_info "Configuring Redis cache..."
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ config:system:set memcache.local --value="\\OC\\Memcache\\APCu"
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ config:system:set memcache.distributed --value="\\OC\\Memcache\\Redis"
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ config:system:set memcache.locking --value="\\OC\\Memcache\\Redis"
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ config:system:set redis host --value="localhost"
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ config:system:set redis port --value="6379"

    # Configure default quota
    log_info "Setting default quota..."
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ config:app:set files default_quota --value="${DEFAULT_QUOTA}"

    # Set up background jobs
    log_info "Configuring background jobs..."
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ background:cron

    log_success "NextCloud configuration completed"
}

configure_cron() {
    log_section "Configuring cron jobs..."

    # Add cron job for www-data
    (crontab -u www-data -l 2>/dev/null; echo "*/5 * * * * php -f ${NEXTCLOUD_DIR}/cron.php") | crontab -u www-data -

    log_success "Cron jobs configured"
}

enable_apps() {
    log_section "Enabling NextCloud apps..."

    local apps=(
        "files_external"
        "files_sharing"
        "files_versions"
        "files_trashbin"
        "user_ldap"
        "user_oidc"
    )

    for app in "${apps[@]}"; do
        log_info "Enabling app: $app"
        sudo -u www-data php ${NEXTCLOUD_DIR}/occ app:enable "$app" || log_warning "Could not enable $app"
    done

    log_success "Apps enabled"
}

configure_keycloak_sso() {
    log_section "Configuring Keycloak SSO (OIDC)..."

    log_info "Installing OIDC app..."
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ app:install user_oidc || log_warning "OIDC app may already be installed"
    sudo -u www-data php ${NEXTCLOUD_DIR}/occ app:enable user_oidc

    log_info "OIDC app enabled - Manual configuration required:"
    log_info "1. Go to Settings > Administration > OIDC"
    log_info "2. Add provider:"
    log_info "   - Identifier: keycloak"
    log_info "   - Client ID: nextcloud"
    log_info "   - Client Secret: (from Keycloak)"
    log_info "   - Discovery URL: ${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/.well-known/openid-configuration"

    log_success "OIDC configuration template ready"
}

create_systemd_service() {
    log_section "Creating systemd service for NextCloud..."

    # Create service file for background jobs (alternative to cron)
    cat > /etc/systemd/system/nextcloud-cron.service <<EOF
[Unit]
Description=NextCloud Cron Job
After=network.target

[Service]
User=www-data
Group=www-data
Type=oneshot
ExecStart=/usr/bin/php -f ${NEXTCLOUD_DIR}/cron.php
EOF

    cat > /etc/systemd/system/nextcloud-cron.timer <<EOF
[Unit]
Description=NextCloud Cron Timer

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min
Unit=nextcloud-cron.service

[Install]
WantedBy=timers.target
EOF

    systemctl daemon-reload
    systemctl enable nextcloud-cron.timer
    systemctl start nextcloud-cron.timer

    log_success "Systemd services created and enabled"
}

verify_installation() {
    log_section "Verifying installation..."

    local checks_passed=0
    local checks_total=8

    # Check 1: Nginx running
    if systemctl is-active --quiet nginx; then
        log_success "Nginx is running"
        ((checks_passed++))
    else
        log_error "Nginx is not running"
    fi

    # Check 2: PHP-FPM running
    if systemctl is-active --quiet php${PHP_VERSION}-fpm; then
        log_success "PHP-FPM is running"
        ((checks_passed++))
    else
        log_error "PHP-FPM is not running"
    fi

    # Check 3: Database connectivity
    if PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" &>/dev/null; then
        log_success "Database connection successful"
        ((checks_passed++))
    else
        log_error "Cannot connect to database"
    fi

    # Check 4: NextCloud directory exists
    if [[ -d "$NEXTCLOUD_DIR" ]]; then
        log_success "NextCloud directory exists"
        ((checks_passed++))
    else
        log_error "NextCloud directory not found"
    fi

    # Check 5: Data directory exists
    if [[ -d "$NEXTCLOUD_DATA_DIR" ]]; then
        log_success "Data directory exists"
        ((checks_passed++))
    else
        log_error "Data directory not found"
    fi

    # Check 6: Plex ingest directory exists
    if [[ -d "$PLEX_INGEST_DIR" ]]; then
        log_success "Plex ingest directory exists"
        ((checks_passed++))
    else
        log_error "Plex ingest directory not found"
    fi

    # Check 7: Web server responding
    if curl -ks https://localhost/ | grep -q "nextcloud"; then
        log_success "Web server responding"
        ((checks_passed++))
    else
        log_warning "Web server may not be responding correctly"
    fi

    # Check 8: Cron timer active
    if systemctl is-active --quiet nextcloud-cron.timer; then
        log_success "Cron timer is active"
        ((checks_passed++))
    else
        log_error "Cron timer is not active"
    fi

    echo
    log_info "Verification: ${checks_passed}/${checks_total} checks passed"

    if [[ $checks_passed -eq $checks_total ]]; then
        log_success "All verification checks passed!"
        return 0
    else
        log_warning "Some verification checks failed"
        return 1
    fi
}

print_summary() {
    log_section "Deployment Summary"

    cat <<EOF

${GREEN}NextCloud has been successfully deployed!${NC}

${BOLD}Access Information:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Web Interface:     https://46.250.241.70/
Admin Username:    ${NC_ADMIN_USER}
Admin Password:    ${NC_ADMIN_PASS}

${BOLD}Database Information:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Host:              ${DB_HOST}
Database:          ${DB_NAME}
User:              ${DB_USER}
Password:          ${DB_PASSWORD}

${BOLD}Directory Information:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Installation:      ${NEXTCLOUD_DIR}
Data Directory:    ${NEXTCLOUD_DATA_DIR}
Plex Ingest:       ${PLEX_INGEST_DIR}

${BOLD}Credentials File:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Location:          /root/nextcloud-db-credentials.txt

${BOLD}Next Steps:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Access web interface and complete setup wizard
2. Configure Keycloak SSO in Settings > OIDC
3. Create Plex user account with unlimited quota
4. Test file upload to ${PLEX_INGEST_DIR}
5. Run deploy-plex.sh for Plex Media Server
6. Run deploy-transcoding.sh for automated transcoding

${BOLD}Maintenance Commands:${NC}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Update NextCloud:  sudo -u www-data php ${NEXTCLOUD_DIR}/occ upgrade
Check Status:      sudo -u www-data php ${NEXTCLOUD_DIR}/occ status
List Users:        sudo -u www-data php ${NEXTCLOUD_DIR}/occ user:list
Add User:          sudo -u www-data php ${NEXTCLOUD_DIR}/occ user:add username

EOF
}

#==============================================================================
# MAIN EXECUTION
#==============================================================================
main() {
    log_section "NextCloud Production Deployment v${SCRIPT_VERSION}"

    # Pre-flight checks
    check_root
    check_os
    check_network
    check_disk_space

    # Installation steps
    install_prerequisites
    configure_php
    create_database
    download_nextcloud
    configure_nginx
    configure_ssl
    install_nextcloud
    configure_cron
    enable_apps
    configure_keycloak_sso
    create_systemd_service

    # Verification
    verify_installation

    # Summary
    print_summary

    log_success "NextCloud deployment completed successfully!"
}

# Run main function
main "$@"
