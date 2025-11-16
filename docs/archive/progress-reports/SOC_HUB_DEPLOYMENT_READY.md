# SOC Hub MCP - Deployment Ready 🚀

## Status: Built and Ready for Deployment

The SOC Hub MCP Server has been successfully **built** and is ready for deployment to VMI03!

## What's Been Completed ✅

1. **Full Source Code** - Complete TypeScript implementation
   - ✅ 4 API client libraries (Wazuh, Elasticsearch, TheHive, CrowdSec)
   - ✅ SOC data aggregation service
   - ✅ Express REST API server with 10+ endpoints
   - ✅ 8 MCP tools for Claude Code integration
   - ✅ TypeScript strict mode compilation

2. **Build & Package** - Production-ready distribution
   - ✅ TypeScript compiled to JavaScript (`dist/`)
   - ✅ Dependencies installed (425 packages)
   - ✅ Configuration template (`.env`)
   - ✅ All TypeScript errors resolved

3. **Deployment Scripts**
   - ✅ Systemd service file
   - ✅ Automated deployment script
   - ✅ Manual deployment guide
   - ✅ Local test script

4. **Documentation**
   - ✅ Complete README with API docs
   - ✅ Manual deployment guide (`DEPLOY_MANUAL.md`)
   - ✅ Implementation summary (`SOC_HUB_IMPLEMENTATION_COMPLETE.md`)

## File Locations

```
/Users/alex/Projects/MCP Bundle/release_dev/soc-hub-mcp/
├── dist/                           # Compiled JavaScript (ready to deploy)
├── deployment/
│   ├── deploy.sh                   # Automated deployment (requires password)
│   └── soc-hub-mcp.service         # Systemd service file
├── DEPLOY_MANUAL.md                # Manual deployment instructions
├── test-local.sh                   # Local test script
├── .env                            # Configuration (needs credentials)
└── README.md                       # Complete API documentation
```

## Quick Deploy Steps

### Option 1: Manual Deployment (Recommended)

Follow the step-by-step guide in `DEPLOY_MANUAL.md`:

```bash
cd "/Users/alex/Projects/MCP Bundle/release_dev/soc-hub-mcp"

# 1. Transfer files (you'll be prompted for password)
scp -r dist package.json package-lock.json .env deployment README.md \
    root@154.26.158.31:/opt/mcp/soc-hub-mcp/

# 2. SSH into server
ssh root@154.26.158.31

# 3. Install dependencies
cd /opt/mcp/soc-hub-mcp
npm ci --only=production

# 4. Get Elasticsearch password
cat /opt/mcp/credentials/elasticsearch.txt

# 5. Edit .env with actual credentials
nano .env
# Update: ELASTICSEARCH_PASSWORD
# Update: THEHIVE_API_KEY (generate in TheHive UI)

# 6. Install and start service
cp deployment/soc-hub-mcp.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable soc-hub-mcp
systemctl start soc-hub-mcp

# 7. Verify
systemctl status soc-hub-mcp
curl http://154.26.158.31:3200/api/v1/health | jq .
```

### Option 2: Test Locally First

```bash
cd "/Users/alex/Projects/MCP Bundle/release_dev/soc-hub-mcp"

# Run local test
./test-local.sh

# This will:
# - Start server on port 3200
# - Test basic endpoints
# - Show service health
# - Stop server
```

## Required Credentials

Before deployment, you need to obtain:

### 1. Elasticsearch Password
```bash
ssh root@154.26.158.31 'cat /opt/mcp/credentials/elasticsearch.txt'
```

### 2. TheHive API Key
1. Access http://154.26.158.31:9000
2. Login (or create admin account)
3. Go to User menu → My Profile → API Keys
4. Click "Create API Key"
5. Copy the key

### 3. Wazuh Password (Optional - default is "admin")
```bash
# Default credentials work
WAZUH_API_USER=admin
WAZUH_API_PASSWORD=admin
```

## Post-Deployment Testing

Once deployed, test all endpoints:

