# SOC Hub - Comprehensive Improvement Guide

**Date**: 2025-11-12
**Status**: Active Deployment with Identified Improvements
**Target**: VMI03 (154.26.158.31)

---

## Executive Summary

The SOC Hub is **operational** with Elasticsearch backend serving security data. This guide provides comprehensive improvements, fixes, and optimizations to enhance functionality, add missing features, and resolve known issues.

### Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| SOC Hub API | ✅ Running | Port 3200, returns 503 (degraded) due to backend services |
| Elasticsearch | ✅ Healthy | 12-28ms response time, data present |
| Wazuh Manager | ❌ Down | Service timeout issues |
| TheHive | ❌ Not Installed | Repository access problems |
| CrowdSec | ⏳ Partial | Services exist but not integrated |

---

## Priority 1: Fix Elasticsearch Aggregations

### Problem
The `/api/v1/stats/elasticsearch` endpoint returns empty arrays for `top_targets.ips` and `top_targets.ports` even when alerts exist.

### Root Cause
1. **Time Range Issue**: `getTopTargets()` queries last 24 hours, but sample data may be older
2. **Field Mapping**: Aggregations require keyword/numeric fields, not analyzed text

### Solution

SSH to VMI03 and execute:

```bash
# 1. Check current Elasticsearch version and status
curl -s http://localhost:9200/ | jq '.'

# 2. Check existing indices
curl -s http://localhost:9200/_cat/indices?v

# 3. Delete old indices (if needed)
curl -X DELETE http://localhost:9200/suricata-* 2>/dev/null || true

# 4. Create new index with proper mappings
INDEX_NAME="suricata-$(date -u +%Y.%m.%d)"

curl -X PUT "http://localhost:9200/${INDEX_NAME}" -H 'Content-Type: application/json' -d '{
  "mappings": {
    "properties": {
      "@timestamp": {"type": "date"},
      "event_type": {"type": "keyword"},
      "src_ip": {"type": "ip"},
      "dest_ip": {"type": "ip"},
      "src_port": {"type": "integer"},
      "dest_port": {"type": "integer"},
      "proto": {"type": "keyword"},
      "alert": {
        "properties": {
          "signature": {
            "type": "text",
            "fields": {"keyword": {"type": "keyword"}}
          },
          "category": {"type": "keyword"},
          "severity": {"type": "integer"}
        }
      }
    }
  }
}'

# 5. Add current timestamp test data
CURRENT_TIME=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# SSH Brute Force
curl -X POST "http://localhost:9200/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"192.168.1.100\",
  \"dest_ip\": \"10.0.1.10\",
  \"src_port\": 54321,
  \"dest_port\": 22,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET SCAN Potential SSH Scan\",
    \"category\": \"Attempted Administrator Privilege Gain\",
    \"severity\": 1
  }
}"

# SQL Injection
curl -X POST "http://localhost:9200/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"203.0.113.45\",
  \"dest_ip\": \"10.0.1.20\",
  \"src_port\": 44567,
  \"dest_port\": 80,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET WEB_SERVER SQL Injection Attempt\",
    \"category\": \"Web Application Attack\",
    \"severity\": 1
  }
}"

# RDP Brute Force
curl -X POST "http://localhost:9200/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"185.220.101.50\",
  \"dest_ip\": \"10.0.1.40\",
  \"src_port\": 35678,
  \"dest_port\": 3389,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET EXPLOIT RDP Brute Force Attempt\",
    \"category\": \"Attempted Administrator Privilege Gain\",
    \"severity\": 1
  }
}"

# Web Shell Upload
curl -X POST "http://localhost:9200/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"45.142.212.61\",
  \"dest_ip\": \"10.0.1.20\",
  \"src_port\": 42156,
  \"dest_port\": 80,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET WEB_SERVER Possible Web Shell Upload\",
    \"category\": \"Web Application Attack\",
    \"severity\": 1
  }
}"

# MySQL Port Scan
curl -X POST "http://localhost:9200/${INDEX_NAME}/_doc" -H 'Content-Type: application/json' -d "{
  \"@timestamp\": \"${CURRENT_TIME}\",
  \"event_type\": \"alert\",
  \"src_ip\": \"198.51.100.78\",
  \"dest_ip\": \"10.0.1.30\",
  \"src_port\": 12345,
  \"dest_port\": 3306,
  \"proto\": \"TCP\",
  \"alert\": {
    \"signature\": \"ET SCAN Suspicious inbound to mySQL port 3306\",
    \"category\": \"Potentially Bad Traffic\",
    \"severity\": 2
  }
}"

# 6. Refresh index to make data searchable immediately
curl -X POST "http://localhost:9200/${INDEX_NAME}/_refresh"

# 7. Verify data
curl -s "http://localhost:9200/${INDEX_NAME}/_count" | jq '.'

# 8. Test aggregation directly in Elasticsearch
curl -s "http://localhost:9200/${INDEX_NAME}/_search" -H 'Content-Type: application/json' -d '{
  "size": 0,
  "query": {
    "bool": {
      "must": [
        {"term": {"event_type": "alert"}},
        {"range": {"@timestamp": {"gte": "now-24h"}}}
      ]
    }
  },
  "aggs": {
    "top_dest_ips": {"terms": {"field": "dest_ip", "size": 10}},
    "top_dest_ports": {"terms": {"field": "dest_port", "size": 10}}
  }
}' | jq '.aggregations'
```

