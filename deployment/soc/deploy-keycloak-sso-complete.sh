#!/bin/bash
#
# SOC Keycloak SSO Complete Deployment
# - Creates Keycloak clients and users
# - Configures Grafana, TheHive, Prometheus with SSO
# - Skips Elasticsearch (LAN/VPN only)
#

set -e

echo "=== SOC Keycloak SSO Complete Deployment ==="
echo ""

# Configuration
KEYCLOAK_URL="https://acdev.host:8443"
KEYCLOAK_REALM="mcp-agents"
SOC_HOST="soc.acdev.host"
VMI01_IP="46.250.243.123"

# Admin credentials for Keycloak
echo "This script will create Keycloak clients and users, then configure SSO."
echo ""
read -sp "Enter Keycloak admin password: " KEYCLOAK_ADMIN_PASS
echo ""

# Get admin token
echo "=== Authenticating with Keycloak ==="
ADMIN_TOKEN=$(curl -sk -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin" \
  -d "password=$KEYCLOAK_ADMIN_PASS" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" | jq -r '.access_token')

if [ "$ADMIN_TOKEN" == "null" ] || [ -z "$ADMIN_TOKEN" ]; then
    echo "❌ Failed to authenticate with Keycloak"
    exit 1
fi

echo "✅ Authenticated with Keycloak"
echo ""

# Function to create client
create_client() {
    local client_id=$1
    local redirect_uris=$2
    local web_origins=$3

    echo "Creating client: $client_id"

    curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"clientId\": \"$client_id\",
        \"enabled\": true,
        \"clientAuthenticatorType\": \"client-secret\",
        \"redirectUris\": $redirect_uris,
        \"webOrigins\": $web_origins,
        \"publicClient\": false,
        \"protocol\": \"openid-connect\",
        \"standardFlowEnabled\": true,
        \"implicitFlowEnabled\": false,
        \"directAccessGrantsEnabled\": true
      }" > /dev/null 2>&1

    # Get client secret
    CLIENT_UUID=$(curl -sk "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients?clientId=$client_id" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

    CLIENT_SECRET=$(curl -sk "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/clients/$CLIENT_UUID/client-secret" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.value')

    echo "$CLIENT_SECRET"
}

# Function to create user
create_user() {
    local username=$1
    local password=$2
    local email=$3
    local first_name=$4
    local last_name=$5

    echo "Creating user: $username"

    # Create user
    curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"username\": \"$username\",
        \"email\": \"$email\",
        \"firstName\": \"$first_name\",
        \"lastName\": \"$last_name\",
        \"enabled\": true,
        \"emailVerified\": true,
        \"credentials\": [{
          \"type\": \"password\",
          \"value\": \"$password\",
          \"temporary\": false
        }]
      }" > /dev/null 2>&1

    # Get user ID
    USER_ID=$(curl -sk "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users?username=$username" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.[0].id')

    # Assign realm admin role
    ADMIN_ROLE_ID=$(curl -sk "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/roles/admin" \
      -H "Authorization: Bearer $ADMIN_TOKEN" | jq -r '.id')

    if [ "$ADMIN_ROLE_ID" != "null" ] && [ -n "$ADMIN_ROLE_ID" ]; then
        curl -sk -X POST "$KEYCLOAK_URL/admin/realms/$KEYCLOAK_REALM/users/$USER_ID/role-mappings/realm" \
          -H "Authorization: Bearer $ADMIN_TOKEN" \
          -H "Content-Type: application/json" \
          -d "[{\"id\":\"$ADMIN_ROLE_ID\",\"name\":\"admin\"}]" > /dev/null 2>&1
    fi

    echo "✅ User $username created"
}

echo "=== Step 1: Creating Keycloak Clients ==="
echo ""

# Create Grafana client
echo "1. Grafana client..."
GRAFANA_SECRET=$(create_client "grafana" \
  "[\"http://$SOC_HOST:3000/*\"]" \
  "[\"http://$SOC_HOST:3000\"]")
echo "✅ Grafana client created"

# Create TheHive client
echo "2. TheHive client..."
THEHIVE_SECRET=$(create_client "thehive" \
  "[\"http://$SOC_HOST:9000/*\", \"http://$SOC_HOST:9000/api/ssoLogin\"]" \
  "[\"http://$SOC_HOST:9000\"]")
echo "✅ TheHive client created"

# Create Prometheus client
echo "3. Prometheus client..."
PROMETHEUS_SECRET=$(create_client "prometheus" \
  "[\"http://$SOC_HOST:9091/oauth2/callback\"]" \
  "[\"http://$SOC_HOST:9091\"]")
echo "✅ Prometheus client created"

echo ""
echo "=== Step 2: Creating Keycloak Users ==="
echo ""

# Create acampkin user
create_user "acampkin" "=London22!" "alex@acdev.host" "Alex" "Campkin"

# Create AIService user
create_user "AIService" "kjYPf2D5cdO+POqV8+LR" "ai@acdev.host" "AI" "Service"

echo ""
echo "=== Step 3: Configuring Grafana OAuth ==="

cat >> /etc/grafana/grafana.ini << EOF

# Keycloak SSO Configuration
[auth.generic_oauth]
enabled = true
name = Keycloak
allow_sign_up = true
auto_login = false
client_id = grafana
client_secret = $GRAFANA_SECRET
scopes = openid email profile
auth_url = $KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/auth
token_url = $KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/token
api_url = $KEYCLOAK_URL/realms/$KEYCLOAK_REALM/protocol/openid-connect/userinfo
role_attribute_path = contains(roles[*], 'admin') && 'Admin' || 'Viewer'

