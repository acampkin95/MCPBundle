# MCP Bundle v0.2.0 Deployment Checklist

Complete checklist for deploying Redis and MCP services to VMI01.

## Pre-Deployment Verification

### Local Environment

- [ ] Node.js >= 20.0.0 installed
- [ ] SSH access to root@46.250.243.123 configured
- [ ] Project cloned at `/Users/alex/Projects/MCP Bundle`
- [ ] All deployment scripts have execute permissions

### VMI01 Server

- [ ] Ubuntu 24.04 LTS running
- [ ] PostgreSQL 16 installed and running
- [ ] VPN interface 10.0.50.1 configured
- [ ] Firewall rules configured (UFW)
- [ ] Sufficient disk space (>20GB free)
- [ ] Sufficient RAM (>4GB available)

### Credentials Ready

- [ ] PostgreSQL admin password: ``
- [ ] Perplexity API key (or plan to add later)
- [ ] Keycloak URL: `https://154.26.158.31:8443`

## Deployment Steps

### Phase 1: Redis Deployment (15 minutes)

**Step 1.1: Transfer Script**

```bash
scp deployment/redis/configure-redis.sh root@46.250.243.123:/tmp/
```

- [ ] Script transferred successfully
- [ ] File permissions: 755

**Step 1.2: Execute Redis Setup**

```bash
ssh root@46.250.243.123 '/tmp/configure-redis.sh'
```

- [ ] Redis 7.x installed
- [ ] Configuration created at `/etc/redis/redis.conf`
- [ ] Systemd service configured
- [ ] Redis exporter installed (port 9121)
- [ ] Health check script created
- [ ] Service started successfully

**Step 1.3: Verify Redis**

```bash
ssh root@46.250.243.123 'systemctl status redis-server'
ssh root@46.250.243.123 '/usr/local/bin/redis-health-check.sh'
```

- [ ] Service active and running
- [ ] Health check passed
- [ ] PING returns PONG
- [ ] Credentials saved at `/opt/redis/credentials.txt`

**Step 1.4: Retrieve Credentials**

```bash
ssh root@46.250.243.123 'cat /opt/redis/credentials.txt'
```

- [ ] Redis password retrieved
- [ ] Redis URL noted
- [ ] Redis VPN URL noted

### Phase 2: MCP Services Deployment (20 minutes)

**Step 2.1: Prepare Environment**

```bash
cd /Users/alex/Projects/MCP\ Bundle
export PERPLEXITY_API_KEY="your-key-here"  # Optional
```

- [ ] Working directory correct
- [ ] Perplexity API key set (or skipped)

**Step 2.2: Verify Source Code**

```bash
ls -la release_dev/
```

- [ ] `mcp-orchestrator/` exists
- [ ] `perplexity-mcp/` exists
- [ ] `itjsst-mcp/` exists
- [ ] All have `package.json` and `src/`

**Step 2.3: Execute Deployment**

```bash
./deployment/scripts/deploy-mcp-services-enhanced.sh
```

- [ ] Prerequisites check passed
- [ ] Credentials gathered (Redis password retrieved)
- [ ] All services built successfully
  - [ ] mcp-orchestrator built
  - [ ] perplexity-mcp built
  - [ ] itjsst-mcp built
- [ ] Deployment package prepared
- [ ] Services synced to VMI01
  - [ ] orchestrator → /opt/mcp/orchestrator
  - [ ] perplexity → /opt/mcp/perplexity
  - [ ] itjsst → /opt/mcp/itjsst
- [ ] Environment files created
- [ ] Systemd services created
- [ ] Log rotation configured
- [ ] Health monitor created and enabled
- [ ] All services started successfully

**Step 2.4: Verify Services**

```bash
ssh root@46.250.243.123 'systemctl status mcp-*.service'
```

- [ ] mcp-orchestrator: active (running)
- [ ] perplexity-mcp: active (running)
- [ ] itjsst-mcp: active (running)

### Phase 3: Health Verification (10 minutes)

**Step 3.1: Test Health Endpoints**

```bash
curl http://46.250.243.123:3000/health
curl http://46.250.243.123:3001/health
curl http://46.250.243.123:3002/health
```