### Verification

From your local machine:

```bash
# Check statistics endpoint
curl -s "http://154.26.158.31:3200/api/v1/stats/elasticsearch" | jq '.data.top_targets'

# Should return:
# {
#   "ips": [
#     {"ip": "10.0.1.10", "count": 1},
#     {"ip": "10.0.1.20", "count": 2},
#     {"ip": "10.0.1.30", "count": 1},
#     {"ip": "10.0.1.40", "count": 1}
#   ],
#   "ports": [
#     {"port": 80, "count": 2},
#     {"port": 22, "count": 1},
#     {"port": 3306, "count": 1},
#     {"port": 3389, "count": 1}
#   ]
# }
```

---

## Priority 2: Fix Wazuh Manager

### Problem
Wazuh Manager service times out during startup. The `wazuh-authd` daemon fails to initialize.

### Diagnostic Steps

```bash
# SSH to VMI03
ssh root@154.26.158.31

# 1. Check service status
systemctl status wazuh-manager

# 2. View detailed logs
tail -100 /var/ossec/logs/ossec.log

# 3. Check for process conflicts
ps aux | grep wazuh

# 4. Check listening ports
netstat -tulpn | grep -E '(1514|1515|1516|55000)'

# 5. Verify file ownership
ls -la /var/ossec/etc/
ls -la /var/ossec/var/run/

# 6. Check disk space and inodes
df -h
df -i
```

### Common Issues and Fixes

#### Issue 1: Configuration Errors

```bash
# Validate configuration
/var/ossec/bin/wazuh-logtest < /etc/null

# Check for deprecated tags (known issue)
grep -E '<force_time>|<force_insert>' /var/ossec/etc/ossec.conf

# Remove deprecated tags
sed -i.bak '/<force_time>/d; /<force_insert>/d' /var/ossec/etc/ossec.conf
```

#### Issue 2: Port Conflicts

```bash
# Kill conflicting processes
lsof -ti:55000 | xargs kill -9 2>/dev/null || true
lsof -ti:1514 | xargs kill -9 2>/dev/null || true
lsof -ti:1515 | xargs kill -9 2>/dev/null || true
```

#### Issue 3: Corrupted State Files

```bash
# Stop service completely
systemctl stop wazuh-manager
killall -9 wazuh-authd wazuh-modulesd wazuh-analysisd wazuh-db wazuh-remoted 2>/dev/null || true

# Clean state files
rm -f /var/ossec/var/run/*.pid
rm -f /var/ossec/var/run/*.state

# Fix ownership
chown -R wazuh:wazuh /var/ossec

# Start fresh
systemctl start wazuh-manager
```

#### Issue 4: Database Corruption

