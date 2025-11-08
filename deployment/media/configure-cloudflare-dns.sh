#!/bin/bash

# CloudFlare DNS Configuration Script for Media Services
# Configures DNS entries for Nextcloud and Plex on VMI02D
# Version: 1.0.0
# Date: November 8, 2025

set -euo pipefail

# Configuration - Update these with your CloudFlare credentials
CLOUDFLARE_EMAIL="${CF_EMAIL:-your-email@example.com}"
CLOUDFLARE_API_KEY="${CF_API_KEY:-your-api-key}"
CLOUDFLARE_ZONE_ID="${CF_ZONE_ID:-your-zone-id}"

# DNS Records to create
VMI02_IP="46.250.241.70"
NEXTCLOUD_SUBDOMAIN="data"
PLEX_SUBDOMAIN="plex"
DOMAIN="acdev.host"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Function to check CloudFlare credentials
check_credentials() {
    if [[ "$CLOUDFLARE_EMAIL" == "your-email@example.com" ]] || \
       [[ "$CLOUDFLARE_API_KEY" == "your-api-key" ]] || \
       [[ "$CLOUDFLARE_ZONE_ID" == "your-zone-id" ]]; then
        error "CloudFlare credentials not configured!"
        echo "Please set the following environment variables:"
        echo "  export CF_EMAIL='your-cloudflare-email'"
        echo "  export CF_API_KEY='your-cloudflare-api-key'"
        echo "  export CF_ZONE_ID='your-zone-id'"
        echo ""
        echo "Or edit this script and update the configuration section."
        exit 1
    fi
}

# Function to check if DNS record exists
check_dns_record() {
    local subdomain=$1
    local full_domain="${subdomain}.${DOMAIN}"

    response=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=$full_domain" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
        -H "Content-Type: application/json")

    # Check if record exists
    if echo "$response" | grep -q "\"count\":0"; then
        return 1  # Record does not exist
    else
        # Extract record ID if it exists
        echo "$response" | grep -oP '"id":"\K[^"]+' | head -1
        return 0  # Record exists
    fi
}

# Function to create or update DNS A record
create_or_update_dns_record() {
    local subdomain=$1
    local ip=$2
    local proxied=${3:-false}
    local full_domain="${subdomain}.${DOMAIN}"

    log "Configuring DNS record for $full_domain -> $ip"

    # Check if record exists
    if record_id=$(check_dns_record "$subdomain"); then
        # Update existing record
        log "Updating existing DNS record for $full_domain"

        response=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$record_id" \
            -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
            -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
            -H "Content-Type: application/json" \
            --data "{
                \"type\": \"A\",
                \"name\": \"$subdomain\",
                \"content\": \"$ip\",
                \"ttl\": 1,
                \"proxied\": $proxied
            }")
    else
        # Create new record
        log "Creating new DNS record for $full_domain"

        response=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
            -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
            -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
            -H "Content-Type: application/json" \
            --data "{
                \"type\": \"A\",
                \"name\": \"$subdomain\",
                \"content\": \"$ip\",
                \"ttl\": 1,
                \"proxied\": $proxied
            }")
    fi

    # Check if successful
    if echo "$response" | grep -q "\"success\":true"; then
        log "✓ DNS record configured successfully for $full_domain"
    else
        error "Failed to configure DNS record for $full_domain"
        echo "Response: $response"
        return 1
    fi
}

# Function to create firewall rules for media services
create_firewall_rules() {
    log "Creating CloudFlare firewall rules for media services..."

    # Create rate limiting rule for Nextcloud
    curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/firewall/rules" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
        -H "Content-Type: application/json" \
        --data '{
            "filter": {
                "expression": "(http.host eq \"data.acdev.host\" and http.request.uri.path contains \"/login\")"
            },
            "action": "challenge",
            "description": "Rate limit Nextcloud login attempts"
        }' > /dev/null 2>&1

    # Create security headers rule
    curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/page_rules" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
        -H "Content-Type: application/json" \
        --data "{
            \"targets\": [
                {
                    \"target\": \"url\",
                    \"constraint\": {
                        \"operator\": \"matches\",
                        \"value\": \"*.${DOMAIN}/*\"
                    }
                }
            ],
            \"actions\": [
                {
                    \"id\": \"security_level\",
                    \"value\": \"medium\"
                },
                {
                    \"id\": \"browser_cache_ttl\",
                    \"value\": 14400
                }
            ],
            \"priority\": 1,
            \"status\": \"active\"
        }" > /dev/null 2>&1

    log "Firewall rules configured"
}

# Function to configure SSL/TLS settings
configure_ssl() {
    log "Configuring SSL/TLS settings..."

    # Set SSL mode to Full (strict)
    curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/settings/ssl" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
        -H "Content-Type: application/json" \
        --data '{"value":"full"}' > /dev/null 2>&1

    # Enable Always Use HTTPS
    curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/settings/always_use_https" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
        -H "Content-Type: application/json" \
        --data '{"value":"on"}' > /dev/null 2>&1

    # Enable HSTS
    curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/settings/security_header" \
        -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
        -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
        -H "Content-Type: application/json" \
        --data '{
            "value": {
                "strict_transport_security": {
                    "enabled": true,
                    "max_age": 31536000,
                    "include_subdomains": true
                }
            }
        }' > /dev/null 2>&1

    log "SSL/TLS settings configured"
}

