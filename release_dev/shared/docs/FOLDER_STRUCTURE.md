# MCP Enterprise Bundle - Folder Structure & Workflow

## Overview

The MCP Bundle project follows a structured release workflow that separates development, testing, and production-ready code. This ensures quality control and facilitates proper testing before deployment.

## Directory Structure

```
/Users/alex/Projects/MCP Bundle/
├── release_dev/                    # Development source code (tracked in git)
│   ├── itjsst-mcp/                # ITJSST-MCP source code
│   │   ├── src/                   # TypeScript source
│   │   ├── dist/                  # Compiled JavaScript
│   │   ├── tests/                 # Unit and integration tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── mcp-orchestrator/          # MCP-Orchestrator source code
│   │   ├── src/                   # TypeScript source
│   │   ├── dist/                  # Compiled JavaScript
│   │   ├── tests/                 # Unit and integration tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── shared/                    # Shared resources
│       ├── config/                # Shared configuration files
│       │   ├── package.json
│       │   ├── tsconfig.json
│       │   ├── vitest.config.ts
│       │   ├── .eslintrc.json
│       │   ├── .prettierrc.json
│       │   └── .lintstagedrc.json
│       │
│       ├── docs/                  # Documentation
│       │   ├── PHASE-0-1-COMPLETE.md
│       │   ├── TESTING.md
│       │   ├── DIAGNOSTIC_SYSTEM.md
│       │   ├── MCP_DEPLOYMENT_SUMMARY.md
│       │   └── MCP_QUICK_REFERENCE.md
│       │
│       ├── scripts/               # Deployment and maintenance scripts
│       │   ├── code-quality.sh
│       │   ├── benchmark.js
│       │   └── diagnostic-runbook.sh
│       │
│       └── tests/                 # Shared test utilities
│
├── devtestready/                  # Built test packages (gitignored)
│   └── 0.1/                       # Version 0.1 test build
│   │   ├── itjsst-mcp-0.1.tar.gz
│   │   ├── mcp-orchestrator-0.1.tar.gz
│   │   ├── config/
│   │   ├── docs/
│   │   ├── scripts/
│   │   └── deploy-to-server.sh    # Automated deployment script
│   └── 0.2/                       # Version 0.2 (when created)
│       └── ...
│
├── final/                         # Production releases (tracked in git)
│   └── 0.1/                       # Production-ready version 0.1
│       ├── itjsst-mcp-0.1.tar.gz
│       ├── mcp-orchestrator-0.1.tar.gz
│       ├── config/
│       ├── docs/
│       ├── scripts/
│       ├── deploy-to-server.sh
│       ├── README.md              # Production README
│       ├── USER_MANUAL.md         # User manual
│       └── CHANGELOG.md           # Version changelog
│
├── deploy.sh                      # Interactive deployment manager
├── VERSION                        # Current version number
├── .gitignore                     # Git ignore (excludes devtestready/)
├── package.json                   # Root package.json for dev tools
├── tsconfig.json                  # Root TypeScript config
├── vitest.config.ts               # Testing configuration
└── .husky/                        # Git hooks
    └── pre-commit                 # Pre-commit quality checks

```

## Workflow

### 1. Development Phase

Work in `release_dev/` directory:

```bash
# Make changes to source code
cd release_dev/itjsst-mcp/
# ... edit files ...

# Run quality checks
npm run lint
npm run type-check
npm test

# Build
npm run build
```

All development happens in `release_dev/`. This folder is tracked in git.

### 2. Building Test Package

When ready to create a test build:

```bash
# From project root
./deploy.sh

# Select option 1: Build for Development Testing
# This will:
# 1. Run all quality checks (type-check, lint, format, tests)
# 2. Build both MCP modules
# 3. Create versioned packages in devtestready/X.Y/
# 4. Generate deployment scripts
```

Output: `devtestready/0.1/` with:
- Compressed packages (.tar.gz)
- Deployment scripts
- Configuration files
- Documentation

**Note**: `devtestready/` is gitignored - these are temporary test builds.

### 3. Testing Phase

Deploy test build to development environment:

```bash
cd devtestready/0.1/

# Deploy to server
./deploy-to-server.sh 46.250.243.123 root

# Or deploy locally for testing
tar -xzf itjsst-mcp-0.1.tar.gz -C /tmp/test-mcp/
cd /tmp/test-mcp/
npm ci --production
npm start
```

#### Run Comprehensive Diagnostics

```bash
# On production server VMI01
ssh root@46.250.243.123
/opt/mcp/diagnostic-runbook.sh

# View results
cat /tmp/mcp_diagnostics_results.json | jq '.'
```

#### Testing Checklist

