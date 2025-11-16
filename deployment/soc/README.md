# SOC Security Deployment Scripts

Enterprise-grade Security Operations Center (SOC) deployment automation for MCP Bundle infrastructure.

## Overview

This directory contains 9 comprehensive deployment scripts for building a production SOC across the 3-VM MCP infrastructure:

- **VMI01** (46.250.243.123): MCP/AI Primary - Full security stack
- **VMI02D** (46.250.241.70): Data/CDN Standby - Full security stack
- **VMI03** (154.26.158.31): Gateway/SOC Hub - Central management + all SOC services

## Security Architecture

### Multi-Layer Defense

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Network Firewall (nftables)                        │
│  - IP whitelisting, VPN-only internal services              │
├─────────────────────────────────────────────────────────────┤
│ Layer 2: Intrusion Prevention (Suricata IPS)                │
│  - Inline traffic inspection, signature-based detection     │
├─────────────────────────────────────────────────────────────┤
│ Layer 3: Threat Intelligence (CrowdSec)                     │
│  - Community-powered threat feeds, auto-banning             │
├─────────────────────────────────────────────────────────────┤
│ Layer 4: Runtime Security (Falco)                           │
│  - Kernel-level behavioral monitoring, anomaly detection    │
├─────────────────────────────────────────────────────────────┤
│ Layer 5: SIEM & Incident Response (Wazuh + TheHive)         │
│  - Centralized logging, correlation, case management        │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Scripts

### 1. `deploy-nftables.sh`

**Network Firewall with Per-Host Rules**

```bash
./deploy-nftables.sh [VMI01|VMI02D|VMI03|all]
```

**Features:**

- Per-host firewall rules optimized for each node's role
- IP whitelisting (58.105.139.107)
- VPN mesh isolation (10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24)
- User VPN support (10.10.10.0/24)
- Rate limiting and brute force protection
- Service-specific port controls

**VMI01 Firewall:**

- SSH 22 (whitelist + VPN)
- PostgreSQL 5432 (VPN mesh only)
- Redis 6379 (localhost only)
- MCP Services 3000-3002 (VPN only)

**VMI02D Firewall:**

- SSH 22 (whitelist + VPN)
- NextCloud 443 (public)
- Plex 32400 (public)
- PostgreSQL 5432 (VMI01 only)
- Elasticsearch 9200 (VMI03 only)

**VMI03 Firewall:**

- SSH 22 (whitelist + VPN)
- HTTP/HTTPS 80/443 (public)
- Keycloak 8443 (public)
- WireGuard 51820 (public)
- All SOC services (VPN only): Kibana 5601, TheHive 9000, Grafana 3000, Prometheus 9090, HAProxy 8404

### 2. `deploy-suricata.sh`

**Intrusion Prevention System**

```bash
./deploy-suricata.sh [VMI01|VMI02D|VMI03|all]
```

**Features:**

- Inline IPS mode with nftables integration
- Multi-interface monitoring (eth0, wg0 on VMI03)
- Automatic rule updates (ET Open, OISF TrafficID, SSL blacklists)
- JSON logging for SIEM integration
- Daily rule update cron job
- Performance-tuned for production

**Rule Sources:**

- Emerging Threats Open
- OISF Traffic ID
- SSL Blacklist (SSLBL)
- JA3 Fingerprints
- Custom aggressive rules

### 3. `deploy-crowdsec.sh`

**Collaborative Threat Intelligence**

```bash
./deploy-crowdsec.sh [VMI01|VMI02D|VMI03|all]
```

**Features:**

- nftables bouncer for automatic IP blocking
- Community threat feed integration
- Multi-log source parsing (SSH, Nginx, PostgreSQL, Suricata, Falco)
- Customizable ban durations (4h default, 24h aggressive)
- Prometheus metrics endpoint
- Daily decision export for audit

**Collections Installed:**

- Linux, SSH, Nginx, Apache, PostgreSQL
- Suricata, HTTP CVE, Base HTTP scenarios

### 4. `deploy-falco.sh`

**Runtime Security & EDR**

```bash
./deploy-falco.sh [VMI01|VMI02D|VMI03|all]
```

**Features:**

- Kernel-level system call monitoring
- Container escape detection
- Privilege escalation alerts
- File integrity monitoring for critical paths
- Custom rules for MCP infrastructure
- JSON output for SIEM integration