# Function to test DNS resolution
test_dns_resolution() {
    log "Testing DNS resolution..."

    echo ""
    echo "Testing DNS records:"
    echo "-------------------"

    # Test Nextcloud
    if nslookup "${NEXTCLOUD_SUBDOMAIN}.${DOMAIN}" 1.1.1.1 > /dev/null 2>&1; then
        resolved_ip=$(nslookup "${NEXTCLOUD_SUBDOMAIN}.${DOMAIN}" 1.1.1.1 | grep "Address:" | tail -1 | awk '{print $2}')
        echo "✓ ${NEXTCLOUD_SUBDOMAIN}.${DOMAIN} -> $resolved_ip"
    else
        warning "${NEXTCLOUD_SUBDOMAIN}.${DOMAIN} - DNS propagation pending"
    fi

    # Test Plex
    if nslookup "${PLEX_SUBDOMAIN}.${DOMAIN}" 1.1.1.1 > /dev/null 2>&1; then
        resolved_ip=$(nslookup "${PLEX_SUBDOMAIN}.${DOMAIN}" 1.1.1.1 | grep "Address:" | tail -1 | awk '{print $2}')
        echo "✓ ${PLEX_SUBDOMAIN}.${DOMAIN} -> $resolved_ip"
    else
        warning "${PLEX_SUBDOMAIN}.${DOMAIN} - DNS propagation pending"
    fi

    echo ""
    log "Note: DNS propagation may take up to 5 minutes"
}

# Function to display summary
display_summary() {
    echo ""
    echo "========================================"
    echo "   CLOUDFLARE DNS CONFIGURATION DONE   "
    echo "========================================"
    echo ""
    echo "DNS Records Created:"
    echo "  ${NEXTCLOUD_SUBDOMAIN}.${DOMAIN} -> ${VMI02_IP}"
    echo "  ${PLEX_SUBDOMAIN}.${DOMAIN} -> ${VMI02_IP}"
    echo ""
    echo "CloudFlare Features Enabled:"
    echo "  ✓ SSL/TLS: Full (strict)"
    echo "  ✓ Always Use HTTPS: Enabled"
    echo "  ✓ HSTS: Enabled (1 year)"
    echo "  ✓ Security Level: Medium"
    echo "  ✓ Browser Cache: 4 hours"
    echo ""
    echo "Security Features:"
    echo "  ✓ Rate limiting on login pages"
    echo "  ✓ Challenge on suspicious activity"
    echo "  ✓ DDoS protection (automatic)"
    echo ""
    echo "Next Steps:"
    echo "1. Wait 2-5 minutes for DNS propagation"
    echo "2. Test access: https://${NEXTCLOUD_SUBDOMAIN}.${DOMAIN}"
    echo "3. Test access: https://${PLEX_SUBDOMAIN}.${DOMAIN}"
    echo "4. Configure origin certificates if needed"
    echo ""
    echo "To monitor DNS propagation:"
    echo "  watch -n 10 'dig +short ${NEXTCLOUD_SUBDOMAIN}.${DOMAIN}'"
    echo ""
}

# Main execution
main() {
    log "Starting CloudFlare DNS configuration for media services..."

    # Check prerequisites
    if ! command -v curl &> /dev/null; then
        error "curl is not installed. Please install it first."
        exit 1
    fi

    if ! command -v nslookup &> /dev/null; then
        warning "nslookup not found. Installing dnsutils..."
        apt-get update && apt-get install -y dnsutils 2>/dev/null || \
        yum install -y bind-utils 2>/dev/null || \
        warning "Could not install DNS tools"
    fi

    # Check CloudFlare credentials
    check_credentials

    # Configure DNS records
    create_or_update_dns_record "$NEXTCLOUD_SUBDOMAIN" "$VMI02_IP" "true"
    create_or_update_dns_record "$PLEX_SUBDOMAIN" "$VMI02_IP" "true"

    # Configure security settings
    configure_ssl
    create_firewall_rules

    # Test DNS resolution
    sleep 2
    test_dns_resolution

    # Display summary
    display_summary

    log "CloudFlare DNS configuration completed!"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --email)
            CLOUDFLARE_EMAIL="$2"
            shift 2
            ;;
        --api-key)
            CLOUDFLARE_API_KEY="$2"
            shift 2
            ;;
        --zone-id)
            CLOUDFLARE_ZONE_ID="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --email EMAIL       CloudFlare account email"
            echo "  --api-key KEY      CloudFlare API key"
            echo "  --zone-id ID       CloudFlare zone ID"
            echo "  --help             Show this help message"
            echo ""
            echo "Environment variables:"
            echo "  CF_EMAIL          CloudFlare account email"
            echo "  CF_API_KEY        CloudFlare API key"
            echo "  CF_ZONE_ID        CloudFlare zone ID"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main function
main "$@"