```bash
# Backup and reset Wazuh database
systemctl stop wazuh-manager

cd /var/ossec/queue/db/
mv *.db *.db.backup 2>/dev/null || true

systemctl start wazuh-manager
```

### Clean Reinstall (Last Resort)

```bash
# 1. Backup configuration
cp -r /var/ossec/etc /root/wazuh-backup-$(date +%Y%m%d)

# 2. Remove Wazuh completely
apt-get remove --purge wazuh-manager -y
rm -rf /var/ossec

# 3. Reinstall
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | apt-key add -
echo "deb https://packages.wazuh.com/4.x/apt/ stable main" > /etc/apt/sources.list.d/wazuh.list
apt-get update
apt-get install wazuh-manager -y

# 4. Restore configuration (if needed)
# cp /root/wazuh-backup-*/ossec.conf /var/ossec/etc/

# 5. Start service
systemctl enable wazuh-manager
systemctl start wazuh-manager
systemctl status wazuh-manager
```

### Update SOC Hub Configuration

Once Wazuh is working:

```bash
cd /opt/mcp/soc-hub-mcp/

# Update .env with correct credentials
sed -i 's/WAZUH_API_PASSWORD=.*/WAZUH_API_PASSWORD=your_actual_password/' .env

# Restart SOC Hub
systemctl restart soc-hub-mcp

# Verify
curl -s http://localhost:3200/api/v1/health | jq '.data.services[] | select(.service=="wazuh")'
```

---

## Priority 3: Deploy TheHive

### Option 1: Docker Deployment (Recommended)

```bash
# SSH to VMI03
ssh root@154.26.158.31

# 1. Install Docker if not already installed
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# 2. Create Docker Compose file
mkdir -p /opt/thehive
cd /opt/thehive

cat > docker-compose.yml <<'EOF'
version: '3.8'

services:
  cassandra:
    image: cassandra:4.1
    container_name: thehive-cassandra
    restart: unless-stopped
    ports:
      - "9042:9042"
    environment:
      - MAX_HEAP_SIZE=1G
      - HEAP_NEWSIZE=512M
    volumes:
      - cassandra-data:/var/lib/cassandra
    networks:
      - thehive-net

  thehive:
    image: strangebee/thehive:5.2
    container_name: thehive
    restart: unless-stopped
    depends_on:
      - cassandra
    ports:
      - "9000:9000"
    environment:
      - JVM_OPTS=-Xms1G -Xmx1G
    volumes:
      - thehive-data:/opt/thp/thehive/data
      - thehive-index:/opt/thp/thehive/index
    networks:
      - thehive-net
    command: --secret "$(openssl rand -hex 16)"

volumes:
  cassandra-data:
  thehive-data:
  thehive-index:

networks:
  thehive-net:
EOF

# 3. Start TheHive
docker-compose up -d

# 4. Wait for services to initialize (2-3 minutes)
sleep 120

# 5. Check logs
docker-compose logs thehive

# 6. Access TheHive
# Default credentials: admin@thehive.local / secret
curl -s http://localhost:9000/api/status | jq '.'

# 7. Create API key via Web UI
# Navigate to: http://154.26.158.31:9000
# Login: admin@thehive.local / secret
# Go to: Admin > Users > admin > Create API Key
# Copy the API key

# 8. Update SOC Hub configuration
cd /opt/mcp/soc-hub-mcp/
nano .env
# Set: THEHIVE_API_KEY=<your-api-key>

# 9. Restart SOC Hub
systemctl restart soc-hub-mcp

# 10. Verify
curl -s http://localhost:3200/api/v1/health | jq '.data.services[] | select(.service=="thehive")'
```

### Option 2: Manual DEB Package Installation

