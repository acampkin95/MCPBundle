# SOC Project Summary and Credentials

## Project Overview

The SOC (Security Operations Center) deployment provides enterprise-grade security infrastructure across the 3-VM MCP Bundle ecosystem. It implements a multi-layer defense strategy with comprehensive monitoring, threat detection, and incident response capabilities.

## Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────┐
│                     VMI03 (SOC Hub)                         │
│                   154.26.158.31                             │
├─────────────────────────────────────────────────────────────┤
│ • Wazuh Manager (SIEM)        • Elasticsearch               │
│ • TheHive (Incident Response) • Kibana                      │
│ • Cortex (Threat Intel)       • Grafana                     │
│ • Keycloak (SSO)              • Prometheus                  │
│ • HAProxy (Load Balancer)     • WireGuard VPN               │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
    ┌─────────▼───────────┐         ┌────────▼──────────┐
    │   VMI01 (Primary)   │         │  VMI02D (Standby) │
    │   46.250.243.123    │         │   46.250.241.70   │
    ├─────────────────────┤         ├───────────────────┤
    │ • PostgreSQL        │         │ • PostgreSQL      │
    │ • MCP Services      │         │ • NextCloud       │
    │ • Wazuh Agent       │         │ • Plex Media      │
    │ • Suricata IPS      │         │ • Wazuh Agent     │
    │ • CrowdSec          │         │ • Suricata IPS    │
    │ • Falco EDR         │         │ • CrowdSec        │
    └─────────────────────┘         └───────────────────┘
```

## Security Layers Deployed

1. **Network Firewall (nftables)** - IP whitelisting, VPN-only internal services
2. **Intrusion Prevention (Suricata)** - Inline traffic inspection, signature-based detection
3. **Threat Intelligence (CrowdSec)** - Community threat feeds, auto-banning
4. **Runtime Security (Falco)** - Kernel-level behavioral monitoring
5. **SIEM & Incident Response (Wazuh + TheHive)** - Centralized logging and case management

## Access Credentials

### Database (PostgreSQL)

- **Database**: mcp_ecosystem
- **Host**: 46.250.243.123 (VMI01)
- **Port**: 5432
- **Username**: mcp_admin
- **Password**: Stored in Contabo Secrets as `mcp-db-admin-password`. Pull locally via `npm run secrets:pull -- --out .env.secrets` (exports `DB_ADMIN_PASSWORD`).
- **Connection String**:
  ```
  postgresql://mcp_admin:${DB_ADMIN_PASSWORD}@46.250.243.123:5432/mcp_ecosystem
  ```

### SSH Access

- **All Nodes** (VMI01, VMI02D, VMI03, Jump Box)
  - Username: root
  - Password: Contabo Secrets entry `mcp-root-password` (export as `MCP_ROOT_PASSWORD`)

### Jump Box (154.26.158.68)

- **SSH**: root / `mcp-root-password`
- **Internal Nodes** (via jump box):
  - 10.0.0.1 (VMI01): root / `mcp-root-password`
  - 10.0.0.2 (VMI02D): root / `mcp-root-password`
  - 10.0.0.3 (VMI03): root / `mcp-root-password`

### WireGuard VPN

- **Server**: 154.26.158.68:51821
- **Admin Client**: 10.10.10.2/24
- **ACDev Access**: 10.10.10.3/24
- **DNS**: 10.10.10.1 (AdGuard Home)

### AdGuard Home

- **URL**: http://10.10.10.1:3000 (VPN access only)
- **Username**: admin
- **Password**: admin (CHANGE ON FIRST LOGIN!)

### SOC Services Credentials

#### Elasticsearch & Kibana (VMI03)

- **Elasticsearch API**: http://localhost:9200
- **Kibana UI**: http://154.26.158.31:5601 (VPN only)
- **Credentials Location**: `/opt/mcp/credentials/elasticsearch.txt`
- **Default User**: elastic
- **Password**: Auto-generated during deployment (check credentials file)

#### TheHive (VMI03)

- **URL**: http://154.26.158.31:9000 (VPN only)
- **Credentials Location**: `/opt/mcp/credentials/thehive.txt`
- **Initial Setup**: Required on first access

#### Cortex (VMI03)

- **URL**: http://154.26.158.31:9001 (VPN only)
- **API Key**: Generated after TheHive setup

#### Wazuh Manager (VMI03)

- **API**: https://154.26.158.31:55000
- **Credentials Location**: `/var/ossec/etc/authd.pass`
- **Agent Ports**:
  - 1514 (Agent communication)
  - 1515 (Agent enrollment)

#### Grafana (VMI03)

- **URL**: http://154.26.158.31:3000 (VPN only)
- **Default**: admin / admin (change on first login)

#### Prometheus (VMI03)

- **URL**: http://154.26.158.31:9090 (VPN only)
- **No authentication by default**

#### Keycloak (VMI03)

- **URL**: https://154.26.158.31:8443
- **Admin Console**: /auth/admin
- **Default**: admin / admin (change on first login)

## Network Configuration

### Whitelisted IPs

- **58.105.139.107** - Full SSH access to all nodes
- **MAC Address**: 6e:d9:d3:17:f6:48 (whitelisted)

### VPN Networks

- **10.0.50.0/24** - VPN Mesh 1
- **10.0.51.0/24** - VPN Mesh 2
- **10.0.52.0/24** - VPN Mesh 3
- **10.10.10.0/24** - User VPN (WireGuard)

### Public Services

- **VMI02D**: NextCloud (443), Plex (32400)
- **VMI03**: HTTP/HTTPS (80/443), Keycloak (8443), WireGuard (51821)

### Internal Services (VPN Only)

- SSH (22), PostgreSQL (5432), MCP services (3000-3002)
- Kibana (5601), TheHive (9000), Grafana (3000), Prometheus (9090)

## Quick Access Commands

### Direct SSH Access

```bash
# Direct to nodes (IP whitelisted)
ssh root@46.250.243.123  # VMI01
ssh root@46.250.241.70   # VMI02D
ssh root@154.26.158.31   # VMI03
ssh root@154.26.158.68   # Jump Box

