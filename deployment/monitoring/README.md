# Monitoring Stack Deployment

Complete deployment scripts for Prometheus, Grafana, and AdGuard Home on VMI03 (154.26.158.31).

## Overview

This monitoring stack provides comprehensive observability for the MCP Bundle infrastructure:

- **Prometheus**: Time-series metrics database with alerting
- **Grafana**: Visualization dashboards with Keycloak SSO integration
- **AdGuard Home**: DNS filtering and ad blocking for VPN users

## Quick Start

### One-Command Deployment

Deploy all components at once:

```bash
sudo ./deploy-monitoring-stack.sh
```

This will deploy Prometheus, Grafana, and AdGuard Home sequentially with full configuration.

### Individual Component Deployment

Deploy components separately:

```bash
# Prometheus only
sudo ./deploy-prometheus.sh

# Grafana only
sudo ./deploy-grafana.sh

# AdGuard Home only
sudo ../dns/deploy-adguard.sh
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     VMI03 (Gateway)                         │
│                   154.26.158.31                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                 │
│  │  Prometheus     │  │    Grafana      │                 │
│  │   Port 9090     │  │   Port 3030     │                 │
│  │                 │  │                 │                 │
│  │  • Metrics DB   │  │  • Dashboards   │                 │
│  │  • Alerting     │  │  • Keycloak SSO │                 │
│  │  • 30d retention│  │  • PostgreSQL   │                 │
│  └────────┬────────┘  └────────┬────────┘                 │
│           │                     │                          │
│           │    Scrapes          │   Queries                │
│           ▼                     ▼                          │
│  ┌──────────────────────────────────────────┐             │
│  │        AdGuard Home (DNS)                │             │
│  │        Ports 53, 3030                    │             │
│  │                                           │             │
│  │  • DNS filtering (10.10.10.1)           │             │
│  │  • Ad blocking (OISD + StevenBlack)     │             │
│  │  • Prometheus metrics export             │             │
│  └──────────────────────────────────────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                        │
                        │ Scrapes targets
                        ▼
        ┌───────────────────────────────────────┐
        │    Monitored Infrastructure           │
        ├───────────────────────────────────────┤
        │  VMI01 (Primary)                      │
        │    • Node Exporter (9100)             │
        │    • PostgreSQL Exporter (9187)       │
        │    • Redis Exporter (9121)            │
        │    • MCP Services (3000-3002)         │
        │                                       │
        │  VMI02D (Standby)                     │
        │    • Node Exporter (9100)             │
        │    • PostgreSQL Exporter (9187)       │
        │                                       │
        │  VMI03 (Gateway)                      │
        │    • Node Exporter (9100)             │
        │    • HAProxy Exporter (9101)          │
        └───────────────────────────────────────┘
```

## Components

### 1. Prometheus

**Purpose**: Metrics collection, storage, and alerting

**Configuration**:

- Version: 2.48.1
- Port: 9090
- Retention: 30 days
- Scrape interval: 15 seconds

**Targets**:

- Node Exporters: VMI01, VMI02D, VMI03 (port 9100)
- PostgreSQL Exporters: VMI01, VMI02D (port 9187)
- Redis Exporter: VMI01 (port 9121)
- HAProxy Exporter: VMI03 (port 9101)
- MCP Services: VMI01 (ports 3000-3002)

**Alert Rules**:

- High CPU usage (>80% warning, >95% critical)
- High memory usage (>80% warning, >90% critical)
- High disk usage (>80% warning, >90% critical)
- Service down alerts
- PostgreSQL replication lag
- Database connection limits
- Redis memory usage

**Files**:

- Binary: `/usr/local/bin/prometheus`
- Config: `/opt/prometheus/prometheus.yml`
- Data: `/opt/prometheus/data`
- Rules: `/opt/prometheus/rules/alerts.yml`
- Health check: `/opt/prometheus/health-check.sh`

### 2. Grafana

**Purpose**: Visualization, dashboards, and alerting UI

**Configuration**:

- Version: 10.2.3
- Port: 3030
- Database: PostgreSQL on VMI01
- Authentication: Local + Keycloak SSO

**Pre-built Dashboards**:

- Node Exporter Full (system metrics)
- PostgreSQL Monitoring (connections, replication lag)
- MCP Services (service status, request rates)
- HAProxy Dashboard (load balancing metrics)
- Redis Dashboard (cache performance)

**Features**:

- Keycloak OAuth2/OIDC integration
- Role-based access control
- Alert notification support (email, Slack, PagerDuty)
- JSON dashboards provisioned automatically

**Files**:

