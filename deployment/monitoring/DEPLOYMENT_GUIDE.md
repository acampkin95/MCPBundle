# Monitoring Stack Deployment Guide

Quick deployment guide for Prometheus, Grafana, and AdGuard Home on VMI03.

## Pre-Deployment Checklist

Before running the deployment scripts, ensure:

- [ ] Root access to VMI03 (154.26.158.31)
- [ ] Internet connectivity available
- [ ] PostgreSQL running on VMI01 (46.250.243.123)
- [ ] WireGuard VPN configured
- [ ] Firewall allows internal traffic (ports 9090, 3030, 53)
- [ ] At least 10GB free disk space on VMI03
- [ ] systemd-resolved stopped (conflicts with AdGuard DNS)

## Deployment Methods

### Method 1: One-Command Deployment (Recommended)

Deploy all three components with a single command:

```bash
# SSH to VMI03
ssh root@154.26.158.31

# Navigate to deployment directory
cd /opt/mcp/deployment/monitoring

# Run master deployment script
./deploy-monitoring-stack.sh
```

**Time**: ~10-15 minutes
**Output**: All services deployed, configured, and running

### Method 2: Individual Component Deployment

Deploy components one at a time:

```bash
# SSH to VMI03
ssh root@154.26.158.31

# Deploy Prometheus
/opt/mcp/deployment/monitoring/deploy-prometheus.sh

# Deploy Grafana
/opt/mcp/deployment/monitoring/deploy-grafana.sh
# After Grafana is online, import the bundled dashboards in
# `deployment/monitoring/grafana_dashboards.json` (including the new
# `cloudflare_mcp_dashboard` for the heartbeat mesh metrics exposed by
# the Cloudflare MCP `/metrics` endpoint).

# Deploy AdGuard Home
/opt/mcp/deployment/dns/deploy-adguard.sh
```

**Time**: ~15-20 minutes
**Use case**: Troubleshooting individual components

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Pre-flight Checks                                        │
│    • Verify root access                                     │
│    • Check system requirements                              │
│    • Validate script availability                           │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 2. Deploy Prometheus                                        │
│    • Download Prometheus 2.48.1                             │
│    • Create prometheus user and directories                 │
│    • Configure scrape targets (VMI01, VMI02D, VMI03)        │
│    • Set up alert rules (CPU, memory, disk, services)       │
│    • Create systemd service                                 │
│    • Enable log rotation                                    │
│    • Start service and verify health                        │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 3. Deploy Grafana                                           │
│    • Install Grafana 10.x from apt repository               │
│    • Create Grafana database on VMI01                       │
│    • Configure PostgreSQL datasource (Prometheus)           │
│    • Set up Keycloak SSO placeholders                       │
│    • Provision dashboards (Node, PostgreSQL, MCP, etc.)     │
│    • Generate admin credentials                             │
│    • Create systemd service                                 │
│    • Start service and verify health                        │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 4. Deploy AdGuard Home                                      │
│    • Download AdGuard Home 0.107.43                         │
│    • Stop systemd-resolved (port 53 conflict)               │
│    • Configure DNS server (10.10.10.1)                      │
│    • Set up blocklists (OISD, StevenBlack, 1Hosts)          │
│    • Configure upstream DNS (Cloudflare DoH, Google)        │
│    • Whitelist dev domains                                  │
│    • Generate admin credentials                             │
│    • Create systemd service                                 │
│    • Start service and verify DNS                           │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│ 5. Post-Deployment Verification                             │
│    • Check all services running                             │
│    • Run health checks                                      │
│    • Verify firewall rules                                  │
│    • Collect and save credentials                           │
│    • Generate deployment report                             │
└─────────────────────────────────────────────────────────────┘
```

## Expected Output

### Successful Deployment

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║      Monitoring Stack Deployment Complete!                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

Deployment Summary:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Prometheus    http://154.26.158.31:9090
✓ Grafana       http://154.26.158.31:3030
✓ AdGuard Home  http://154.26.158.31:3030

Services Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

● prometheus.service - Prometheus Monitoring System
     Loaded: loaded
     Active: active (running)

● grafana-server.service - Grafana instance
     Loaded: loaded
     Active: active (running)

● adguard-home.service - AdGuard Home DNS Ad Blocker
     Loaded: loaded
     Active: active (running)
```

## Post-Deployment Tasks

### 1. Collect Credentials (5 minutes)

```bash
# View all credentials
cat /opt/mcp-monitoring-credentials.txt

# Copy to secure location
scp root@154.26.158.31:/opt/mcp-monitoring-credentials.txt ~/Desktop/
```

### 2. Deploy Exporters on Target Machines (30 minutes)

Deploy monitoring exporters on VMI01 and VMI02D:

