# MCP Bundle Workflow - Quick Start Guide

## 🚀 Daily Development Workflow

### 1. Start Development

```bash
cd "/Users/alex/Projects/MCP Bundle/release_dev/itjsst-mcp"
# OR
cd "/Users/alex/Projects/MCP Bundle/release_dev/mcp-orchestrator"

# Make your changes...
```

### 2. Before Committing

```bash
# Quality checks run automatically via pre-commit hook
git add .
git commit -m "feat: your feature description"

# Pre-commit hook will:
# ✓ Run ESLint auto-fix
# ✓ Run Prettier auto-format
# ✓ Run ShellCheck on scripts
```

### 3. Manual Quality Check (Optional)

```bash
cd "/Users/alex/Projects/MCP Bundle"
./scripts/code-quality.sh

# Runs:
# [1/8] TypeScript type check (target: <1s)
# [2/8] ESLint with security rules
# [3/8] Prettier format check
# [4/8] Vitest tests + coverage (target: <10s)
# [5/8] npm security audit
# [6/8] Semgrep security scan
# [7/8] ShellCheck
# [8/8] Bundle size analysis
```

## 📦 Creating a Test Build

### When Ready to Test

```bash
cd "/Users/alex/Projects/MCP Bundle"
./deploy.sh

# Select: 1) Build for Development Testing
# Version auto-increments: 0.1 → 0.2
```

**Output**: `devtestready/0.2/` with:
- `itjsst-mcp-0.2.tar.gz`
- `mcp-orchestrator-0.2.tar.gz`
- `deploy-to-server.sh`
- `config/`, `docs/`, `scripts/`

## 🧪 Testing the Build

### Deploy to Dev/Test Environment

```bash
cd devtestready/0.2/
./deploy-to-server.sh 46.250.243.123 root
# Or custom: ./deploy-to-server.sh <ip> <user>
```

### Run Diagnostics

```bash
# SSH to server
ssh root@46.250.243.123

# Run full diagnostic suite
/opt/mcp/diagnostic-runbook.sh

# View JSON results
cat /tmp/mcp_diagnostics_results.json | jq '.'

# Expected output:
# ✓ System health (CPU, Memory, Disk)
# ✓ PostgreSQL running and performant
# ✓ Redis cache healthy
# ✓ MCP-Orchestrator responding
# ✓ Keycloak authentication
# ✓ Observability stack active
# ✓ All ports listening
# ✓ Agents connected
```

### Testing Checklist

- [ ] All services start: `curl http://46.250.243.123:9090/health`
- [ ] Grafana accessible: `open http://46.250.243.123:3000`
- [ ] Agents can connect and register
- [ ] Commands execute successfully
- [ ] Diagnostics show 100% pass rate
- [ ] Performance benchmarks meet targets

### Break Testing (Important!)

```bash
# Test resilience
systemctl stop redis        # Verify circuit breaker
systemctl start redis
systemctl stop postgresql   # Verify graceful degradation
systemctl start postgresql

# Load testing
npm run load-test

# Network simulation
# Add latency, packet loss, verify retry logic
```

## ✅ Promoting to Production

### When All Tests Pass

```bash
cd "/Users/alex/Projects/MCP Bundle"
./deploy.sh

# Select: 2) Promote to Production Release
# Enter version: 0.2
```

**Output**: `final/0.2/` with:
- All deployment packages
- `README.md` (production guide)
- `USER_MANUAL.md` (complete manual)
- `CHANGELOG.md` (version history)

### Commit to Git

```bash
git add final/0.2/
git commit -m "Release: Production bundle v0.2

- Feature: Agent auto-discovery
- Feature: Circuit breaker improvements
- Fix: Memory leak in command queue
- Chore: Update dependencies
"
git push origin main
```

## 🚢 Production Deployment

### Deploy to VMI01

```bash
cd "/Users/alex/Projects/MCP Bundle"
./deploy.sh

# Select: 3) Deploy to VMI01 Production Server
# Enter version: 0.2
# Confirm server: 46.250.243.123
```