- Config: `/etc/grafana/grafana.ini`
- Data: `/opt/grafana/data`
- Dashboards: `/opt/grafana/dashboards`
- Credentials: `/opt/grafana/credentials.txt`
- Keycloak setup: `/opt/grafana/KEYCLOAK_SETUP.md`

**Dashboards bundled (`deployment/monitoring/grafana_dashboards.json`)**

| Dashboard                  | Purpose                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_exporter_dashboard`  | Existing system metrics across MCP fleet.                                                                                                                                                                                             |
| `cloudflare_mcp_dashboard` | New panels for heartbeat health (`cloudflare_mcp_agents_total`, `cloudflare_mcp_agents_stale_total`, `cloudflare_mcp_agent_last_heartbeat_seconds`). Import after the Cloudflare MCP deploy to visualize the mesh + DNS relay status. |

### 3. AdGuard Home

**Purpose**: DNS filtering and ad blocking for VPN users

**Configuration**:

- Version: 0.107.43
- DNS Port: 53
- Web Port: 3030
- VPN DNS IP: 10.10.10.1

**Blocklists**:

- OISD Full (comprehensive)
- StevenBlack Unified (malware + ads)
- 1Hosts Lite (balanced)
- AdGuard DNS filter (official)

**Upstream DNS**:

- Primary: Cloudflare DNS over HTTPS (1.1.1.1)
- Secondary: Google DNS over HTTPS (8.8.8.8)
- DNSSEC: Enabled

**Whitelisted Domains**:

- Development: github.io, githubusercontent.com, cloudflare.com
- Analytics: google-analytics.com, googletagmanager.com
- MCP infrastructure: prometheus.io, grafana.com

**Files**:

- Binary: `/usr/local/bin/AdGuardHome`
- Config: `/opt/adguard/AdGuardHome.yaml`
- Data: `/opt/adguard/data`
- Credentials: `/opt/adguard/credentials.txt`
- Health check: `/opt/adguard/health-check.sh`
- WireGuard update: `/opt/adguard/wireguard-dns-update.txt`

## Deployment Process

### Prerequisites

1. Root access to VMI03
2. Internet connectivity
3. PostgreSQL available on VMI01 (for Grafana database)
4. Firewall rules allowing internal traffic

### Deployment Steps

1. **Run Master Script**:

   ```bash
   sudo ./deploy-monitoring-stack.sh
   ```

2. **Verify Services**:

   ```bash
   systemctl status prometheus grafana-server adguard-home
   ```

3. **Run Health Checks**:

   ```bash
   /opt/prometheus/health-check.sh
   /opt/adguard/health-check.sh
   curl http://localhost:3030/api/health
   ```

4. **Access Web Interfaces**:
   - Prometheus: http://154.26.158.31:9090
   - Grafana: http://154.26.158.31:3030
   - AdGuard Home: http://154.26.158.31:3030 (separate path)

5. **Collect Credentials**:
   ```bash
   cat /opt/mcp-monitoring-credentials.txt
   ```

## Post-Deployment Configuration

### 1. Deploy Exporters on Target Machines

#### Node Exporter (VMI01, VMI02D, VMI03)

```bash
# Download and install
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xzf node_exporter-1.7.0.linux-amd64.tar.gz
cp node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/

# Create systemd service
cat > /etc/systemd/system/node_exporter.service <<'EOF'
[Unit]
Description=Node Exporter
After=network.target

[Service]
Type=simple
User=nobody
ExecStart=/usr/local/bin/node_exporter
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now node_exporter
```

#### PostgreSQL Exporter (VMI01, VMI02D)

```bash
# Download and install
wget https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz
tar xzf postgres_exporter-0.15.0.linux-amd64.tar.gz
cp postgres_exporter-0.15.0.linux-amd64/postgres_exporter /usr/local/bin/

# Create monitoring user in PostgreSQL
sudo -u postgres psql <<'SQL'
CREATE USER postgres_exporter WITH PASSWORD 'exporter_password';
GRANT pg_monitor TO postgres_exporter;
SQL

# Create systemd service
cat > /etc/systemd/system/postgres_exporter.service <<'EOF'
[Unit]
Description=PostgreSQL Exporter
After=postgresql.service

[Service]
Type=simple
User=nobody
Environment="DATA_SOURCE_NAME=postgresql://postgres_exporter:exporter_password@localhost:5432/postgres?sslmode=disable"
ExecStart=/usr/local/bin/postgres_exporter
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now postgres_exporter
```

#### Redis Exporter (VMI01)

```bash
# Download and install
wget https://github.com/oliver006/redis_exporter/releases/download/v1.55.0/redis_exporter-v1.55.0.linux-amd64.tar.gz
tar xzf redis_exporter-v1.55.0.linux-amd64.tar.gz
cp redis_exporter-v1.55.0.linux-amd64/redis_exporter /usr/local/bin/

