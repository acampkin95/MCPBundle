# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP Bundle is an enterprise-ready distributed Model Context Protocol (MCP) ecosystem for production operations. It provides a complete solution for deploying and managing MCP servers across distributed infrastructure with production-grade monitoring, security, and resilience.

The project consists of multiple MCP servers that can be developed independently in `release_dev/`, tested in `devtestready/`, and deployed to production in `final/`.

## Key Commands

### Development

```bash
# Navigate to specific MCP server for development
cd release_dev/itjsst-mcp/
npm install && npm run dev

# Run quality checks before committing
npm run lint
npm run format
npm test

# Full quality suite (from project root)
./scripts/code-quality.sh
```

### Build & Deployment

```bash
# Build test package (creates devtestready/<version>/)
./deploy.sh # Select Option 1

# Test deployment to server
cd devtestready/<version>/
./deploy-to-server.sh 46.250.243.123 root

# Promote to production release (creates final/<version>/)
./deploy.sh # Select Option 2

# Deploy to production (VMI01)
./deploy.sh # Select Option 3
```

### Testing

```bash
# Run unit tests
npm test

# Watch mode for development
npm run test:watch

# With coverage
npm run test:coverage

# Load testing
npm run load-test

# Performance profiling
npm run perf:profile
npm run perf:flame
npm run perf:benchmark
```

### Diagnostics

```bash
# Run full diagnostic suite on deployed server
ssh root@46.250.243.123 '/opt/mcp/diagnostic-runbook.sh'

# View diagnostic results
ssh root@46.250.243.123 'cat /tmp/mcp_diagnostics_results.json | jq "."'

# Check service health
curl http://46.250.243.123:9090/health
```

## Architecture

### Directory Structure

```
MCP Bundle/
├── release_dev/           # Development source code (git tracked)
│   ├── itjsst-mcp/       # IT administration MCP server
│   ├── mcp-orchestrator/ # Central orchestration server
│   ├── perplexity-mcp/   # AI search integration MCP
│   └── shared/           # Shared configurations and docs
├── devtestready/         # Test builds (gitignored)
├── final/                # Production releases (git tracked)
├── deployment/           # Deployment scripts and automation
│   ├── scripts/          # Deployment and migration scripts
│   ├── security/         # Security configuration scripts
│   ├── ha/               # High availability setup
│   ├── monitoring/       # Health monitoring tools
│   ├── automation/       # Automated maintenance
│   └── tests/            # Integration and load tests
├── deploy.sh             # Interactive deployment manager
└── scripts/              # Build and quality scripts
```

### Technology Stack

- **Runtime**: Node.js >= 20.0.0, TypeScript 5.9+
- **MCP Protocol**: @modelcontextprotocol/sdk for stdio transport
- **Testing**: Vitest with coverage reporting
- **Linting**: ESLint with security plugins
- **Formatting**: Prettier with pre-commit hooks
- **Security**: Semgrep static analysis, npm audit
- **Performance**: Clinic.js profiling tools

### Production Infrastructure (3-VM Architecture)

```
VMI01 (Primary)          VMI02D (Standby)         VMI03 (Gateway)
46.250.243.123           46.250.241.70            154.26.158.31
├─ PostgreSQL 16 (R/W)   ├─ PostgreSQL 16 (R/O)   ├─ HAProxy LB
├─ MCP Orchestrator      ├─ Streaming Replication ├─ Failover Monitor
├─ Perplexity MCP        ├─ Hot Standby           ├─ Keycloak SSO
├─ IT-MCP Server         ├─ Storage Layer         ├─ Pi-Hole DNS
├─ Redis Cache           └─ Backup Storage        ├─ Prometheus
└─ PgBouncer Pool                                 └─ Grafana

Connected via WireGuard VPN Mesh (10.0.50.0/24, 10.0.51.0/24, 10.0.52.0/24)
```

**High Availability Features:**

- PostgreSQL streaming replication with automatic failover
- HAProxy load balancing across services
- Self-healing health monitors with auto-restart
- Connection pooling (1000 client connections)
- Automated maintenance scheduling

### MCP Servers

1. **itjsst-mcp**: System administration and diagnostic tools
   - 29 service classes for macOS/Linux/Windows administration
   - Structured thinking framework with SQLite persistence
   - Remote execution via SSH and PowerShell remoting

