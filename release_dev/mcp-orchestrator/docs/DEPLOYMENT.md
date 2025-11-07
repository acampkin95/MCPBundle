# Deployment Guide

This document provides step-by-step instructions for deploying SERVER-MCP to production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Methods](#installation-methods)
- [Configuration](#configuration)
- [Starting the Service](#starting-the-service)
- [Verification](#verification)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **OS**: Ubuntu Server 24.04 LTS (or compatible)
- **Node.js**: 18.18 or higher (20 LTS recommended)
- **PostgreSQL**: 16+ running locally
- **Redis**: 7+ running locally
- **Keycloak**: Running (Docker or standalone)
- **NGINX**: Installed and configured
- **Sudo Access**: For the service user
- **RAM**: Minimum 2GB available
- **Disk**: 10GB free space (for backups)

### Network Requirements

- **Inbound**: SSH (port 22) only
- **Outbound**: HTTPS (443) for Keycloak auth and agent registry
- **Local**: PostgreSQL (5432), Redis (6379), NGINX on localhost

---

## Installation Methods

### Method 1: Automated Setup (Recommended)

```bash
# Clone repository
cd /opt
sudo git clone <repository-url> server-mcp
cd server-mcp

# Run setup script
sudo ./scripts/setup.sh
```

The setup script will:
1. Install Node.js (if not present)
2. Create `mcp-agent` service user
3. Set up directory structure
4. Install npm dependencies
5. Build TypeScript
6. Configure sudoers
7. Create systemd service
8. Set file permissions

### Method 2: Manual Setup

```bash
# 1. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# 2. Create service user
sudo useradd -r -s /bin/false -d /opt/server-mcp -c "SERVER-MCP Agent" mcp-agent

# 3. Clone and build
cd /opt
sudo git clone <repository-url> server-mcp
cd server-mcp
sudo chown -R mcp-agent:mcp-agent /opt/server-mcp
sudo -u mcp-agent npm install
sudo -u mcp-agent npm run build

# 4. Create directories
sudo mkdir -p /etc/server-mcp /var/lib/server-mcp /var/log/server-mcp /var/backups/server-mcp
sudo chown mcp-agent:mcp-agent /var/{lib,log,backups}/server-mcp
sudo chown root:mcp-agent /etc/server-mcp

# 5. Copy configuration
sudo cp .env.example /etc/server-mcp/server-mcp.env
sudo chmod 640 /etc/server-mcp/server-mcp.env
sudo chown root:mcp-agent /etc/server-mcp/server-mcp.env

# 6. Configure sudoers (see SECURITY.md)
sudo visudo -f /etc/sudoers.d/server-mcp

# 7. Install systemd service
sudo cp systemd/server-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload
```

### Method 3: PM2 (Alternative)

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start with PM2
cd /opt/server-mcp
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Enable PM2 startup on boot
pm2 startup systemd
```

---

## Configuration

### 1. Edit Environment Variables

```bash
sudo nano /etc/server-mcp/server-mcp.env
```

**Required settings**:

```bash
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DATABASE=postgres

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# Keycloak
KEYCLOAK_BASE_URL=https://acdev.host:8080
KEYCLOAK_REALM=mcp-agents
KEYCLOAK_CLIENT_ID=server-mcp-agent
KEYCLOAK_CLIENT_SECRET=your_keycloak_secret
```

**Optional (Distributed Mode)**:

```bash
# Enable agent registration
IT_MCP_REGISTRY_URL=https://acdev.host/api/v1

# Enable PostgreSQL sync
POSTGRES_CONNECTION_STRING=postgresql://user:pass@localhost:5432/mcp_central
```

### 2. Update SQLite Paths

```bash
# Use data directory for SQLite files
SERVER_MCP_SQLITE_PATH=/var/lib/server-mcp/mcp_cache.db
SERVER_MCP_QUEUE_PATH=/var/lib/server-mcp/mcp_command_queue.db
```

### 3. Configure Backups

```bash
# Backup settings
SERVER_MCP_BACKUP_DIR=/var/backups/server-mcp
ENABLE_AUTO_BACKUP=true
BACKUP_RETENTION_DAYS=30
```

---

## Starting the Service

### Systemd Method

```bash
# Enable service to start on boot
sudo systemctl enable server-mcp

# Start service
sudo systemctl start server-mcp

# Check status
sudo systemctl status server-mcp
```

### PM2 Method

```bash
# Start application
pm2 start ecosystem.config.js

# View logs
pm2 logs server-mcp

# Monitor
pm2 monit
```

---

## Verification

### 1. Check Service Status

```bash
# Systemd
sudo systemctl status server-mcp

# PM2
pm2 status
```

Expected output:
```
● server-mcp.service - SERVER-MCP Agent
     Loaded: loaded (/etc/systemd/system/server-mcp.service; enabled)
     Active: active (running) since ...
```

### 2. View Logs

```bash
# Real-time logs (systemd)
sudo journalctl -u server-mcp -f

# Recent errors
sudo journalctl -u server-mcp -p err -n 50

# PM2 logs
pm2 logs server-mcp --lines 100
```

### 3. Verify Database Connections

Check logs for successful connections:

```bash
sudo journalctl -u server-mcp | grep -i "initialized"
```

Expected output:
```
PostgresManagerService initialized
RedisManagerService initialized
KeycloakManagerService initialized
AutoDiscoveryService initialized
```

### 4. Test Agent Registration (if enabled)

```bash
# Check for registration message
sudo journalctl -u server-mcp | grep -i "registered"
```

Expected:
```
Agent auto-discovery registered and heartbeat started
```

### 5. Verify File Permissions

```bash
ls -la /opt/server-mcp/dist/index.js
# Should be owned by mcp-agent:mcp-agent

ls -la /etc/server-mcp/server-mcp.env
# Should be -rw-r----- root:mcp-agent
```

---

## Troubleshooting

### Service Won't Start

**Check logs**:
```bash
sudo journalctl -u server-mcp -n 100 --no-pager
```

**Common issues**:

1. **Permission denied**
   ```bash
   # Fix ownership
   sudo chown -R mcp-agent:mcp-agent /opt/server-mcp
   sudo chmod 750 /opt/server-mcp
   ```

2. **Cannot connect to PostgreSQL**
   ```bash
   # Test connection
   sudo -u postgres psql -c "SELECT version();"
   
   # Check PostgreSQL is running
   sudo systemctl status postgresql
   ```

3. **Missing environment file**
   ```bash
   # Create from example
   sudo cp /opt/server-mcp/.env.example /etc/server-mcp/server-mcp.env
   sudo chmod 640 /etc/server-mcp/server-mcp.env
   ```

### High Memory Usage

```bash
# Check current memory
pm2 info server-mcp | grep memory

# Restart to clear
sudo systemctl restart server-mcp
```

### Agent Not Registering

1. **Check registry URL**:
   ```bash
   grep IT_MCP_REGISTRY_URL /etc/server-mcp/server-mcp.env
   ```

2. **Test connectivity**:
   ```bash
   curl -k https://acdev.host/api/v1/health
   ```

3. **Check Keycloak auth**:
   ```bash
   sudo journalctl -u server-mcp | grep -i keycloak
   ```

### Database Sync Not Working

```bash
# Check PostgreSQL connection string
grep POSTGRES_CONNECTION_STRING /etc/server-mcp/server-mcp.env

# Test connection
psql "$POSTGRES_CONNECTION_STRING" -c "SELECT 1;"
```

---

## Updating

### Using Deployment Script

```bash
cd /opt/server-mcp
sudo ./scripts/deploy.sh --restart
```

### Manual Update

```bash
cd /opt/server-mcp
sudo systemctl stop server-mcp
sudo -u mcp-agent git pull
sudo -u mcp-agent npm install
sudo -u mcp-agent npm run build
sudo systemctl start server-mcp
```

---

## Rollback

If deployment fails, restore from backup:

```bash
# Stop service
sudo systemctl stop server-mcp

# Find latest backup
ls -lt /var/backups/server-mcp/

# Restore
sudo tar -xzf /var/backups/server-mcp/pre-deploy-YYYYMMDD_HHMMSS.tar.gz -C /opt/server-mcp

# Fix permissions
sudo chown -R mcp-agent:mcp-agent /opt/server-mcp

# Start service
sudo systemctl start server-mcp
```

---

## Production Checklist

Before going live, verify:

- [ ] Service user created with no login shell
- [ ] All file permissions set correctly
- [ ] Environment file configured with production credentials
- [ ] Sudoers configured with minimal commands
- [ ] Firewall enabled (UFW)
- [ ] PostgreSQL bound to localhost
- [ ] Redis password protected
- [ ] Systemd service enabled
- [ ] Logs rotating properly (journald)
- [ ] Backups configured
- [ ] Agent registration working (if distributed mode)
- [ ] Security hardening applied (see SECURITY.md)
- [ ] Monitoring configured (journald + external)

---

## Support

For issues or questions:
- Review logs: `sudo journalctl -u server-mcp -f`
- Check documentation: `/opt/server-mcp/docs/`
- Open an issue: <repository-url>/issues

---

**Last Updated**: November 2025