**Custom Detection Rules:**

- PostgreSQL connection monitoring
- SSH key access tracking
- Cryptocurrency mining detection
- Reverse shell detection
- Container escape attempts
- Critical file modification alerts

### 5. `deploy-wazuh-manager.sh`

**SIEM Manager (VMI03 Only)**

```bash
./deploy-wazuh-manager.sh
```

**Features:**

- Central log aggregation from all nodes
- File Integrity Monitoring (FIM)
- Vulnerability scanning (CVE database)
- Security Configuration Assessment (SCA)
- Active Response capabilities
- Custom rules for MCP services

**Monitored Logs:**

- System: syslog, auth.log, kern.log
- Security: Suricata, Falco, CrowdSec
- Services: PostgreSQL, Nginx, MCP logs

**Agent Ports:**

- 1514: Agent communication (TCP)
- 1515: Agent enrollment (TCP)
- 55000: Wazuh API (HTTPS)

### 6. `deploy-wazuh-agent.sh`

**SIEM Agents (VMI01 & VMI02D)**

```bash
./deploy-wazuh-agent.sh [VMI01|VMI02D|all]
```

**Features:**

- Lightweight log forwarder
- Local FIM and rootkit detection
- System inventory collection
- Automatic vulnerability scanning
- TLS-encrypted communication to manager

**Post-Deployment:**
Agents must be registered on the manager (VMI03):

```bash
ssh root@154.26.158.31 '/var/ossec/bin/manage_agents'
```

### 7. `deploy-elasticsearch.sh`

**Log Storage & Analytics (VMI03 Only)**

```bash
./deploy-elasticsearch.sh
```

**Features:**

- Single-node Elasticsearch cluster
- Kibana visualization interface
- Index Lifecycle Management (ILM)
- Auto-scaling heap (50% RAM, max 4GB)
- Log retention: 90 days
- SOC-optimized index templates

**Access:**

- Elasticsearch: http://localhost:9200
- Kibana: http://VMI03:5601 (VPN only)
- Credentials: `/opt/mcp/credentials/elasticsearch.txt`

### 8. `deploy-thehive-cortex.sh`

**Incident Response Platform (VMI03 Only)**

```bash
./deploy-thehive-cortex.sh
```

**Features:**

- TheHive: Security incident & case management
- Cortex: Automated threat intelligence analysis
- Cassandra database backend
- Wazuh alert integration
- Analyzer framework for automated triage

**Components:**

- TheHive: http://VMI03:9000 (VPN only)
- Cortex: http://VMI03:9001 (VPN only)
- Cassandra: localhost:9042

**Post-Deployment:**

1. Complete TheHive initial setup
2. Generate Cortex API key
3. Install analyzers: `/usr/local/bin/install-cortex-analyzers.sh`

### 9. `deploy-soc-sync.sh`

**Nightly Maintenance & Reporting**

```bash
./deploy-soc-sync.sh [VMI01|VMI02D|VMI03|all]
```

**Features:**

- Automated threat feed updates (Suricata, CrowdSec, Wazuh)
- Security decision exports and audit trails
- Backup verification with SHA256 hashing
- Log rotation and cleanup
- Security metrics collection
- Multi-channel notifications (email, Nextcloud, Slack, Telegram)

**Schedule:**

- Daily sync: 2:00 AM
- Weekly summary: 3:00 AM Monday

**Configuration:**
Edit `/opt/soc/config.yaml` to enable notifications.

**Dashboard:**

```bash
ssh root@<host> '/usr/local/bin/soc-dashboard.sh'
```

## Deployment Order

### Quick Deployment (All Hosts)

```bash
cd /Users/alex/Projects/MCP\ Bundle/deployment/soc/

# 1. Network layer
./deploy-nftables.sh all

# 2. IPS layer
./deploy-suricata.sh all

# 3. Threat intelligence
./deploy-crowdsec.sh all

# 4. Runtime security
./deploy-falco.sh all

# 5. SIEM manager (VMI03)
./deploy-wazuh-manager.sh

# 6. SIEM agents (VMI01, VMI02D)
./deploy-wazuh-agent.sh all

# 7. Log analytics (VMI03)
./deploy-elasticsearch.sh

# 8. Incident response (VMI03)
./deploy-thehive-cortex.sh

# 9. Automated maintenance
./deploy-soc-sync.sh all
```