# Via jump box proxy
ssh -J root@154.26.158.68 root@10.0.0.1  # VMI01
ssh -J root@154.26.158.68 root@10.0.0.2  # VMI02D
ssh -J root@154.26.158.68 root@10.0.0.3  # VMI03
```

### Check Service Status

```bash
# VMI01
ssh root@46.250.243.123 'systemctl status nftables suricata crowdsec falco wazuh-agent postgresql'

# VMI02D
ssh root@46.250.241.70 'systemctl status nftables suricata crowdsec falco wazuh-agent'

# VMI03
ssh root@154.26.158.31 'systemctl status wazuh-manager elasticsearch kibana thehive cortex'
```

### View Security Alerts

```bash
# Suricata alerts
ssh root@<host> 'tail -f /var/log/suricata/eve.json | jq "select(.event_type==\"alert\")"'

# Falco events
ssh root@<host> 'tail -f /var/log/falco/events.log | jq .'

# CrowdSec decisions
ssh root@<host> 'cscli decisions list'

# Wazuh alerts
ssh root@154.26.158.31 'tail -f /var/ossec/logs/alerts/alerts.log'
```

### Access Web Interfaces (VPN Required)

```bash
# Connect to VPN first using WireGuard configuration
# Then access:

# Kibana
open http://10.0.52.1:5601

# TheHive
open http://10.0.52.1:9000

# Grafana
open http://10.0.52.1:3000

