# MCP Diagnostic System Integration

## Overview

The MCP diagnostic system provides comprehensive health checks, performance testing, and monitoring for the production environment (VMI01). The system is integrated with the MCP-Orchestrator for automated diagnostics.

## Components

### 1. Diagnostic Runbook Script

**Location**: `/opt/mcp/diagnostic-runbook.sh`

Comprehensive diagnostic script that checks:

- System health (CPU, memory, disk)
- PostgreSQL database health and performance
- Redis cache health and performance
- MCP-Orchestrator status
- Keycloak authentication service
- Observability stack (Prometheus, Grafana, Loki, Jaeger)
- Network connectivity and ports
- Active agent connectivity

**Output**: JSON results saved to `/tmp/mcp_diagnostics_results.json`

### 2. Orchestrator Integration

The diagnostic runbook can be invoked by the Orchestrator through the command queue system.

## Usage

### Manual Execution

```bash
# SSH to production server
ssh root@46.250.243.123

# Run full diagnostic
/opt/mcp/diagnostic-runbook.sh

# View results
cat /tmp/mcp_diagnostics_results.json | jq '.'

# View logs
tail -f /var/log/mcp/diagnostics.log
```

### Orchestrator Integration

The Orchestrator can trigger diagnostics via the command queue:

```typescript
// In MCP-Orchestrator
await commandQueue.enqueue({
  command: 'run_diagnostics',
  target: 'production',
  priority: 'high',
  payload: {
    checks: 'all', // or specific checks
    save_results: true,
  },
});
```

### Scheduled Diagnostics

Set up cron job for regular health checks:

```bash
# Add to /etc/cron.d/mcp-diagnostics
# Run diagnostics every hour
0 * * * * root /opt/mcp/diagnostic-runbook.sh > /var/log/mcp/diagnostics-cron.log 2>&1

# Run full diagnostics daily at 3 AM
0 3 * * * root /opt/mcp/diagnostic-runbook.sh --full > /var/log/mcp/diagnostics-daily.log 2>&1
```

## Diagnostic Checks

### System Health (Check 1)

- **CPU Usage**: Monitors CPU utilization across all cores
- **Memory Usage**: Checks RAM usage and availability
- **Disk Usage**: Monitors root filesystem capacity
- **Thresholds**:
  - PASS: <80% CPU, <85% memory, <85% disk
  - WARN: 80-95% usage
  - FAIL: >95% usage

### PostgreSQL Health (Check 2)

- **Service Status**: Verifies PostgreSQL is running
- **Connection Count**: Active connections to mcp_ecosystem
- **Database Size**: Current database size
- **Version**: PostgreSQL version check
- **Performance Test**: Simple query execution time

### Redis Health (Check 3)

- **Service Status**: Verifies Redis is running
- **Connectivity**: PING/PONG test
- **Memory Usage**: Current memory consumption
- **Key Count**: Number of cached keys
- **Performance Test**: Latency measurement

### MCP-Orchestrator Health (Check 4)

- **HTTP Health Endpoint**: `GET /health`
- **Expected Response**: HTTP 200 with health status
- **Checks**:
  - Service availability
  - Database connectivity
  - Redis connectivity
  - Queue depth

### Keycloak Health (Check 5)

- **HTTP Health Endpoint**: `GET /health`
- **Service Status**: Verifies Keycloak is running
- **Realm Availability**: Checks mcp-enterprise realm

### Observability Stack (Check 6)

- **Prometheus**: `GET /-/healthy`
- **Grafana**: `GET /api/health`
- **Loki**: `GET /ready`
- **Jaeger**: `GET /` (UI availability)

### Network & Ports (Check 7)

Verifies all required ports are listening:

- 9090: MCP-Orchestrator
- 9091: Prometheus
- 3000: Grafana
- 3100: Loki
- 16686: Jaeger UI
- 5432: PostgreSQL
- 6379: Redis
- 8080: Keycloak

### Database Performance Test (Check 8)

- Executes sample query: `SELECT COUNT(*) FROM mcp_agents`
- Measures execution time in milliseconds
- **Thresholds**:
  - Excellent: <100ms
  - Acceptable: 100-500ms
  - Slow: >500ms

### Redis Performance Test (Check 9)

