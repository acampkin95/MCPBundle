# SOC Infrastructure - Quick Reference Card

**Server**: soc.acdev.host (154.26.158.31)
**Updated**: 2025-11-14
**SSH**: `ssh root@154.26.158.31` (Password: C0nnaught)

---

## 🚀 Quick Access URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| **SOC Dashboard** | http://soc.acdev.host/ | Keycloak SSO |
| **Grafana** | http://soc.acdev.host:3000 | admin / GrafanaAdmin2024! ✅ |
| **TheHive** | http://soc.acdev.host:9000 | Setup on first visit 🔄 |
| **Elasticsearch** | http://soc.acdev.host:9200 | No auth required ✅ |
| **Prometheus** | http://soc.acdev.host:9090 | No auth required ✅ |
| **Wazuh API** | https://soc.acdev.host:55000 | Setup required 🔄 |
| **SOC Hub MCP** | http://soc.acdev.host:3200 | No auth required ✅ |

---

## ✅ Working Now (No Setup)

1. **SOC Dashboard**: http://soc.acdev.host/
2. **Grafana**: http://soc.acdev.host:3000 (admin / GrafanaAdmin2024!)
3. **Elasticsearch**: http://soc.acdev.host:9200 (all logs, no auth)
4. **Prometheus**: http://soc.acdev.host:9090 (metrics, no auth)
5. **SOC Hub MCP**: http://soc.acdev.host:3200 (API access)

---

## 🔄 Requires Setup (5-10 min)

### TheHive
1. Open: http://soc.acdev.host:9000
2. Create admin user in web UI
3. Suggested: admin@acdev.host / TheHiveAdmin2024!

### Wazuh API (Optional)
- Elasticsearch provides same alert data
- Only needed for agent management
- Setup via Wazuh Dashboard if available

---

## 📁 Keycloak SSO

**Server**: https://acdev.host:8443/
**Realm**: mcp-agents
**Client**: soc-hub (for dashboard)

---

## 📝 Important Files

### VMI03 (soc.acdev.host)
```
/var/www/soc/                      # SOC Dashboard
/opt/mcp/services/soc-hub-mcp/     # SOC Hub MCP
/opt/thehive/                      # TheHive
/etc/grafana/grafana.ini           # Grafana config
```

### Local Documentation
```
SOC_CREDENTIALS.md                 # Full credentials guide
SOC_DASHBOARDS_GUIDE.md            # Dashboard documentation
SOC_HUB_WORKING_CONFIGURATION.md   # MCP configuration
SOC_QUICK_REFERENCE.md             # This file
```

---

## 🔧 Common Commands

```bash
# SSH to SOC server
ssh root@154.26.158.31

# Check Grafana
curl -u admin:GrafanaAdmin2024! http://soc.acdev.host:3000/api/health

# Check Elasticsearch
curl http://soc.acdev.host:9200

# Check TheHive
docker ps | grep thehive

# Check SOC Hub MCP
curl http://soc.acdev.host:3200/api/health

# Restart services
systemctl restart grafana-server
cd /opt/thehive && docker-compose restart
```

---

## ⚠️ Known Status

- ✅ Grafana: Working (verified credentials)
- ✅ Elasticsearch: Working (no auth)
- ✅ Prometheus: Working (no auth)
- ✅ SOC Dashboard: Deployed with Keycloak
- ✅ SOC Hub MCP: Deployed, HTTP API ready
- 🔄 TheHive: First-time setup needed
- 🔄 Wazuh API: Optional setup needed
- ❌ CrowdSec: Not installed

---

## 📊 SOC Hub MCP Tools

8 tools available via MCP protocol:

**Working Now** (no credentials needed):
1. `soc_search_ip` - Search by IP address (Elasticsearch)
2. `soc_health_check` - Service health status

**After TheHive Setup**:
3. `soc_get_cases` - Incident cases
4. `soc_create_case` - Create incident

**After Wazuh Setup** (optional):
5. `soc_get_agents` - Agent status
6. `soc_get_alerts` - Security alerts
7. `soc_get_dashboard` - Complete overview

**Not Available**:
8. `soc_get_threat_intel` - CrowdSec (not installed)

---

## 🔐 Password Summary

| Component | Username | Password | Status |
|-----------|----------|----------|--------|
| Grafana | admin | GrafanaAdmin2024! | ✅ Working |
| TheHive | admin@acdev.host | *Create on first visit* | 🔄 Setup |
| Elasticsearch | - | *No auth* | ✅ Working |
| Prometheus | - | *No auth* | ✅ Working |
| Wazuh API | - | *Create via dashboard* | 🔄 Setup |
| SSH (VMI03) | root | C0nnaught | ✅ Working |

---

## 📞 Support

**Full Documentation**:
- SOC_CREDENTIALS.md - Complete credentials & setup guide
- SOC_DASHBOARDS_GUIDE.md - Dashboard features & access
- SOC_HUB_WORKING_CONFIGURATION.md - MCP configuration

**Troubleshooting**:
1. Check service status: `systemctl status <service>`
2. View logs: `journalctl -u <service> -n 50`
3. Test connectivity: `curl http://soc.acdev.host:<port>`

---

**Print this card for quick access to SOC infrastructure!**