```bash
# 1. Install dependencies
apt-get update
apt-get install -y openjdk-11-jre-headless

# 2. Install Cassandra
echo "deb https://debian.cassandra.apache.org 41x main" > /etc/apt/sources.list.d/cassandra.list
curl https://downloads.apache.org/cassandra/KEYS | apt-key add -
apt-get update
apt-get install -y cassandra

# Start Cassandra
systemctl enable cassandra
systemctl start cassandra

# 3. Download TheHive DEB
cd /tmp
wget https://download.thehive-project.org/thehive_5.2.9-1_all.deb

# 4. Install TheHive
dpkg -i thehive_5.2.9-1_all.deb || apt-get install -f -y

# 5. Configure TheHive
nano /etc/thehive/application.conf
# Update database connection, secret key

# 6. Start TheHive
systemctl enable thehive
systemctl start thehive

# 7. Check status
systemctl status thehive
```

---

## Priority 4: Production Hardening

### Enable Elasticsearch Security

```bash
# SSH to VMI03
ssh root@154.26.158.31

# 1. Stop Elasticsearch
systemctl stop elasticsearch

# 2. Edit configuration
nano /etc/elasticsearch/elasticsearch.yml

# Change these lines:
# FROM:
#   xpack.security.enabled: false
# TO:
#   xpack.security.enabled: true
#   xpack.security.transport.ssl.enabled: true

# 3. Set up passwords
cd /usr/share/elasticsearch
bin/elasticsearch-setup-passwords interactive

# Note the passwords, especially for 'elastic' user

# 4. Start Elasticsearch
systemctl start elasticsearch

# 5. Update SOC Hub configuration
cd /opt/mcp/soc-hub-mcp/
nano .env

# Set:
#   ELASTICSEARCH_PASSWORD=<your-elastic-password>

# 6. Restart SOC Hub
systemctl restart soc-hub-mcp
```

### Add Reverse Proxy with TLS

```bash
# 1. Install Nginx
apt-get install -y nginx certbot python3-certbot-nginx

# 2. Create Nginx configuration
cat > /etc/nginx/sites-available/soc-hub <<'EOF'
server {
    listen 80;
    server_name soc.yourdomain.com;

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name soc.yourdomain.com;

    # SSL certificates (will be configured by certbot)
    ssl_certificate /etc/letsencrypt/live/soc.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/soc.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Proxy to SOC Hub
    location / {
        proxy_pass http://localhost:3200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# 3. Enable site
ln -s /etc/nginx/sites-available/soc-hub /etc/nginx/sites-enabled/

# 4. Obtain SSL certificate
certbot --nginx -d soc.yourdomain.com

# 5. Reload Nginx
systemctl reload nginx
```

### Configure Firewall

```bash
# 1. Install UFW if not present
apt-get install -y ufw

# 2. Configure rules
ufw default deny incoming
ufw default allow outgoing

# Allow SSH (change port if needed)
ufw allow 22/tcp

# Allow HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Allow from specific IPs only (recommended)
# ufw allow from YOUR_IP_ADDRESS to any port 3200

# 3. Enable firewall
ufw enable

# 4. Check status
ufw status verbose
```

---

## Priority 5: Monitoring and Alerting

### Add Prometheus Metrics

Create a metrics endpoint in SOC Hub:

```typescript
// Add to src/api/routes.ts

import promClient from 'prom-client';

const register = new promClient.Registry();

// Metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const alertsTotal = new promClient.Counter({
  name: 'soc_alerts_total',
  help: 'Total number of security alerts',
  labelNames: ['source', 'severity'],
  registers: [register],
});

// Metrics endpoint
router.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

### Create Grafana Dashboard

```bash
# 1. Install Grafana
apt-get install -y software-properties-common
add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | apt-key add -
apt-get update
apt-get install -y grafana

# 2. Start Grafana
systemctl enable grafana-server
systemctl start grafana-server

# 3. Access Grafana
# URL: http://154.26.158.31:3000
# Default: admin / admin

# 4. Add Prometheus data source
# - Navigate to Configuration > Data Sources
# - Add Prometheus
# - URL: http://localhost:9090

# 5. Import SOC Hub dashboard
# Use the dashboard JSON from the deployment package
```

---

## Priority 6: Automated Testing

### Create Health Check Script

```bash
cat > /opt/mcp/scripts/soc-health-check.sh <<'EOF'
#!/bin/bash

# SOC Hub Health Check
# Run every 5 minutes via cron

