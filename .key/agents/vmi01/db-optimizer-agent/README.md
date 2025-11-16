# Database Optimizer Agent

MCP-based PostgreSQL performance monitoring and optimization agent for VMI01.

## Features

- **Real-time Monitoring**: Tracks database connections, cache hit ratios, and transaction metrics
- **Table Health**: Monitors dead tuples, bloat ratios, and vacuum/analyze status
- **Index Analysis**: Detects unused indexes and provides optimization recommendations
- **Slow Query Detection**: Identifies and analyzes slow-running queries using pg_stat_statements
- **Auto-Optimization**: Automatically performs VACUUM operations when thresholds are exceeded
- **Prometheus Integration**: Exports metrics via Pushgateway for visualization
- **Alerting**: Generates alerts for critical conditions (low cache hit ratio, high bloat, etc.)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Database Optimizer Agent                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  DB Metrics  │  │Table Metrics │  │Index Metrics │     │
│  │  Collector   │  │  Collector   │  │  Collector   │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                  │              │
│         └─────────────────┼──────────────────┘              │
│                           │                                 │
│                  ┌────────▼────────┐                        │
│                  │  Metrics Store  │                        │
│                  │  (PostgreSQL)   │                        │
│                  └────────┬────────┘                        │
│                           │                                 │
│         ┌─────────────────┼─────────────────┐              │
│         │                 │                 │              │
│  ┌──────▼───────┐  ┌──────▼───────┐  ┌─────▼──────┐      │
│  │  Prometheus  │  │    Redis     │  │    MCP     │      │
│  │  Pushgateway │  │    Cache     │  │Orchestrator│      │
│  └──────────────┘  └──────────────┘  └────────────┘      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 13
- Redis >= 6.0
- Prometheus Pushgateway (optional)
- pg_stat_statements extension enabled

## Installation

### 1. System User Setup

```bash
# Create dedicated user for agent
sudo useradd -r -s /bin/false -d /opt/mcp-agents -m mcp-agent

# Create required directories
sudo mkdir -p /opt/mcp-agents/db-optimizer-agent
sudo mkdir -p /var/log/mcp-agents
sudo mkdir -p /var/lib/mcp-agents
sudo mkdir -p /etc/mcp-agents

# Set permissions
sudo chown -R mcp-agent:mcp-agent /opt/mcp-agents
sudo chown -R mcp-agent:mcp-agent /var/log/mcp-agents
sudo chown -R mcp-agent:mcp-agent /var/lib/mcp-agents
```

### 2. Install Agent

```bash
# Copy agent files
sudo cp -r ./* /opt/mcp-agents/db-optimizer-agent/
cd /opt/mcp-agents/db-optimizer-agent

# Install dependencies
sudo -u mcp-agent npm install

# Build TypeScript
sudo -u mcp-agent npm run build
```

### 3. Configure Environment

```bash
# Create environment file
sudo tee /etc/mcp-agents/db-optimizer.env << EOF
DB_PASSWORD=your_secure_postgres_password
REDIS_PASSWORD=your_secure_redis_password
NODE_ENV=production
EOF

# Secure the file
sudo chmod 600 /etc/mcp-agents/db-optimizer.env
sudo chown mcp-agent:mcp-agent /etc/mcp-agents/db-optimizer.env
```

### 4. Configure Agent

```bash
# Edit configuration file
sudo nano /opt/mcp-agents/db-optimizer-agent/config/config.yaml

# Update the following settings:
# - database.host
# - database.port
# - database.database
# - database.user
# - redis.host
# - redis.port
# - prometheus.pushgateway_url
```

### 5. Enable PostgreSQL Extensions

```bash
# Connect to PostgreSQL
sudo -u postgres psql

# Enable required extension
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

# Configure postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.max = 10000
pg_stat_statements.track = all

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### 6. Install Systemd Service

```bash
# Copy service file
sudo cp db-optimizer.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable db-optimizer
sudo systemctl start db-optimizer
```

## Usage

### Start/Stop Service

```bash
# Start agent
sudo systemctl start db-optimizer

# Stop agent
sudo systemctl stop db-optimizer

# Restart agent
sudo systemctl restart db-optimizer