### Selective Deployment

Deploy to specific hosts:

```bash
./deploy-nftables.sh VMI01
./deploy-suricata.sh VMI03
./deploy-wazuh-agent.sh VMI02D
```

## Post-Deployment Tasks

### 1. Wazuh Agent Registration

On each agent (VMI01, VMI02D):

```bash
ssh root@154.26.158.31 '/var/ossec/bin/manage_agents'
# Select 'A' to add agent
# Enter hostname: VMI01 or VMI02D
# Extract key and import on agent
```

### 2. TheHive Configuration

1. Access TheHive: http://154.26.158.31:9000 (via VPN)
2. Complete initial setup wizard
3. Create organization and users
4. Generate Cortex API key
5. Update TheHive config with Cortex key:
   ```bash
   ssh root@154.26.158.31
   vi /etc/thehive/application.conf
   # Update: cortex.servers[0].auth.key = "YOUR_KEY"
   systemctl restart thehive
   ```

### 3. Cortex Analyzers

Install threat intelligence analyzers:

```bash
ssh root@154.26.158.31 '/usr/local/bin/install-cortex-analyzers.sh'
```

### 4. SOC Notifications

Configure notification channels in `/opt/soc/config.yaml`:

```yaml
notifications:
  email:
    enabled: true
    to: admin@example.com

  nextcloud:
    enabled: true
    webhook_url: https://your-nextcloud.com/webhook
```

### 5. Elasticsearch Kibana Setup

1. Access Kibana: http://154.26.158.31:5601 (via VPN)
2. Get credentials: `ssh root@154.26.158.31 'cat /opt/mcp/credentials/elasticsearch.txt'`
3. Import Wazuh dashboards
4. Create index patterns for Suricata, Falco

## Verification

### Check All Services

```bash
# VMI01
ssh root@46.250.243.123 'systemctl status nftables suricata crowdsec falco wazuh-agent'

# VMI02D
ssh root@46.250.241.70 'systemctl status nftables suricata crowdsec falco wazuh-agent'

# VMI03
ssh root@154.26.158.31 'systemctl status nftables suricata crowdsec falco wazuh-manager elasticsearch kibana thehive cortex cassandra'
```

### View SOC Dashboard

```bash
ssh root@<host> '/usr/local/bin/soc-dashboard.sh'
```

### Check Logs

```bash
# Suricata alerts
ssh root@<host> 'tail -f /var/log/suricata/eve.json | jq .'

# Falco events
ssh root@<host> 'tail -f /var/log/falco/events.log | jq .'

# CrowdSec decisions
ssh root@<host> 'cscli decisions list'

# Wazuh alerts
ssh root@154.26.158.31 'tail -f /var/ossec/logs/alerts/alerts.log'
```

## Security Credentials

All generated credentials are stored securely:

- **Elasticsearch**: `/opt/mcp/credentials/elasticsearch.txt` (VMI03)
- **TheHive**: `/opt/mcp/credentials/thehive.txt` (VMI03)
- **Wazuh**: `/var/ossec/etc/authd.pass` (VMI03)

**IMPORTANT**: Change all default passwords on first login!

## Firewall Rules Summary

### IP Whitelist

- **58.105.139.107**: Full access to all hosts

### VPN Networks

- **10.0.50.0/24**: VPN Mesh 1
- **10.0.51.0/24**: VPN Mesh 2
- **10.0.52.0/24**: VPN Mesh 3
- **10.10.10.0/24**: User VPN (VMI03 gateway)

### Public Services

- **VMI02D**: NextCloud (443), Plex (32400)
- **VMI03**: HTTP/HTTPS (80/443), Keycloak (8443), WireGuard (51820)

### Internal Services (VPN Only)

- **All hosts**: SSH (22), PostgreSQL (5432), MCP services (3000-3002)
- **VMI03**: Kibana (5601), TheHive (9000), Grafana (3000), Prometheus (9090)

## Troubleshooting

### Service Not Starting

Check systemd logs:

```bash
journalctl -u <service-name> -n 50 --no-pager
```

### Firewall Blocking Legitimate Traffic

