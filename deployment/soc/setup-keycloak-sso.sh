#!/bin/bash
#
# SOC Keycloak SSO Integration Setup
# Configures all SOC components to use Keycloak SSO
#

set -e

echo "=== SOC Keycloak SSO Integration Setup ==="
echo ""

KEYCLOAK_URL="https://acdev.host:8443"
KEYCLOAK_REALM="mcp-agents"
SOC_HOST="soc.acdev.host"

# Check if running on VMI03
if [[ $(hostname) != *"vmi03"* ]]; then
    echo "Error: This script must run on VMI03 (soc.acdev.host)"
    exit 1
fi

echo "Prerequisites:"
echo "1. Keycloak admin access at $KEYCLOAK_URL/admin/"
echo "2. Create the following clients in Keycloak realm '$KEYCLOAK_REALM':"
echo "   - grafana (Confidential)"
echo "   - thehive (Confidential)"
echo "   - elasticsearch (Confidential)"
echo "   - prometheus (Confidential)"
echo ""
read -p "Have you created these clients? (y/n): " CLIENTS_CREATED

if [[ "$CLIENTS_CREATED" != "y" ]]; then
    echo "Please create Keycloak clients first. Exiting."
    exit 1
fi

# Function to prompt for client secrets
get_client_secret() {
    local client=$1
    read -sp "Enter client secret for '$client': " secret
    echo "$secret"
}

echo ""
echo "=== Collecting Client Secrets ==="
GRAFANA_SECRET=$(get_client_secret "grafana")
echo ""
THEHIVE_SECRET=$(get_client_secret "thehive")
echo ""
ELASTICSEARCH_SECRET=$(get_client_secret "elasticsearch")
echo ""
PROMETHEUS_SECRET=$(get_client_secret "prometheus")
echo ""

echo "=== 1. Configuring Grafana OAuth ==="
cat >> /etc/grafana/grafana.ini << EOF

[auth.generic_oauth]
enabled = true
name = Keycloak
allow_sign_up = true
client_id = grafana
client_secret = $GRAFANA_SECRET
scopes = openid email profile
auth_url = $KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/auth
token_url = $KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/token
api_url = $KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/userinfo
role_attribute_path = contains(roles[*], 'admin') && 'Admin' || contains(roles[*], 'editor') && 'Editor' || 'Viewer'
EOF

systemctl restart grafana-server
echo "✅ Grafana configured for Keycloak SSO"

echo ""
echo "=== 2. Configuring TheHive OAuth ==="
cat > /opt/thehive/oauth.conf << EOF
auth {
  providers: [
    {name: session}
    {name: basic, realm: thehive}
    {name: local}
    {name: key}
    {
      name: oauth2
      clientId: thehive
      clientSecret: "$THEHIVE_SECRET"
      redirectUri: "http://$SOC_HOST:9000/api/ssoLogin"
      responseType: "code"
      grantType: "authorization_code"
      authorizationUrl: "$KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/auth"
      tokenUrl: "$KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/token"
      userUrl: "$KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/userinfo"
      scope: ["openid", "email", "profile"]
      userOrganisation: "acdev"
    }
  ]
}
EOF

# Append to main config
echo 'include "/opt/thehive/oauth.conf"' >> /opt/thehive/application.conf

cd /opt/thehive && docker-compose restart thehive
echo "✅ TheHive configured for Keycloak SSO"

echo ""
echo "=== 3. Installing oauth2-proxy for Prometheus ==="
if ! command -v oauth2-proxy &> /dev/null; then
    wget -q https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.5.1/oauth2-proxy-v7.5.1.linux-amd64.tar.gz
    tar -xzf oauth2-proxy-v7.5.1.linux-amd64.tar.gz
    mv oauth2-proxy-v7.5.1.linux-amd64/oauth2-proxy /usr/local/bin/
    rm -rf oauth2-proxy-v7.5.1*
fi

# Generate cookie secret
COOKIE_SECRET=$(openssl rand -base64 32 | tr -d '\n')

cat > /etc/oauth2-proxy-prometheus.cfg << EOF
provider = "keycloak-oidc"
client_id = "prometheus"
client_secret = "$PROMETHEUS_SECRET"
redirect_url = "http://$SOC_HOST:9091/oauth2/callback"
oidc_issuer_url = "$KEYCLOAK_URL/realms/$KEYCLOAK_REALM"
email_domains = ["*"]
cookie_secret = "$COOKIE_SECRET"
cookie_secure = false
upstreams = ["http://127.0.0.1:9090"]
http_address = "0.0.0.0:9091"
skip_provider_button = false
EOF

# Create systemd service for oauth2-proxy
cat > /etc/systemd/system/oauth2-proxy-prometheus.service << 'EOF'
[Unit]
Description=OAuth2 Proxy for Prometheus
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/oauth2-proxy --config /etc/oauth2-proxy-prometheus.cfg
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable oauth2-proxy-prometheus
systemctl start oauth2-proxy-prometheus

echo "✅ oauth2-proxy configured for Prometheus"

echo ""
echo "=== 4. Updating Nginx Configuration ==="
cat > /etc/nginx/sites-available/soc-keycloak << 'EOF'
# Prometheus with OAuth2 Proxy
server {
    listen 9091;
    server_name soc.acdev.host 154.26.158.31;

    location / {
        proxy_pass http://127.0.0.1:9091;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/soc-keycloak /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo "✅ Nginx configured"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "✅ Services now using Keycloak SSO:"
echo "   - Grafana: http://soc.acdev.host:3000"
echo "   - TheHive: http://soc.acdev.host:9000 (SSO Login button)"
echo "   - Prometheus: http://soc.acdev.host:9091 (via oauth2-proxy)"
echo ""
echo "⚠️  Still using local auth:"
echo "   - Elasticsearch: http://soc.acdev.host:9200 (no auth)"
echo "   - Wazuh: https://soc.acdev.host:55000 (local users)"
echo ""
echo "📝 Next Steps:"
echo "1. Test Grafana SSO: http://soc.acdev.host:3000"
echo "2. Test TheHive SSO: Click 'SSO Login' button"
echo "3. Test Prometheus SSO: http://soc.acdev.host:9091"
echo ""
echo "To enable Elasticsearch OIDC, see: SOC_CREDENTIALS.md"
echo ""
