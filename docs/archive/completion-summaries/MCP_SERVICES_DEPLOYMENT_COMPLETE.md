# MCP Services Deployment Complete

## Summary

All three MCP services have been successfully deployed on VMI01 (46.250.243.123) and are ready to start once the database configuration is provided.

## Deployment Details

### Server Information

- **Host**: VMI01 (46.250.243.123)
- **IP**: 46.250.243.123
- **Node.js**: v20.19.5
- **npm**: 10.8.2
- **PM2**: 6.0.13

### Service Locations and Ports

| Service          | Location                             | Port | Status |
| ---------------- | ------------------------------------ | ---- | ------ |
| MCP Orchestrator | `/opt/mcp/services/mcp-orchestrator` | 3000 | READY  |
| Perplexity MCP   | `/opt/mcp/services/perplexity-mcp`   | 3001 | READY  |
| IT MCP           | `/opt/mcp/services/it-mcp`           | 3002 | READY  |

### Configuration Files

All services have `.env` files configured with:

- Generated JWT secrets
- Generated session secrets
- Placeholder database URLs (waiting for database agent)
- Service-specific configurations

### Systemd Services

All services have systemd unit files created:

- `mcp-orchestrator.service`
- `perplexity-mcp.service`
- `it-mcp.service`

### Management Tools

#### 1. Management Script

Location: `/opt/mcp/mcp-services.sh`

Commands:

```bash
/opt/mcp/mcp-services.sh start     # Start all services
/opt/mcp/mcp-services.sh stop      # Stop all services
/opt/mcp/mcp-services.sh restart   # Restart all services
/opt/mcp/mcp-services.sh status    # Check status
/opt/mcp/mcp-services.sh logs      # View logs
/opt/mcp/mcp-services.sh enable    # Enable on boot
```

#### 2. PM2 Ecosystem

Location: `/opt/mcp/ecosystem.config.js`

Commands:

```bash
cd /opt/mcp
pm2 start ecosystem.config.js  # Start with PM2
pm2 status                     # Check status
pm2 logs                        # View logs
```

### Log Files

- Orchestrator: `/opt/mcp/logs/orchestrator.log`
- Perplexity: `/opt/mcp/logs/perplexity.log`
- IT-MCP: `/opt/mcp/logs/it-mcp.log`

## Required Actions from Database Agent

### 1. Database Creation

Create PostgreSQL databases:

- `mcp_orchestrator`
- `perplexity_mcp`
- `it_mcp`

### 2. Update Configuration Files

Update the `DATABASE_URL` in each service's `.env` file:

- `/opt/mcp/services/mcp-orchestrator/.env`
- `/opt/mcp/services/perplexity-mcp/.env`
- `/opt/mcp/services/it-mcp/.env`

Example:

```bash
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
```

### 3. Redis Configuration (if needed)

Update `REDIS_URL` if not using localhost:6379

## Additional Configuration Needed

### 1. Perplexity API Key

Update in `/opt/mcp/services/perplexity-mcp/.env`:

```
PERPLEXITY_API_KEY=your-actual-api-key-here
```

### 2. Security Considerations

- Consider creating a dedicated service user instead of running as root
- Configure firewall rules for service ports if external access is needed
- Set up SSL/TLS termination (nginx or caddy recommended)

## Starting the Services

Once database configuration is complete:

### Option 1: Using Systemd

```bash
# On VMI01 as root
/opt/mcp/mcp-services.sh start
/opt/mcp/mcp-services.sh enable  # To start on boot
```

### Option 2: Using PM2

```bash
# On VMI01 as root
cd /opt/mcp
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # To start on boot
```

## Service Endpoints

Once running, services will be available at:

| Service              | Internal URL          | Port |
| -------------------- | --------------------- | ---- |
| Orchestrator API     | http://localhost:3000 | 3000 |
| Perplexity API       | http://localhost:3001 | 3001 |
| IT MCP API           | http://localhost:3002 | 3002 |
| Orchestrator Metrics | http://localhost:9090 | 9090 |
| Perplexity Metrics   | http://localhost:9091 | 9091 |
| IT MCP Diagnostics   | http://localhost:9092 | 9092 |
| IT MCP Metrics       | http://localhost:9093 | 9093 |

## Verification Commands

Pull secrets from Contabo first (for example `npm run secrets:pull -- --out .env.secrets && source .env.secrets`) so `MCP_ROOT_PASSWORD` is available locally. Then reuse it via `SSHPASS`:

```bash
# Check service readiness
SSHPASS="$MCP_ROOT_PASSWORD" sshpass -e ssh root@46.250.243.123 "/opt/mcp/mcp-services.sh status"

# Check logs (once started)
SSHPASS="$MCP_ROOT_PASSWORD" sshpass -e ssh root@46.250.243.123 "tail -f /opt/mcp/logs/*.log"
```

## Deployment Status: COMPLETE

All MCP services are deployed and ready to start. Waiting for database configuration from the database agent before starting the services.