- [ ] All services start successfully
- [ ] PostgreSQL database accessible
- [ ] Redis cache functional
- [ ] Keycloak authentication working
- [ ] Orchestrator health endpoint responding
- [ ] Agents can connect and register
- [ ] Commands execute successfully
- [ ] Observability stack collecting metrics
- [ ] All diagnostic checks pass
- [ ] Performance benchmarks meet targets
- [ ] No security vulnerabilities found

#### Break Testing

```bash
# Simulate failures
systemctl stop redis
# Verify circuit breaker activates

# Overload testing
npm run load-test
# Verify graceful degradation

# Network issues
# Add iptables rules to simulate latency
# Verify retry logic works
```

### 4. Promotion to Production

Once testing is complete and all checks pass:

```bash
./deploy.sh

# Select option 2: Promote to Production Release
# Enter version: 0.1

# This will:
# 1. Copy from devtestready/0.1/ to final/0.1/
# 2. Generate production README.md
# 3. Create USER_MANUAL.md
# 4. Generate CHANGELOG.md
# 5. Include all deployment artifacts
```

Output: `final/0.1/` with complete production package.

**Important**: `final/` IS tracked in git. Commit and push after promotion:

```bash
git add final/0.1/
git commit -m "Release: Production bundle v0.1"
git push origin main
```

### 5. Production Deployment

Deploy to production server:

```bash
./deploy.sh

# Select option 3: Deploy to VMI01 Production Server
# Enter version: 0.1
# Confirm server: 46.250.243.123

# This will:
# 1. Upload packages to server
# 2. Backup existing deployments
# 3. Extract new versions
# 4. Install dependencies
# 5. Restart services
# 6. Verify health checks
```

### 6. Post-Deployment Verification

```bash
# Health checks
curl http://46.250.243.123:9090/health

# Grafana dashboards
open http://46.250.243.123:3000

# View logs
ssh root@46.250.243.123 'tail -f /var/log/mcp/orchestrator.log'

# Run diagnostics
ssh root@46.250.243.123 '/opt/mcp/diagnostic-runbook.sh'
```

## Version Management

### Version File

`VERSION` file at project root tracks current version:

```
0.1
```

### Version Incrementing

Automatic during build process:
- Minor version increments automatically (0.1 → 0.2)
- Major version requires manual edit

### Version Naming

Format: `MAJOR.MINOR`

Examples:
- `0.1` - Initial release
- `0.2` - Bug fixes, minor features
- `1.0` - Major stable release
- `1.1` - Additional features
- `2.0` - Breaking changes

## Git Workflow

### What's Tracked

**Tracked (committed to git)**:
- `release_dev/` - All source code
- `final/` - Production releases only
- Root configuration files
- Documentation
- Scripts
- `.gitignore`

**Not Tracked (gitignored)**:
- `devtestready/` - Temporary test builds
- `node_modules/` - Dependencies
- `dist/` - Compiled code (regenerated)
- `coverage/` - Test coverage reports
- `.env` - Environment variables
- `*.log` - Log files

### Commit Strategy

```bash
# Development commits
git add release_dev/
git commit -m "feat: Add agent auto-discovery"

# Production release commits
git add final/0.1/
git commit -m "Release: Production bundle v0.1"

# Documentation updates
git add release_dev/shared/docs/
git commit -m "docs: Update deployment guide"
```

## Deployment Scripts

### deploy.sh

Interactive deployment manager with 5 options:

1. **Build for Development Testing**
   - Runs quality checks
   - Builds packages
   - Creates devtestready/VERSION/

2. **Promote to Production Release**
   - Copies from devtestready/ to final/
   - Generates documentation
   - Creates changelog

3. **Deploy to VMI01 Production Server**
   - Uploads packages
   - Installs on server
   - Restarts services

4. **Run Quality Checks**
   - Execute code-quality.sh
   - TypeScript, ESLint, Prettier, Vitest

5. **Exit**

### deploy-to-server.sh

Auto-generated per version in devtestready/VERSION/:

```bash
./deploy-to-server.sh [server-ip] [user]

# Example
./deploy-to-server.sh 46.250.243.123 root
```

Features:
- Automatic backup of existing deployments
- Atomic deployment (mv instead of cp)
- Dependency installation
- Service restart
- Health verification

## Quality Gates

### Pre-Commit (Automatic)

Via Husky + lint-staged:
- ESLint auto-fix
- Prettier auto-format
- ShellCheck for scripts

Runs on: `git commit`

### Pre-Build (Required)

Via code-quality.sh:
1. TypeScript type check (strict mode)
2. ESLint with security rules
3. Prettier format check
4. Vitest tests + coverage
5. npm security audit
6. Semgrep security scan
7. ShellCheck for scripts
8. Bundle size analysis

Runs: Before creating devtestready/ package

### Pre-Production (Manual)

