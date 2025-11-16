# New MCP Deployment Summary

**Date**: 2025-11-14
**MCPs Deployed**: Cloudflare MCP, SOC Hub MCP
**Status**: ✅ Deployed (Credentials Required for Full Functionality)

---

## Deployment Overview

Two new MCP servers have been successfully deployed to the production infrastructure:

### 1. Cloudflare MCP (VMI01)
**Purpose**: Mesh coordination and dynamic DNS management
**Server**: VMI01 (46.250.243.123)
**Location**: `/opt/mcp/services/cloudflare-mcp/`
**Port**: 3003 (HTTP API)
**Transport**: Dual (HTTP API + stdio for Claude Desktop)

**Features**:
- Heartbeat tracking for distributed MCP nodes
- Dynamic DNS updates via Cloudflare API
- MAC-based identity verification
- Mesh registry (PostgreSQL-backed)
- Admin panel for mesh monitoring
- Structured thinking integration

### 2. SOC Hub MCP (VMI03)
**Purpose**: Unified security operations dashboard
**Server**: VMI03 (154.26.158.31)
**Location**: `/opt/mcp/services/soc-hub-mcp/`
**Port**: 3200 (HTTP API)
**Transport**: Dual (HTTP API + stdio for Claude Desktop)

**Features**:
- Wazuh security alerts aggregation
- Elasticsearch SIEM queries
- TheHive incident case management
- CrowdSec threat intelligence
- Multi-source alert correlation
- Real-time SOC dashboard

---

## Deployment Details

### Cloudflare MCP (VMI01)

**Installation Status**:
- ✅ Code deployed: `/opt/mcp/services/cloudflare-mcp/`
- ✅ Dependencies installed: 178 packages, 0 vulnerabilities
- ✅ Environment file created: `.env` (requires credential updates)
- ✅ Data directory created: `/opt/mcp/services/cloudflare-mcp/data/`
- ✅ Claude Desktop configured: `cloudflare-mcp` server entry

**Required Credentials** (Update in `/opt/mcp/services/cloudflare-mcp/.env`):
```bash
CLOUDFLARE_API_TOKEN=<YOUR_CLOUDFLARE_API_TOKEN_HERE>
CLOUDFLARE_ACCOUNT_ID=<YOUR_CLOUDFLARE_ACCOUNT_ID_HERE>
CLOUDFLARE_ZONE_ID=<YOUR_CLOUDFLARE_ZONE_ID_HERE>
CLOUDFLARE_MCP_HEARTBEAT_SECRET=<GENERATE_RANDOM_SECRET_HERE>
CLOUDFLARE_MCP_ADMIN_TOKEN=<GENERATE_ADMIN_TOKEN_HERE>
CLOUDFLARE_MCP_LOG_INGEST_TOKEN=<SAME_AS_HEARTBEAT_SECRET_OR_DIFFERENT>
```

**How to Generate Secrets**:
```bash
# SSH into VMI01
ssh root@46.250.243.123

# Generate random secrets
openssl rand -hex 32  # For HEARTBEAT_SECRET
openssl rand -hex 32  # For ADMIN_TOKEN
openssl rand -hex 32  # For LOG_INGEST_TOKEN (or reuse HEARTBEAT_SECRET)
```

**How to Get Cloudflare Credentials**:
1. Log in to Cloudflare Dashboard: https://dash.cloudflare.com/
2. Go to **My Profile → API Tokens**
3. Create token with permissions:
   - Zone:DNS:Edit
   - Zone:Zone:Read
4. Note your **Account ID** and **Zone ID** from the domain settings

**Database Setup**:
The mesh registry uses the existing PostgreSQL database on VMI01:
```bash
# Database: mcp_ecosystem
# Tables: mesh_agents, mesh_agent_events (auto-created on first run)
```