- [ ] Orchestrator health: OK
- [ ] Perplexity health: OK
- [ ] IT-MCP health: OK

**Step 3.2: Check Logs**

```bash
ssh root@46.250.243.123 'tail -n 50 /var/log/mcp/orchestrator.log'
ssh root@46.250.243.123 'tail -n 50 /var/log/mcp/perplexity.log'
ssh root@46.250.243.123 'tail -n 50 /var/log/mcp/itjsst.log'
```

- [ ] No critical errors in orchestrator log
- [ ] No critical errors in perplexity log
- [ ] No critical errors in itjsst log
- [ ] Services initialized successfully

**Step 3.3: Verify Database Connectivity**

```bash
ssh root@46.250.243.123 'psql -U mcp_admin -d mcp_ecosystem -c "SELECT version();"'
```

- [ ] Database connection successful
- [ ] PostgreSQL 16.x confirmed

**Step 3.4: Verify Redis Connectivity**

```bash
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) ping'
```

- [ ] Redis PING successful
- [ ] Services can connect to Redis

**Step 3.5: Check Network Ports**

```bash
ssh root@46.250.243.123 'ss -tuln | grep -E ":(3000|3001|3002|6379|9121)"'
```

- [ ] Port 3000 listening (orchestrator)
- [ ] Port 3001 listening (perplexity)
- [ ] Port 3002 listening (itjsst)
- [ ] Port 6379 listening (redis)
- [ ] Port 9121 listening (redis exporter)

**Step 3.6: Verify Health Monitor**

```bash
ssh root@46.250.243.123 'systemctl status mcp-health-monitor.timer'
ssh root@46.250.243.123 '/usr/local/bin/mcp-services-health-check.sh'
```

- [ ] Health monitor timer enabled
- [ ] Next run scheduled
- [ ] Manual health check passed

### Phase 4: Post-Deployment Configuration (5 minutes)

**Step 4.1: Configure Perplexity API Key (if needed)**

```bash
ssh root@46.250.243.123 'nano /opt/mcp/perplexity/.env'
# Add: PERPLEXITY_API_KEY=actual-key
ssh root@46.250.243.123 'systemctl restart perplexity-mcp'
```

- [ ] API key configured (or skipped if done during deployment)
- [ ] Service restarted successfully

**Step 4.2: Test Inter-Service Communication**

```bash
# Terminal 1: Subscribe
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) SUBSCRIBE mcp:test'

# Terminal 2: Publish
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) PUBLISH mcp:test "hello"'
```

- [ ] Pub/sub working
- [ ] Message received in subscriber

**Step 4.3: Document Credentials**
Create secure note with:

- [ ] Redis password
- [ ] Redis URL
- [ ] PostgreSQL credentials
- [ ] Service URLs
- [ ] Health check commands

### Phase 5: Monitoring Setup (10 minutes)

**Step 5.1: Verify Metrics Endpoints**

```bash
curl http://46.250.243.123:9121/metrics
```

- [ ] Redis exporter metrics available
- [ ] Prometheus-compatible format

**Step 5.2: Configure Log Rotation**

```bash
ssh root@46.250.243.123 'cat /etc/logrotate.d/mcp-services'
```

- [ ] Log rotation configured
- [ ] Daily rotation
- [ ] 7 days retention

**Step 5.3: Set Up Monitoring Alerts (Future)**

- [ ] Add scrape targets to Prometheus
- [ ] Create Grafana dashboards
- [ ] Configure alert rules
- [ ] Test notification channels

### Phase 6: Security Hardening (5 minutes)

**Step 6.1: Verify Firewall Rules**

```bash
ssh root@46.250.243.123 'ufw status numbered'
```

- [ ] Port 3000 allowed (or restricted to specific IPs)
- [ ] Port 3001 allowed (or restricted)
- [ ] Port 3002 allowed (or restricted)
- [ ] Port 6379 blocked from external (only localhost/VPN)

**Step 6.2: Verify File Permissions**

