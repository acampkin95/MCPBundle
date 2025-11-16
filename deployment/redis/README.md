# Redis Configuration for MCP Bundle

This directory contains production-ready Redis deployment scripts for the MCP Bundle v0.2.0 ecosystem.

## Overview

Redis serves as the pub/sub message broker and caching layer for MCP agent coordination. The configuration provides:

- **Pub/Sub Messaging**: Real-time agent coordination and event distribution
- **Caching Layer**: Frequently accessed metadata and session storage
- **Persistence**: AOF + RDB for data durability
- **Security**: Password authentication, command renaming, network binding
- **Monitoring**: Redis exporter for Prometheus metrics

## Quick Start

### 1. Deploy Redis to VMI01

```bash
# SSH to VMI01
ssh root@46.250.243.123

# Copy the script (or run directly via SSH)
cat > /tmp/configure-redis.sh << 'EOF'
[paste script contents]
EOF

chmod +x /tmp/configure-redis.sh
/tmp/configure-redis.sh
```

Or deploy remotely:

```bash
# From your local machine
scp deployment/redis/configure-redis.sh root@46.250.243.123:/tmp/
ssh root@46.250.243.123 '/tmp/configure-redis.sh'
```

### 2. Verify Installation

```bash
# Check service status
ssh root@46.250.243.123 'systemctl status redis-server'

# Run health check
ssh root@46.250.243.123 '/usr/local/bin/redis-health-check.sh'

# Test connection
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2) ping'
```

## Configuration Details

### Network Binding

Redis binds to two interfaces:

- `127.0.0.1`: Local connections (MCP services on VMI01)
- `10.0.50.1`: VPN interface (future cross-VM coordination)

### Memory Management

- **Max Memory**: 2GB
- **Eviction Policy**: `allkeys-lru` (least recently used)
- **Memory Samples**: 5 keys per eviction cycle

### Persistence

**AOF (Append Only File)**:

- Enabled with `everysec` fsync
- Auto-rewrite at 100% growth, minimum 64MB
- File: `/var/lib/redis/appendonly.aof`

**RDB (Snapshots)**:

- Save after 900s with 1+ changes
- Save after 300s with 10+ changes
- Save after 60s with 10000+ changes
- File: `/var/lib/redis/dump.rdb`

### Security

**Authentication**:

- Randomly generated 32-character password
- Stored in `/opt/redis/credentials.txt` (mode 600)

**Command Protection**:

- `FLUSHDB` disabled (renamed to empty string)
- `FLUSHALL` disabled (renamed to empty string)
- `CONFIG` renamed to `CONFIG_MCP_ADMIN_ONLY`
- `SHUTDOWN` renamed to `SHUTDOWN_MCP_ADMIN_ONLY`

### Monitoring

**Redis Exporter**:

- Port: 9121
- Metrics endpoint: `http://localhost:9121/metrics`
- Auto-starts with Redis
- Prometheus-compatible format

**Health Check Script**:

- Location: `/usr/local/bin/redis-health-check.sh`
- Checks: PING, memory usage, persistence, connections
- Returns: 0 (healthy), 1 (unhealthy)

## File Locations

```
/opt/redis/
└── credentials.txt          # Redis password and connection URLs

/etc/redis/
└── redis.conf               # Main Redis configuration

/var/lib/redis/              # Data directory
├── appendonly.aof           # AOF persistence file
└── dump.rdb                 # RDB snapshot file

/var/log/redis/
└── redis-server.log         # Redis logs

/usr/local/bin/
└── redis-health-check.sh    # Health check script
```

## Usage Examples

### Connect via CLI

```bash
# Get password
REDIS_PASSWORD=$(ssh root@46.250.243.123 "grep '^REDIS_PASSWORD=' /opt/redis/credentials.txt | cut -d'=' -f2")

# Connect locally
ssh root@46.250.243.123 "redis-cli -a '$REDIS_PASSWORD'"

# Connect via VPN
ssh root@46.250.243.123 "redis-cli -h 10.0.50.1 -a '$REDIS_PASSWORD'"
```

### Pub/Sub Example

```bash
# Terminal 1: Subscribe to channel
redis-cli -a '<password>' SUBSCRIBE mcp:events

# Terminal 2: Publish message
redis-cli -a '<password>' PUBLISH mcp:events '{"type":"agent_registered","agent":"itjsst-mcp"}'
```

### Caching Example

```bash
# Set cache entry (TTL 300 seconds)
redis-cli -a '<password>' SETEX agent:itjsst:status 300 '{"status":"healthy","timestamp":1699500000}'

# Get cache entry
redis-cli -a '<password>' GET agent:itjsst:status
```

## Integration with MCP Services

MCP services connect to Redis using the `REDIS_URL` environment variable:

```bash
# Format
REDIS_URL=redis://:<password>@localhost:6379

# Example from credentials file
REDIS_URL=$(ssh root@46.250.243.123 "grep '^REDIS_URL=' /opt/redis/credentials.txt | cut -d'=' -f2")
```