**On VMI01 (Primary):**

```bash
# Node Exporter
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar xzf node_exporter-1.7.0.linux-amd64.tar.gz
cp node_exporter-1.7.0.linux-amd64/node_exporter /usr/local/bin/
# See README.md for systemd service setup

# PostgreSQL Exporter
wget https://github.com/prometheus-community/postgres_exporter/releases/download/v0.15.0/postgres_exporter-0.15.0.linux-amd64.tar.gz
tar xzf postgres_exporter-0.15.0.linux-amd64.tar.gz
cp postgres_exporter-0.15.0.linux-amd64/postgres_exporter /usr/local/bin/
# See README.md for systemd service setup

# Redis Exporter
wget https://github.com/oliver006/redis_exporter/releases/download/v1.55.0/redis_exporter-v1.55.0.linux-amd64.tar.gz
tar xzf redis_exporter-v1.55.0.linux-amd64.tar.gz
cp redis_exporter-v1.55.0.linux-amd64/redis_exporter /usr/local/bin/
# See README.md for systemd service setup
```

**On VMI02D (Standby):**

```bash
# Node Exporter
# (same as VMI01)

# PostgreSQL Exporter
# (same as VMI01)
```

**On VMI03 (Gateway):**

```bash
# Node Exporter
# (same as VMI01)

# HAProxy Exporter (if HAProxy is installed)
# Install haproxy-exporter package or use built-in stats
```

### 3. Configure Keycloak SSO (15 minutes)

Follow `/opt/grafana/KEYCLOAK_SETUP.md`:

1. Login to Keycloak: http://154.26.158.31:8080
2. Select realm: `mcp`
3. Create client: `grafana`
4. Configure OAuth2 settings
5. Set up role mappings
6. Test SSO login to Grafana

### 4. Update WireGuard DNS (10 minutes)

Update all WireGuard configurations to use AdGuard DNS:

```bash
# On VMI03 (or each WireGuard server)
for conf in /etc/wireguard/wg*.conf; do
    sed -i '/^DNS/d' "$conf"
    echo "DNS = 10.10.10.1" >> "$conf"
done

# Restart WireGuard services
systemctl restart wg-quick@wg0
systemctl restart wg-quick@wg1
systemctl restart wg-quick@wg2
```

### 5. Configure Alert Notifications (20 minutes)

Set up alert channels in Grafana:

1. Login to Grafana
2. Navigate to Alerting → Notification channels
3. Add email/Slack/PagerDuty integration
4. Test notifications
5. Configure alert rules in dashboards

### 6. Set Up HAProxy for HTTPS (30 minutes)

Configure HAProxy to expose monitoring services securely:

```bash
# Edit HAProxy configuration
vi /etc/haproxy/haproxy.cfg

# Add frontend and backend configurations
# See README.md for complete HAProxy configuration

# Reload HAProxy
systemctl reload haproxy
```

## Verification Steps

### 1. Check Service Status

```bash
systemctl status prometheus grafana-server adguard-home
```

Expected: All services showing `active (running)`

### 2. Run Health Checks

```bash
# Prometheus
/opt/prometheus/health-check.sh

# Grafana
curl http://localhost:3030/api/health | jq

# AdGuard Home
/opt/adguard/health-check.sh
```

Expected: All health checks passing

### 3. Verify Prometheus Targets

```bash
# Via curl
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, instance: .labels.instance, health: .health}'

# Via web browser
# Navigate to: http://154.26.158.31:9090/targets
```

Expected: All configured targets showing as "up" (may be "down" initially until exporters are deployed)

### 4. Test Grafana Login

```bash
# Get admin credentials
grep "Admin Password" /opt/grafana/credentials.txt

# Navigate to: http://154.26.158.31:3030
# Login with admin credentials
```

Expected: Successful login, dashboards visible

### 5. Test DNS Filtering

```bash
# Test normal resolution
dig @10.10.10.1 google.com

# Test ad blocking (should return 0.0.0.0)
dig @10.10.10.1 ads.google.com

# Test from VPN client
nslookup google.com
```

Expected: Normal domains resolve, ad domains blocked

## Troubleshooting

### Issue: Service fails to start

**Solution:**

```bash
# Check service status
systemctl status <service-name>

# View logs
journalctl -u <service-name> -n 100 --no-pager

# Check for port conflicts
netstat -tulpn | grep <port>
```

### Issue: Prometheus targets showing as "down"

**Solution:**

```bash
# Verify exporter is running on target machine
ssh root@<target-ip> "systemctl status node_exporter"

# Test connectivity
curl http://<target-ip>:<port>/metrics

# Check firewall
ufw status
```

### Issue: Grafana cannot connect to database

**Solution:**