# Create systemd service
cat > /etc/systemd/system/redis_exporter.service <<'EOF'
[Unit]
Description=Redis Exporter
After=redis.service

[Service]
Type=simple
User=nobody
ExecStart=/usr/local/bin/redis_exporter
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now redis_exporter
```

### 2. Configure Keycloak SSO for Grafana

Follow instructions in `/opt/grafana/KEYCLOAK_SETUP.md`:

1. Create Grafana client in Keycloak admin console
2. Configure OAuth2/OIDC settings
3. Set up role mappings (admin, editor, viewer)
4. Test SSO login

### 3. Update WireGuard DNS Settings

Update all WireGuard client configurations to use AdGuard:

```bash
# On each WireGuard server
sed -i '/^DNS/d' /etc/wireguard/wg*.conf
echo "DNS = 10.10.10.1" >> /etc/wireguard/wg0.conf
systemctl restart wg-quick@wg0
```

### 4. Configure Alert Notifications

In Grafana, set up notification channels:

1. Navigate to Alerting > Notification channels
2. Add email/Slack/PagerDuty integration
3. Test notifications
4. Configure alert rules in dashboards

### 5. Set Up HAProxy for HTTPS Access

Configure HAProxy on VMI03 to expose services securely:

```haproxy
frontend monitoring
    bind *:443 ssl crt /etc/ssl/certs/mcp.pem

    # Route to Prometheus
    acl is_prometheus hdr(host) -i prometheus.mcp.local
    use_backend prometheus if is_prometheus

    # Route to Grafana
    acl is_grafana hdr(host) -i grafana.mcp.local
    use_backend grafana if is_grafana

    # Route to AdGuard
    acl is_adguard hdr(host) -i adguard.mcp.local
    use_backend adguard if is_adguard

backend prometheus
    server prometheus 127.0.0.1:9090 check

backend grafana
    server grafana 127.0.0.1:3030 check

backend adguard
    server adguard 127.0.0.1:3030 check
```

## Usage

### Accessing Dashboards

1. **Prometheus**:
   - URL: http://154.26.158.31:9090
   - No authentication (internal only)
   - View targets: /targets
   - View alerts: /alerts
   - Query metrics: /graph

2. **Grafana**:
   - URL: http://154.26.158.31:3030
   - Login with admin credentials (see credentials file)
   - Explore pre-built dashboards
   - Create custom dashboards
   - Set up alerts

3. **AdGuard Home**:
   - URL: http://154.26.158.31:3030
   - Login with admin credentials
   - Configure DNS filtering rules
   - View query logs
   - Manage blocklists

### Querying Metrics

Example Prometheus queries:

```promql
# CPU usage per instance
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Memory usage per instance
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100

# PostgreSQL connections
pg_stat_activity_count

# PostgreSQL replication lag
pg_replication_lag

# Redis memory usage
(redis_memory_used_bytes / redis_memory_max_bytes) * 100

# MCP service uptime
up{job=~"mcp-.*"}
```

### Testing DNS Filtering

```bash
# Test DNS resolution
dig @10.10.10.1 google.com

# Test ad blocking (should return 0.0.0.0)
dig @10.10.10.1 ads.google.com

# Test from VPN client
nslookup google.com
```

## Service Management

### Start/Stop/Restart

```bash
# Prometheus
systemctl start prometheus
systemctl stop prometheus
systemctl restart prometheus
systemctl status prometheus

# Grafana
systemctl start grafana-server
systemctl stop grafana-server
systemctl restart grafana-server
systemctl status grafana-server

# AdGuard Home
systemctl start adguard-home
systemctl stop adguard-home
systemctl restart adguard-home
systemctl status adguard-home
```

### View Logs

```bash
# Prometheus
journalctl -u prometheus -f
tail -f /var/log/prometheus/prometheus.log

# Grafana
journalctl -u grafana-server -f
tail -f /var/log/grafana/grafana.log

# AdGuard Home
journalctl -u adguard-home -f
```

### Health Checks

```bash
# Prometheus
/opt/prometheus/health-check.sh
curl http://localhost:9090/-/healthy

# Grafana
curl http://localhost:3030/api/health | jq

# AdGuard Home
/opt/adguard/health-check.sh
curl http://localhost:3030/control/status
```

## Troubleshooting

### Prometheus Issues

**Problem**: Targets showing as "down"

**Solutions**:

1. Check if exporters are running on target machines
2. Verify firewall rules allow connections
3. Test connectivity: `curl http://<target-ip>:<port>/metrics`
4. Check Prometheus logs: `journalctl -u prometheus -n 100`

**Problem**: High memory usage

**Solutions**:

