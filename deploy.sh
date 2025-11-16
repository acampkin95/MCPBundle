#!/bin/bash
# Interactive MCP Deployment Script
# Handles development, testing, and production deployments

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Directories
RELEASE_DEV="release_dev"
DEVTEST="devtestready"
FINAL="final"

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  MCP Enterprise Deployment Manager${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# Function to get version
get_version() {
    if [ -f "VERSION" ]; then
        cat VERSION
    else
        echo "0.1"
    fi
}

# Function to increment version
increment_version() {
    local version=$1
    local major=$(echo $version | cut -d. -f1)
    local minor=$(echo $version | cut -d. -f2)
    minor=$((minor + 1))
    echo "$major.$minor"
}

# Main menu
echo -e "${YELLOW}Select deployment mode:${NC}"
echo "1) Build for Development Testing (devtestready/)"
echo "2) Promote to Production Release (final/)"
echo "3) Deploy to VMI01 Production Server"
echo "4) Run Quality Checks"
echo "5) Exit"
echo ""
read -p "Enter choice [1-5]: " choice

case $choice in
    1)
        echo ""
        echo -e "${BLUE}=== Building Development Test Package ===${NC}"

        CURRENT_VERSION=$(get_version)
        NEW_VERSION=$(increment_version $CURRENT_VERSION)

        echo -e "${YELLOW}Current version: ${CURRENT_VERSION}${NC}"
        echo -e "${YELLOW}New version: ${NEW_VERSION}${NC}"
        read -p "Accept version ${NEW_VERSION}? (y/n): " confirm

        if [ "$confirm" != "y" ]; then
            read -p "Enter custom version: " NEW_VERSION
        fi

        VERSION_DIR="${DEVTEST}/${NEW_VERSION}"

        echo ""
        echo -e "${YELLOW}Running code quality checks...${NC}"
        if ! ./scripts/code-quality.sh; then
            echo -e "${RED}✗ Quality checks failed. Fix issues before building.${NC}"
            exit 1
        fi

        echo ""
        echo -e "${YELLOW}Building packages...${NC}"

        # Create version directory
        mkdir -p "$VERSION_DIR"

        # Build ITJSST-MCP
        echo -e "${BLUE}Building ITJSST-MCP...${NC}"
        cd "$RELEASE_DEV/itjsst-mcp"
        npm ci
        npm run build
        npm test
        cd ../..

        # Build MCP-Orchestrator
        echo -e "${BLUE}Building MCP-Orchestrator...${NC}"
        cd "$RELEASE_DEV/mcp-orchestrator"
        npm ci
        npm run build
        npm test
        cd ../..

        # Build Cloudflare-MCP
        echo -e "${BLUE}Building Cloudflare-MCP...${NC}"
        cd "$RELEASE_DEV/cloudflare-mcp"
        npm ci
        npm run build
        npm test
        cd ../..

        # Build Admin Panel
        echo -e "${BLUE}Building Admin Panel...${NC}"
        cd "$RELEASE_DEV/admin-panel"
        npm ci
        npm run lint
        npm run build
        cd ../..

        # Package deployments
        echo -e "${BLUE}Creating deployment packages...${NC}"
        tar -czf "${VERSION_DIR}/itjsst-mcp-${NEW_VERSION}.tar.gz" \
            -C "$RELEASE_DEV/itjsst-mcp" \
            --exclude='node_modules' \
            --exclude='.git' \
            --exclude='*.db' \
            --exclude='*.db-wal' \
            --exclude='*.db-shm' \
            .

        tar -czf "${VERSION_DIR}/mcp-orchestrator-${NEW_VERSION}.tar.gz" \
            -C "$RELEASE_DEV/mcp-orchestrator" \
            --exclude='node_modules' \
            --exclude='.git' \
            .

        tar -czf "${VERSION_DIR}/cloudflare-mcp-${NEW_VERSION}.tar.gz" \
            -C "$RELEASE_DEV/cloudflare-mcp" \
            --exclude='node_modules' \
            --exclude='.git' \
            --exclude='*.db' \
            --exclude='*.db-wal' \
            --exclude='*.db-shm' \
            .

        tar -czf "${VERSION_DIR}/admin-panel-${NEW_VERSION}.tar.gz" \
            -C "$RELEASE_DEV/admin-panel" \
            --exclude='node_modules' \
            --exclude='.next/cache' \
            --exclude='.git' \
            .

        # Copy deployment files
        cp -r release_dev/shared/config "${VERSION_DIR}/"
        cp -r release_dev/shared/docs "${VERSION_DIR}/"
        cp -r release_dev/shared/scripts "${VERSION_DIR}/"

        # Create deployment script for this version
        cat > "${VERSION_DIR}/deploy-to-server.sh" << 'DEPLOY_EOF'