Temporarily allow traffic:

```bash
ssh root@<host> 'nft add rule inet filter input ip saddr X.X.X.X accept'
```

Then update permanent rules in `/etc/nftables.d/base.nft`

### Wazuh Agent Not Connecting

Check connectivity:

```bash
ssh root@<agent-host> 'telnet 10.0.52.1 1514'
```

Verify agent registration:

```bash
ssh root@154.26.158.31 '/var/ossec/bin/agent_control -l'
```

### High Memory Usage

Adjust Elasticsearch heap:

```bash
ssh root@154.26.158.31 'vi /etc/elasticsearch/jvm.options.d/heap.options'
# Reduce -Xms and -Xmx values
systemctl restart elasticsearch
```

## Maintenance

### Manual Sync Run

```bash
ssh root@<host> '/opt/soc/soc_sync.sh'
```

### Update Threat Feeds

```bash
# Suricata
ssh root@<host> 'suricata-update && systemctl reload suricata'

# CrowdSec
ssh root@<host> 'cscli hub update && cscli hub upgrade'
```

### Backup Verification

```bash
ssh root@<host> 'cat /opt/soc/backup_hashes_$(date +%Y%m%d).txt'
```

## Monitoring

### Prometheus Metrics

All components export metrics:

- **Suricata**: Eve.json stats
- **CrowdSec**: http://localhost:60601/metrics
- **Falco**: Event counts in logs
- **Wazuh**: API metrics

### Grafana Dashboards

Import dashboards for:

- Network traffic (Suricata)
- Security alerts (CrowdSec, Falco)
- System health (Wazuh)

## Logs & Reports

### Log Locations

```
/var/log/suricata/          - Suricata IPS logs
/var/log/falco/             - Falco runtime security logs
/var/log/crowdsec.log       - CrowdSec engine logs
/var/ossec/logs/            - Wazuh logs
/var/log/elasticsearch/     - Elasticsearch logs
/opt/soc/logs/              - SOC sync logs
/opt/soc/reports/           - Daily/weekly reports
```

### Report Access

```bash
# Daily SOC report
ssh root@<host> 'cat /opt/soc/reports/soc_report_$(date +%Y%m%d).json | jq .'

# Weekly summary
ssh root@<host> 'cat /opt/soc/reports/weekly_summary_$(date +%Y%W).json | jq .'
```

## Architecture Diagram

```
                    Internet
                        │
                        ▼
              ┌─────────────────┐
              │   VMI03 (SOC)   │
              │  154.26.158.31  │
              ├─────────────────┤
              │ • nftables      │
              │ • Suricata      │
              │ • CrowdSec      │
              │ • Falco         │
              │ • Wazuh Manager │◄─────┐
              │ • Elasticsearch │      │
              │ • Kibana        │      │
              │ • TheHive       │      │
              │ • Cortex        │      │
              │ • WireGuard VPN │      │
              └────────┬────────┘      │
                       │               │
          VPN Mesh (10.0.50-52.0/24)  │
          ┌────────────┴────────────┐  │
          ▼                         ▼  │
┌──────────────────┐      ┌──────────────────┐
│  VMI01 (Primary) │      │ VMI02D (Standby) │
│ 46.250.243.123   │      │ 46.250.241.70    │
├──────────────────┤      ├──────────────────┤
│ • nftables       │      │ • nftables       │
│ • Suricata       │      │ • Suricata       │
│ • CrowdSec       │      │ • CrowdSec       │
│ • Falco          │      │ • Falco          │
│ • Wazuh Agent    │──────┤ • Wazuh Agent    │
│ • PostgreSQL     │      │ • PostgreSQL     │
│ • MCP Services   │      │ • NextCloud      │
└──────────────────┘      └──────────────────┘
```

## Support

For issues or questions:

1. Check service logs: `journalctl -u <service>`
2. Review deployment log: `/var/log/soc-*-deploy.log`
3. Check SOC dashboard: `/usr/local/bin/soc-dashboard.sh`
4. Verify network connectivity with `nmap` or `telnet`

## License

Part of MCP Bundle v0.2.0 - Enterprise SOC Security Infrastructure

---

**Last Updated**: 2025-11-08
**Version**: 1.0.0
**Author**: Claude Code SOC Deployment System