### Post-Deployment Verification

```bash
# 1. Health check
curl http://46.250.243.123:9090/health
# Expected: {"status":"healthy","version":"0.2",...}

# 2. Grafana dashboards
open http://46.250.243.123:3000
# Check: System Overview, Agent Health, Queue Status

# 3. Run diagnostics
ssh root@46.250.243.123 '/opt/mcp/diagnostic-runbook.sh'
# Expected: All checks pass

# 4. Monitor logs (24h)
ssh root@46.250.243.123 'tail -f /var/log/mcp/orchestrator.log'
```

## 🔧 Common Tasks

### Run Tests Locally

```bash
# Unit tests
npm test

# Watch mode (re-runs on changes)
npm run test:watch

# With coverage report
npm run test:coverage

# Open coverage in browser
open coverage/index.html
```

### Performance Profiling

```bash
# General performance diagnosis
npm run perf:profile

# CPU profiling (flame graphs)
npm run perf:flame

# Async operations analysis
npm run perf:bubbleprof

# Micro-benchmarks
npm run perf:benchmark

# HTTP load testing
npm run load-test
```

### Code Quality

```bash
# Type check only
npm run type-check

# Lint only
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code
npm run format

# Check formatting
npm run format:check

# Security audit
npm run security:audit

# Full quality suite
./scripts/code-quality.sh
```

### View Diagnostic Results

```bash
# Latest results
ssh root@46.250.243.123 'cat /tmp/mcp_diagnostics_results.json | jq ".summary"'

# All checks
ssh root@46.250.243.123 'cat /tmp/mcp_diagnostics_results.json | jq ".checks"'

# Failed checks only
ssh root@46.250.243.123 'cat /tmp/mcp_diagnostics_results.json | jq ".checks[] | select(.status==\"fail\")"'

# Logs
ssh root@46.250.243.123 'tail -100 /var/log/mcp/diagnostics.log'
```

## 📊 Monitoring

### Grafana Dashboards

```bash
# Access Grafana
open http://46.250.243.123:3000

# Login: admin / admin (change on first login)

# Key dashboards:
# - MCP System Overview
# - Agent Health & Performance
# - Command Queue Status
# - Database Performance
```

### Prometheus Metrics

```bash
# Direct query
curl http://46.250.243.123:9091/api/v1/query?query=mcp_agent_status

# Common queries:
# - Active agents: count(mcp_agent_status == 1)
# - Queue depth: mcp_command_queue_depth
# - Error rate: rate(mcp_errors_total[5m])
```

### Logs

```bash
# Orchestrator logs
ssh root@46.250.243.123 'journalctl -u mcp-orchestrator -f'

# All MCP logs
ssh root@46.250.243.123 'tail -f /var/log/mcp/*.log'

# Search for errors
ssh root@46.250.243.123 'grep -i error /var/log/mcp/*.log'
```

## 🔥 Emergency Procedures

### Rollback Deployment

```bash
ssh root@46.250.243.123

# Find backup
ls -lt /opt/mcp/*.backup.*

# Rollback
cd /opt/mcp
systemctl stop mcp-orchestrator
mv mcp-orchestrator mcp-orchestrator.failed
mv mcp-orchestrator.backup.TIMESTAMP mcp-orchestrator
systemctl start mcp-orchestrator

# Verify
curl http://localhost:9090/health
```

### Service Recovery

```bash
# Restart Orchestrator
ssh root@46.250.243.123 'systemctl restart mcp-orchestrator'

# Restart PostgreSQL
ssh root@46.250.243.123 'systemctl restart postgresql'

# Restart Redis
ssh root@46.250.243.123 'systemctl restart redis'

# Restart all
ssh root@46.250.243.123 'systemctl restart postgresql redis mcp-orchestrator'
```

### Clear Cache

```bash
# Redis cache
ssh root@46.250.243.123 'redis-cli FLUSHDB'

# Confirm
ssh root@46.250.243.123 'redis-cli DBSIZE'
# Expected: (integer) 0
```