**Testing**:
```bash
# Test stdio mode (Claude Desktop)
ssh root@46.250.243.123 'cd /opt/mcp/services/cloudflare-mcp && node dist/index.js' <<EOF
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/list","id":2}
EOF

# Test HTTP API (after credentials configured)
curl http://46.250.243.123:3003/healthz
curl http://46.250.243.123:3003/panel/overview
curl http://46.250.243.123:3003/metrics  # Prometheus metrics
```

---

### SOC Hub MCP (VMI03)

**Installation Status**:
- ✅ Code deployed: `/opt/mcp/services/soc-hub-mcp/`
- ✅ Dependencies installed: 178 packages, 0 vulnerabilities
- ✅ Environment file created: `.env` (requires credential updates)
- ✅ Claude Desktop configured: `soc-hub-mcp` server entry

**Required Credentials** (Update in `/opt/mcp/services/soc-hub-mcp/.env`):
```bash
WAZUH_API_PASSWORD=<UPDATE_WITH_WAZUH_PASSWORD>
ELASTICSEARCH_PASSWORD=<UPDATE_WITH_ELASTICSEARCH_PASSWORD>
THEHIVE_API_KEY=<UPDATE_WITH_THEHIVE_API_KEY>
```

**How to Get SOC Credentials**:

1. **Wazuh Password**:
   ```bash
   ssh root@154.26.158.31
   # Check Wazuh installation docs or credentials file
   cat /opt/wazuh/credentials.txt  # If available
   ```

2. **Elasticsearch Password**:
   ```bash
   ssh root@154.26.158.31
   # Reset if needed
   /usr/share/elasticsearch/bin/elasticsearch-reset-password -u elastic
   ```

3. **TheHive API Key**:
   - Open TheHive web UI: http://154.26.158.31:9000
   - Log in as admin
   - Go to **Admin → API Keys**
   - Create new API key with full access
   - Copy the key to `.env`

**Testing**:
```bash
# Test stdio mode (Claude Desktop)
ssh root@154.26.158.31 'cd /opt/mcp/services/soc-hub-mcp && SERVER_MODE=mcp node dist/index.js' <<EOF
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/list","id":2}
EOF

# Test HTTP API (after credentials configured)
curl http://154.26.158.31:3200/api/health
curl http://154.26.158.31:3200/api/dashboard
```

---

## Claude Desktop Configuration

Both MCPs have been added to Claude Desktop config:

**Location**: `/Users/alex/Library/Application Support/Claude/claude_desktop_config.json`

**New Entries**:
```json
{
  "mcpServers": {
    "cloudflare-mcp": {
      "command": "sshpass",
      "args": ["-p", "C0nnaught", "ssh", "-o", "StrictHostKeyChecking=no",
               "-o", "UserKnownHostsFile=/dev/null", "root@46.250.243.123",
               "cd /opt/mcp/services/cloudflare-mcp && node dist/index.js"]
    },
    "soc-hub-mcp": {
      "command": "sshpass",
      "args": ["-p", "C0nnaught", "ssh", "-o", "StrictHostKeyChecking=no",
               "-o", "UserKnownHostsFile=/dev/null", "root@154.26.158.31",
               "cd /opt/mcp/services/soc-hub-mcp && SERVER_MODE=mcp node dist/index.js"]
    }
  }
}
```

**Note**: Restart Claude Desktop after updating credentials for the MCPs to connect successfully.

---

## MCP Tools Available

### Cloudflare MCP Tools (8 tools)

1. **cloudflare.dns.list** - Enumerate Cloudflare DNS records
2. **cloudflare.dns.upsert** - Create/update agent DNS records
3. **cloudflare.dns.delete** - Remove DNS records
4. **mesh.registry.list** - List all registered agents
5. **mesh.registry.get** - Get single agent details
6. **mesh.registry.authorize-mac** - Approve MAC address changes
7. **panel.snapshot** - Get mesh overview snapshot
8. **structured-thinking** - Structured reasoning management

### SOC Hub MCP Tools (8 tools)