[server]
root_url = http://$SOC_HOST:3000
EOF

systemctl restart grafana-server
echo "✅ Grafana configured and restarted"

echo ""
echo "=== Step 4: Configuring TheHive OAuth ==="

cat > /opt/thehive/oauth.conf << EOF
# Keycloak SSO Configuration
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

# Add include to main config if not already there
if ! grep -q "oauth.conf" /opt/thehive/application.conf; then
    echo 'include "/opt/thehive/oauth.conf"' >> /opt/thehive/application.conf
fi

cd /opt/thehive && docker-compose restart thehive
echo "✅ TheHive configured and restarted"

echo ""
echo "=== Step 5: Installing oauth2-proxy for Prometheus ==="

# Install oauth2-proxy if not present
if ! command -v oauth2-proxy &> /dev/null; then
    wget -q https://github.com/oauth2-proxy/oauth2-proxy/releases/download/v7.5.1/oauth2-proxy-v7.5.1.linux-amd64.tar.gz
    tar -xzf oauth2-proxy-v7.5.1.linux-amd64.tar.gz
    mv oauth2-proxy-v7.5.1.linux-amd64/oauth2-proxy /usr/local/bin/
    rm -rf oauth2-proxy-v7.5.1*
    echo "✅ oauth2-proxy installed"
else
    echo "✅ oauth2-proxy already installed"
fi

# Generate cookie secret
COOKIE_SECRET=$(openssl rand -base64 32 | tr -d '\n')

# Create oauth2-proxy config
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

# Create systemd service
cat > /etc/systemd/system/oauth2-proxy-prometheus.service << 'SVCEOF'
[Unit]
Description=OAuth2 Proxy for Prometheus
After=network.target prometheus.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/oauth2-proxy --config /etc/oauth2-proxy-prometheus.cfg
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable oauth2-proxy-prometheus
systemctl restart oauth2-proxy-prometheus

echo "✅ oauth2-proxy configured and started"

echo ""
echo "=== Step 6: Updating Nginx Configuration ==="

# Backup existing config
cp /etc/nginx/sites-available/default /etc/nginx/sites-available/default.backup

# Add Prometheus proxy config if not exists
if ! grep -q "listen 9091" /etc/nginx/sites-available/default; then
    cat >> /etc/nginx/sites-available/default << 'NGINXEOF'

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
NGINXEOF
fi

nginx -t && systemctl reload nginx
echo "✅ Nginx configured and reloaded"

echo ""
echo "=== Step 7: Saving Credentials ==="

cat > /root/soc-keycloak-credentials.txt << CREDEOF
# SOC Keycloak SSO Credentials
# Generated: $(date)

=== Keycloak Users ===

1. Alex Campkin (Admin)
   Username: acampkin
   Password: =London22!
   Email: alex@acdev.host
   Role: Full Admin

2. AI Service (Admin - AI Use Only)
   Username: AIService
   Password: kjYPf2D5cdO+POqV8+LR
   Email: ai@acdev.host
   Role: Full Admin
   Purpose: Automated AI/MCP access

=== Keycloak Clients & Secrets ===

Grafana:
  Client ID: grafana
  Client Secret: $GRAFANA_SECRET
  Redirect URI: http://soc.acdev.host:3000/*

TheHive:
  Client ID: thehive
  Client Secret: $THEHIVE_SECRET
  Redirect URI: http://soc.acdev.host:9000/*

Prometheus:
  Client ID: prometheus
  Client Secret: $PROMETHEUS_SECRET
  Redirect URI: http://soc.acdev.host:9091/oauth2/callback

=== Access URLs (All use Keycloak SSO) ===

Keycloak Admin: https://acdev.host:8443/admin/
SOC Dashboard:  http://soc.acdev.host/
Grafana:        http://soc.acdev.host:3000
TheHive:        http://soc.acdev.host:9000
Prometheus:     http://soc.acdev.host:9091

=== Elasticsearch (LAN/VPN Only - No SSO) ===

Elasticsearch:  http://soc.acdev.host:9200
Access: LAN/VPN only, no authentication required
Note: Not configured for SSO per security requirements

CREDEOF

chmod 600 /root/soc-keycloak-credentials.txt
echo "✅ Credentials saved to /root/soc-keycloak-credentials.txt"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "✅ Services configured with Keycloak SSO:"
echo "   - Grafana:    http://soc.acdev.host:3000"
echo "   - TheHive:    http://soc.acdev.host:9000"
echo "   - Prometheus: http://soc.acdev.host:9091"
echo ""
echo "✅ Keycloak users created:"
echo "   - acampkin (Full Admin): =London22!"
echo "   - AIService (Full Admin, AI only): kjYPf2D5cdO+POqV8+LR"
echo ""
echo "⚠️  Elasticsearch kept as LAN/VPN only (no SSO)"
echo "   - Access: http://soc.acdev.host:9200"
echo "   - No authentication required"
echo "   - Restricted to internal network only"
echo ""
echo "📝 All credentials saved to: /root/soc-keycloak-credentials.txt"
echo ""
echo "🧪 Test SSO:"
echo "   1. Open http://soc.acdev.host:3000"
echo "   2. Click 'Sign in with Keycloak'"
echo "   3. Login with: acampkin / =London22!"
echo ""
