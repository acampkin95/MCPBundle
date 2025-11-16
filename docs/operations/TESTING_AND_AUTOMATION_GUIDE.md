# MCP Bundle Testing and Automation Guide

Complete guide for production-ready testing and automation scripts.

## Overview

This guide covers four critical deployment scripts for comprehensive testing and automated maintenance of the MCP Bundle infrastructure:

1. **Security Validation** - Multi-layer security testing
2. **Backup Validation** - Backup integrity and restore testing
3. **Automated Maintenance** - Self-healing and scheduled maintenance
4. **Load Testing** - Performance and stress testing

---

## 1. Security Validation (`deployment/tests/security-validation.sh`)

### Purpose

Comprehensive security testing across all VMs in the MCP infrastructure.

### Features

- Port scanning with nmap (all open ports)
- SSL/TLS configuration testing (testssl.sh)
- Vulnerability scanning with Lynis
- Authentication bypass testing
- Fail2Ban trigger validation
- Firewall rule verification (UFW, nftables)
- Service exposure verification

### Usage

```bash
# Full security scan on all VMs
./deployment/tests/security-validation.sh

# Quick scan (skip lengthy tests)
./deployment/tests/security-validation.sh --quick

# Test specific VM only
./deployment/tests/security-validation.sh --vm vmi01

# Quick scan of specific VM
./deployment/tests/security-validation.sh --quick --vm vmi03
```

### Options

- `--quick` - Skip lengthy scans (Lynis, deep SSL tests)
- `--vm <vm>` - Test specific VM only (vmi01, vmi02d, vmi03)
- `--report <path>` - Custom report output directory
- `-h, --help` - Show help message

### Output

- **Report Directory**: `/tmp/mcp_security_validation_<timestamp>/`
- **Summary**: `SECURITY_SUMMARY.md`
- **JSON Report**: `security_report.json`
- **Detailed Reports**:
  - `port_scans/` - nmap scan results per VM
  - `ssl_tests/` - testssl.sh reports
  - `lynis_scans/` - Lynis audit reports
  - `firewall_rules/` - UFW and nftables rules
  - `service_exposure/` - Listening service details

### Dependencies

- **Required**: nmap, ssh, jq
- **Optional**: testssl.sh, lynis

### Performance Baselines

- No unauthorized open ports
- SSL/TLS: No critical or high severity issues
- Authentication: All bypass attempts must fail
- Fail2Ban: Active and monitoring critical services
- Firewall: Active with default deny policy

---

## 2. Backup Validation (`deployment/tests/backup-validation-tests.sh`)

### Purpose

Comprehensive backup integrity verification and restore testing.

### Features

- Automated restore testing to temporary location
- File integrity verification (SHA256 checksums)
- Encryption verification
- GFS rotation compliance checking
- Performance metrics (backup size, duration, transfer rates)
- Backup freshness monitoring

### Usage

```bash
# Validate latest backups (default)
./deployment/tests/backup-validation-tests.sh

# Validate all backups in rotation
./deployment/tests/backup-validation-tests.sh --full

# Include actual restore tests
./deployment/tests/backup-validation-tests.sh --restore-test

# Test specific backup type
./deployment/tests/backup-validation-tests.sh --type daily

# Full validation with restore testing
./deployment/tests/backup-validation-tests.sh --full --restore-test
```

### Options

- `--full` - Validate all backups in rotation (default: latest only)
- `--latest` - Validate only the latest backup
- `--restore-test` - Perform actual restore test (resource intensive)
- `--type <type>` - Test specific backup type (daily, weekly, monthly, database)
- `--report <path>` - Custom report output directory
- `-h, --help` - Show help message

### Output

- **Report Directory**: `/tmp/mcp_backup_validation_<timestamp>/`
- **Summary**: `BACKUP_VALIDATION_SUMMARY.md`
- **JSON Report**: `backup_validation_report.json`
- **Backup List**: `backup_list.txt`

### GFS Rotation Policy

- **Daily**: 7 days retention
- **Weekly**: 4 weeks retention
- **Monthly**: 12 months retention

### Validation Checks

1. ✓ Backup file exists and is non-empty
2. ✓ Archive/SQL integrity (tar/gzip testing)
3. ✓ SHA256 checksum verification
4. ✓ Encryption validation (no plaintext sensitive data)
5. ✓ GFS rotation compliance
6. ✓ Backup freshness (<24 hours for daily)
7. ✓ Restore test (if --restore-test enabled)

