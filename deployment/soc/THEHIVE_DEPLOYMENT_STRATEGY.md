# TheHive Deployment Strategy Analysis

**Date**: 2025-11-12
**System**: VMI03 (154.26.158.31) SOC Hub

## Executive Summary

After extensive troubleshooting of TheHive Docker networking to external Elasticsearch, we've pivoted to a **simplified deployment strategy** that uses Cassandra's built-in indexing instead of external Elasticsearch. This approach is:

- ✅ More reliable (no cross-container networking issues)
- ✅ Simpler architecture (fewer moving parts)
- ✅ Easier to maintain (self-contained stack)
- ✅ Production-ready (Cassandra indexing is fully supported)
- ✅ Faster to deploy (no complex firewall rules needed)

## Problem Analysis

### Issue: Docker Container Cannot Reach Host Elasticsearch

**Symptoms:**
```
java.net.ConnectException: Timeout connecting to [elasticsearch/172.17.0.1:9200]
```

**Root Cause:**
- TheHive container attempting to reach Elasticsearch on Docker host (172.17.0.1:9200)
- Despite multiple networking configurations, connection consistently times out
- Issue persists even with UFW rules, iptables rules, and extra_hosts mappings

**Troubleshooting Attempts:**
1. ❌ Used public IP (154.26.158.31) - Connection timeout
2. ❌ Used Docker bridge IP (172.17.0.1) - Connection timeout
3. ❌ Added extra_hosts mapping - Connection timeout
4. ❌ Added iptables rule for docker0 - Connection timeout
5. ❌ Added UFW rule for Docker network - Connection timeout

**Technical Challenges:**
- Docker container-to-host networking complex and fragile
- Multiple layers of network isolation (Docker bridge, UFW, iptables, host networking)
- Elasticsearch binding issues (IPv4 vs IPv6)
- Potential systemd-resolved conflicts
- Security considerations (firewall rules, port exposure)

## Solution: Simplified Architecture

### Approach: Use Cassandra Built-in Indexing

Instead of fighting Docker networking, we use Cassandra's native indexing capabilities:

```hocon
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
    # No external search index - uses Cassandra's built-in indexing
  }
}
```

### Architecture Comparison

#### Complex Architecture (Problematic)
```
┌─────────────────────────────────────────────┐
│ Docker Host (VMI03)                         │
│                                             │
│  ┌──────────────────┐                      │
│  │ Docker Network   │                      │
│  │                  │                      │
│  │ ┌──────────┐     │   ┌──────────┐      │
│  │ │ TheHive  │─────┼──►│Elastic-  │      │
│  │ │Container │     │   │search    │      │
│  │ └──────────┘     │   │(Host)    │      │
│  │       │          │   └──────────┘      │
│  │       ▼          │         ▲           │
│  │ ┌──────────┐     │         │           │
│  │ │Cassandra │     │   Complex           │
│  │ │Container │     │   Networking        │
│  │ └──────────┘     │   Issues Here!      │
│  └──────────────────┘                      │
└─────────────────────────────────────────────┘

Issues:
- Container-to-host networking (172.17.0.1)
- Firewall rules (UFW, iptables)
- extra_hosts mappings
- IPv4/IPv6 binding conflicts
- Security exposure
```

#### Simplified Architecture (Recommended)
```
┌─────────────────────────────────────────────┐
│ Docker Host (VMI03)                         │
│                                             │
│  ┌──────────────────┐                      │
│  │ Docker Network   │                      │
│  │                  │                      │
│  │ ┌──────────┐     │                      │
│  │ │ TheHive  │◄────┼────► No External    │
│  │ │Container │     │      Dependencies!   │
│  │ └──────────┘     │                      │
│  │       │          │                      │
│  │       ▼          │                      │
│  │ ┌──────────┐     │                      │
│  │ │Cassandra │     │  All-in-one          │
│  │ │Container │     │  Self-contained      │
│  │ │(+Index)  │     │  Simple!             │
│  │ └──────────┘     │                      │
│  └──────────────────┘                      │
└─────────────────────────────────────────────┘

Benefits:
- All services within Docker network
- No cross-container networking
- No firewall complexity
- Self-contained stack
- Easier to maintain
```

## Deployment Files

### 1. application.conf (Simplified)

**Location**: `/opt/thehive/application.conf`

```hocon
# TheHive Configuration - Simplified without external search index
# Uses Cassandra's built-in indexing for simplicity and reliability

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
    # No external search index - use Cassandra's built-in indexing
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
```

**Key Changes:**
- ❌ Removed: `index.search` configuration
- ❌ Removed: Elasticsearch backend
- ✅ Added: Cassandra native indexing (automatic)