2. **mcp-orchestrator**: Central coordination and management
   - Agent registry and heartbeat monitoring
   - Command queue with priority scheduling
   - Distributed command dispatch

3. **perplexity-mcp**: AI-powered search and research
   - Integration with Perplexity API
   - Context-aware search capabilities
   - BI research purposes - work required
   - Deep research during planning rounds, retreive and pass over technical documents or research.

## Code Guidelines

### TypeScript Configuration

The project uses strict TypeScript configuration (`tsconfig.json`):

- All strict checks enabled
- ES2022 target with CommonJS modules
- No implicit any, unused locals, or unchecked indexed access
- Source maps and declarations generated

### Service Pattern

Services follow dependency injection pattern:

```typescript
export class MyService {
  public constructor(private readonly runner: CommandRunner) {}

  public async execute(params: MyParams): Promise<MyResult> {
    const result = await this.runner.run('command', {
      requiresSudo: false,
      timeoutMs: 30000,
    });
    return this.parseResult(result);
  }
}
```

### Error Handling

All tools use standardized error handling:

- `CommandExecutionError` for command failures
- Consistent error response format
- Graceful degradation for non-critical failures

### Testing Standards

- Write tests alongside feature files (`*.test.ts`)
- Minimum 80% coverage target
- Performance benchmarks for critical paths
- Integration tests for external dependencies

## Deployment Workflow

### Quick Deployment

```bash
# One-command full deployment (database + services + config)
./deployment/scripts/deploy-production.sh
```

### Step-by-Step Deployment

1. **Development**: Make changes in `release_dev/<mcp-name>/`
2. **Quality Check**: Run `./scripts/code-quality.sh`
3. **Build Test Package**: `./deploy.sh` → Option 1
4. **Deploy to Test**: `cd devtestready/<version>/ && ./deploy-to-server.sh`
5. **Run Diagnostics**: Verify all services healthy
6. **Promote to Production**: `./deploy.sh` → Option 2
7. **Git Commit**: Commit final version
8. **Deploy to Production**: `./deploy.sh` → Option 3
9. **Monitor**: Check Grafana dashboards and logs

### Production Deployment Components

- **Database Migration**: Automatic v0.1 → v0.2 with backup
- **Service Deployment**: Build, sync, and systemd setup
- **Security Hardening**: IP whitelisting, Fail2Ban, UFW firewall
- **High Availability**: PostgreSQL replication, HAProxy, failover monitoring
- **Health Monitoring**: Auto-healing with service restart and cooldowns
- **Automated Maintenance**: Daily/weekly/monthly scheduled tasks

## Important Files

### Documentation

- `release_dev/shared/docs/WORKFLOW_QUICKSTART.md` - Complete workflow guide
- `release_dev/shared/docs/FOLDER_STRUCTURE.md` - Detailed structure reference
- `release_dev/shared/docs/TESTING.md` - Testing and performance guide
- `release_dev/shared/docs/DIAGNOSTIC_SYSTEM.md` - Diagnostics documentation
- `DEPLOYMENT_GUIDE_COMPLETE.md` - Full v0.2.0 deployment instructions
- `MCP_CREDENTIALS.txt` - Production credentials (PostgreSQL, Keycloak, Redis)

### Deployment Scripts

- `deployment/scripts/deploy-production.sh` - One-command full deployment
- `deployment/security/configure-ip-whitelist.sh` - Security hardening
- `deployment/ha/configure-high-availability.sh` - HA setup
- `deployment/monitoring/mcp-health-monitor.sh` - Health monitoring
- `deployment/automation/auto-management.sh` - Maintenance automation
- `deployment/tests/mcp-integration-tests.sh` - Integration test suite

## Security Considerations

### Multi-Layer Security

1. **Network Firewall (UFW)**: IP whitelisting, VPN-only internal traffic
2. **Intrusion Prevention (Fail2Ban)**: SSH, PostgreSQL, HTTP auth protection
3. **Application Access Control**: pg_hba.conf, Nginx whitelist, service auth
4. **Service Authentication**: Keycloak SSO (JWT), SCRAM-SHA-256 passwords

### Best Practices

- Never commit credentials or secrets
- Use environment variables for sensitive configuration
- SSH keys managed via local SSH config
- PowerShell remoting requires explicit password environment variable
- All tools support dry-run mode for destructive operations
- Regular security updates via automated maintenance