---

## 3. Automated Maintenance (`deployment/automation/deploy-maintenance.sh`)

### Purpose

Deploy comprehensive self-healing and maintenance automation across all VMs.

### Features

#### Self-Healing Service Monitor

- Monitors service health every 10 seconds
- Auto-restart failed services (max 3 attempts)
- 5-minute cooldown after max attempts
- Prometheus metrics integration
- Intelligent failure tracking

#### Scheduled Maintenance Tasks

**Daily (02:00):**

- Log cleanup (30-day retention)
- Disk space monitoring (80% warning, 90% critical)
- Metrics collection
- Service health verification

**Weekly (Sunday 03:00):**

- Database VACUUM and optimization
- Security update checks
- SSL certificate expiration checks
- Backup verification

**Monthly (1st of month, 04:00):**

- Full database optimization (VACUUM FULL, REINDEX)
- Comprehensive system audit
- Performance analysis
- Backup validation

### Usage

```bash
# Deploy everything to all VMs
./deployment/automation/deploy-maintenance.sh

# Deploy to specific VM
./deployment/automation/deploy-maintenance.sh --vm vmi01

# Deploy only service monitors
./deployment/automation/deploy-maintenance.sh --service-only

# Deploy only scheduled tasks
./deployment/automation/deploy-maintenance.sh --cron-only

# Preview deployment (dry-run)
./deployment/automation/deploy-maintenance.sh --dry-run
```

### Options

- `--vm <vm>` - Deploy to specific VM (vmi01, vmi02d, vmi03, all)
- `--service-only` - Deploy only self-healing service monitors
- `--cron-only` - Deploy only scheduled maintenance tasks
- `--dry-run` - Show what would be deployed without making changes
- `-h, --help` - Show help message

### Deployed Components

**Systemd Services:**

- `mcp-service-monitor.service` - Self-healing monitor (oneshot)
- `mcp-daily-maintenance.service` - Daily tasks (oneshot)
- `mcp-weekly-maintenance.service` - Weekly tasks (oneshot)
- `mcp-monthly-maintenance.service` - Monthly tasks (oneshot)

**Systemd Timers:**

- `mcp-service-monitor.timer` - Every 10 seconds
- `mcp-daily-maintenance.timer` - Daily at 02:00
- `mcp-weekly-maintenance.timer` - Sunday at 03:00
- `mcp-monthly-maintenance.timer` - 1st of month at 04:00

**Installation Locations:**

- Scripts: `/opt/mcp/maintenance/`
- Logs: `/var/log/mcp/`
- State: `/var/lib/mcp/service-monitor/`
- Reports: `/var/lib/mcp/reports/`
- Metrics: `/var/lib/node_exporter/textfile_collector/`

### Monitoring

```bash
# View active timers
systemctl list-timers 'mcp-*'

# Check service monitor logs
journalctl -u mcp-service-monitor -f

# View maintenance logs
tail -f /var/log/mcp/daily-maintenance.log
tail -f /var/log/mcp/weekly-maintenance.log
tail -f /var/log/mcp/monthly-maintenance.log

# Check Prometheus metrics
cat /var/lib/node_exporter/textfile_collector/mcp_services.prom
```

---

## 4. Load Testing (`deployment/tests/load-testing.sh`)

### Purpose

Comprehensive load and performance testing for MCP infrastructure components.

### Features

- Automatic k6 installation and setup
- Multiple load scenarios (baseline, peak, stress)
- Service-specific tests (MCP, HAProxy, PostgreSQL, Redis)
- Performance baseline validation
- SLA compliance checking
- HTML and Markdown report generation

### Usage

```bash
# Run baseline tests on all services
./deployment/tests/load-testing.sh

# Run all scenarios with 50 VUs
./deployment/tests/load-testing.sh --scenario all --vus 50

# Peak test PostgreSQL only
./deployment/tests/load-testing.sh --target postgres --scenario peak

# 5-minute stress test with 100 VUs
./deployment/tests/load-testing.sh --scenario stress --duration 5m --vus 100

# Custom test configuration
./deployment/tests/load-testing.sh --target haproxy --scenario peak --duration 10m --vus 200
```

### Options