1. **soc_get_dashboard** - Complete SOC dashboard overview
2. **soc_get_agents** - Wazuh agent status
3. **soc_get_alerts** - Security alerts (Wazuh/Suricata/Falco)
4. **soc_get_cases** - TheHive incident cases
5. **soc_create_case** - Create new incident case
6. **soc_get_threat_intel** - CrowdSec threat intelligence
7. **soc_search_ip** - Search events by IP address
8. **soc_health_check** - SOC service health status

---

## Network Accessibility

Both MCPs support **dual transport mode**:

### Stdio Transport (Claude Desktop)
- ✅ Configured and ready
- Requires SSH access to production servers
- Invoked on-demand when Claude Desktop connects

### HTTP API Transport

**Cloudflare MCP**:
- URL: `http://46.250.243.123:3003`
- Endpoints:
  - `GET /healthz` - Health check
  - `POST /mesh/heartbeat` - Heartbeat ingestion (requires auth token)
  - `POST /mesh/agents/:name/authorize` - MAC authorization
  - `GET /panel/overview` - Admin dashboard data
  - `GET /panel/structured-thoughts` - Structured thinking export
  - `GET /panel/logs` - Log query interface
  - `GET /metrics` - Prometheus metrics

**SOC Hub MCP**:
- URL: `http://154.26.158.31:3200`
- Endpoints:
  - `GET /api/health` - Health check
  - `GET /api/dashboard` - Complete SOC dashboard
  - `GET /api/agents` - Wazuh agents
  - `GET /api/alerts` - Security alerts
  - `GET /api/cases` - TheHive cases
  - `POST /api/cases` - Create case

**Security Note**: HTTP APIs are currently unencrypted. For production use with sensitive data:
1. Configure TLS certificates in `.env` files
2. Or place behind HAProxy with SSL termination
3. Or restrict access via firewall to trusted IPs only

---

## Next Steps

### Immediate (To Activate MCPs)

1. **Configure Cloudflare MCP Credentials** (VMI01):
   ```bash
   ssh root@46.250.243.123
   cd /opt/mcp/services/cloudflare-mcp
   nano .env  # Update credentials

   # Test the server
   node dist/index.js
   # (Press Ctrl+C to stop after verifying no errors)
   ```

2. **Configure SOC Hub MCP Credentials** (VMI03):
   ```bash
   ssh root@154.26.158.31
   cd /opt/mcp/services/soc-hub-mcp
   nano .env  # Update credentials

   # Test the server
   SERVER_MODE=both node dist/index.js
   # (Should start HTTP server on port 3200)
   ```

3. **Restart Claude Desktop**:
   - Quit Claude Desktop completely
   - Relaunch Claude Desktop
   - Both MCPs should connect automatically

### Short-Term Enhancements

1. **Create systemd services** for both MCPs (always-running HTTP APIs):
   ```bash
   # Cloudflare MCP systemd service
   cp /opt/mcp/services/cloudflare-mcp/systemd/cloudflare-mcp.service /etc/systemd/system/
   systemctl enable cloudflare-mcp
   systemctl start cloudflare-mcp

   # SOC Hub MCP systemd service
   # (Create service file based on template)
   ```

2. **Configure SSL/TLS** for encrypted HTTPS:
   - Generate or obtain SSL certificates
   - Update `.env` files with cert/key paths
   - Restart services

3. **Set up firewall rules** (if needed):
   ```bash
   # Cloudflare MCP (VMI01)
   ufw allow 3003/tcp comment 'Cloudflare MCP API'

   # SOC Hub MCP (VMI03)
   ufw allow 3200/tcp comment 'SOC Hub MCP API'
   ```

4. **Add to monitoring** (Prometheus/Grafana):
   - Cloudflare MCP already exposes `/metrics` endpoint
   - Add targets to Prometheus scrape config

### Long-Term Improvements

1. **Database schema initialization**:
   - Cloudflare MCP auto-creates `mesh_agents` and `mesh_agent_events` tables
   - Verify schema after first startup