# Check status
sudo systemctl status db-optimizer
```

### View Logs

```bash
# Follow logs
sudo journalctl -u db-optimizer -f

# View recent logs
sudo journalctl -u db-optimizer -n 100

# View logs from specific time
sudo journalctl -u db-optimizer --since "1 hour ago"
```

### Health Check

```bash
# Check agent health
curl http://localhost:9100/health

# View Prometheus metrics
curl http://localhost:9100/metrics
```

## Monitoring

### Prometheus Metrics

The agent exports the following metrics:

- `db_optimizer_heartbeat_total`: Total heartbeats sent
- `db_connections_active`: Active database connections by database
- `db_cache_hit_ratio`: Cache hit ratio by database
- `db_dead_tuples`: Dead tuples by schema/table
- `db_bloat_ratio`: Table bloat ratio by schema/table
- `db_slow_queries_total`: Total slow queries detected
- `db_vacuum_runs_total`: Total vacuum operations
- `db_index_scans`: Index scan count by index
- `db_optimizer_metrics_collection_duration_seconds`: Metrics collection duration
- `db_optimizer_errors_total`: Total errors by type

### Alerts

The agent generates alerts for:

- **Critical**:
  - Connection pool exhausted
  - Replication lag high
  - Disk full

- **Warning**:
  - Cache hit ratio below threshold
  - Table bloat above threshold
  - Slow queries detected

- **Info**:
  - Vacuum needed
  - Index recommendations
  - Unused indexes

## Configuration

### Key Configuration Options

```yaml
monitoring:
  metrics_interval: 60000 # Collection interval in ms

  thresholds:
    connection_usage_percent: 80 # Alert when connections > 80%
    cache_hit_ratio_min: 0.95 # Alert when cache hit < 95%
    dead_tuples_max: 10000 # Alert when dead tuples > 10k
    bloat_ratio_max: 0.3 # Alert when bloat > 30%
    slow_query_ms: 1000 # Queries slower than 1s
    index_scan_ratio_min: 0.9 # Alert when index usage < 90%

optimization:
  auto_vacuum_enabled: true # Enable auto-vacuum
  auto_analyze_enabled: true # Enable auto-analyze
  index_recommendations_enabled: true
```

## Troubleshooting

### Agent Won't Start

```bash
# Check logs for errors
sudo journalctl -u db-optimizer -n 50

# Verify PostgreSQL connection
psql -h localhost -U mcp_orchestrator -d mcp_ecosystem -c "SELECT 1"

# Verify Redis connection
redis-cli -h localhost ping

# Check file permissions
ls -la /opt/mcp-agents/db-optimizer-agent
ls -la /var/log/mcp-agents
```

### High Memory Usage

```bash
# Check current memory usage
systemctl status db-optimizer

# Adjust MemoryLimit in service file
sudo systemctl edit db-optimizer

# Add or modify:
[Service]
MemoryLimit=256M

# Restart service
sudo systemctl restart db-optimizer
```

### Missing Metrics

```bash
# Verify pg_stat_statements is enabled
psql -U postgres -c "SELECT * FROM pg_extension WHERE extname = 'pg_stat_statements'"

# Reset statistics if needed
psql -U postgres -c "SELECT pg_stat_statements_reset()"

# Check Pushgateway connectivity
curl http://localhost:9091/metrics
```

## Development

### Build

```bash
npm run build
```

### Run in Development Mode

```bash
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Security Considerations

1. **Credentials**: Store passwords in environment variables, never in config files
2. **File Permissions**: Config and env files should be readable only by mcp-agent user
3. **Network**: Bind health check endpoint to localhost only in production
4. **Systemd**: Service runs with restricted privileges (NoNewPrivileges, ProtectSystem)
5. **Database**: Use dedicated user with minimal required privileges

## Performance

- **Memory**: ~100-200MB typical usage
- **CPU**: ~5-10% during metrics collection
- **Network**: ~1-5KB/s metrics push
- **Database**: Minimal impact (<1% overhead)

## Support

For issues, questions, or contributions:

- GitHub Issues: [your-repo]/issues
- Documentation: [your-docs-url]
- Contact: mcp-support@example.com

## License

MIT License - See LICENSE file for details
