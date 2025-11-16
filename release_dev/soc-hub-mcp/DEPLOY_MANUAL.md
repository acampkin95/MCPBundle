# Manual Deployment Guide - SOC Hub MCP

Since automated deployment requires the root password, follow these steps to deploy manually:

## Step 1: Package the Build

Already done! The project is built in `dist/` directory.

## Step 2: Transfer Files to VMI03

```bash
cd "/Users/alex/Projects/MCP Bundle/release_dev/soc-hub-mcp"

# You'll be prompted for password
scp -r dist package.json package-lock.json .env deployment README.md root@154.26.158.31:/opt/mcp/soc-hub-mcp/
```

## Step 3: Install Dependencies on Server

```bash
ssh root@154.26.158.31

cd /opt/mcp/soc-hub-mcp
npm ci --only=production
```

## Step 4: Get Elasticsearch Password

```bash
# While still SSH'd into VMI03
cat /opt/mcp/credentials/elasticsearch.txt

# Update /opt/mcp/soc-hub-mcp/.env with the password
nano /opt/mcp/soc-hub-mcp/.env
# Find: ELASTICSEARCH_PASSWORD=PLACEHOLDER_WILL_RETRIEVE
# Replace with actual password
```

## Step 5: Generate TheHive API Key

1. Access TheHive UI: http://154.26.158.31:9000
2. Login (create admin account if first time)
3. Go to User menu → My Profile → API Keys
4. Click "Create API Key"
5. Copy the key
6. Update `/opt/mcp/soc-hub-mcp/.env`:
   ```
   THEHIVE_API_KEY=your_api_key_here
   ```

## Step 6: Install Systemd Service

```bash
# Copy service file
cp /opt/mcp/soc-hub-mcp/deployment/soc-hub-mcp.service /etc/systemd/system/

# Reload systemd
systemctl daemon-reload

# Enable service
systemctl enable soc-hub-mcp

# Start service
systemctl start soc-hub-mcp

# Check status
systemctl status soc-hub-mcp
```

## Step 7: Verify Deployment

```bash
# Check logs
journalctl -u soc-hub-mcp -f

# Test API (in another terminal)
curl http://154.26.158.31:3200/api/v1/health | jq .

# Test dashboard
curl http://154.26.158.31:3200/api/v1/dashboard | jq .data.overview
```

## Troubleshooting

### Service won't start

```bash
# Check logs
journalctl -u soc-hub-mcp -n 100 --no-pager

# Common issues:
# 1. Missing credentials - check .env file
# 2. Port in use - check: netstat -tlnp | grep 3200
# 3. Permission issues - check: ls -la /opt/mcp/soc-hub-mcp
```

### Connection errors

```bash
# Test Wazuh
curl -k -u admin:admin https://154.26.158.31:55000/

# Test Elasticsearch
curl http://154.26.158.31:9200/_cluster/health

# Test TheHive
curl http://154.26.158.31:9000/api/status
```

### Can't access API from outside

```bash
# Check firewall
ufw status

# If port 3200 is blocked:
ufw allow 3200/tcp
```

## Alternative: Quick Test Without Systemd

If you want to test before setting up the service:

```bash
cd /opt/mcp/soc-hub-mcp
NODE_ENV=production PORT=3200 node dist/index.js

# Test in another terminal:
curl http://154.26.158.31:3200/api/v1/health
```

## Post-Deployment

1. Update Admin Panel to use SOC Hub API:
   ```env
   # In release_dev/admin-panel/.env.local
   SOC_HUB_API_URL=http://154.26.158.31:3200/api/v1
   ```

2. Test all endpoints:
   ```bash
   # Agents
   curl http://154.26.158.31:3200/api/v1/agents | jq .

   # Alerts
   curl http://154.26.158.31:3200/api/v1/alerts/wazuh?limit=5 | jq .

   # Cases
   curl http://154.26.158.31:3200/api/v1/cases | jq .

   # Threat Intel
   curl http://154.26.158.31:3200/api/v1/threat-intel/crowdsec | jq .
   ```

3. Monitor logs for any errors:
   ```bash
   journalctl -u soc-hub-mcp -f
   ```