ALERT_EMAIL="admin@yourdomain.com"
WEBHOOK_URL="https://your-slack-webhook-url"

# Check SOC Hub
if ! curl -sf http://localhost:3200/api/v1/health > /dev/null; then
    echo "SOC Hub is down!" | mail -s "ALERT: SOC Hub Down" "$ALERT_EMAIL"
    systemctl restart soc-hub-mcp
fi

# Check Elasticsearch
if ! curl -sf http://localhost:9200/_cluster/health > /dev/null; then
    echo "Elasticsearch is down!" | mail -s "ALERT: Elasticsearch Down" "$ALERT_EMAIL"
    systemctl restart elasticsearch
fi

# Check Wazuh
if ! systemctl is-active --quiet wazuh-manager; then
    echo "Wazuh Manager is down!" | mail -s "ALERT: Wazuh Down" "$ALERT_EMAIL"
    systemctl restart wazuh-manager
fi
EOF

chmod +x /opt/mcp/scripts/soc-health-check.sh

# Add to crontab
echo "*/5 * * * * /opt/mcp/scripts/soc-health-check.sh" | crontab -
```

---

## Quick Reference Commands

### Check All Services

```bash
# SSH to server
ssh root@154.26.158.31

# Service status
systemctl status soc-hub-mcp
systemctl status elasticsearch
systemctl status wazuh-manager
docker ps  # if using Docker for TheHive

# Logs
journalctl -u soc-hub-mcp -f
journalctl -u elasticsearch -f
tail -f /var/ossec/logs/ossec.log
docker logs -f thehive  # if using Docker
```

### API Testing

```bash
# Health check
curl -s http://154.26.158.31:3200/api/v1/health | jq '.'

# Dashboard
curl -s http://154.26.158.31:3200/api/v1/dashboard | jq '.data.overview'

# Alerts
curl -s "http://154.26.158.31:3200/api/v1/alerts/suricata?limit=10" | jq '.data | length'

# Statistics
curl -s http://154.26.158.31:3200/api/v1/stats/elasticsearch | jq '.'

# IP Search
curl -s "http://154.26.158.31:3200/api/v1/search/ip/10.0.1.10" | jq '.'
```

### Elasticsearch Direct Queries

```bash
# SSH to server first
ssh root@154.26.158.31

# Cluster health
curl -s http://localhost:9200/_cluster/health | jq '.'

# List indices
curl -s http://localhost:9200/_cat/indices?v

# Count alerts
curl -s http://localhost:9200/suricata-*/_count | jq '.'

# Recent alerts
curl -s http://localhost:9200/suricata-*/_search?size=5&sort=@timestamp:desc | jq '.hits.hits[]._source'
```

---

## Next Steps

1. **Immediate** (< 1 hour):
   - Fix Elasticsearch aggregations with current timestamps
   - Verify all SOC Hub endpoints working
   - Add diverse test data

2. **Short-term** (1-4 hours):
   - Resolve Wazuh Manager startup issues
   - Deploy TheHive via Docker
   - Configure basic monitoring

3. **Medium-term** (1-2 days):
   - Enable Elasticsearch security
   - Add TLS/HTTPS support
   - Configure automated backups
   - Set up Grafana dashboards

4. **Long-term** (1 week):
   - Implement comprehensive monitoring
   - Add automated testing
   - Configure alerting
   - Deploy to production with full security

---

## Support and Troubleshooting

### Common Issues

1. **503 Service Unavailable**: Normal when backend services are degraded, check individual service health
2. **Empty aggregations**: Ensure data timestamps are recent (within 24 hours)
3. **Wazuh timeout**: Check for port conflicts, corrupted state files
4. **TheHive connection failed**: Verify Docker containers running, API key configured

### Getting Help

- **Elasticsearch**: https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
- **Wazuh**: https://documentation.wazuh.com/current/index.html
- **TheHive**: https://docs.thehive-project.org/
- **SOC Hub Source**: `/Users/alex/Projects/MCP Bundle/release_dev/soc-hub-mcp`

---

**Last Updated**: 2025-11-12
**Version**: 1.0
**Author**: Claude Code