Before promoting to final/:
- [ ] All tests pass in dev environment
- [ ] Diagnostic runbook shows no failures
- [ ] Performance benchmarks meet targets
- [ ] Security scans show no critical issues
- [ ] Break testing validates resilience
- [ ] Documentation is complete
- [ ] Changelog is updated

## Diagnostic System

### Local Development

```bash
# Run diagnostic script locally against dev env
./release_dev/shared/scripts/diagnostic-runbook-dev.sh
```

### Production Server (VMI01)

```bash
# Manual execution
ssh root@46.250.243.123 '/opt/mcp/diagnostic-runbook.sh'

# View results
ssh root@46.250.243.123 'cat /tmp/mcp_diagnostics_results.json | jq .'

# View logs
ssh root@46.250.243.123 'tail -f /var/log/mcp/diagnostics.log'
```

### Automated Diagnostics

Cron jobs on VMI01:

```bash
# Hourly diagnostics
0 * * * * /opt/mcp/diagnostic-runbook.sh > /var/log/mcp/diagnostics-cron.log 2>&1

# Daily full diagnostics
0 3 * * * /opt/mcp/diagnostic-runbook.sh --full > /var/log/mcp/diagnostics-daily.log 2>&1
```

### Orchestrator Integration

Diagnostic tool registered in MCP-Orchestrator:

```typescript
// Via MCP command
mcp.executeTool('run_production_diagnostics', {
  checks: 'all',
  save_results: true
});
```

## Testing Strategy

### Unit Tests (Vitest)

```bash
npm test                 # Run once
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
```

Target: 70% coverage

### Integration Tests

```bash
npm run test:integration
```

### Performance Tests

```bash
npm run perf:profile     # Clinic Doctor
npm run perf:flame       # Flame graphs
npm run perf:benchmark   # Micro-benchmarks
npm run load-test        # HTTP load testing
```

### End-to-End Tests

Deployed to devtestready/ environment

### Break Testing

Manual chaos engineering:
- Service failures
- Network partitions
- Resource exhaustion
- High load scenarios

## Maintenance

### Daily

- Monitor Grafana dashboards
- Check diagnostic results
- Review error logs

### Weekly

- Review test coverage reports
- Check for npm updates
- Review security scan results

### Monthly

- Update dependencies
- Review performance trends
- Clean old devtestready/ builds
- Backup production database

## Best Practices

### Development

1. **Branch from `main`** for features
2. **Write tests** before code (TDD)
3. **Run quality checks** before commit
4. **Keep commits atomic** and well-described
5. **Update documentation** with code changes

### Testing

1. **Test in devtestready/** before final/
2. **Run full diagnostic suite** before promotion
3. **Perform break testing** on critical changes
4. **Validate performance** meets benchmarks
5. **Security scan** all dependencies

### Deployment

1. **Always backup** before deployment
2. **Use atomic operations** (mv not cp)
3. **Verify health checks** post-deployment
4. **Monitor for 24h** after production deploy
5. **Keep rollback packages** for 30 days

### Documentation

1. **Update CHANGELOG.md** for every release
2. **Keep USER_MANUAL.md** current
3. **Document breaking changes** prominently
4. **Include migration guides** when needed
5. **Version documentation** with code

## Troubleshooting

### Build Fails

```bash
# Check quality issues
./scripts/code-quality.sh

# Fix linting
npm run lint:fix

# Fix formatting
npm run format

# Rebuild
npm run build
```

### Tests Fail

```bash
# Run with verbose output
npm test -- --reporter=verbose

# Check specific test
npm test -- path/to/test.ts

# Update snapshots if needed
npm test -- -u
```

### Deployment Fails

```bash
# Check server connectivity
ssh root@46.250.243.123 'echo OK'

# Verify space
ssh root@46.250.243.123 'df -h'

# Check logs
ssh root@46.250.243.123 'tail -f /var/log/mcp/*.log'

# Manual rollback
ssh root@46.250.243.123 'cd /opt/mcp && mv mcp-orchestrator mcp-orchestrator.failed && mv mcp-orchestrator.backup.* mcp-orchestrator'
```

### Diagnostic Failures

```bash
# Run with debug
ssh root@46.250.243.123 'bash -x /opt/mcp/diagnostic-runbook.sh'

# Check specific service
ssh root@46.250.243.123 'systemctl status postgresql'
ssh root@46.250.243.123 'systemctl status redis'

# View full logs
ssh root@46.250.243.123 'journalctl -xe'
```

## Summary

This folder structure provides:

✅ **Clear separation** between dev, test, and production
✅ **Automated quality gates** at every stage
✅ **Comprehensive testing** before production
✅ **Reproducible deployments** via scripts
✅ **Full observability** through diagnostics
✅ **Version control** of production releases
✅ **Rollback capability** via backups
✅ **Documentation** at every level

The workflow ensures that only thoroughly tested, quality-checked code reaches production while maintaining a clear audit trail through git.