- Runs intrinsic latency test
- Measures Redis response time
- **Thresholds**:
  - Good: <1ms
  - Acceptable: 1-10ms
  - Slow: >10ms

### Agent Connectivity Test (Check 10)

- Queries active agents from database
- Checks agents with heartbeat within last 5 minutes
- Reports: Active agents / Total agents
- **Alerts**: Warns if no agents active but agents registered

## JSON Output Format

```json
{
  "timestamp": "2025-01-05T10:30:00Z",
  "checks": [
    {
      "name": "cpu_health",
      "status": "pass",
      "message": "CPU usage normal: 25.5%",
      "details": {
        "usage": 25.5,
        "cores": 6
      },
      "timestamp": "2025-01-05T10:30:01Z"
    },
    {
      "name": "memory_health",
      "status": "pass",
      "message": "Memory usage normal: 42.3%",
      "details": {
        "total": 12288,
        "used": 5200,
        "free": 7088,
        "usage_percent": 42.3
      },
      "timestamp": "2025-01-05T10:30:02Z"
    }
    // ... more checks
  ],
  "summary": {
    "passed": 18,
    "warnings": 1,
    "failed": 0,
    "total": 19
  }
}
```

## Orchestrator Integration Implementation

### 1. Add Diagnostic Tool to Orchestrator

Create `/opt/mcp/mcp-orchestrator/src/tools/diagnostics.ts`:

```typescript
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';

const execAsync = promisify(exec);

export class DiagnosticsTool implements Tool {
  name = 'run_production_diagnostics';
  description = 'Run comprehensive diagnostics on the production server';

  schema = {
    type: 'object',
    properties: {
      checks: {
        type: 'string',
        enum: ['all', 'system', 'database', 'services'],
        description: 'Which diagnostic checks to run',
        default: 'all',
      },
      save_results: {
        type: 'boolean',
        description: 'Save results to database',
        default: true,
      },
    },
  };

  async execute(args: any): Promise<any> {
    try {
      // Execute diagnostic script
      const { stdout, stderr } = await execAsync('/opt/mcp/diagnostic-runbook.sh');

      // Read JSON results
      const resultsJson = await readFile('/tmp/mcp_diagnostics_results.json', 'utf-8');
      const results = JSON.parse(resultsJson);

      // Optionally save to database
      if (args.save_results) {
        await this.saveDiagnosticsToDatabase(results);
      }

      // Send alerts if failures detected
      if (results.summary.failed > 0) {
        await this.sendAlerts(results);
      }

      return {
        success: true,
        summary: results.summary,
        results: results.checks,
        message: `Diagnostics complete: ${results.summary.passed} passed, ${results.summary.warnings} warnings, ${results.summary.failed} failed`,
        timestamp: results.timestamp,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Diagnostic execution failed',
      };
    }
  }

  private async saveDiagnosticsToDatabase(results: any): Promise<void> {
    // Save to diagnostic_results table
    const query = `
      INSERT INTO diagnostic_results (timestamp, checks, summary, raw_output)
      VALUES ($1, $2, $3, $4)
    `;

    await db.query(query, [
      results.timestamp,
      JSON.stringify(results.checks),
      JSON.stringify(results.summary),
      JSON.stringify(results),
    ]);
  }

  private async sendAlerts(results: any): Promise<void> {
    const failedChecks = results.checks.filter((c) => c.status === 'fail');

    for (const check of failedChecks) {
      // Send alert to monitoring system
      console.error(`ALERT: ${check.name} failed: ${check.message}`);

      // Could integrate with:
      // - Email notifications
      // - Slack/Discord webhooks
      // - PagerDuty
      // - Custom alerting system
    }
  }
}
```

### 2. Register Tool in Orchestrator

In `/opt/mcp/mcp-orchestrator/src/index.ts`:

```typescript
import { DiagnosticsTool } from './tools/diagnostics.js';

// Register diagnostic tool
server.addTool(new DiagnosticsTool());
```

### 3. Add Diagnostic Results Table

```sql
CREATE TABLE IF NOT EXISTS diagnostic_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  timestamp TIMESTAMPTZ NOT NULL,
  checks JSONB NOT NULL,
  summary JSONB NOT NULL,
  raw_output JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_diagnostic_results_timestamp ON diagnostic_results(timestamp DESC);
CREATE INDEX idx_diagnostic_results_summary ON diagnostic_results USING gin(summary);
```