- `--scenario <name>` - Run specific scenario (baseline, peak, stress, all) [default: baseline]
- `--target <service>` - Test specific service (mcp, haproxy, postgres, redis, all) [default: all]
- `--duration <time>` - Test duration (e.g., 30s, 5m, 1h) [default: 30s]
- `--vus <number>` - Number of virtual users [default: 10]
- `--output <path>` - Custom report output directory
- `-h, --help` - Show help message

### Load Scenarios

#### Baseline

- **Purpose**: Normal operating conditions
- **VUs**: As specified (default: 10)
- **Duration**: Sustained load
- **SLA**: P95 < 500ms, Error rate < 1%

#### Peak

- **Purpose**: High traffic with spikes
- **VUs**: 2-3x baseline
- **Duration**: Includes spike pattern
- **SLA**: P95 < 1000ms, Error rate < 1%

#### Stress

- **Purpose**: Beyond normal capacity
- **VUs**: 3-5x baseline
- **Duration**: Extended high load
- **SLA**: P95 < 2000ms, Error rate < 5%

### Performance Baselines

| Scenario | P95 Latency | Error Rate | VUs (relative) |
| -------- | ----------- | ---------- | -------------- |
| Baseline | < 500ms     | < 1%       | 1x             |
| Peak     | < 1000ms    | < 1%       | 2-3x           |
| Stress   | < 2000ms    | < 5%       | 3-5x           |

### Test Targets

1. **MCP Services** - Health endpoints, orchestrator API
2. **HAProxy** - Load balancing, backend distribution
3. **PostgreSQL** - Connection pooling, query performance
4. **Redis** - Cache operations, response times

### Output

- **Report Directory**: `/tmp/mcp_load_testing_<timestamp>/`
- **Summary**: `LOAD_TEST_SUMMARY.md`
- **HTML Report**: `load_test_report.html` (interactive)
- **Raw Results**: `results/` directory (JSON format)
- **Test Scripts**: `scripts/` directory (k6 JavaScript)

### Dependencies

- **k6**: Auto-installed if not present
  - macOS: Via Homebrew
  - Linux: Direct binary download
- **jq**: For JSON parsing (optional, recommended)

---

## Quick Start Workflow

### Initial Security Audit

```bash
# Run comprehensive security scan
./deployment/tests/security-validation.sh

# Review report
cat /tmp/mcp_security_validation_*/SECURITY_SUMMARY.md
```

### Deploy Automated Maintenance

```bash
# Deploy to all VMs
./deployment/automation/deploy-maintenance.sh

# Verify deployment
ssh root@46.250.243.123 'systemctl list-timers "mcp-*"'
```

### Validate Backups

```bash
# Quick validation of latest backups
./deployment/tests/backup-validation-tests.sh --latest

# Full validation with restore test (monthly)
./deployment/tests/backup-validation-tests.sh --full --restore-test
```

### Performance Testing

```bash
# Baseline performance test
./deployment/tests/load-testing.sh --scenario baseline

# Full load test suite (before major releases)
./deployment/tests/load-testing.sh --scenario all --duration 5m --vus 50
```

---

## Scheduled Testing Recommendations

### Daily

- Automated via deployed maintenance scripts
- Service health monitoring (automatic)
- Log cleanup (automatic)

### Weekly

- Security scan (quick mode)
  ```bash
  ./deployment/tests/security-validation.sh --quick
  ```
- Backup validation (latest)
  ```bash
  ./deployment/tests/backup-validation-tests.sh --latest
  ```

### Monthly

- Full security audit
  ```bash
  ./deployment/tests/security-validation.sh
  ```
- Comprehensive backup validation
  ```bash
  ./deployment/tests/backup-validation-tests.sh --full --restore-test
  ```
- Performance load testing
  ```bash
  ./deployment/tests/load-testing.sh --scenario all --duration 5m --vus 50
  ```

### Before Major Releases

- Full security validation
- Backup restore test
- Stress testing
  ```bash
  ./deployment/tests/load-testing.sh --scenario stress --duration 10m --vus 100
  ```

---

## Troubleshooting

### Security Validation

**Issue**: nmap fails with permission denied

```bash
# Run with sudo or ensure proper permissions
sudo ./deployment/tests/security-validation.sh
```

**Issue**: testssl.sh not found

