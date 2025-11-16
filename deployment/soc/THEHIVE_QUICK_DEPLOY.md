# TheHive Quick Deployment Guide

**Target**: VMI03 (154.26.158.31)
**Strategy**: Simplified (no external Elasticsearch)
**Timeline**: 10-15 minutes

## One-Command Deployment

SSH to VMI03 and run:

```bash
bash /opt/thehive/deploy-thehive-simple.sh
```

## Manual Deployment Steps

If the script isn't available, deploy manually:

### 1. Stop Existing Containers (1 min)
```bash
cd /opt/thehive
docker-compose down
```

### 2. Deploy Simplified Configuration (2 min)

Create `/opt/thehive/application.conf`:
```bash
cat > /opt/thehive/application.conf << 'EOF'
play.http.secret.key="0e32fe7060592b9122c8b487219779c6b3c7597c9b70c64003d5fad9a4665f07"

db {
  provider: janusgraph
  janusgraph {
    storage {
      backend: cql
      hostname: ["cassandra"]
      cql {
        cluster-name: thp
        keyspace: thehive
      }
    }
  }
}

storage {
  provider: localfs
  localfs.location: /opt/thp/thehive/data
}

play.modules.enabled += org.thp.thehive.connector.cortex.CortexModule
cortex {
  servers: []
}

auth {
  providers: [
    {name: session}
    {name: basic, realm: thehive}
    {name: local}
    {name: key}
  ]
}
EOF
```

### 3. Deploy Simplified Docker Compose (2 min)

Create `/opt/thehive/docker-compose.yml`:
```bash
cat > /opt/thehive/docker-compose.yml << 'EOF'
version: '3.8'

services:
  cassandra:
    image: cassandra:4.1
    container_name: thehive-cassandra
    restart: unless-stopped
    hostname: cassandra
    environment:
      - MAX_HEAP_SIZE=1G
      - HEAP_NEWSIZE=512M
      - CASSANDRA_CLUSTER_NAME=thp
    volumes:
      - cassandra-data:/var/lib/cassandra
    networks:
      - thehive-net
    healthcheck:
      test: ["CMD-SHELL", "nodetool status"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  thehive:
    image: strangebee/thehive:5.2
    container_name: thehive
    restart: unless-stopped
    depends_on:
      cassandra:
        condition: service_healthy
    ports:
      - "9000:9000"
    environment:
      - JVM_OPTS=-Xms1G -Xmx1G
    volumes:
      - thehive-data:/opt/thp/thehive/data
      - thehive-index:/opt/thp/thehive/index
      - ./application.conf:/etc/thehive/application.conf:ro
    networks:
      - thehive-net
    command:
      - --secret
      - "0e32fe7060592b9122c8b487219779c6b3c7597c9b70c64003d5fad9a4665f07"

volumes:
  cassandra-data:
  thehive-data:
  thehive-index:

networks:
  thehive-net:
    driver: bridge
EOF
```

### 4. Start Containers (5-7 min)
```bash
cd /opt/thehive
docker-compose up -d

# Wait for Cassandra (60-90 seconds)
sleep 90

# Check Cassandra health
docker exec thehive-cassandra nodetool status

# Wait for TheHive (30-60 seconds)
sleep 60
```

### 5. Verify Deployment (2 min)
```bash
# Check container status
docker ps -a | grep thehive

# Check TheHive logs
docker logs thehive --tail 50

# Test API
curl http://localhost:9000/api/status
```

## Expected Results

### Healthy Deployment
```bash
# Container status
CONTAINER ID   IMAGE                      STATUS
abc123def456   strangebee/thehive:5.2     Up 2 minutes (healthy)
xyz789uvw012   cassandra:4.1              Up 3 minutes (healthy)

# API response
{"status":"OK"}

# Or authentication required (also good)
{"type":"AuthenticationError","message":"Authentication required"}
```

### Logs Should Show
```
[info] play.api.Play - Application started (Prod)
[info] play.core.server.AkkaHttpServer - Listening for HTTP on /0.0.0.0:9000
[info] o.t.t.c.ConfigurationProvider - Configuration loaded
[info] o.t.t.s.UserSrv - Admin user admin@thehive.local created
```

## Access Information

**URL**: http://154.26.158.31:9000

**Default Credentials** (first login only):
- Username: `admin@thehive.local`
- Password: `secret`

**IMPORTANT**: Change password immediately after first login!

## Troubleshooting

### Cassandra Not Starting
```bash
# Check logs
docker logs thehive-cassandra

# Common issue: insufficient memory
# Solution: Reduce MAX_HEAP_SIZE in docker-compose.yml

# Restart
docker-compose restart cassandra
```

### TheHive Not Starting
```bash
# Check logs
docker logs thehive

# Check config syntax
docker exec thehive cat /etc/thehive/application.conf

# Restart
docker-compose restart thehive
```

### Port Already in Use
```bash
# Check what's using port 9000
netstat -tlnp | grep 9000

# Stop conflicting service
systemctl stop <service-name>

# Or change TheHive port in docker-compose.yml
ports:
  - "9001:9000"
```

## Integration with SOC Hub

After successful deployment, add to SOC Hub configuration:

```json
{
  "thehive": {
    "url": "http://154.26.158.31:9000",
    "enabled": true,
    "timeout": 30000
  }
}
```

Then generate API key in TheHive:
1. Login to TheHive UI
2. Navigate to Admin → Users
3. Click on admin user
4. Generate new API key
5. Add to SOC Hub config

## Next Steps

1. ✅ Deploy TheHive
2. ⏳ Change admin password
3. ⏳ Generate API key
4. ⏳ Update SOC Hub configuration
5. ⏳ Test case creation
6. ⏳ Configure Nginx reverse proxy
7. ⏳ Add SSL certificate

## Support

**Logs Location**:
- TheHive: `docker logs thehive`
- Cassandra: `docker logs thehive-cassandra`

**Configuration Files**:
- `/opt/thehive/application.conf`
- `/opt/thehive/docker-compose.yml`

**Data Volumes**:
- `cassandra-data` - Cassandra database
- `thehive-data` - TheHive file storage
- `thehive-index` - TheHive indexes

---

**Version**: 1.0
**Last Updated**: 2025-11-12
**Deployment Strategy**: Simplified (Cassandra built-in indexing)