1. Reduce retention period in prometheus.yml
2. Decrease scrape frequency
3. Remove unused targets
4. Check for cardinality explosion

### Grafana Issues

**Problem**: Cannot connect to database

**Solutions**:

1. Verify PostgreSQL is running on VMI01
2. Check database credentials in grafana.ini
3. Test connection: `psql -h VMI01_IP -U grafana -d grafana`
4. Check PostgreSQL logs

**Problem**: Dashboards not loading

**Solutions**:

1. Verify Prometheus datasource is configured
2. Test Prometheus connectivity from Grafana
3. Check Grafana logs: `journalctl -u grafana-server -n 100`
4. Re-import dashboards from /opt/grafana/dashboards

### AdGuard Home Issues

**Problem**: DNS queries not working

**Solutions**:

1. Check if AdGuard is listening on port 53: `netstat -tulpn | grep :53`
2. Verify systemd-resolved is disabled
3. Test DNS: `dig @localhost google.com`
4. Check AdGuard logs: `journalctl -u adguard-home -n 100`

**Problem**: Ads not being blocked

**Solutions**:

1. Update blocklists in AdGuard web interface
2. Verify filtering is enabled
3. Check query logs for blocked domains
4. Add custom rules if needed

## Maintenance

### Update Prometheus

```bash
# Backup configuration
cp /opt/prometheus/prometheus.yml /opt/prometheus/prometheus.yml.bak

# Download new version
wget https://github.com/prometheus/prometheus/releases/download/v2.XX.X/prometheus-2.XX.X.linux-amd64.tar.gz

# Extract and install
tar xzf prometheus-2.XX.X.linux-amd64.tar.gz
cp prometheus-2.XX.X.linux-amd64/prometheus /usr/local/bin/

# Restart service
systemctl restart prometheus
```

### Update Grafana

```bash
# Update via apt
apt-get update
apt-get install --only-upgrade grafana

# Restart service
systemctl restart grafana-server
```

### Update AdGuard Home

```bash
# Backup configuration
cp /opt/adguard/AdGuardHome.yaml /opt/adguard/AdGuardHome.yaml.bak

# Download new version
wget https://github.com/AdguardTeam/AdGuardHome/releases/download/vX.XX.XX/AdGuardHome_linux_amd64.tar.gz

# Extract and install
tar xzf AdGuardHome_linux_amd64.tar.gz
cp AdGuardHome/AdGuardHome /usr/local/bin/

# Restart service
systemctl restart adguard-home
```

### Backup Data

```bash
# Backup Prometheus data
tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /opt/prometheus/data

# Backup Grafana database
pg_dump -h VMI01_IP -U grafana grafana > /backup/grafana-$(date +%Y%m%d).sql

# Backup AdGuard configuration
cp /opt/adguard/AdGuardHome.yaml /backup/adguard-$(date +%Y%m%d).yaml
```

## Security Considerations

1. **Network Security**:
   - Prometheus: Internal access only (no external exposure)
   - Grafana: Behind HAProxy with HTTPS
   - AdGuard: Only accessible via VPN

2. **Authentication**:
   - Prometheus: No auth (internal use)
   - Grafana: Strong password + Keycloak SSO
   - AdGuard: Strong password, consider 2FA

3. **Firewall Rules**:
   - All services restricted to WireGuard networks
   - UFW rules configured automatically
   - No public exposure without HAProxy

4. **Data Protection**:
   - Credentials stored in secure files (600 permissions)
   - Database passwords randomly generated
   - Regular backups recommended

5. **Best Practices**:
   - Change default passwords immediately
   - Enable audit logging
   - Regular security updates
   - Monitor access logs
   - Use HTTPS in production

## Performance Tuning

### Prometheus

```yaml
# Adjust in prometheus.yml
global:
  scrape_interval: 30s # Reduce from 15s if needed
  evaluation_interval: 30s

storage:
  tsdb:
    retention.time: 15d # Reduce from 30d if space limited
```

### Grafana

```ini
# Adjust in grafana.ini
[database]
max_idle_conn = 50      # Increase for more concurrent users
max_open_conn = 200     # Increase for more concurrent users

[server]
enable_gzip = true      # Enable compression
```

### AdGuard Home

- Increase cache size for better performance
- Reduce query logging if disk I/O is high
- Use faster upstream DNS servers
- Enable parallel DNS resolution

## Support and Documentation

- **Prometheus Docs**: https://prometheus.io/docs/
- **Grafana Docs**: https://grafana.com/docs/
- **AdGuard Home Docs**: https://github.com/AdguardTeam/AdGuardHome/wiki
- **MCP Bundle Issues**: Create issue in repository

## License

Part of MCP Bundle v0.2.0 - See main project LICENSE