```bash
# Health check
curl http://154.26.158.31:3200/api/v1/health | jq .

# Dashboard overview
curl http://154.26.158.31:3200/api/v1/dashboard | jq .data.overview

# Wazuh agents
curl http://154.26.158.31:3200/api/v1/agents | jq '.data[0:3]'

# Recent alerts
curl "http://154.26.158.31:3200/api/v1/alerts/wazuh?limit=5" | jq .

# Suricata IPS alerts
curl "http://154.26.158.31:3200/api/v1/alerts/suricata?limit=5" | jq .

# TheHive cases
curl http://154.26.158.31:3200/api/v1/cases | jq .

# CrowdSec threat intel
curl http://154.26.158.31:3200/api/v1/threat-intel/crowdsec | jq .data.stats

# Search by IP
curl http://154.26.158.31:3200/api/v1/search/ip/192.168.1.1 | jq .
```

## Expected Results

### Healthy Status
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "services": [
      {"service": "wazuh", "status": "healthy", "response_time_ms": 150},
      {"service": "elasticsearch", "status": "healthy", "response_time_ms": 50},
      {"service": "thehive", "status": "healthy", "response_time_ms": 100}
    ]
  }
}
```

### Dashboard Overview
```json
{
  "success": true,
  "data": {
    "overview": {
      "total_alerts": 150,
      "critical_alerts": 5,
      "agents_active": 3,
      "agents_disconnected": 0,
      "open_cases": 2,
      "threat_level": "medium"
    }
  }
}
```

## Monitoring

### View Live Logs
```bash
ssh root@154.26.158.31
journalctl -u soc-hub-mcp -f
```

### Check Service Status
```bash
systemctl status soc-hub-mcp
```

### Restart Service
```bash
systemctl restart soc-hub-mcp
```

## Integration with Admin Panel

After deployment, update your admin panel:

```bash
# Edit release_dev/admin-panel/.env.local
echo "SOC_HUB_API_URL=http://154.26.158.31:3200/api/v1" >> release_dev/admin-panel/.env.local
echo "NEXT_PUBLIC_SOC_HUB_URL=http://154.26.158.31:3200/api/v1" >> release_dev/admin-panel/.env.local

# Restart admin panel
cd release_dev/admin-panel
npm run build
# Or for dev: npm run dev
```

## API Endpoints Summary

Base URL: `http://154.26.158.31:3200/api/v1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health status |
| `/dashboard` | GET | Complete SOC overview |
| `/agents` | GET | Wazuh agents list |
| `/agents/summary` | GET | Agent statistics |
| `/alerts/wazuh` | GET | Wazuh SIEM alerts |
| `/alerts/suricata` | GET | Suricata IPS alerts |
| `/alerts/falco` | GET | Falco runtime alerts |
| `/cases` | GET | TheHive cases |
| `/cases` | POST | Create new case |
| `/cases/:id` | GET | Get specific case |
| `/threat-intel/crowdsec` | GET | CrowdSec threat data |
| `/stats/elasticsearch` | GET | Alert statistics |
| `/search/ip/:ip` | GET | IP investigation |

## Troubleshooting

### Service Won't Start

```bash
# Check logs
journalctl -u soc-hub-mcp -n 100 --no-pager

# Common issues:
# 1. Missing/wrong credentials in .env
# 2. Port 3200 already in use: netstat -tlnp | grep 3200
# 3. Permission issues: ls -la /opt/mcp/soc-hub-mcp
```

### Connection Errors

```bash
# Test each service individually
curl -k -u admin:admin https://154.26.158.31:55000/          # Wazuh
curl http://154.26.158.31:9200/_cluster/health              # Elasticsearch
curl http://154.26.158.31:9000/api/status                   # TheHive
```

### Port Not Accessible

```bash
# Check firewall
ufw status

# If needed, open port
ufw allow 3200/tcp
```

## Next Steps

1. **Deploy to VMI03** - Follow `DEPLOY_MANUAL.md`
2. **Get Credentials** - Elasticsearch password and TheHive API key
3. **Test Endpoints** - Verify all integrations working
4. **Integrate with Admin Panel** - Add SOC dashboard page
5. **Monitor** - Watch logs for any errors

## Support

- **Documentation**: `release_dev/soc-hub-mcp/README.md`
- **Deployment Guide**: `release_dev/soc-hub-mcp/DEPLOY_MANUAL.md`
- **Implementation Details**: `SOC_HUB_IMPLEMENTATION_COMPLETE.md`
- **API Examples**: See README.md for complete endpoint documentation

---

## Summary

✅ **Build Status**: Complete
✅ **Package Status**: Ready
✅ **Documentation**: Complete
📋 **Action Required**: Deploy to VMI03 and configure credentials

The SOC Hub MCP Server is production-ready and waiting for deployment! 🎉
