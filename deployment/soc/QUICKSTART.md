# SOC Deployment Quick Start

## One-Command Full Deployment

```bash
cd /Users/alex/Projects/MCP\ Bundle/deployment/soc/
./deploy-all.sh
```

This will deploy the complete SOC stack across all three VMs in the correct order with verification.

## Individual Component Deployment

```bash
# Network firewall (nftables)
./deploy-nftables.sh all

# Intrusion Prevention (Suricata)
./deploy-suricata.sh all

# Threat Intelligence (CrowdSec)
./deploy-crowdsec.sh all

# Runtime Security (Falco)
./deploy-falco.sh all

# SIEM Manager (Wazuh on VMI03)
./deploy-wazuh-manager.sh

# SIEM Agents (Wazuh on VMI01 & VMI02D)
./deploy-wazuh-agent.sh all

# Log Analytics (Elasticsearch + Kibana on VMI03)
./deploy-elasticsearch.sh

# Incident Response (TheHive + Cortex on VMI03)
./deploy-thehive-cortex.sh

# Automated Maintenance (all hosts)
./deploy-soc-sync.sh all
```

## Selective Host Deployment

Deploy to specific host:

```bash
./deploy-nftables.sh VMI01
./deploy-suricata.sh VMI02D
./deploy-falco.sh VMI03
```

## Verification

Run comprehensive health checks:

```bash
./verify-soc.sh
```

Quick verification:

```bash
./verify-soc.sh --quick
```

## Post-Deployment Checklist

### 1. Register Wazuh Agents (Required)

```bash
# On VMI03 (manager)
ssh root@154.26.158.31 '/var/ossec/bin/manage_agents'

# Select 'A' to add agent
# Enter hostname: VMI01
# Extract the key

# On VMI01 (agent)
ssh root@46.250.243.123 '/var/ossec/bin/manage_agents'

# Select 'I' to import key
# Paste the key from manager
# Restart agent: systemctl restart wazuh-agent

# Repeat for VMI02D
```

### 2. Configure TheHive + Cortex

```bash
# Access TheHive web interface (via VPN)
# http://154.26.158.31:9000

# 1. Complete initial setup wizard
# 2. Create organization
# 3. Create admin user
# 4. Access Cortex: http://154.26.158.31:9001
# 5. Generate Cortex API key
# 6. Update TheHive config:

ssh root@154.26.158.31 << 'EOF'
vi /etc/thehive/application.conf
# Update: cortex.servers[0].auth.key = "YOUR_API_KEY"
systemctl restart thehive
EOF
```

### 3. Install Cortex Analyzers

```bash
ssh root@154.26.158.31 '/usr/local/bin/install-cortex-analyzers.sh'
```

### 4. Configure SOC Notifications

```bash
# Edit notification settings on each host
ssh root@<host> 'vi /opt/soc/config.yaml'

# Enable email, Nextcloud, Slack, or Telegram notifications
```

### 5. Import Kibana Dashboards

```bash
# Access Kibana (via VPN)
# http://154.26.158.31:5601

# Get credentials
ssh root@154.26.158.31 'cat /opt/mcp/credentials/elasticsearch.txt'

# Import dashboards:
# - Wazuh overview
# - Suricata IDS
# - Falco runtime security
# - CrowdSec threat intelligence
```

## Quick Access

### Credentials

```bash
# Elasticsearch
ssh root@154.26.158.31 'cat /opt/mcp/credentials/elasticsearch.txt'

# TheHive + Cortex
ssh root@154.26.158.31 'cat /opt/mcp/credentials/thehive.txt'

# Wazuh
ssh root@154.26.158.31 'cat /var/ossec/etc/authd.pass'
```

### Web Interfaces (VPN Access Required)

```
Kibana:      http://154.26.158.31:5601
TheHive:     http://154.26.158.31:9000
Cortex:      http://154.26.158.31:9001
Grafana:     http://154.26.158.31:3000
Prometheus:  http://154.26.158.31:9090
```

### Dashboard & Status

```bash
# SOC dashboard (quick status overview)
ssh root@<host> '/usr/local/bin/soc-dashboard.sh'

# Service status
ssh root@<host> 'systemctl status nftables suricata crowdsec falco'

# Wazuh status
ssh root@154.26.158.31 '/usr/local/bin/wazuh-status.sh'

# Elasticsearch status
ssh root@154.26.158.31 '/usr/local/bin/elasticsearch-status.sh'

# TheHive status
ssh root@154.26.158.31 '/usr/local/bin/thehive-status.sh'
```

### Live Monitoring

```bash
# Suricata alerts
ssh root@<host> 'tail -f /var/log/suricata/eve.json | jq "select(.event_type==\"alert\")"'

# Falco events
ssh root@<host> 'tail -f /var/log/falco/events.log | jq .'

# CrowdSec decisions
ssh root@<host> 'watch cscli decisions list'

# Wazuh alerts
ssh root@154.26.158.31 'tail -f /var/ossec/logs/alerts/alerts.log'
```