## Monitoring & Alerts

### Grafana Dashboard

Create dashboard with panels for:

- Diagnostic success rate over time
- Failed checks history
- System health metrics
- Alert frequency

### Prometheus Metrics

Export diagnostic metrics:

```typescript
// In diagnostics.ts
import { Counter, Gauge } from 'prom-client';

const diagnosticRuns = new Counter({
  name: 'mcp_diagnostic_runs_total',
  help: 'Total diagnostic runs',
  labelNames: ['status'],
});

const lastDiagnosticScore = new Gauge({
  name: 'mcp_diagnostic_score',
  help: 'Last diagnostic score (% passed)',
});

// After running diagnostics
diagnosticRuns.inc({ status: 'success' });
const score = (results.summary.passed / results.summary.total) * 100;
lastDiagnosticScore.set(score);
```

### Alert Rules

Create `/opt/mcp/alerting-rules.yml`:

```yaml
groups:
  - name: mcp_diagnostics
    interval: 5m
    rules:
      - alert: DiagnosticFailures
        expr: mcp_diagnostic_score < 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: 'MCP diagnostic score below 80%'
          description: 'Diagnostic health score is {{ $value }}%'

      - alert: CriticalDiagnosticFailures
        expr: mcp_diagnostic_score < 50
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: 'MCP diagnostic score critically low'
          description: 'Diagnostic health score is {{ $value }}%'
```

## Development Environment

### Local Diagnostic Script

Create `release_dev/shared/scripts/diagnostic-runbook-dev.sh` for local testing:

```bash
#!/bin/bash
# Development version - runs against local Docker containers

export DB_HOST=localhost
export REDIS_HOST=localhost
export ORCHESTRATOR_HOST=localhost

/path/to/diagnostic-runbook.sh
```

### Docker Compose Testing

```yaml
# docker-compose.yml for testing
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: test
      POSTGRES_DB: mcp_ecosystem_test
    ports:
      - '5432:5432'

  redis:
    image: redis:7
    ports:
      - '6379:6379'

  mcp-orchestrator:
    build: ./mcp-orchestrator
    ports:
      - '9090:9090'
    depends_on:
      - postgres
      - redis
```

## Best Practices

### 1. Regular Execution

- Run diagnostics hourly during business hours
- Run full diagnostics daily at off-peak times
- Trigger on-demand for troubleshooting

### 2. Alert Management

- Configure alert thresholds appropriately
- Set up escalation for critical failures
- Use alert aggregation to prevent alert fatigue

### 3. Historical Tracking

- Retain diagnostic results for 90 days
- Archive older results to cold storage
- Analyze trends to identify degradation

### 4. Integration Testing

- Test diagnostic script in staging before production
- Validate all checks are relevant and accurate
- Update thresholds based on actual performance

### 5. Documentation

- Document all diagnostic checks
- Explain thresholds and reasoning
- Provide remediation steps for failures

## Troubleshooting

### Diagnostic Script Fails

1. Check permissions:

```bash
chmod +x /opt/mcp/diagnostic-runbook.sh
```

2. Verify dependencies:

```bash
which jq bc curl ss
```

3. Check logs:

```bash
tail -f /var/log/mcp/diagnostics.log
```

### JSON Output Malformed

- Ensure `jq` is installed
- Check for special characters in service responses
- Validate JSON with: `jq '.' /tmp/mcp_diagnostics_results.json`

### Orchestrator Can't Execute

1. Verify script location
2. Check file permissions
3. Ensure Orchestrator has sudo access (if required)
4. Test manual execution first

## Future Enhancements

- [ ] Add break testing capabilities
- [ ] Implement chaos engineering scenarios
- [ ] Add predictive analytics
- [ ] Integrate with incident management
- [ ] Add auto-remediation for common issues
- [ ] Implement A/B testing for configuration changes
- [ ] Add capacity planning metrics
- [ ] Create runbook automation for common failures

## References

- [System Architecture](PHASE-0-1-COMPLETE.md)
- [Deployment Guide](MCP_DEPLOYMENT_SUMMARY.md)
- [Testing Documentation](TESTING.md)
- [Monitoring Setup](monitoring-setup.md)