```bash
ssh root@46.250.243.123 'ls -l /opt/mcp/*/.env'
ssh root@46.250.243.123 'ls -l /opt/redis/credentials.txt'
```

- [ ] All .env files: mode 600, owner mcp
- [ ] credentials.txt: mode 600, owner root

**Step 6.3: Verify Service Security**

```bash
ssh root@46.250.243.123 'systemctl show mcp-orchestrator | grep NoNewPrivileges'
```

- [ ] NoNewPrivileges=yes
- [ ] ProtectSystem=strict
- [ ] PrivateTmp=true

## Post-Deployment Testing

### Functional Tests

**Test 1: Service Restart**

```bash
ssh root@46.250.243.123 'systemctl restart mcp-orchestrator'
sleep 5
curl http://46.250.243.123:3000/health
```

- [ ] Service restarts successfully
- [ ] Comes back healthy within 10 seconds

**Test 2: Auto-Healing**

```bash
ssh root@46.250.243.123 'systemctl stop mcp-orchestrator'
# Wait 5-10 minutes for health monitor
ssh root@46.250.243.123 'systemctl status mcp-orchestrator'
```

- [ ] Health monitor detects failure
- [ ] Service auto-restarted
- [ ] Logged in health-monitor.log

**Test 3: Database Query**

```bash
ssh root@46.250.243.123 'psql -U mcp_admin -d mcp_ecosystem -c "SELECT * FROM agents LIMIT 1;"'
```

- [ ] Query executes successfully
- [ ] Data retrieved

**Test 4: Redis Cache**

```bash
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) SET test:key "test value" EX 300'
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) GET test:key'
```

- [ ] SET successful
- [ ] GET returns correct value

### Performance Tests

**Test 5: Load Testing (Optional)**

```bash
# Run integration tests
ssh root@46.250.243.123 '/opt/mcp/deployment/tests/mcp-integration-tests.sh'
```

- [ ] Integration tests pass
- [ ] No performance degradation
- [ ] Memory usage acceptable

**Test 6: Resource Usage**

```bash
ssh root@46.250.243.123 'systemctl status mcp-orchestrator | grep Memory'
ssh root@46.250.243.123 'free -h'
```

- [ ] Service memory < 1GB
- [ ] System memory > 20% free
- [ ] No swap usage

## Rollback Plan (If Needed)

If deployment fails:

1. **Stop Services**

   ```bash
   ssh root@46.250.243.123 'systemctl stop mcp-*.service'
   ```

2. **Review Logs**

   ```bash
   ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -n 100'
   ```

3. **Restore Previous Version (if backed up)**

   ```bash
   ssh root@46.250.243.123 'cp -r /opt/mcp.backup/* /opt/mcp/'
   ```

4. **Document Issues**
   - Error messages
   - Service logs
   - System state

## Sign-Off

Deployment completed by: **\*\*\*\***\_\_\_\_**\*\*\*\***
Date: **\*\*\*\***\_\_\_\_**\*\*\*\***
Time: **\*\*\*\***\_\_\_\_**\*\*\*\***

All checkboxes verified: [ ]

Notes:

```
________________________________________________________________________________
________________________________________________________________________________
________________________________________________________________________________
```

## Next Steps After Deployment

1. [ ] Configure Keycloak integration (when available)
2. [ ] Set up Grafana dashboards
3. [ ] Run full integration test suite
4. [ ] Document any configuration changes
5. [ ] Schedule regular backups
6. [ ] Plan for load testing
7. [ ] Update team documentation
8. [ ] Schedule review meeting

## Support Contacts

- Documentation: `/Users/alex/Projects/MCP Bundle/deployment/DEPLOYMENT_REDIS_AND_SERVICES.md`
- Quick Start: `/Users/alex/Projects/MCP Bundle/deployment/QUICKSTART_REDIS_SERVICES.md`
- Redis Docs: `/Users/alex/Projects/MCP Bundle/deployment/redis/README.md`
- Project Guide: `/Users/alex/Projects/MCP Bundle/CLAUDE.md`

## Deployment Complete!

Total estimated time: 60 minutes
Actual time: **\*\***\_\_\_\_**\*\***

All services deployed and verified: [ ]