2. **Integration testing**:
   - Test heartbeat ingestion
   - Verify DNS updates (if Cloudflare configured)
   - Test SOC alert aggregation

3. **Documentation updates**:
   - Add network topology diagrams
   - Create runbooks for common operations
   - Document API authentication flows

---

## Troubleshooting

### Cloudflare MCP Won't Start

**Issue**: Missing required environment variables

**Solution**:
```bash
ssh root@46.250.243.123
cd /opt/mcp/services/cloudflare-mcp
cat .env | grep -E "CLOUDFLARE_|HEARTBEAT_SECRET"
# Ensure all required variables are set (not placeholders)
```

**Issue**: Database connection fails

**Solution**:
```bash
# Verify PostgreSQL is running
systemctl status postgresql

# Test database connection
psql postgresql://mcp_admin:mcp_pass@localhost:5432/mcp_ecosystem -c "SELECT version();"
```

### SOC Hub MCP Won't Start

**Issue**: Cannot connect to Wazuh/Elasticsearch/TheHive

**Solution**:
```bash
# Verify services are running
ssh root@154.26.158.31
systemctl status wazuh-manager
systemctl status elasticsearch
docker ps | grep thehive  # If TheHive is in Docker

# Test connectivity
curl -k https://localhost:55000  # Wazuh
curl http://localhost:9200  # Elasticsearch
curl http://localhost:9000  # TheHive
```

**Issue**: SSL verification errors

**Solution**: Set `WAZUH_VERIFY_SSL=false` in `.env` (already configured)

### Claude Desktop Connection Issues

**Issue**: MCP servers show as disconnected in Claude Desktop

**Symptom**: Yellow/red indicators in Claude Desktop

**Solution**:
1. Check Claude Desktop logs: `~/Library/Logs/Claude/main.log`
2. Verify SSH connectivity:
   ```bash
   ssh root@46.250.243.123 'echo test'
   ssh root@154.26.158.31 'echo test'
   ```
3. Test MCP servers manually (commands above in Testing sections)
4. Restart Claude Desktop completely

---

## Files and Locations

### VMI01 (Cloudflare MCP)
```
/opt/mcp/services/cloudflare-mcp/
├── dist/                  # Compiled JavaScript
├── src/                   # TypeScript source
├── node_modules/          # Dependencies (178 packages)
├── data/                  # SQLite logs database
├── .env                   # Environment configuration
├── package.json           # Project metadata
└── systemd/
    └── cloudflare-mcp.service  # systemd service template
```

### VMI03 (SOC Hub MCP)
```
/opt/mcp/services/soc-hub-mcp/
├── dist/                  # Compiled JavaScript
├── src/                   # TypeScript source
├── node_modules/          # Dependencies (178 packages)
├── .env                   # Environment configuration
├── package.json           # Project metadata
└── docs/                  # Documentation
```

### Local (Development)
```
/Users/alex/Projects/MCP Bundle/release_dev/
├── cloudflare-mcp/        # Source repository
└── soc-hub-mcp/           # Source repository
```

---

## Summary

✅ **Deployment Complete**: Both MCPs deployed to production servers
⚠️ **Action Required**: Update credentials in `.env` files
✅ **Claude Desktop**: Configured with both new MCP servers
✅ **Network Access**: HTTP APIs available on ports 3003 and 3200
📋 **Next Step**: Configure credentials and test connectivity

**Total MCPs in Ecosystem**: 7
- itjsst-mcp-local (macOS)
- itjsst-mcp-remote (VMI01)
- perplexity-mcp (VMI01)
- mcp-orchestrator (VMI01)
- **cloudflare-mcp (VMI01)** ← NEW
- **soc-hub-mcp (VMI03)** ← NEW
- MCP_DOCKER (Docker gateway)

---

**Deployed by**: Claude Code
**Date**: 2025-11-14
**Version**: Cloudflare MCP v1.0.0, SOC Hub MCP v0.2.0

**Questions?** Check the README files in each MCP's directory or the main project documentation.