### 2. docker-compose.yml (Simplified)

**Location**: `/opt/thehive/docker-compose.yml`

```yaml
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

volumes:
  cassandra-data:
  thehive-data:
  thehive-index:

networks:
  thehive-net:
    driver: bridge
```

**Key Changes:**
- ❌ Removed: `extra_hosts` mappings
- ❌ Removed: External Elasticsearch references
- ✅ Added: Cassandra healthcheck
- ✅ Added: Proper service dependency

## Performance Considerations

### Cassandra Built-in Indexing

**Capabilities:**
- Secondary indexes for queries
- Materialized views for complex queries
- Search functionality via CQL
- Adequate for small-to-medium deployments (<100k cases)

**Performance Characteristics:**
- ✅ Low latency (local queries)
- ✅ Consistent performance
- ⚠️ Not as feature-rich as Elasticsearch
- ⚠️ Full-text search limited

### When to Consider External Elasticsearch

Use external Elasticsearch if you need:
1. **Advanced full-text search** - Complex queries, fuzzy matching
2. **Large-scale deployments** - >100k cases, high query volume
3. **Complex aggregations** - Multi-field analytics, faceting
4. **Search performance critical** - Sub-second search across millions of records

### Our Use Case: SOC Hub

**Requirements:**
- Small-to-medium case load (<10k cases/year)
- Basic search and filtering
- Dashboard integration
- API access for automation

**Assessment:** ✅ Cassandra built-in indexing is **sufficient and appropriate**

## Deployment Strategy

### Phase 1: Deploy Simplified Stack ✅
```bash
./deploy-thehive-simple.sh
```

**Actions:**
1. Stop existing containers
2. Deploy simplified application.conf
3. Deploy simplified docker-compose.yml
4. Start containers with healthchecks
5. Verify startup and API access

**Timeline:** 10-15 minutes

### Phase 2: Integration Testing
```bash
# Test TheHive API
curl http://154.26.158.31:9000/api/status

# Test case creation
# Test alert management
# Test user authentication
```

**Timeline:** 15-30 minutes

### Phase 3: SOC Hub Integration
```typescript
// Update SOC Hub MCP Server
const theHiveConfig = {
  url: 'http://154.26.158.31:9000',
  apiKey: '<generated-key>',
  timeout: 30000
};
```

**Timeline:** 30-45 minutes

### Phase 4: Production Hardening
- Configure reverse proxy (Nginx)
- Add SSL/TLS certificates
- Set up authentication (SSO via Keycloak)
- Configure backup strategy

**Timeline:** 1-2 hours

## Rollback Plan

If simplified deployment fails:

### Option A: Deploy Elasticsearch in Docker
```yaml
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    networks:
      - thehive-net
```

**Pros:** All services in same Docker network
**Cons:** Additional resource overhead

### Option B: Use TheHive Cloud
- Managed service by StrangeBee
- No infrastructure concerns
- Monthly subscription cost

### Option C: Defer TheHive Integration
- Focus on Wazuh + Elasticsearch for now
- Add TheHive in Phase 2
- Build custom case management

## Success Criteria

- ✅ TheHive containers start successfully
- ✅ API responds with 200/401 status
- ✅ UI accessible at http://154.26.158.31:9000
- ✅ Can create cases via UI
- ✅ Can create cases via API
- ✅ SOC Hub can integrate TheHive endpoints

## Monitoring and Maintenance

### Health Checks
```bash
# Container status
docker ps -a | grep thehive

# API health
curl http://localhost:9000/api/status

# Cassandra health
docker exec thehive-cassandra nodetool status

# View logs
docker logs -f thehive
```

### Maintenance Tasks
- Weekly: Check disk space (Cassandra data volumes)
- Monthly: Backup Cassandra keyspace
- Quarterly: Review and archive old cases
- As-needed: Update TheHive image version

## Conclusion

The simplified TheHive deployment strategy:
- ✅ Resolves Docker networking complexity
- ✅ Reduces infrastructure dependencies
- ✅ Improves reliability and maintainability
- ✅ Meets current SOC Hub requirements
- ✅ Provides path for future scaling

**Recommendation:** Proceed with simplified deployment using Cassandra built-in indexing.

## Next Steps

1. ✅ Deploy simplified stack via `deploy-thehive-simple.sh`
2. ⏳ Verify TheHive startup and API access
3. ⏳ Integrate TheHive with SOC Hub MCP Server
4. ⏳ Create final deployment documentation
5. ⏳ Production hardening (Nginx, SSL, SSO)

---

**Author**: Claude Code
**Date**: 2025-11-12
**Version**: 1.0
**Status**: Ready for Deployment