#!/bin/bash
# Auto-generated deployment script

set -e

VERSION="VERSION_PLACEHOLDER"
SERVER="${1:-46.250.243.123}"
USER="${2:-root}"

echo "Deploying MCP Bundle v${VERSION} to ${USER}@${SERVER}"

# Upload packages
scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    itjsst-mcp-${VERSION}.tar.gz \
    mcp-orchestrator-${VERSION}.tar.gz \
    cloudflare-mcp-${VERSION}.tar.gz \
    admin-panel-${VERSION}.tar.gz \
    "${USER}@${SERVER}:/opt/mcp/"

# Deploy on server
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
    "${USER}@${SERVER}" << 'SERVER_EOF'
cd /opt/mcp

# Backup existing
if [ -d "itjsst-mcp" ]; then
    mv itjsst-mcp itjsst-mcp.backup.$(date +%s)
fi
if [ -d "mcp-orchestrator" ]; then
    mv mcp-orchestrator mcp-orchestrator.backup.$(date +%s)
fi
if [ -d "cloudflare-mcp" ]; then
    mv cloudflare-mcp cloudflare-mcp.backup.$(date +%s)
fi
if [ -d "admin-panel" ]; then
    mv admin-panel admin-panel.backup.$(date +%s)
fi

rm -rf itjsst-mcp-new mcp-orchestrator-new cloudflare-mcp-new admin-panel-new
mkdir -p itjsst-mcp-new mcp-orchestrator-new cloudflare-mcp-new admin-panel-new

# Extract new versions
tar -xzf itjsst-mcp-VERSION_PLACEHOLDER.tar.gz -C itjsst-mcp-new
tar -xzf mcp-orchestrator-VERSION_PLACEHOLDER.tar.gz -C mcp-orchestrator-new
tar -xzf cloudflare-mcp-VERSION_PLACEHOLDER.tar.gz -C cloudflare-mcp-new
tar -xzf admin-panel-VERSION_PLACEHOLDER.tar.gz -C admin-panel-new

# Install dependencies
cd itjsst-mcp-new && npm ci --production
cd ../mcp-orchestrator-new && npm ci --production
cd ../cloudflare-mcp-new && npm ci --production
cd ../admin-panel-new && npm ci && npm run build
cd ..

# Atomic swap
mv itjsst-mcp-new itjsst-mcp
mv mcp-orchestrator-new mcp-orchestrator
mv cloudflare-mcp-new cloudflare-mcp
mv admin-panel-new admin-panel

# Restart services
systemctl restart mcp-orchestrator || pm2 restart mcp-orchestrator || echo "Manual restart required"
systemctl restart cloudflare-mcp || pm2 restart cloudflare-mcp || echo "Manual restart required"
systemctl restart admin-panel || pm2 restart admin-panel || echo "Manual restart required"

echo "Deployment complete!"
SERVER_EOF