```bash
# Install testssl.sh
git clone --depth 1 https://github.com/drwetter/testssl.sh.git
export PATH=$PATH:$(pwd)/testssl.sh
```

### Backup Validation

**Issue**: Cannot access backup VM

```bash
# Verify SSH access
ssh root@46.250.241.70 'echo "Connection successful"'

# Check SSH keys
ssh-add -l
```

**Issue**: Restore test fails

```bash
# Check available disk space
df -h /tmp

# Verify backup file integrity manually
ssh root@46.250.241.70 'tar -tzf /mnt/storage/backups/daily/latest.tar.gz | head'
```

### Automated Maintenance

**Issue**: Timers not starting

```bash
# Check systemd status
systemctl list-timers 'mcp-*'
systemctl status mcp-service-monitor.timer

# Reload systemd if needed
systemctl daemon-reload
systemctl restart mcp-service-monitor.timer
```

**Issue**: Service monitor not restarting services

```bash
# Check logs
journalctl -u mcp-service-monitor -n 50

# Verify permissions
ls -l /opt/mcp/maintenance/service-monitor.sh

# Manual test
/opt/mcp/maintenance/service-monitor.sh
```

### Load Testing

**Issue**: k6 installation fails

```bash
# macOS: Install Homebrew first
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install k6

# Linux: Download directly
wget https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz
tar -xzf k6-v0.47.0-linux-amd64.tar.gz
sudo mv k6-*/k6 /usr/local/bin/
```

**Issue**: Tests fail to connect

```bash
# Verify endpoints are accessible
curl http://46.250.243.123:9090/health

# Check firewall rules
ssh root@46.250.243.123 'ufw status'
```

---

## Best Practices

### Security

1. Run security validation after any infrastructure changes
2. Review Fail2Ban logs regularly for attack patterns
3. Keep SSL certificates monitored (30-day warning)
4. Audit firewall rules monthly

### Backups

1. Test restore procedures monthly
2. Verify GFS rotation compliance weekly
3. Monitor backup storage capacity
4. Validate encryption on all backups

### Maintenance

1. Review maintenance logs weekly
2. Monitor Prometheus metrics dashboards
3. Investigate any service restart patterns
4. Keep maintenance windows documented

### Performance

1. Establish baseline metrics first
2. Run load tests before and after major changes
3. Compare results over time to detect degradation
4. Test peak scenarios before high-traffic events

---

## Integration with CI/CD

### Example GitHub Actions Workflow

```yaml
name: MCP Bundle Testing

on:
  schedule:
    - cron: '0 2 * * 0' # Weekly on Sunday at 2 AM
  workflow_dispatch:

jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Security Validation
        run: ./deployment/tests/security-validation.sh --quick

  backup-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Validate Backups
        run: ./deployment/tests/backup-validation-tests.sh --latest

  load-testing:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Performance Test
        run: ./deployment/tests/load-testing.sh --scenario baseline --duration 2m
```

---

## Support and Maintenance

### Log Locations

- Security: `/tmp/mcp_security_validation_*/`
- Backups: `/tmp/mcp_backup_validation_*/`
- Maintenance: `/var/log/mcp/`
- Load Tests: `/tmp/mcp_load_testing_*/`

### Metrics Endpoints

- Prometheus: `http://154.26.158.31:9090`
- Grafana: `http://154.26.158.31:3000`
- Node Exporter: `http://<vm>:9100/metrics`

### Documentation

- This guide: `deployment/TESTING_AND_AUTOMATION_GUIDE.md`
- Deployment: `DEPLOYMENT_GUIDE_COMPLETE.md`
- Workflow: `release_dev/shared/docs/WORKFLOW_QUICKSTART.md`

---

## Version History

**v0.2.0** (Current)

- Initial release of comprehensive testing and automation suite
- Security validation with multi-layer testing
- Backup integrity verification with restore testing
- Self-healing service monitors with Prometheus integration
- Load testing with k6 and performance baselines

---

## Contributing

When adding new tests or maintenance tasks:

1. Follow the existing script structure (colors, logging, error handling)
2. Use `set -euo pipefail` for robust error handling
3. Generate both Markdown and JSON reports
4. Include comprehensive help text (`--help`)
5. Support dry-run mode where applicable
6. Add examples to this guide

---

**Last Updated**: November 2025
**Maintained By**: MCP Bundle Team