### Node.js Connection

```typescript
import { createClient } from 'redis';

const client = createClient({
  url: process.env.REDIS_URL,
});

await client.connect();

// Pub/Sub
await client.subscribe('mcp:events', (message) => {
  console.log('Received:', message);
});

// Caching
await client.setEx('key', 300, 'value');
const value = await client.get('key');
```

## Monitoring & Maintenance

### View Metrics

```bash
# Prometheus metrics
curl http://46.250.243.123:9121/metrics

# Redis INFO
ssh root@46.250.243.123 "redis-cli -a '<password>' INFO"

# Memory stats
ssh root@46.250.243.123 "redis-cli -a '<password>' INFO MEMORY"

# Persistence stats
ssh root@46.250.243.123 "redis-cli -a '<password>' INFO PERSISTENCE"
```

### Log Management

```bash
# View logs
ssh root@46.250.243.123 'tail -f /var/log/redis/redis-server.log'

# Log rotation
# - Configured via /etc/logrotate.d/redis-server
# - Daily rotation, 7 days retention
```

### Service Management

```bash
# Restart Redis
ssh root@46.250.243.123 'systemctl restart redis-server'

# Check status
ssh root@46.250.243.123 'systemctl status redis-server'

# View systemd logs
ssh root@46.250.243.123 'journalctl -u redis-server -f'
```

## Troubleshooting

### Connection Refused

```bash
# Check if Redis is running
systemctl status redis-server

# Check port binding
ss -tuln | grep 6379

# Check logs
journalctl -u redis-server -n 50
```

### High Memory Usage

```bash
# Check memory stats
redis-cli -a '<password>' INFO MEMORY

# Check keys
redis-cli -a '<password>' DBSIZE

# Manually trigger eviction (if needed)
redis-cli -a '<password>' CONFIG_MCP_ADMIN_ONLY SET maxmemory-policy allkeys-lru
```

### AOF Corruption

```bash
# Check AOF integrity
redis-check-aof /var/lib/redis/appendonly.aof

# Repair AOF (stops at first error)
redis-check-aof --fix /var/lib/redis/appendonly.aof

# Restart Redis after repair
systemctl restart redis-server
```

## Security Considerations

1. **Password Storage**: Credentials stored in `/opt/redis/credentials.txt` with mode 600
2. **Network Isolation**: Only localhost and VPN interface, not exposed to internet
3. **Command Restrictions**: Dangerous commands disabled or renamed
4. **Systemd Hardening**: NoNewPrivileges, PrivateTmp, ProtectSystem
5. **Firewall**: UFW should block external access to port 6379

## Performance Tuning

Current configuration is optimized for:

- Small to medium workloads (< 1M keys)
- Balanced read/write operations
- Durability over raw performance

For high-throughput scenarios, consider:

- Disable AOF: `appendonly no`
- Increase RDB intervals
- Increase `maxmemory` if more RAM available
- Use Redis Cluster for horizontal scaling

## Backup & Recovery

### Manual Backup

```bash
# Create snapshot
ssh root@46.250.243.123 "redis-cli -a '<password>' BGSAVE"

# Copy RDB file
scp root@46.250.243.123:/var/lib/redis/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

### Restore from Backup

```bash
# Stop Redis
ssh root@46.250.243.123 'systemctl stop redis-server'

# Replace dump file
scp ./redis-backup.rdb root@46.250.243.123:/var/lib/redis/dump.rdb
ssh root@46.250.243.123 'chown redis:redis /var/lib/redis/dump.rdb'

# Start Redis
ssh root@46.250.243.123 'systemctl start redis-server'
```

## Advanced Configuration

### Enable SSL/TLS

Redis 6+ supports TLS. To enable:

```bash
# Generate certificates
openssl req -x509 -newkey rsa:4096 -keyout redis.key -out redis.crt -days 365 -nodes

# Update redis.conf
tls-port 6380
tls-cert-file /etc/redis/redis.crt
tls-key-file /etc/redis/redis.key
tls-ca-cert-file /etc/redis/ca.crt
```

### Redis Cluster Setup

For multi-VM coordination:

```bash
# Enable cluster mode in redis.conf
cluster-enabled yes
cluster-config-file nodes.conf
cluster-node-timeout 5000
```

## Related Documentation

- [MCP Services Deployment](/Users/alex/Projects/MCP Bundle/deployment/scripts/README.md)
- [High Availability Setup](/Users/alex/Projects/MCP Bundle/deployment/ha/README.md)
- [Production Deployment Guide](/Users/alex/Projects/MCP Bundle/DEPLOYMENT_GUIDE_COMPLETE.md)
- [Redis Official Documentation](https://redis.io/documentation)
- [Redis Exporter Documentation](https://github.com/oliver006/redis_exporter)
