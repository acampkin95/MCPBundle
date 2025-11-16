# SOC Hub MCP - Credentials Configuration Guide

**Server**: VMI03 (154.26.158.31)
**Status**: ✅ MCP Server Working | ⚠️ Manual Credential Steps Required
**Date**: 2025-11-14

---

## Current Configuration Status

### ✅ Working Components
1. **Elasticsearch**: No authentication required (`xpack.security.enabled: false`)
2. **MCP Protocol**: Server responding with all 8 tools registered
3. **SOC Hub MCP**: Deployed and functional in stdio mode

### ⚠️ Requires Manual Configuration
1. **Wazuh API**: Password needs to be reset (default admin:admin not working)
2. **TheHive API**: API key needs to be generated from web UI

---

## Step 1: Reset Wazuh API Password

The Wazuh API requires authentication but the default credentials aren't working. Follow these steps to reset the password:

### Method 1: Using Wazuh CLI (Recommended)

```bash
# SSH into VMI03
ssh root@154.26.158.31

# Reset the admin user password
/var/ossec/bin/wazuh-api-credentials -u admin -p YOUR_NEW_PASSWORD_HERE

# Or use interactive mode
/var/ossec/bin/wazuh-api-credentials

# Restart Wazuh manager
systemctl restart wazuh-manager

# Test the new credentials
curl -k -u admin:YOUR_NEW_PASSWORD_HERE https://localhost:55000
```

### Method 2: Using Wazuh Keystore

```bash
# SSH into VMI03
ssh root@154.26.158.31

# Set the password in keystore
echo 'YOUR_NEW_PASSWORD_HERE' | /var/ossec/bin/wazuh-keystore -f wazuh-api -k api_password

# Restart Wazuh manager
systemctl restart wazuh-manager
```

### Method 3: Check Backup (If Available)

```bash
# SSH into VMI03
ssh root@154.26.158.31

# Check the backup directory found earlier
ls -la ~/wazuh-backup-20251112_142231/

# Look for credentials file
find ~/wazuh-backup-20251112_142231/ -name "*credentials*" -o -name "*password*"
```

### Update .env File

After resetting the password:

```bash
# SSH into VMI03
ssh root@154.26.158.31

# Edit the .env file
nano /opt/mcp/services/soc-hub-mcp/.env

# Update this line:
WAZUH_API_PASSWORD=YOUR_NEW_PASSWORD_HERE
```

---

## Step 2: Generate TheHive API Key

TheHive requires an API key for programmatic access.

### Access TheHive Web UI

1. Open browser to: **http://154.26.158.31:9000**
2. Default credentials (check TheHive documentation or docker-compose logs):
   - Username: `admin@thehive.local`
   - Password: Check TheHive first-run logs or documentation

### Generate API Key

