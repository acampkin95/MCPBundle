# Quick Start: Redis & MCP Services Deployment

Fast deployment guide for Redis and MCP services on VMI01.

## Prerequisites

- SSH access to root@46.250.243.123
- Node.js >= 20.0.0 on local machine
- Perplexity API key (optional, can add later)

## 1. Deploy Redis (5 minutes)

```bash
# Copy and run Redis configuration script
scp deployment/redis/configure-redis.sh root@46.250.243.123:/tmp/
ssh root@46.250.243.123 '/tmp/configure-redis.sh'

# Verify
ssh root@46.250.243.123 '/usr/local/bin/redis-health-check.sh'
```

## 2. Deploy MCP Services (10 minutes)

```bash
# Set API key (optional)
export PERPLEXITY_API_KEY="your-key-here"

# Run deployment script
cd /Users/alex/Projects/MCP\ Bundle
chmod +x deployment/scripts/deploy-mcp-services-enhanced.sh
./deployment/scripts/deploy-mcp-services-enhanced.sh
```

The script will:

1. Build all services locally
2. Deploy to VMI01
3. Configure systemd services
4. Start services with health monitoring

## 3. Verify Deployment (2 minutes)

```bash
# Check service status
ssh root@46.250.243.123 'systemctl status mcp-*.service'

# Test health endpoints
curl http://46.250.243.123:3000/health  # Orchestrator
curl http://46.250.243.123:3001/health  # Perplexity
curl http://46.250.243.123:3002/health  # IT-MCP

# View logs
ssh root@46.250.243.123 'tail -f /var/log/mcp/*.log'
```

## Credentials

### PostgreSQL

- User: `mcp_admin`
- Password: ``
- URL: `postgresql://mcp_admin:...@localhost:5432/mcp_ecosystem`

### Redis

- Stored at: `/opt/redis/credentials.txt` on VMI01
- Retrieved automatically by deployment script

### Keycloak

- URL: `https://154.26.158.31:8443`
- Configuration: TBD after Keycloak deployment

## Services

| Service          | Port | Description           |
| ---------------- | ---- | --------------------- |
| mcp-orchestrator | 3000 | Central coordination  |
| perplexity-mcp   | 3001 | AI search integration |
| itjsst-mcp       | 3002 | System administration |
| redis-server     | 6379 | Pub/sub & caching     |
| redis_exporter   | 9121 | Prometheus metrics    |

## Common Commands

```bash
# Restart service
ssh root@46.250.243.123 'systemctl restart mcp-orchestrator'

# View logs
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -f'

# Health check
ssh root@46.250.243.123 '/usr/local/bin/mcp-services-health-check.sh'

# Redis CLI
ssh root@46.250.243.123 'redis-cli -a $(grep REDIS_PASSWORD /opt/redis/credentials.txt | cut -d= -f2)'
```

## Troubleshooting

**Service won't start**:

```bash
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -n 50'
```

**Health endpoint fails**:

```bash
ssh root@46.250.243.123 'ss -tuln | grep 3000'
ssh root@46.250.243.123 'systemctl status mcp-orchestrator'
```

**Database connection error**:

```bash
ssh root@46.250.243.123 'systemctl status postgresql'
ssh root@46.250.243.123 'psql -U mcp_admin -d mcp_ecosystem -c "SELECT 1"'
```

## Auto-Healing

Health monitor runs every 5 minutes:

- Checks service status
- Verifies health endpoints
- Auto-restarts unhealthy services
- 5-minute cooldown between restarts

View health monitor logs:

```bash
ssh root@46.250.243.123 'tail -f /var/log/mcp/health-monitor.log'
```

## Next Steps

1. Configure Perplexity API key (if skipped):

   ```bash
   ssh root@46.250.243.123 'nano /opt/mcp/perplexity/.env'
   ssh root@46.250.243.123 'systemctl restart perplexity-mcp'
   ```

2. Test inter-service communication via Redis pub/sub

3. Configure Grafana dashboards for monitoring

4. Run integration tests:
   ```bash
   ssh root@46.250.243.123 '/opt/mcp/deployment/tests/mcp-integration-tests.sh'
   ```

## File Locations

| Path                                | Description          |
| ----------------------------------- | -------------------- |
| `/opt/mcp/orchestrator/`            | Orchestrator service |
| `/opt/mcp/perplexity/`              | Perplexity service   |
| `/opt/mcp/itjsst/`                  | IT-MCP service       |
| `/var/log/mcp/`                     | Service logs         |
| `/opt/redis/credentials.txt`        | Redis credentials    |
| `/etc/systemd/system/mcp-*.service` | Systemd services     |

## Support

For detailed documentation:

- Full deployment guide: `deployment/DEPLOYMENT_REDIS_AND_SERVICES.md`
- Redis documentation: `deployment/redis/README.md`
- Project overview: `CLAUDE.md`