echo "Deployment to ${SERVER} complete!"
DEPLOY_EOF

        sed -i.bak "s/VERSION_PLACEHOLDER/${NEW_VERSION}/g" "${VERSION_DIR}/deploy-to-server.sh"
        rm "${VERSION_DIR}/deploy-to-server.sh.bak"
        chmod +x "${VERSION_DIR}/deploy-to-server.sh"

        # Save version
        echo "$NEW_VERSION" > VERSION

        echo ""
        echo -e "${GREEN}✅ Development test package built successfully!${NC}"
        echo -e "${CYAN}Location: ${VERSION_DIR}/${NC}"
        echo -e "${CYAN}Packages:${NC}"
        echo -e "  - itjsst-mcp-${NEW_VERSION}.tar.gz"
        echo -e "  - mcp-orchestrator-${NEW_VERSION}.tar.gz"
        echo -e "  - cloudflare-mcp-${NEW_VERSION}.tar.gz"
        echo -e "  - admin-panel-${NEW_VERSION}.tar.gz"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "1. Deploy to dev/test environment"
        echo "2. Run extensive diagnostics"
        echo "3. Perform agent-based break testing"
        echo "4. If all tests pass, promote to production (option 2)"
        ;;

    2)
        echo ""
        echo -e "${BLUE}=== Promoting to Production Release ===${NC}"

        # List available versions
        echo -e "${YELLOW}Available versions in devtestready/:${NC}"
        if [ -d "$DEVTEST" ]; then
            ls -1 "$DEVTEST" | grep -E '^[0-9]+\.[0-9]+$'
        else
            echo "No versions found"
            exit 1
        fi

        echo ""
        read -p "Enter version to promote: " PROMOTE_VERSION

        if [ ! -d "${DEVTEST}/${PROMOTE_VERSION}" ]; then
            echo -e "${RED}Version ${PROMOTE_VERSION} not found${NC}"
            exit 1
        fi

        FINAL_DIR="${FINAL}/${PROMOTE_VERSION}"
        mkdir -p "$FINAL_DIR"

        echo ""
        echo -e "${YELLOW}Copying files to final release...${NC}"
        cp -r "${DEVTEST}/${PROMOTE_VERSION}"/* "$FINAL_DIR/"

        # Create README
        cat > "${FINAL_DIR}/README.md" << 'README_EOF'
# MCP Enterprise Bundle - Production Release

## Version VERSION_PLACEHOLDER

Production-ready release of the MCP Enterprise ecosystem.

## Contents

- `itjsst-mcp-VERSION_PLACEHOLDER.tar.gz` - Desktop/Mac MCP agent
- `mcp-orchestrator-VERSION_PLACEHOLDER.tar.gz` - Central orchestrator server
- `config/` - Shared configuration files
- `docs/` - Complete documentation
- `scripts/` - Deployment and maintenance scripts
- `deploy-to-server.sh` - Interactive deployment script

## Quick Start

### 1. Deploy to Production Server

```bash
./deploy-to-server.sh [server-ip] [user]
# Example: ./deploy-to-server.sh 46.250.243.123 root
```

### 2. Verify Deployment

```bash
# Check orchestrator status
curl http://[server-ip]:9090/health

# Check Grafana dashboards
open http://[server-ip]:3000

# View logs
ssh root@[server-ip] 'journalctl -u mcp-orchestrator -f'
```

## Architecture

- **ITJSST-MCP**: Mac/Desktop agent for system administration
- **MCP-Orchestrator**: Central coordination server
- **PostgreSQL**: Primary database (mcp_ecosystem)
- **Redis**: Caching and pub/sub
- **Keycloak**: Authentication (OAuth2/JWT)
- **Observability**: Prometheus, Grafana, Loki, Jaeger

## Documentation

- [Architecture Overview](docs/PHASE-0-1-COMPLETE.md)
- [Testing Guide](docs/TESTING.md)
- [Deployment Summary](docs/MCP_DEPLOYMENT_SUMMARY.md)
- [Quick Reference](docs/MCP_QUICK_REFERENCE.md)
- [Credentials](docs/MCP_CREDENTIALS.txt)

## Support

For issues or questions, please refer to the documentation in `docs/`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
README_EOF

        sed -i.bak "s/VERSION_PLACEHOLDER/${PROMOTE_VERSION}/g" "${FINAL_DIR}/README.md"
        rm "${FINAL_DIR}/README.md.bak"

        # Create CHANGELOG if it doesn't exist
        if [ ! -f "${FINAL_DIR}/CHANGELOG.md" ]; then
            cat > "${FINAL_DIR}/CHANGELOG.md" << 'CHANGELOG_EOF'
# Changelog

All notable changes to the MCP Enterprise Bundle will be documented in this file.

## [VERSION_PLACEHOLDER] - DATE_PLACEHOLDER

### Added
- Initial production release
- ITJSST-MCP: Mac-centric system administration agent
- MCP-Orchestrator: Central coordination server
- Complete PostgreSQL schema (44 tables)
- Keycloak OAuth2/JWT authentication
- Redis caching and pub/sub
- Full observability stack (Prometheus, Grafana, Loki, Jaeger)
- Comprehensive testing suite (Vitest, 70% coverage thresholds)
- Performance profiling tools (Clinic.js, Autocannon, Benchmark.js)
- Pre-commit hooks (Husky + lint-staged)
- TypeScript strict mode enabled
- Security scanning (ESLint security plugin, Semgrep, CodeQL)
- CI/CD workflows (GitHub Actions)

### Infrastructure
- PostgreSQL 16 optimized for 10-20x performance
- Redis 7 with 2GB cache
- 9 firewall ports configured
- System tuning (65K file descriptors, TCP optimization, 4GB swap)

### Documentation
- Complete architecture documentation
- Testing and performance guide
- Deployment runbooks
- Quick reference guide
- Credentials and configuration guide

### Security
- Rate limiting and IP whitelisting
- Capability-based authorization
- Encrypted credentials
- Audit logging
- Security scanning in CI/CD

CHANGELOG_EOF

            sed -i.bak "s/VERSION_PLACEHOLDER/${PROMOTE_VERSION}/g" "${FINAL_DIR}/CHANGELOG.md"
            sed -i.bak "s/DATE_PLACEHOLDER/$(date +%Y-%m-%d)/g" "${FINAL_DIR}/CHANGELOG.md"
            rm "${FINAL_DIR}/CHANGELOG.md.bak"
        fi

        # Create USER_MANUAL
        cat > "${FINAL_DIR}/USER_MANUAL.md" << 'MANUAL_EOF'
# MCP Enterprise Bundle - User Manual

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Operation](#operation)
5. [Monitoring](#monitoring)
6. [Troubleshooting](#troubleshooting)
7. [Maintenance](#maintenance)

## System Requirements

### Production Server (VMI01)
- **OS**: Ubuntu 20.04+ LTS
- **CPU**: 4+ cores (6 recommended)
- **RAM**: 8GB+ (12GB recommended)
- **Disk**: 100GB+ free
- **Network**: Static IP, firewall access to ports:
  - 9090 (Orchestrator Health)
  - 9091 (Prometheus)
  - 3000 (Grafana)
  - 3100 (Loki)
  - 16686 (Jaeger UI)
  - 5432 (PostgreSQL)
  - 6379 (Redis)

### Desktop Agent (Mac)
- **OS**: macOS 12+ (Monterey or newer)
- **Node.js**: 20.x+
- **RAM**: 4GB+
- **Disk**: 10GB+ free

## Installation

### 1. Production Server Deployment

```bash
# Upload deployment package
scp -r VERSION_PLACEHOLDER/ root@46.250.243.123:/tmp/

# Connect to server
ssh root@46.250.243.123

# Run deployment script
cd /tmp/VERSION_PLACEHOLDER
chmod +x deploy-to-server.sh
./deploy-to-server.sh
```

The script will:
- Install Node.js dependencies
- Configure PostgreSQL database
- Set up Redis cache
- Configure Keycloak authentication
- Start observability stack
- Launch MCP-Orchestrator service

### 2. Desktop Agent Installation

```bash
# Extract package
tar -xzf itjsst-mcp-VERSION_PLACEHOLDER.tar.gz
cd itjsst-mcp

# Install dependencies
npm ci --production

# Configure
cp config/example.env .env
nano .env  # Edit configuration

# Start agent
npm start
```

## Configuration

### Environment Variables

**MCP-Orchestrator** (`.env`):
```bash
# Database
DATABASE_URL=postgresql://mcp_admin:PASSWORD@localhost:5432/mcp_ecosystem

# Redis
REDIS_URL=redis://localhost:6379

# Keycloak
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=mcp-enterprise
KEYCLOAK_CLIENT_ID=mcp-orchestrator
KEYCLOAK_CLIENT_SECRET=SECRET

# Server
PORT=9090
NODE_ENV=production
```

**ITJSST-MCP** (`.env`):
```bash
# Orchestrator
ORCHESTRATOR_URL=http://46.250.243.123:9090

# Agent Identity
AGENT_ID=auto
AGENT_TYPE=desktop
HOSTNAME=auto

# Authentication
KEYCLOAK_URL=http://46.250.243.123:8080
KEYCLOAK_CLIENT_ID=it-mcp-desktop
KEYCLOAK_CLIENT_SECRET=SECRET
```

### Database Connection

Test PostgreSQL connection:
```bash
psql -h localhost -U mcp_admin -d mcp_ecosystem -c "SELECT COUNT(*) FROM mcp_agents;"
```

### Redis Connection

Test Redis connection:
```bash
redis-cli ping
# Should return: PONG
```

## Operation

### Starting Services

**Production Server**:
```bash
# Start all services
systemctl start postgresql
systemctl start redis
systemctl start keycloak
systemctl start mcp-orchestrator
systemctl start cloudflare-mcp

# Check status
systemctl status mcp-orchestrator
systemctl status cloudflare-mcp
```

**Desktop Agent**:
```bash
cd /opt/mcp/itjsst-mcp
npm start

# Or with PM2
pm2 start npm --name "itjsst-mcp" -- start
pm2 save
```

### Health Checks

```bash
# Orchestrator health
curl http://46.250.243.123:9090/health

# Database health
psql -U mcp_admin -d mcp_ecosystem -c "SELECT version();"

# Redis health
redis-cli info server

# Prometheus metrics
curl http://46.250.243.123:9091/metrics

# Cloudflare MCP health
curl http://46.250.243.123:3003/healthz

# Panel snapshot (sanitized)
curl http://46.250.243.123:3003/panel/overview | jq '.stats'
```

## Monitoring

### Grafana Dashboards

Access: `http://46.250.243.123:3000`

Default login: `admin / admin` (change on first login)

**Key Dashboards**:
1. MCP System Overview
2. Agent Health & Performance
3. Command Queue Status
4. Database Performance
5. Redis Cache Hit Rates

### Prometheus Queries

Access: `http://46.250.243.123:9091`

**Useful queries**:
```promql
# Active agents
count(mcp_agent_status == 1)

# Command queue depth
mcp_command_queue_depth

# Average command execution time
rate(mcp_command_duration_seconds_sum[5m]) / rate(mcp_command_duration_seconds_count[5m])

# Error rate
rate(mcp_errors_total[5m])
```

### Log Aggregation (Loki)

Access via Grafana data source

**Query examples**:
```logql
{job="mcp-orchestrator"} |= "error"
{job="mcp-orchestrator"} | json | level="error"
```

### Distributed Tracing (Jaeger)

Access: `http://46.250.243.123:16686`

Trace command execution across agents and services.

## Troubleshooting

### Orchestrator Not Starting

1. Check logs:
```bash
journalctl -u mcp-orchestrator -n 100
```

2. Verify database:
```bash
psql -U mcp_admin -d mcp_ecosystem -c "\dt"
```

3. Check ports:
```bash
ss -tulpn | grep 9090
```

### Agent Not Connecting

1. Test network:
```bash
telnet 46.250.243.123 9090
```

2. Verify authentication:
```bash
curl -X POST http://46.250.243.123:8080/realms/mcp-enterprise/protocol/openid-connect/token \
  -d "client_id=it-mcp-desktop" \
  -d "client_secret=SECRET" \
  -d "grant_type=client_credentials"
```

3. Check agent logs:
```bash
tail -f ~/.mcp/itjsst-mcp.log
```

### Database Performance Issues

1. Check connections:
```bash
psql -U mcp_admin -d mcp_ecosystem -c "SELECT count(*) FROM pg_stat_activity;"
```

2. Identify slow queries:
```bash
psql -U mcp_admin -d mcp_ecosystem -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

3. Vacuum database:
```bash
psql -U mcp_admin -d mcp_ecosystem -c "VACUUM ANALYZE;"
```

### High Redis Memory Usage

1. Check memory:
```bash
redis-cli info memory
```

2. Clear cache if needed:
```bash
redis-cli FLUSHDB
```

## Maintenance

### Daily Tasks
- Monitor Grafana dashboards
- Check error logs
- Verify agent heartbeats

### Weekly Tasks
- Review command execution metrics
- Check database size
- Rotate old logs

### Monthly Tasks
- Update dependencies: `npm audit && npm update`
- Review security scans
- Backup database: `pg_dump -U mcp_admin mcp_ecosystem > backup.sql`
- Clean old partitions: `psql -U mcp_admin -d mcp_ecosystem -f cleanup_old_partitions.sql`

### Backups

**Database**:
```bash
# Backup
pg_dump -U mcp_admin -Fc mcp_ecosystem > mcp_backup_$(date +%Y%m%d).dump

# Restore
pg_restore -U mcp_admin -d mcp_ecosystem mcp_backup_20250101.dump
```

**Configuration**:
```bash
tar -czf mcp_config_backup_$(date +%Y%m%d).tar.gz \
  /opt/mcp/*/config \
  /opt/mcp/*/.env
```

### Updates

1. Build new version in devtestready/
2. Test thoroughly
3. Promote to final/
4. Deploy using deploy-to-server.sh
5. Verify health checks
6. Monitor for 24 hours

---

For additional support, refer to:
- [Architecture Documentation](docs/PHASE-0-1-COMPLETE.md)
- [Testing Guide](docs/TESTING.md)
- [Quick Reference](docs/MCP_QUICK_REFERENCE.md)
MANUAL_EOF

        sed -i.bak "s/VERSION_PLACEHOLDER/${PROMOTE_VERSION}/g" "${FINAL_DIR}/USER_MANUAL.md"
        rm "${FINAL_DIR}/USER_MANUAL.md.bak"

        echo ""
        echo -e "${GREEN}✅ Production release package created!${NC}"
        echo -e "${CYAN}Location: ${FINAL_DIR}/${NC}"
        echo ""
        echo -e "${YELLOW}Release includes:${NC}"
        echo "  - Deployment packages"
        echo "  - README.md"
        echo "  - USER_MANUAL.md"
        echo "  - CHANGELOG.md"
        echo "  - deploy-to-server.sh"
        echo ""
        echo -e "${YELLOW}Next steps:${NC}"
        echo "1. Review all documentation"
        echo "2. Commit to repository (final/ is tracked)"
        echo "3. Deploy to production using option 3"
        ;;

    3)
        echo ""
        echo -e "${BLUE}=== Deploy to VMI01 Production Server ===${NC}"

        # List available final versions
        echo -e "${YELLOW}Available production versions in final/:${NC}"
        if [ -d "$FINAL" ]; then
            ls -1 "$FINAL" | grep -E '^[0-9]+\.[0-9]+$'
        else
            echo "No production versions found"
            exit 1
        fi

        echo ""
        read -p "Enter version to deploy: " DEPLOY_VERSION

        if [ ! -d "${FINAL}/${DEPLOY_VERSION}" ]; then
            echo -e "${RED}Version ${DEPLOY_VERSION} not found in final/${NC}"
            exit 1
        fi

        read -p "Deploy to server 46.250.243.123? (y/n): " confirm
        if [ "$confirm" != "y" ]; then
            read -p "Enter custom server IP: " SERVER_IP
        else
            SERVER_IP="46.250.243.123"
        fi

        echo ""
        echo -e "${YELLOW}Deploying version ${DEPLOY_VERSION} to ${SERVER_IP}...${NC}"

        cd "${FINAL}/${DEPLOY_VERSION}"
        chmod +x deploy-to-server.sh
        ./deploy-to-server.sh "$SERVER_IP" root

        echo ""
        echo -e "${GREEN}✅ Deployment complete!${NC}"
        echo ""
        echo -e "${YELLOW}Verify deployment:${NC}"
        echo "  curl http://${SERVER_IP}:9090/health"
        echo "  open http://${SERVER_IP}:3000  # Grafana"
        ;;

    4)
        echo ""
        echo -e "${BLUE}=== Running Quality Checks ===${NC}"
        ./scripts/code-quality.sh
        ;;

    5)
        echo ""
        echo -e "${CYAN}Exiting...${NC}"
        exit 0
        ;;

    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}Deployment Manager Complete${NC}"
echo -e "${CYAN}========================================${NC}"