```bash
# Test PostgreSQL connection from VMI03
psql -h 46.250.243.123 -U grafana -d grafana

# Check database credentials in grafana.ini
grep -A 5 "\[database\]" /etc/grafana/grafana.ini

# Check PostgreSQL logs on VMI01
ssh root@46.250.243.123 "tail -f /var/log/postgresql/postgresql-16-main.log"
```

### Issue: AdGuard DNS not working

**Solution:**

```bash
# Check if AdGuard is listening on port 53
netstat -tulpn | grep :53

# Verify systemd-resolved is disabled
systemctl status systemd-resolved

# Test DNS locally
dig @localhost google.com

# Check AdGuard logs
journalctl -u adguard-home -n 100 --no-pager
```

### Issue: Port 3030 conflict (Grafana vs AdGuard)

**Note:** Both Grafana and AdGuard use port 3030 by default. The deployment scripts handle this, but if issues occur:

**Solution:**

```bash
# Change AdGuard web port
vi /opt/adguard/AdGuardHome.yaml
# Change bind_port to 3031

# Restart AdGuard
systemctl restart adguard-home
```

## Rollback Procedure

If deployment fails and you need to rollback:

```bash
# Stop all services
systemctl stop prometheus grafana-server adguard-home

# Disable services
systemctl disable prometheus grafana-server adguard-home

# Remove binaries
rm -f /usr/local/bin/prometheus
rm -f /usr/local/bin/promtool
rm -f /usr/local/bin/AdGuardHome

# Remove systemd services
rm -f /etc/systemd/system/prometheus.service
rm -f /etc/systemd/system/adguard-home.service

# Remove data directories (optional - preserves data)
# rm -rf /opt/prometheus
# rm -rf /opt/grafana
# rm -rf /opt/adguard

# Reload systemd
systemctl daemon-reload

# Re-enable systemd-resolved (if AdGuard was deployed)
systemctl enable --now systemd-resolved
```

## Security Best Practices

1. **Change Default Passwords**:
   - Change Grafana admin password after first login
   - Change AdGuard admin password after first login

2. **Configure HTTPS**:
   - Set up SSL/TLS certificates
   - Configure HAProxy for HTTPS termination
   - Redirect HTTP to HTTPS

3. **Restrict Access**:
   - Use firewall rules (UFW) to limit access
   - Only allow WireGuard networks
   - No public exposure without authentication

4. **Regular Updates**:
   - Keep all components up to date
   - Monitor security advisories
   - Apply patches promptly

5. **Audit Logging**:
   - Enable audit logs in Grafana
   - Monitor access logs
   - Review query logs in AdGuard

## Performance Optimization

### Prometheus

- Reduce scrape interval if metrics load is high
- Decrease retention period if disk space is limited
- Use recording rules for complex queries

### Grafana

- Increase database connection pool
- Enable query caching
- Use dashboard snapshots for static views

### AdGuard Home

- Increase DNS cache size
- Use faster upstream resolvers
- Enable parallel upstream queries

## Maintenance Schedule

| Task                   | Frequency | Command                                                                  |
| ---------------------- | --------- | ------------------------------------------------------------------------ |
| Check service health   | Daily     | `systemctl status prometheus grafana-server adguard-home`                |
| Review logs            | Weekly    | `journalctl -u <service> --since "1 week ago"`                           |
| Update blocklists      | Weekly    | Automatic (AdGuard)                                                      |
| Backup Prometheus data | Weekly    | `tar czf /backup/prometheus-$(date +%Y%m%d).tar.gz /opt/prometheus/data` |
| Backup Grafana DB      | Weekly    | `pg_dump grafana > /backup/grafana-$(date +%Y%m%d).sql`                  |
| Update components      | Monthly   | See "Update" sections in README.md                                       |
| Review alerts          | Monthly   | Check Prometheus alerts and Grafana notifications                        |

## Support Resources

- **Deployment Logs**: `/var/log/mcp-deployment/`
- **Service Logs**: `journalctl -u <service-name>`
- **Credentials**: `/opt/mcp-monitoring-credentials.txt`
- **Health Checks**: `/opt/prometheus/health-check.sh`, `/opt/adguard/health-check.sh`
- **Documentation**: `/opt/mcp/deployment/monitoring/README.md`

## Summary

Total deployment time: **1-2 hours** (including post-deployment tasks)

Components deployed:

- ✓ Prometheus (metrics collection)
- ✓ Grafana (visualization)
- ✓ AdGuard Home (DNS filtering)

Post-deployment required:

- Deploy exporters on VMI01, VMI02D, VMI03
- Configure Keycloak SSO
- Update WireGuard DNS settings
- Set up alert notifications
- Configure HAProxy for HTTPS

For detailed information, see the comprehensive README.md in the deployment directory.
