# MCP Ecosystem - Production Implementation Plan

## Comprehensive Database Schema & Deployment Strategy

**Version:** 0.2.0
**Created:** 2025-11-07
**Status:** Ready for Execution
**Estimated Duration:** 18-20 hours with parallel deployment

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Database Schema Integration](#database-schema-integration)
4. [Deployment Phases](#deployment-phases)
5. [MCP Server Implementation](#mcp-server-implementation)
6. [Inter-MCP Communication](#inter-mcp-communication)
7. [Production Readiness Checklist](#production-readiness-checklist)

---

## 🎯 Executive Summary

This plan integrates the existing MCP ecosystem database (agent management, command orchestration) with an enhanced structured thought framework, creating a comprehensive production-ready system across 3 VMs.

### Key Objectives

1. **Enhance Existing Schema** - Add metacognitive framework to current database
2. **Deploy MCP Services** - Orchestrator, Perplexity, IT-MCP across infrastructure
3. **Establish Security** - WireGuard VPN, Keycloak SSO, 8/10 security hardening
4. **Enable Monitoring** - Comprehensive observability and alerting
5. **Production Launch** - Full integration testing and validation

### Current State

✅ **Completed:**

- PostgreSQL 16 deployed on VMI01 with base schema
- Database: `mcp_ecosystem` (16 tables, 97 indexes, 5 triggers)
- SSH keys generated for all 3 VMs
- Deployment structure created
- Phase 1-3 agent prompts ready

⏳ **Pending:**

- Enhanced structured thought schema integration
- Phase 4-6 agent prompts (WireGuard, Keycloak, monitoring)
- MCP service deployment
- Production testing and validation

---

## 🏗️ Architecture Overview

### Infrastructure Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                     Internet / Client Access                     │
└───────────────────┬──────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────┐
        │   VMI03 - Security GW     │
        │   154.26.158.31           │
        │                           │
        │  • WireGuard (3 tunnels)  │
        │    - Root (admin)         │
        │    - MCP (services)       │
        │    - Red (restricted)     │
        │  • Keycloak SSO           │
        │  • pfSense + Pi-Hole      │
        │  • Suricata IDS/IPS       │
        └───────────┬───────────────┘
                    │
                    ▼ (VPN/Secure Network)
        ┌───────────────────────────┐       ┌──────────────────────┐
        │  VMI01 - Dev/Database     │──────▶│  VMI02D - Storage    │
        │  46.250.243.123           │       │  46.250.241.70       │
        │                           │       │                      │
        │  • PostgreSQL 16          │       │  • NextCloud (off)   │
        │  • Redis 7                │       │  • Plex (off)        │
        │  • MCP-Orchestrator       │       │  • 968GB Storage     │
        │  • Perplexity-MCP         │       │  • WORM Backups      │
        │  • IT-MCP Server          │       │  • SMART Monitoring  │
        └───────────────────────────┘       └──────────────────────┘
```

### MCP Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Orchestrator (VMI01)                      │
│  - Command routing and priority queue management                │
│  - Agent health monitoring and load balancing                   │
│  - Policy enforcement and approval workflows                    │
│  - Distributed thought coordination                             │
└──────────┬───────────────────────────┬──────────────────────────┘
           │                           │
           ▼                           ▼
┌─────────────────────┐    ┌──────────────────────────┐
│  Perplexity-MCP     │    │      IT-MCP Server       │
│  Business Intel     │    │   System Diagnostics     │
│                     │    │                          │
│  • Web research     │    │  • Local shell           │
│  • Market analysis  │    │  • SSH operations        │
│  • Trend tracking   │    │  • Process mgmt          │
│  • Cost budgets     │    │  • System metrics        │
└─────────────────────┘    └──────────────────────────┘
           │                           │
           └───────────┬───────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  PostgreSQL Database  │
            │   mcp_ecosystem       │
            │                       │
            │  • Agent registry     │
            │  • Command queue      │
            │  • Structured thoughts│
            │  • Audit trail        │
            └──────────────────────┘
```

---

## 🗄️ Database Schema Integration

### Current Schema Analysis

**Existing Tables (Already Deployed):**

1. `mcp_agents` - Agent registry
2. `agent_heartbeats` - Partitioned heartbeat data
3. `mesh_topology` - Service mesh relationships
4. `command_queue` - Command dispatch queue
5. `command_execution_log` - Immutable audit trail
6. `thought_sessions` - Basic session tracking
7. `structured_thoughts` - 5-stage thoughts
8. `markdown_resources` - Documentation
9. `policies` - Policy engine
10. `approval_requests` - Approval workflow
11. `system_metrics` - Partitioned metrics
12. `alert_rules` - Alert definitions
13. `alerts` - Active alerts
14. `backup_registry` - Backup tracking
15. `maintenance_tasks` - Scheduled tasks
16. `audit_log` - Partitioned audit

### Schema Enhancement Strategy

**Phase A: Enhanced Structured Thinking (New Schema)**

Add comprehensive metacognitive framework alongside existing schema:

```sql
-- Enhanced enums
CREATE TYPE cognitive_stage_v2 AS ENUM (
  'problem_definition', 'research', 'analysis',
  'synthesis', 'conclusion', 'reflection',
  'implementation', 'validation'
);

CREATE TYPE branch_health AS ENUM (
  'forming', 'healthy', 'stagnant', 'at_risk', 'unknown'
);

CREATE TYPE feedback_signal_type AS ENUM (
  'stage_dwell', 'quality_drop', 'repetition',
  'branch_health', 'context_shift', 'convergence'
);

-- New tables (complement existing)
CREATE TABLE thought_branches (
  branch_id VARCHAR(100) PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id),
  root_thought_id UUID,
  parent_branch_id VARCHAR(100),
  branch_type VARCHAR(50) DEFAULT 'exploration',

  -- Metrics
  thought_count INTEGER DEFAULT 0,
  max_depth INTEGER DEFAULT 0,
  average_quality NUMERIC(3,2),
  health branch_health DEFAULT 'forming',

  -- Activity
  created_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  staleness_minutes INTEGER
);

CREATE TABLE feedback_signals (
  signal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id),
  thought_id UUID REFERENCES structured_thoughts(id),

  signal_type feedback_signal_type NOT NULL,
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,

  metrics JSONB DEFAULT '{}',
  suggested_next_stages TEXT[],

  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by VARCHAR(255),

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE thought_relationships (
  relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_thought_id UUID NOT NULL REFERENCES structured_thoughts(id),
  target_thought_id UUID NOT NULL REFERENCES structured_thoughts(id),

  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN (
    'extends', 'contradicts', 'supports', 'branches_from',
    'revises', 'references', 'merges_with'
  )),

  strength NUMERIC(3,2) CHECK (strength BETWEEN 0 AND 1),
  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  created_by VARCHAR(255),

  CONSTRAINT no_self_reference CHECK (source_thought_id != target_thought_id),
  CONSTRAINT unique_relationship UNIQUE (source_thought_id, target_thought_id, relationship_type)
);

CREATE TABLE thought_sync_queue (
  sync_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id VARCHAR(255) NOT NULL,

  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  operation VARCHAR(20) NOT NULL,

  payload JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',

  attempt_count INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  synced_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);
```

**Phase B: Enhanced Existing Tables**

Add columns to existing `structured_thoughts` table:

```sql
ALTER TABLE structured_thoughts
ADD COLUMN IF NOT EXISTS content_tsvector TSVECTOR,
ADD COLUMN IF NOT EXISTS branch_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS branch_root_id UUID REFERENCES structured_thoughts(id),
ADD COLUMN IF NOT EXISTS branch_depth INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_revision BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS revises_thought_id UUID REFERENCES structured_thoughts(id),
ADD COLUMN IF NOT EXISTS next_stages TEXT[];

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_thoughts_fts
ON structured_thoughts USING GIN(content_tsvector);

-- Branch indexes
CREATE INDEX IF NOT EXISTS idx_thoughts_branch
ON structured_thoughts(branch_id) WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_thoughts_revision
ON structured_thoughts(revises_thought_id) WHERE is_revision = TRUE;
```

**Phase C: Enhanced Functions**

```sql
-- Search thoughts with full-text
CREATE OR REPLACE FUNCTION search_thoughts(
  search_query TEXT,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  thought_id UUID,
  session_id UUID,
  content TEXT,
  stage VARCHAR(50),
  quality_score NUMERIC,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.id::UUID as thought_id,
    st.session_id,
    st.thought as content,
    st.stage,
    st.quality_score,
    ts_rank(st.content_tsvector, plainto_tsquery('english', search_query)) AS rank
  FROM structured_thoughts st
  WHERE st.content_tsvector @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Get thought branch
CREATE OR REPLACE FUNCTION get_thought_branch(
  input_branch_id VARCHAR(100)
)
RETURNS TABLE (
  thought_id UUID,
  content TEXT,
  stage VARCHAR(50),
  ordering INTEGER,
  branch_depth INTEGER,
  quality_score NUMERIC,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.id::UUID as thought_id,
    st.thought as content,
    st.stage,
    st.ordering,
    st.branch_depth,
    st.quality_score,
    st.timestamp::TIMESTAMPTZ as created_at
  FROM structured_thoughts st
  WHERE st.branch_id = input_branch_id
  ORDER BY st.ordering;
END;
$$ LANGUAGE plpgsql;

-- Update branch analytics trigger
CREATE OR REPLACE FUNCTION update_branch_analytics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    INSERT INTO thought_branches (
      branch_id, session_id, thought_count,
      max_depth, last_activity_at
    )
    VALUES (
      NEW.branch_id, NEW.session_id, 1,
      NEW.branch_depth, NEW.timestamp::TIMESTAMPTZ
    )
    ON CONFLICT (branch_id) DO UPDATE SET
      thought_count = (
        SELECT COUNT(*) FROM structured_thoughts
        WHERE branch_id = NEW.branch_id
      ),
      max_depth = (
        SELECT MAX(branch_depth) FROM structured_thoughts
        WHERE branch_id = NEW.branch_id
      ),
      last_activity_at = NEW.timestamp::TIMESTAMPTZ;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_thoughts_update_branch
  AFTER INSERT OR UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_branch_analytics();
```

### Migration Script

**File:** `/Users/alex/Projects/MCP Bundle/deployment/schema/migrate_to_v2.sql`

```sql
-- Migration from v0.1 to v0.2
-- Adds enhanced structured thinking capabilities

BEGIN;

-- Step 1: Create new enums
CREATE TYPE branch_health AS ENUM ('forming', 'healthy', 'stagnant', 'at_risk', 'unknown');
CREATE TYPE feedback_signal_type AS ENUM ('stage_dwell', 'quality_drop', 'repetition', 'branch_health', 'context_shift', 'convergence');

-- Step 2: Create new tables
\i /opt/mcp/schema/enhanced-thoughts.sql

-- Step 3: Alter existing tables
ALTER TABLE structured_thoughts
ADD COLUMN content_tsvector TSVECTOR,
ADD COLUMN branch_id VARCHAR(100),
ADD COLUMN branch_root_id UUID,
ADD COLUMN branch_depth INTEGER DEFAULT 0,
ADD COLUMN is_revision BOOLEAN DEFAULT FALSE,
ADD COLUMN revises_thought_id UUID,
ADD COLUMN next_stages TEXT[];

-- Step 4: Create indexes
CREATE INDEX idx_thoughts_fts ON structured_thoughts USING GIN(content_tsvector);
CREATE INDEX idx_thoughts_branch ON structured_thoughts(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_thoughts_revision ON structured_thoughts(revises_thought_id) WHERE is_revision = TRUE;

-- Step 5: Create triggers and functions
\i /opt/mcp/schema/enhanced-functions.sql

-- Step 6: Populate tsvector for existing thoughts
UPDATE structured_thoughts
SET content_tsvector = to_tsvector('english', thought)
WHERE content_tsvector IS NULL;

COMMIT;

-- Validation queries
SELECT 'New tables created' as status, COUNT(*) as count
FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'thought_%';

SELECT 'New columns added' as status, COUNT(*) as count
FROM information_schema.columns
WHERE table_name = 'structured_thoughts'
AND column_name IN ('branch_id', 'content_tsvector', 'next_stages');

SELECT 'New indexes created' as status, COUNT(*) as count
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'structured_thoughts'
AND indexname LIKE 'idx_thoughts_%';
```

---

## 📦 Deployment Phases

### Phase 1: Database Enhancement (2-3 hours)

**Agent:** database-enhancement-agent (distributed-thought-architect)

```bash
# On VMI01 as dev-admin
cd /opt/mcp/schema

# 1. Backup current database
pg_dump -U mcp_admin -d mcp_ecosystem -Fc \
  -f /var/backups/postgresql/mcp_ecosystem_pre_v2_$(date +%Y%m%d).backup

# 2. Apply migration
psql -U mcp_admin -d mcp_ecosystem -f migrate_to_v2.sql

# 3. Verify migration
psql -U mcp_admin -d mcp_ecosystem -c "
  SELECT 'Tables' as type, COUNT(*) as count FROM pg_tables WHERE schemaname='public'
  UNION ALL
  SELECT 'Indexes', COUNT(*) FROM pg_indexes WHERE schemaname='public'
  UNION ALL
  SELECT 'Triggers', COUNT(*) FROM pg_trigger WHERE tgisinternal = false;
"

# 4. Test new functions
psql -U mcp_admin -d mcp_ecosystem -c "
  SELECT * FROM search_thoughts('database performance', 10);
"
```

**Validation Criteria:**

- ✅ All new tables created (4 new tables)
- ✅ All columns added to structured_thoughts
- ✅ All indexes created successfully
- ✅ All triggers firing correctly
- ✅ Full-text search working
- ✅ No data loss (verify thought count)

### Phase 2: MCP Service Deployment (3-4 hours)

**Run in parallel: agents 11-13 from agent prompts**

#### Agent 11: MCP-Orchestrator

```bash
# On VMI01
sudo mkdir -p /opt/mcp-orchestrator
sudo useradd -r -s /bin/false mcp-orchestrator
sudo chown -R mcp-orchestrator:mcp-orchestrator /opt/mcp-orchestrator

# Copy code from development
rsync -av /Users/alex/Projects/MCP\ Bundle/release_dev/mcp-orchestrator/ \
  dev-admin@46.250.243.123:/opt/mcp-orchestrator/

# On VMI01
cd /opt/mcp-orchestrator
npm install --production
npm run build

# Create .env
cat > /opt/mcp-orchestrator/.env <<EOF
POSTGRES_CONNECTION_STRING=postgresql://mcp_admin:@localhost:5432/mcp_ecosystem
REDIS_URL=redis://:<redis-password>@localhost:6379
SERVER_MCP_ID=vmi01.acdev.host
SERVER_MCP_PORT=9090
LOG_LEVEL=info
NODE_ENV=production
EOF

# Create systemd service
sudo systemctl enable /opt/mcp-orchestrator/systemd/mcp-orchestrator.service
# Don't start yet - wait for Keycloak in Phase 4
```

#### Agent 12: Perplexity-MCP

```bash
# Similar deployment pattern
sudo mkdir -p /opt/perplexity-mcp
sudo useradd -r -s /bin/false perplexity-mcp

# Deploy and configure
# Key: Get Perplexity API key from user
```

#### Agent 13: IT-MCP

```bash
# Similar deployment pattern
sudo mkdir -p /opt/it-mcp
sudo useradd -r -s /bin/false it-mcp

# Deploy and configure
```

**Validation Criteria:**

- ✅ All services deployed to /opt/
- ✅ Dependencies installed
- ✅ Environment files configured
- ✅ Systemd services created
- ✅ Database connectivity verified
- ✅ Services registered in mcp_agents table

### Phase 3: Security Infrastructure (4-5 hours)

**Run in sequence: agents 14-18**

This is the most critical phase. Covered in existing agent prompts:

- Agent 14: WireGuard Root Tunnel (port 51820)
- Agent 15: WireGuard MCP Tunnel (port 51821)
- Agent 16: WireGuard Red Tunnel (port 51822)
- Agent 17: Keycloak SSO Deployment
- Agent 18: pfSense + Pi-Hole Integration

After this phase, update all MCP service configs with Keycloak credentials.

### Phase 4: Start MCP Services (30 minutes)

```bash
# On VMI01
sudo systemctl start mcp-orchestrator
sudo systemctl start perplexity-mcp
sudo systemctl start it-mcp

# Verify all started
sudo systemctl status mcp-orchestrator perplexity-mcp it-mcp

# Check logs
sudo journalctl -u mcp-orchestrator -f
```

### Phase 5: Monitoring & Alerting (2-3 hours)

**Run in parallel: agents 19-24**

- Agent 19: Prometheus + Grafana
- Agent 20: Monitoring agents (2 per VM)
- Agent 21: Network security monitoring
- Agent 22: Snapshot/backup automation
- Agent 23: CVE scanning + NIST compliance
- Agent 24: Access control enforcement

### Phase 6: Integration Testing (2 hours)

**Run in sequence: agents 25-27**

- Agent 25: Integration testing
- Agent 26: Security validation
- Agent 27: Documentation generation

---

## 🔧 MCP Server Implementation

### MCP-Orchestrator Tools

**Core Capabilities:**

```typescript
// src/tools/registerTools.ts
export const orchestratorTools = [
  {
    name: 'command-dispatch',
    description: 'Dispatch commands to target agents',
    schema: z.object({
      tool_name: z.string(),
      parameters: z.record(z.any()),
      target_agent: z.string().optional(),
      capabilities: z.array(z.string()),
      priority: z.number().min(1).max(10).default(5),
    }),
  },
  {
    name: 'agent-status',
    description: 'Query agent health and availability',
    schema: z.object({
      agent_id: z.string().optional(),
      capabilities: z.array(z.string()).optional(),
    }),
  },
  {
    name: 'thought-capture',
    description: 'Capture structured thoughts with metacognition',
    schema: z.object({
      session_id: z.string().optional(),
      stage: z.enum([
        'problem_definition',
        'research',
        'analysis',
        'synthesis',
        'conclusion',
        'reflection',
      ]),
      thought: z.string(),
      metadata: z
        .object({
          importance: z.enum(['low', 'medium', 'high']).optional(),
          tags: z.array(z.string()).optional(),
          quality_score: z.number().min(0).max(1).optional(),
          branch_id: z.string().optional(),
        })
        .optional(),
    }),
  },
  {
    name: 'thought-retrieve',
    description: 'Retrieve and search structured thoughts',
    schema: z.object({
      session_id: z.string().optional(),
      stage: z.string().optional(),
      branch_id: z.string().optional(),
      search_query: z.string().optional(),
      limit: z.number().default(50),
    }),
  },
];
```

### Perplexity-MCP Tools

**Research Capabilities:**

```typescript
export const perplexityTools = [
  {
    name: 'web-research',
    description: 'Conduct web research via Perplexity API',
    schema: z.object({
      query: z.string(),
      mode: z.enum(['quick', 'detailed', 'pro']).default('detailed'),
      budget_approval: z.boolean().default(false),
    }),
  },
  {
    name: 'market-analysis',
    description: 'Analyze market trends and competitors',
    schema: z.object({
      topic: z.string(),
      timeframe: z.string().optional(),
      depth: z.enum(['overview', 'detailed', 'comprehensive']),
    }),
  },
];
```

### IT-MCP Tools

**Diagnostic Capabilities:**

```typescript
export const itMcpTools = [
  {
    name: 'system-diagnostics',
    description: 'Run comprehensive system diagnostics',
    schema: z.object({
      target: z.string().optional(),
      checks: z
        .array(z.enum(['cpu', 'memory', 'disk', 'network', 'processes', 'services']))
        .optional(),
    }),
  },
  {
    name: 'database-diagnostics',
    description: 'PostgreSQL/Redis health checks',
    schema: z.object({
      service: z.enum(['postgres', 'redis', 'all']),
      include_slow_queries: z.boolean().default(true),
    }),
  },
];
```

---

## 🔗 Inter-MCP Communication

### Architecture Pattern

```typescript
// Orchestrator acts as central hub
class MCPOrchestrator {
  private agentRegistry: Map<string, AgentInfo>;
  private commandQueue: CommandQueue;
  private thoughtCoordinator: ThoughtCoordinator;

  async dispatchCommand(command: Command): Promise<CommandResult> {
    // 1. Find best agent for capabilities
    const agent = await this.findBestAgent(command.capabilities);

    // 2. Queue command with priority
    const jobId = await this.commandQueue.enqueue({
      toolName: command.toolName,
      parameters: command.parameters,
      targetAgent: agent.id,
      priority: command.priority,
    });

    // 3. Wait for execution
    return await this.commandQueue.waitForResult(jobId);
  }

  async coordinateThought(thought: ThoughtEntry): Promise<ThoughtResult> {
    // 1. Capture in database
    const thoughtId = await this.thoughtCoordinator.capture(thought);

    // 2. Generate feedback signals
    const signals = await this.thoughtCoordinator.analyzeFeedback(thoughtId);

    // 3. Coordinate across agents if branching needed
    if (thought.metadata?.branch_id) {
      await this.thoughtCoordinator.syncBranch(thought.metadata.branch_id);
    }

    return { thoughtId, signals };
  }
}
```

### Communication Protocol

**1. Command Dispatch (Orchestrator → Worker)**

```
Orchestrator                       Worker MCP
    │                                  │
    ├──1. INSERT command_queue────────▶│
    │   (status='pending')              │
    │                                   │
    ├──2. Notify via Redis pub/sub────▶│
    │                                   │
    │                  3. Pick command  │
    │   UPDATE status='executing'◀──────┤
    │                                   │
    │              4. Execute tool      │
    │                                   │
    │   UPDATE status='completed'◀──────┤
    │   + result JSONB                  │
    │                                   │
    ├──5. Return result────────────────▶│
```

**2. Thought Synchronization**

```
IT-MCP (Local SQLite)         Orchestrator (PostgreSQL)
    │                                  │
    ├──1. Capture thought locally─────▶│
    │   (SQLite cache)                  │
    │                                   │
    ├──2. Queue for sync──────────────▶│
    │   INSERT thought_sync_queue       │
    │                                   │
    │              3. Process sync      │
    │   INSERT structured_thoughts◀─────┤
    │                                   │
    │   UPDATE sync_status='synced'◀────┤
    │                                   │
    ├──4. Acknowledge sync─────────────▶│
```

**3. Agent Health Monitoring**

```
All Agents                    Orchestrator
    │                              │
    ├──Every 30s: Heartbeat───────▶│
    │   INSERT agent_heartbeats     │
    │                               │
    │   Trigger updates last_seen◀──┤
    │   UPDATE mcp_agents.status    │
    │                               │
    ├──If no heartbeat >5min────────│
    │   UPDATE status='offline'     │
    │   INSERT alert                │
```

### Redis Pub/Sub Channels

```typescript
// Channel definitions
const CHANNELS = {
  COMMAND_DISPATCH: 'mcp:commands:dispatch',
  AGENT_HEARTBEAT: 'mcp:agents:heartbeat',
  THOUGHT_SYNC: 'mcp:thoughts:sync',
  ALERT_CRITICAL: 'mcp:alerts:critical',
};

// Publisher (Orchestrator)
redis.publish(
  'mcp:commands:dispatch',
  JSON.stringify({
    jobId: 'cmd-12345',
    toolName: 'system-diagnostics',
    targetAgent: 'it-mcp-vmi01',
  })
);

// Subscriber (Worker)
redis.subscribe('mcp:commands:dispatch', (message) => {
  const command = JSON.parse(message);
  if (command.targetAgent === this.agentId) {
    this.executeCommand(command);
  }
});
```

---

## ✅ Production Readiness Checklist

### Database Layer

- [ ] Schema v0.2 migration completed
- [ ] All new tables created (4 new)
- [ ] All indexes created (check count matches expected)
- [ ] All triggers firing correctly
- [ ] Full-text search functional
- [ ] Backup tested and verified
- [ ] Remote access configured for VMI02D, VMI03
- [ ] Performance tuning applied
- [ ] Query monitoring enabled (pg_stat_statements)

### MCP Services

- [ ] MCP-Orchestrator deployed and running
- [ ] Perplexity-MCP deployed with API key
- [ ] IT-MCP deployed and registered
- [ ] All services auto-start on boot
- [ ] Health endpoints responding
- [ ] Database connectivity verified
- [ ] Redis connectivity verified
- [ ] Logging configured and working

### Security

- [ ] WireGuard tunnels operational (3 tunnels)
- [ ] Keycloak SSO configured
- [ ] All services authenticated via Keycloak
- [ ] Firewall rules tested
- [ ] SSH key auth only (no passwords)
- [ ] Fail2ban active on all VMs
- [ ] Pentanet blocking verified
- [ ] IDS/IPS operational (Suricata)
- [ ] Security audit score ≥ 8/10

### Monitoring

- [ ] Prometheus + Grafana deployed
- [ ] Node exporters on all VMs
- [ ] Alert rules configured
- [ ] Email notifications working
- [ ] Backup automation tested
- [ ] Log aggregation functional
- [ ] SMART monitoring (VMI02D)
- [ ] CVE scanning operational

### Integration Testing

- [ ] Command dispatch working end-to-end
- [ ] Thought capture and sync working
- [ ] Inter-MCP communication verified
- [ ] Load balancing functional
- [ ] Failover tested
- [ ] Performance baseline established
- [ ] All agent prompts validated

### Documentation

- [ ] Architecture diagrams complete
- [ ] Runbooks written
- [ ] Recovery procedures documented
- [ ] Admin credentials secured
- [ ] Deployment log maintained
- [ ] Known issues documented

---

## 📊 Success Metrics

### Performance

- Command dispatch latency: < 100ms (p95)
- Thought capture latency: < 50ms (p95)
- Database query time: < 10ms (p95)
- Agent health check: < 30s response

### Reliability

- System uptime: > 99.9%
- Database availability: > 99.95%
- Command success rate: > 99%
- Backup success rate: 100%

### Security

- Failed login attempts: 0 (after lockout)
- CVE critical vulnerabilities: 0
- Security audit score: ≥ 8/10
- Unauthorized access attempts: 0

---

## 🚨 Rollback Plan

If critical issues arise during deployment:

**Database Rollback:**

```bash
# Stop all MCP services
sudo systemctl stop mcp-orchestrator perplexity-mcp it-mcp

# Restore backup
pg_restore -U mcp_admin -d mcp_ecosystem -c \
  /var/backups/postgresql/mcp_ecosystem_pre_v2_20251107.backup

# Restart PostgreSQL
sudo systemctl restart postgresql
```

**Service Rollback:**

```bash
# Disable services
sudo systemctl disable mcp-orchestrator perplexity-mcp it-mcp

# Remove deployment
sudo rm -rf /opt/mcp-orchestrator /opt/perplexity-mcp /opt/it-mcp

# Restore from backup if needed
```

---

## 📝 Next Steps

1. **Execute Phase 1:** Database enhancement migration
2. **Execute Phase 2:** Deploy MCP services
3. **Execute Phase 3:** Security infrastructure (WireGuard + Keycloak)
4. **Execute Phase 4:** Start and verify all services
5. **Execute Phase 5:** Deploy monitoring and alerting
6. **Execute Phase 6:** Integration testing and validation
7. **Production Launch:** Enable production traffic

---

**Document Status:** Ready for execution
**Approval Required:** Database migration, API keys, production credentials
**Estimated Completion:** 18-20 hours with parallel deployment
**Risk Level:** Medium (comprehensive backup and rollback plans in place)