## 📁 Important Files

### Configuration

- `release_dev/shared/config/` - Shared configs
- `release_dev/itjsst-mcp/.env` - Desktop agent config
- `release_dev/mcp-orchestrator/.env` - Orchestrator config

### Documentation

- `FOLDER_STRUCTURE.md` - Complete folder structure guide
- `WORKFLOW_QUICKSTART.md` - This file
- `release_dev/shared/docs/TESTING.md` - Testing guide
- `release_dev/shared/docs/DIAGNOSTIC_SYSTEM.md` - Diagnostic docs
- `release_dev/shared/docs/PHASE-0-1-COMPLETE.md` - Architecture

### Scripts

- `deploy.sh` - Interactive deployment manager
- `scripts/code-quality.sh` - Quality checks
- `scripts/benchmark.js` - Performance benchmarks
- `scripts/diagnostic-runbook.sh` - Server diagnostics

### Credentials

- `MCP_CREDENTIALS.txt` - Production credentials
  - PostgreSQL: mcp_admin password
  - Keycloak: admin + client secrets
  - Redis: connection details

## 🎯 Quick Reference

```bash
# Daily development
cd release_dev/<mcp-name>/
# ... make changes ...
git commit -m "..."

# Create test build
./deploy.sh → Option 1

# Test deployment
cd devtestready/VERSION/
./deploy-to-server.sh 46.250.243.123 root

# Run diagnostics
ssh root@46.250.243.123 '/opt/mcp/diagnostic-runbook.sh'

# Promote to production
./deploy.sh → Option 2
git add final/VERSION/ && git commit

# Deploy to production
./deploy.sh → Option 3

# Verify deployment
curl http://46.250.243.123:9090/health
open http://46.250.243.123:3000
```

## 🐛 Troubleshooting

### "Quality checks failed"

```bash
# Fix automatically
npm run lint:fix
npm run format

# Re-run checks
./scripts/code-quality.sh
```

### "Tests failing"

```bash
# Run with verbose output
npm test -- --reporter=verbose

# Update snapshots
npm test -- -u

# Debug specific test
npm test -- path/to/failing-test.ts
```

### "Deployment failed"

```bash
# Check connectivity
ssh root@46.250.243.123 'echo OK'

# Check disk space
ssh root@46.250.243.123 'df -h'

# View logs
ssh root@46.250.243.123 'journalctl -xe'

# Manual deployment
cd devtestready/VERSION/
scp *.tar.gz root@46.250.243.123:/opt/mcp/
ssh root@46.250.243.123
cd /opt/mcp
# ... manual extraction and setup ...
```

### "Diagnostic failures"

```bash
# Identify issue
ssh root@46.250.243.123 'cat /tmp/mcp_diagnostics_results.json | jq ".checks[] | select(.status==\"fail\")"'

# Check specific service
ssh root@46.250.243.123 'systemctl status SERVICE_NAME'

# View service logs
ssh root@46.250.243.123 'journalctl -u SERVICE_NAME -n 100'

# Restart if needed
ssh root@46.250.243.123 'systemctl restart SERVICE_NAME'
```

## 📚 Further Reading

- [Complete Folder Structure](FOLDER_STRUCTURE.md) - Detailed structure and workflow
- [Testing Guide](release_dev/shared/docs/TESTING.md) - Comprehensive testing documentation
- [Diagnostic System](release_dev/shared/docs/DIAGNOSTIC_SYSTEM.md) - Diagnostic integration
- [Architecture](release_dev/shared/docs/PHASE-0-1-COMPLETE.md) - Complete system architecture
- [Deployment Summary](release_dev/shared/docs/MCP_DEPLOYMENT_SUMMARY.md) - Deployment details

---

**Need help?** Check logs, run diagnostics, review documentation, or consult the team.

**Report issues**: Document in GitHub issues with:
- Version number
- Steps to reproduce
- Diagnostic results
- Relevant logs