1. Log in to TheHive web interface
2. Click on your profile (top-right corner)
3. Go to **Admin → API Keys**
4. Click **Create API Key**
5. Name: `SOC Hub MCP`
6. Permissions: Select **Full Access** (or customize as needed)
7. Click **Create**
8. **Copy the API key immediately** (it won't be shown again)

### Update .env File

```bash
# SSH into VMI03
ssh root@154.26.158.31

# Edit the .env file
nano /opt/mcp/services/soc-hub-mcp/.env

# Update this line:
THEHIVE_API_KEY=YOUR_GENERATED_API_KEY_HERE
```

---

## Step 3: Test Configuration

After updating both credentials:

### Test Wazuh Connection

```bash
ssh root@154.26.158.31

# Test Wazuh API authentication
curl -k -u admin:YOUR_PASSWORD https://localhost:55000/manager/info | jq .
```

### Test TheHive Connection

```bash
# Test TheHive API with your key
curl -s -H "Authorization: Bearer YOUR_THEHIVE_API_KEY" http://localhost:9000/api/v1/status | jq .
```

### Test SOC Hub MCP

```bash
# Run health check tool
cd /opt/mcp/services/soc-hub-mcp
SERVER_MODE=mcp node dist/index.js <<EOF
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"soc_health_check"},"id":2}
EOF
```

---

## Current .env File Configuration

Located at: `/opt/mcp/services/soc-hub-mcp/.env`

```bash
# SOC Hub MCP Environment Configuration
# Deployed to: VMI03 (154.26.158.31)
# Date: 2025-11-14

SERVER_MODE=both
PORT=3200

# WAZUH - UPDATE PASSWORD AFTER RESET
WAZUH_API_URL=https://154.26.158.31:55000
WAZUH_API_USER=admin
WAZUH_API_PASSWORD=admin  # ← UPDATE THIS
WAZUH_VERIFY_SSL=false

# ELASTICSEARCH - NO AUTH REQUIRED ✅
ELASTICSEARCH_URL=http://154.26.158.31:9200
ELASTICSEARCH_USER=elastic
ELASTICSEARCH_PASSWORD=

# THEHIVE - GENERATE API KEY FROM WEB UI
THEHIVE_URL=http://154.26.158.31:9000
THEHIVE_API_KEY=PLACEHOLDER_GENERATE_FROM_WEB_UI  # ← UPDATE THIS

# CORS CONFIGURATION
ALLOWED_ORIGINS=http://154.26.158.31:3200,http://localhost:3200,https://acdev.host

# LOGGING
LOG_LEVEL=info
NODE_ENV=production
```

---

## Optional: Create systemd Service

To run SOC Hub MCP as a always-running service:

```bash
# SSH into VMI03
ssh root@154.26.158.31

# Create systemd service file
cat > /etc/systemd/system/soc-hub-mcp.service << 'EOF'
[Unit]
Description=SOC Hub MCP Server
After=network.target elasticsearch.service wazuh-manager.service docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mcp/services/soc-hub-mcp
ExecStart=/usr/bin/node /opt/mcp/services/soc-hub-mcp/dist/index.js
Restart=always
RestartSec=10
Environment=SERVER_MODE=both
EnvironmentFile=/opt/mcp/services/soc-hub-mcp/.env

# Security
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
systemctl daemon-reload
systemctl enable soc-hub-mcp
systemctl start soc-hub-mcp

# Check status
systemctl status soc-hub-mcp

# View logs
journalctl -u soc-hub-mcp -f
```

---

## Verification Checklist

- [ ] Wazuh API password reset
- [ ] Wazuh API authentication tested (curl command successful)
- [ ] TheHive API key generated from web UI
- [ ] TheHive API key tested (curl command successful)
- [ ] SOC Hub MCP .env file updated with both credentials
- [ ] SOC Hub MCP health check returns all services as healthy
- [ ] (Optional) systemd service created and running
- [ ] Claude Desktop successfully connects to soc-hub-mcp

---

## Troubleshooting

### Wazuh API Returns "Unauthorized"

**Problem**: `curl -k -u admin:password https://localhost:55000` returns 401 Unauthorized

**Solutions**:
1. Verify Wazuh is running: `systemctl status wazuh-manager`
2. Check Wazuh API logs: `journalctl -u wazuh-manager -f`
3. Reset password using methods above
4. Check if Wazuh API is listening: `netstat -tlnp | grep 55000`

### TheHive API Key Not Working

**Problem**: API key returns 401 or 403

**Solutions**:
1. Verify TheHive is running: `docker ps | grep thehive`
2. Check TheHive logs: `docker logs thehive`
3. Regenerate API key with full permissions
4. Ensure API key header format: `Authorization: Bearer YOUR_KEY`

### SOC Hub MCP Won't Start

**Problem**: Service fails to start or crashes

**Solutions**:
1. Check for syntax errors in .env: `cat /opt/mcp/services/soc-hub-mcp/.env`
2. Verify all dependencies installed: `cd /opt/mcp/services/soc-hub-mcp && npm list`
3. Check logs: `journalctl -u soc-hub-mcp -n 50`
4. Test manually: `cd /opt/mcp/services/soc-hub-mcp && SERVER_MODE=both node dist/index.js`

---

## Additional Resources

- **Wazuh Documentation**: https://documentation.wazuh.com/current/user-manual/api/reference.html
- **TheHive Documentation**: https://docs.strangebee.com/thehive/
- **Elasticsearch Documentation**: https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
- **MCP Protocol Specification**: https://modelcontextprotocol.io/docs

---

## Summary

**What's Working**:
- ✅ SOC Hub MCP deployed and functional
- ✅ Elasticsearch accessible (no auth)
- ✅ All 8 MCP tools registered
- ✅ HTTP API mode functional (port 3200)
- ✅ stdio mode functional (Claude Desktop)
- ✅ CrowdSec integration (local cscli commands)

**What Needs Manual Configuration**:
- ⚠️ Wazuh API password reset
- ⚠️ TheHive API key generation

**Estimated Time**: 10-15 minutes

Once these two credentials are configured, the SOC Hub MCP will have full access to all SOC components and provide complete security operations dashboard functionality.

---

**Last Updated**: 2025-11-14
**Contact**: See deployment documentation for support