### Reports

```bash
# Daily SOC report
ssh root@<host> 'cat /opt/soc/reports/soc_report_$(date +%Y%m%d).json | jq .'

# Weekly summary
ssh root@<host> 'cat /opt/soc/reports/weekly_summary_$(date +%Y%W).json | jq .'

# Falco daily report
ssh root@<host> '/usr/local/bin/falco-report.sh'

# CrowdSec report
ssh root@<host> '/usr/local/bin/crowdsec-report.sh'
```

## Common Operations

### Update Threat Feeds

```bash
# Suricata
ssh root@<host> 'suricata-update && systemctl reload suricata'

# CrowdSec
ssh root@<host> 'cscli hub update && cscli hub upgrade'

# Wazuh
ssh root@154.26.158.31 '/var/ossec/bin/wazuh-control reload'
```

### Manual Sync Run

```bash
ssh root@<host> '/opt/soc/soc_sync.sh'
```

### Export Security Decisions

```bash
# CrowdSec banlist
ssh root@<host> 'cscli decisions export -o json > /tmp/banlist.json'

# View current bans
ssh root@<host> 'cscli decisions list'
```

### Check Firewall Rules

```bash
# List all nftables rules
ssh root@<host> 'nft list ruleset'

# Count active rules
ssh root@<host> 'nft list ruleset | wc -l'

# Check specific chain
ssh root@<host> 'nft list chain inet filter input'
```

## Troubleshooting

### Service Not Starting

```bash
# Check logs
ssh root@<host> 'journalctl -u <service-name> -n 50 --no-pager'

# Check service status
ssh root@<host> 'systemctl status <service-name>'

# Restart service
ssh root@<host> 'systemctl restart <service-name>'
```

### High Resource Usage

```bash
# Check CPU/memory
ssh root@<host> 'top -bn1 | head -20'

# Check disk usage
ssh root@<host> 'df -h'

# Check service resource usage
ssh root@<host> 'systemctl status <service-name> | grep -A5 "Memory:"'
```

### Connectivity Issues

```bash
# Test port connectivity
ssh root@<host> 'nc -zv <target-ip> <port>'

# Check listening ports
ssh root@<host> 'ss -tlnp'

# Test firewall rules
ssh root@<host> 'nft list ruleset | grep <ip-address>'
```

### Wazuh Agent Not Connecting

```bash
# Check agent status
ssh root@<agent-host> '/var/ossec/bin/wazuh-control status'

# Check connection to manager
ssh root@<agent-host> 'telnet 10.0.52.1 1514'

# View agent logs
ssh root@<agent-host> 'tail -f /var/ossec/logs/ossec.log'

# Restart agent
ssh root@<agent-host> 'systemctl restart wazuh-agent'
```

## Maintenance Schedule

### Automated (via cron)

- **Daily 2:00 AM**: SOC sync (threat feed updates, exports, backups)
- **Weekly Monday 3:00 AM**: Weekly summary report
- **Daily**: Suricata rule updates
- **Daily**: CrowdSec hub updates
- **Hourly**: Elasticsearch health check

### Manual (recommended monthly)

- Review and rotate logs
- Update system packages
- Review security alerts and incidents
- Test backup restoration
- Verify firewall rules
- Review and tune detection rules

## Architecture Overview

```
Internet → VMI03 (Gateway/SOC Hub)
            ↓
    [nftables → Suricata → CrowdSec]
            ↓
    VPN Mesh (10.0.50-52.0/24)
            ↓
    ┌───────────────┬────────────────┐
    ↓               ↓                ↓
  VMI01         VMI02D           VMI03
  (Primary)     (Standby)        (SOC)
    ↓               ↓                ↓
  Falco           Falco            Falco
  Wazuh Agent     Wazuh Agent      Wazuh Manager
  MCP Services    NextCloud        Elasticsearch
                                   Kibana
                                   TheHive
                                   Cortex
```

## Security Layers

1. **Network Firewall**: IP whitelisting, VPN-only internal services
2. **IPS**: Inline traffic inspection and blocking
3. **Threat Intel**: Community threat feeds, auto-banning
4. **Runtime EDR**: Kernel-level behavioral monitoring
5. **SIEM**: Centralized logging, correlation, incident response

## Support Resources

- **README.md**: Comprehensive documentation
- **SOC-DEPLOY.md**: Original deployment specifications
- **Deployment logs**: `/var/log/soc-*-deploy.log`
- **Service logs**: `/var/log/<service>/`
- **Reports**: `/opt/soc/reports/`

---

**Quick Deploy**: `./deploy-all.sh`
**Quick Verify**: `./verify-soc.sh`
**Quick Status**: `ssh root@<host> '/usr/local/bin/soc-dashboard.sh'`