# AdGuard Home
open http://10.10.10.1:3000
```

## Post-Deployment Tasks

### Critical Actions Required

1. **Change Default Passwords**
   - AdGuard Home admin password
   - Grafana admin password
   - Keycloak admin password
   - Elasticsearch elastic user password

2. **Register Wazuh Agents**

   ```bash
   ssh root@154.26.158.31 '/var/ossec/bin/manage_agents'
   # Add agents for VMI01 and VMI02D
   ```

3. **Configure TheHive**
   - Complete initial setup wizard
   - Create organization and users
   - Generate Cortex API key
   - Update configuration with Cortex integration

4. **Install Cortex Analyzers**

   ```bash
   ssh root@154.26.158.31 '/usr/local/bin/install-cortex-analyzers.sh'
   ```

5. **Import Kibana Dashboards**
   - Access Kibana UI
   - Import Wazuh dashboards
   - Create index patterns for Suricata and Falco

## Security Features Active

### Detection Capabilities

- Network intrusion detection (Suricata)
- File integrity monitoring (Wazuh FIM)
- Vulnerability scanning (Wazuh CVE)
- Container escape detection (Falco)
- Privilege escalation detection (Falco)
- Cryptocurrency mining detection (Falco)
- Reverse shell detection (Falco)
- Brute force protection (CrowdSec)

### Automated Responses

- IP auto-banning (CrowdSec + nftables)
- Threat feed updates (daily)
- Log rotation and archival
- Backup verification (SHA256 hashing)
- Service auto-restart on failure
- Alert correlation and enrichment

### Monitoring & Reporting

- Real-time security dashboards (Kibana)
- Incident case management (TheHive)
- Threat intelligence analysis (Cortex)
- Performance metrics (Grafana)
- Daily security reports
- Weekly summary reports

## Log Locations

```
/var/log/suricata/          - IPS logs
/var/log/falco/             - Runtime security logs
/var/log/crowdsec.log       - Threat intelligence logs
/var/ossec/logs/            - SIEM logs
/var/log/elasticsearch/     - Search engine logs
/opt/soc/logs/              - SOC sync logs
/opt/soc/reports/           - Security reports
```

## Important Files

### Credentials Storage

- `/opt/mcp/credentials/elasticsearch.txt` - Elasticsearch passwords
- `/opt/mcp/credentials/thehive.txt` - TheHive credentials
- `/var/ossec/etc/authd.pass` - Wazuh authentication
- `/etc/wireguard/*.key` - WireGuard private keys

### Configuration Files

- `/etc/nftables.conf` - Firewall rules
- `/etc/suricata/suricata.yaml` - IPS configuration
- `/etc/crowdsec/config.yaml` - Threat intelligence config
- `/etc/falco/falco.yaml` - Runtime security config
- `/var/ossec/etc/ossec.conf` - SIEM configuration
- `/etc/wireguard/wg0.conf` - VPN configuration

### Deployment Scripts

- `/Users/alex/Projects/MCP Bundle/deployment/soc/` - All SOC deployment scripts
- `/opt/soc/soc_sync.sh` - Nightly maintenance script
- `/usr/local/bin/soc-dashboard.sh` - SOC status dashboard

## Maintenance Schedule

### Automated (Cron)

- **Daily 2:00 AM**: Threat feed updates, decision exports, backup verification
- **Weekly Monday 3:00 AM**: Weekly security summary report
- **Daily**: Suricata rule updates, CrowdSec hub updates
- **Hourly**: Elasticsearch health checks

### Manual (Monthly)

- Review and rotate logs
- Update system packages
- Review security alerts and incidents
- Test backup restoration
- Verify firewall rules
- Review and tune detection rules
- Rotate credentials

## Support & Troubleshooting

### Quick Diagnostics

```bash
# Run SOC dashboard
ssh root@<host> '/usr/local/bin/soc-dashboard.sh'

# Check deployment logs
ssh root@<host> 'ls -la /var/log/soc-*-deploy.log'

# View service logs
ssh root@<host> 'journalctl -u <service-name> -n 50 --no-pager'
```

### Common Issues & Solutions

**Service not starting**: Check systemd logs and ensure dependencies are running
**High memory usage**: Adjust Elasticsearch heap size in jvm.options
**Wazuh agent disconnected**: Verify network connectivity and agent registration
**Firewall blocking traffic**: Check nftables rules and whitelist requirements
**Dashboard not accessible**: Ensure VPN is connected and service is running

---

**Deployment Date**: November 2025
**Version**: MCP Bundle v0.2.0 with SOC Infrastructure
**Support**: GitHub Issues - https://github.com/anthropics/claude-code/issues

⚠️ **Security Notice**: Store credentials securely, rotate passwords regularly, and limit access to authorized personnel only.
