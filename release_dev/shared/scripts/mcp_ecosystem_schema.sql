-- =====================================================
-- MCP ECOSYSTEM - COMPLETE POSTGRESQL SCHEMA
-- =====================================================
-- Version: 1.0
-- Date: 2025-11-05
-- Description: Complete distributed MCP agent ecosystem database schema
--              Supports command orchestration, agent registry, structured thinking,
--              monitoring, approval workflows, and service mesh topology

-- =====================================================
-- EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================================================
-- TABLE: mcp_agents
-- =====================================================
-- Central registry of all MCP agents in the ecosystem

CREATE TABLE IF NOT EXISTS mcp_agents (
    agent_id TEXT PRIMARY KEY,
    agent_name TEXT NOT NULL,
    agent_type TEXT NOT NULL, -- 'desktop', 'server', 'orchestrator'
    capabilities TEXT[] NOT NULL DEFAULT '{}',
    hostname TEXT,
    ip_address INET,
    platform TEXT, -- 'linux', 'macos', 'windows', 'ubuntu-server'
    version TEXT,
    status TEXT NOT NULL DEFAULT 'offline', -- 'online', 'offline', 'degraded', 'maintenance'
    last_seen TIMESTAMPTZ,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    health_score NUMERIC(3,2) DEFAULT 1.0 CHECK (health_score >= 0 AND health_score <= 1),
    max_concurrent_commands INTEGER DEFAULT 10,
    current_load INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_mcp_agents_status ON mcp_agents(status);
CREATE INDEX idx_mcp_agents_last_seen ON mcp_agents(last_seen);
CREATE INDEX idx_mcp_agents_capabilities ON mcp_agents USING GIN(capabilities);
CREATE INDEX idx_mcp_agents_tags ON mcp_agents USING GIN(tags);
CREATE INDEX idx_mcp_agents_type ON mcp_agents(agent_type);

-- =====================================================
-- TABLE: agent_heartbeats (Partitioned by timestamp)
-- =====================================================
-- Time-series heartbeat data from agents

CREATE TABLE IF NOT EXISTS agent_heartbeats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cpu_percent NUMERIC(5,2),
    memory_percent NUMERIC(5,2),
    disk_percent NUMERIC(5,2),
    active_connections INTEGER,
    metrics JSONB DEFAULT '{}'
) PARTITION BY RANGE (timestamp);

-- Create partitions for current and next month
CREATE TABLE IF NOT EXISTS agent_heartbeats_2025_11 PARTITION OF agent_heartbeats
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE IF NOT EXISTS agent_heartbeats_2025_12 PARTITION OF agent_heartbeats
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE INDEX idx_heartbeats_agent_timestamp ON agent_heartbeats(agent_id, timestamp DESC);

-- =====================================================
-- TABLE: command_queue
-- =====================================================
-- Distributed command queue for agent orchestration

CREATE TABLE IF NOT EXISTS command_queue (
    command_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tool_name TEXT NOT NULL,
    operation TEXT NOT NULL,
    parameters JSONB DEFAULT '{}',
    target_agent_id TEXT REFERENCES mcp_agents(agent_id) ON DELETE SET NULL,
    priority INTEGER DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'assigned', 'running', 'completed', 'failed', 'cancelled', 'requires_approval'
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    timeout_ms INTEGER DEFAULT 300000,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    result JSONB,
    error_message TEXT,
    approval_required BOOLEAN DEFAULT FALSE,
    approval_status TEXT, -- 'pending', 'approved', 'rejected'
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    tags TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_command_queue_status ON command_queue(status);
CREATE INDEX idx_command_queue_target_agent ON command_queue(target_agent_id);
CREATE INDEX idx_command_queue_priority ON command_queue(priority DESC);
CREATE INDEX idx_command_queue_created_at ON command_queue(created_at DESC);
CREATE INDEX idx_command_queue_pending ON command_queue(status) WHERE status = 'pending';

-- =====================================================
-- TABLE: command_execution_log
-- =====================================================
-- Immutable audit trail of all command executions

CREATE TABLE IF NOT EXISTS command_execution_log (
    log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    command_id UUID NOT NULL REFERENCES command_queue(command_id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- 'assigned', 'started', 'progress', 'completed', 'failed', 'cancelled'
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message TEXT,
    details JSONB DEFAULT '{}',
    duration_ms INTEGER
);

CREATE INDEX idx_command_log_command_id ON command_execution_log(command_id);
CREATE INDEX idx_command_log_timestamp ON command_execution_log(timestamp DESC);
CREATE INDEX idx_command_log_event_type ON command_execution_log(event_type);

-- =====================================================
-- TABLE: thought_sessions
-- =====================================================
-- Structured thinking session management

CREATE TABLE IF NOT EXISTS thought_sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    task_description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'completed', 'abandoned'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    total_thoughts INTEGER DEFAULT 0,
    current_stage TEXT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_thought_sessions_agent ON thought_sessions(agent_id);
CREATE INDEX idx_thought_sessions_status ON thought_sessions(status);
CREATE INDEX idx_thought_sessions_created ON thought_sessions(created_at DESC);

-- =====================================================
-- TABLE: structured_thoughts
-- =====================================================
-- 5-stage cognitive framework for structured reasoning

CREATE TABLE IF NOT EXISTS structured_thoughts (
    id TEXT PRIMARY KEY,
    session_id UUID REFERENCES thought_sessions(session_id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    stage TEXT NOT NULL, -- 'understanding', 'breakdown', 'exploration', 'synthesis', 'reflection'
    thought TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ordering INTEGER NOT NULL,
    quality_score NUMERIC(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
    importance INTEGER DEFAULT 5 CHECK (importance >= 1 AND importance <= 10),
    branch TEXT DEFAULT 'main',
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    server_id TEXT,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_structured_thoughts_session ON structured_thoughts(session_id);
CREATE INDEX idx_structured_thoughts_agent ON structured_thoughts(agent_id);
CREATE INDEX idx_structured_thoughts_stage ON structured_thoughts(stage);
CREATE INDEX idx_structured_thoughts_timestamp ON structured_thoughts(timestamp DESC);
CREATE INDEX idx_structured_thoughts_branch ON structured_thoughts(branch);
CREATE INDEX idx_structured_thoughts_synced ON structured_thoughts(synced_at);
CREATE INDEX idx_structured_thoughts_search ON structured_thoughts USING GIN(to_tsvector('english', thought));

-- =====================================================
-- TABLE: markdown_resources
-- =====================================================
-- Knowledge base for agents (documentation, procedures, references)

CREATE TABLE IF NOT EXISTS markdown_resources (
    resource_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT, -- 'documentation', 'procedure', 'reference', 'troubleshooting'
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,
    version INTEGER DEFAULT 1,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_markdown_resources_category ON markdown_resources(category);
CREATE INDEX idx_markdown_resources_tags ON markdown_resources USING GIN(tags);
CREATE INDEX idx_markdown_resources_search ON markdown_resources USING GIN(to_tsvector('english', title || ' ' || content));

-- =====================================================
-- TABLE: policies
-- =====================================================
-- Policy definitions for command execution and approvals

CREATE TABLE IF NOT EXISTS policies (
    policy_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_name TEXT NOT NULL UNIQUE,
    policy_type TEXT NOT NULL, -- 'command_approval', 'rate_limit', 'access_control', 'maintenance_window'
    conditions JSONB NOT NULL, -- Flexible JSON conditions
    actions JSONB NOT NULL, -- Actions to take when policy matches
    priority INTEGER DEFAULT 100,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_policies_type ON policies(policy_type);
CREATE INDEX idx_policies_enabled ON policies(enabled);
CREATE INDEX idx_policies_priority ON policies(priority);

-- =====================================================
-- TABLE: audit_log (Partitioned, immutable)
-- =====================================================
-- Immutable audit trail for all system operations

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor TEXT NOT NULL, -- User or agent that performed action
    action TEXT NOT NULL, -- 'create', 'update', 'delete', 'execute', 'approve', 'reject'
    resource_type TEXT NOT NULL, -- 'agent', 'command', 'policy', 'session', etc.
    resource_id TEXT NOT NULL,
    changes JSONB, -- Before/after state
    ip_address INET,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}'
) PARTITION BY RANGE (timestamp);

-- Create partitions for current and next month
CREATE TABLE IF NOT EXISTS audit_log_2025_11 PARTITION OF audit_log
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE IF NOT EXISTS audit_log_2025_12 PARTITION OF audit_log
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX idx_audit_log_actor ON audit_log(actor);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- =====================================================
-- TABLE: approval_requests
-- =====================================================
-- Approval workflow for sensitive operations

CREATE TABLE IF NOT EXISTS approval_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    command_id UUID REFERENCES command_queue(command_id) ON DELETE CASCADE,
    requestor TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'expired'
    approver TEXT,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    expires_at TIMESTAMPTZ,
    notification_sent BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_approval_requests_status ON approval_requests(status);
CREATE INDEX idx_approval_requests_command ON approval_requests(command_id);
CREATE INDEX idx_approval_requests_requestor ON approval_requests(requestor);

-- =====================================================
-- TABLE: mesh_topology
-- =====================================================
-- Service mesh topology and agent relationships

CREATE TABLE IF NOT EXISTS mesh_topology (
    edge_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_agent_id TEXT NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    target_agent_id TEXT NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL, -- 'parent', 'peer', 'coordinator', 'worker'
    latency_ms INTEGER,
    bandwidth_mbps NUMERIC(10,2),
    last_verified TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(source_agent_id, target_agent_id, relationship_type)
);

CREATE INDEX idx_mesh_topology_source ON mesh_topology(source_agent_id);
CREATE INDEX idx_mesh_topology_target ON mesh_topology(target_agent_id);
CREATE INDEX idx_mesh_topology_relationship ON mesh_topology(relationship_type);

-- =====================================================
-- TABLE: system_metrics (Partitioned time-series)
-- =====================================================
-- System-wide metrics and performance data

CREATE TABLE IF NOT EXISTS system_metrics (
    metric_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metric_name TEXT NOT NULL,
    metric_value NUMERIC NOT NULL,
    agent_id TEXT REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    dimensions JSONB DEFAULT '{}',
    unit TEXT
) PARTITION BY RANGE (timestamp);

-- Create partitions for current and next month
CREATE TABLE IF NOT EXISTS system_metrics_2025_11 PARTITION OF system_metrics
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE IF NOT EXISTS system_metrics_2025_12 PARTITION OF system_metrics
    FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

CREATE INDEX idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX idx_system_metrics_name ON system_metrics(metric_name);
CREATE INDEX idx_system_metrics_agent ON system_metrics(agent_id);

-- =====================================================
-- TABLE: alert_rules
-- =====================================================
-- Monitoring alert rule definitions

CREATE TABLE IF NOT EXISTS alert_rules (
    rule_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_name TEXT NOT NULL UNIQUE,
    metric_name TEXT NOT NULL,
    condition TEXT NOT NULL, -- '>', '<', '>=', '<=', '==', '!='
    threshold NUMERIC NOT NULL,
    duration_seconds INTEGER DEFAULT 60,
    severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
    enabled BOOLEAN DEFAULT TRUE,
    notification_channels TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_alert_rules_enabled ON alert_rules(enabled);
CREATE INDEX idx_alert_rules_metric ON alert_rules(metric_name);

-- =====================================================
-- TABLE: alerts
-- =====================================================
-- Active and historical alerts

CREATE TABLE IF NOT EXISTS alerts (
    alert_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id UUID NOT NULL REFERENCES alert_rules(rule_id) ON DELETE CASCADE,
    agent_id TEXT REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'firing', -- 'firing', 'resolved', 'acknowledged'
    current_value NUMERIC,
    message TEXT,
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_rule ON alerts(rule_id);
CREATE INDEX idx_alerts_agent ON alerts(agent_id);
CREATE INDEX idx_alerts_fired_at ON alerts(fired_at DESC);

-- =====================================================
-- TABLE: backup_registry
-- =====================================================
-- Track database and system backups

CREATE TABLE IF NOT EXISTS backup_registry (
    backup_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backup_type TEXT NOT NULL, -- 'postgresql', 'redis', 'sqlite', 'filesystem'
    source_agent_id TEXT NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    backup_path TEXT NOT NULL,
    backup_size_bytes BIGINT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
    error_message TEXT,
    retention_until TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_backup_registry_agent ON backup_registry(source_agent_id);
CREATE INDEX idx_backup_registry_type ON backup_registry(backup_type);
CREATE INDEX idx_backup_registry_completed ON backup_registry(completed_at DESC);

-- =====================================================
-- TABLE: maintenance_tasks
-- =====================================================
-- Scheduled maintenance tasks

CREATE TABLE IF NOT EXISTS maintenance_tasks (
    task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_name TEXT NOT NULL,
    task_type TEXT NOT NULL, -- 'vacuum', 'reindex', 'backup', 'cleanup', 'update'
    schedule_cron TEXT NOT NULL, -- Cron expression
    target_agent_id TEXT REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT TRUE,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_tasks_enabled ON maintenance_tasks(enabled);
CREATE INDEX idx_maintenance_tasks_next_run ON maintenance_tasks(next_run);
CREATE INDEX idx_maintenance_tasks_agent ON maintenance_tasks(target_agent_id);

-- =====================================================
-- VIEWS
-- =====================================================

-- Service directory: Active agents with their capabilities
CREATE MATERIALIZED VIEW service_directory AS
SELECT
    agent_id,
    agent_name,
    agent_type,
    capabilities,
    status,
    last_seen,
    health_score,
    current_load,
    max_concurrent_commands,
    ROUND((1.0 - (CAST(current_load AS NUMERIC) / NULLIF(max_concurrent_commands, 0))) * health_score, 2) AS availability_score
FROM mcp_agents
WHERE status = 'online'
ORDER BY availability_score DESC;

CREATE INDEX idx_service_directory_availability ON service_directory(availability_score DESC);

-- Active agents (last seen within 5 minutes)
CREATE VIEW active_agents AS
SELECT
    agent_id,
    agent_name,
    agent_type,
    capabilities,
    hostname,
    ip_address,
    last_seen,
    health_score,
    current_load,
    EXTRACT(EPOCH FROM (NOW() - last_seen)) AS seconds_since_seen
FROM mcp_agents
WHERE status = 'online'
  AND last_seen > NOW() - INTERVAL '5 minutes'
ORDER BY last_seen DESC;

-- Command queue summary
CREATE VIEW queue_summary AS
SELECT
    status,
    COUNT(*) AS count,
    AVG(priority) AS avg_priority,
    MIN(created_at) AS oldest_command,
    MAX(created_at) AS newest_command
FROM command_queue
WHERE status IN ('pending', 'assigned', 'running')
GROUP BY status;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Get least loaded agent with required capabilities
CREATE OR REPLACE FUNCTION get_least_loaded_agent(
    required_capabilities TEXT[]
) RETURNS TEXT AS $$
DECLARE
    selected_agent_id TEXT;
BEGIN
    SELECT agent_id INTO selected_agent_id
    FROM mcp_agents
    WHERE status = 'online'
      AND capabilities @> required_capabilities
      AND current_load < max_concurrent_commands
    ORDER BY
        (CAST(current_load AS NUMERIC) / NULLIF(max_concurrent_commands, 1)) ASC,
        health_score DESC
    LIMIT 1;

    RETURN selected_agent_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Cleanup old data
CREATE OR REPLACE FUNCTION cleanup_old_data(
    retention_days INTEGER DEFAULT 90
) RETURNS TABLE(
    table_name TEXT,
    rows_deleted BIGINT
) AS $$
BEGIN
    -- Cleanup old heartbeats
    RETURN QUERY
    WITH deleted AS (
        DELETE FROM agent_heartbeats
        WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING 1
    )
    SELECT 'agent_heartbeats'::TEXT, COUNT(*)::BIGINT FROM deleted;

    -- Cleanup old audit logs
    RETURN QUERY
    WITH deleted AS (
        DELETE FROM audit_log
        WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING 1
    )
    SELECT 'audit_log'::TEXT, COUNT(*)::BIGINT FROM deleted;

    -- Cleanup old completed commands
    RETURN QUERY
    WITH deleted AS (
        DELETE FROM command_queue
        WHERE status = 'completed'
          AND completed_at < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING 1
    )
    SELECT 'command_queue'::TEXT, COUNT(*)::BIGINT FROM deleted;

    -- Cleanup old system metrics
    RETURN QUERY
    WITH deleted AS (
        DELETE FROM system_metrics
        WHERE timestamp < NOW() - (retention_days || ' days')::INTERVAL
        RETURNING 1
    )
    SELECT 'system_metrics'::TEXT, COUNT(*)::BIGINT FROM deleted;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger: Update thought_sessions.updated_at on structured_thoughts insert
CREATE OR REPLACE FUNCTION update_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.session_id IS NOT NULL THEN
        UPDATE thought_sessions
        SET updated_at = NOW(),
            total_thoughts = total_thoughts + 1,
            current_stage = NEW.stage
        WHERE session_id = NEW.session_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_session_timestamp
AFTER INSERT ON structured_thoughts
FOR EACH ROW
EXECUTE FUNCTION update_session_timestamp();

-- Trigger: Update agent last_seen on heartbeat
CREATE OR REPLACE FUNCTION update_agent_last_seen()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE mcp_agents
    SET last_seen = NEW.timestamp,
        status = 'online'
    WHERE agent_id = NEW.agent_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_agent_last_seen
AFTER INSERT ON agent_heartbeats
FOR EACH ROW
EXECUTE FUNCTION update_agent_last_seen();

-- Trigger: Auto-expire approval requests
CREATE OR REPLACE FUNCTION check_approval_expiration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at IS NOT NULL AND NEW.expires_at < NOW() THEN
        NEW.status := 'expired';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_check_approval_expiration
BEFORE INSERT OR UPDATE ON approval_requests
FOR EACH ROW
EXECUTE FUNCTION check_approval_expiration();

-- =====================================================
-- ROLES & PERMISSIONS
-- =====================================================

-- Role: mcp_agent_role (for agent services)
CREATE ROLE mcp_agent_role;

GRANT CONNECT ON DATABASE mcp_ecosystem TO mcp_agent_role;
GRANT USAGE ON SCHEMA public TO mcp_agent_role;

-- Agents can read/write most tables
GRANT SELECT, INSERT, UPDATE ON TABLE mcp_agents TO mcp_agent_role;
GRANT SELECT, INSERT ON TABLE agent_heartbeats TO mcp_agent_role;
GRANT SELECT, INSERT, UPDATE ON TABLE command_queue TO mcp_agent_role;
GRANT SELECT, INSERT ON TABLE command_execution_log TO mcp_agent_role;
GRANT SELECT, INSERT, UPDATE ON TABLE thought_sessions TO mcp_agent_role;
GRANT SELECT, INSERT, UPDATE ON TABLE structured_thoughts TO mcp_agent_role;
GRANT SELECT ON TABLE markdown_resources TO mcp_agent_role;
GRANT SELECT ON TABLE policies TO mcp_agent_role;
GRANT SELECT, INSERT ON TABLE audit_log TO mcp_agent_role;
GRANT SELECT, INSERT, UPDATE ON TABLE approval_requests TO mcp_agent_role;
GRANT SELECT, INSERT, UPDATE ON TABLE mesh_topology TO mcp_agent_role;
GRANT SELECT, INSERT ON TABLE system_metrics TO mcp_agent_role;
GRANT SELECT ON TABLE alert_rules TO mcp_agent_role;
GRANT SELECT, INSERT, UPDATE ON TABLE alerts TO mcp_agent_role;
GRANT SELECT, INSERT, UPDATE ON TABLE backup_registry TO mcp_agent_role;
GRANT SELECT, UPDATE ON TABLE maintenance_tasks TO mcp_agent_role;

-- Grant access to views
GRANT SELECT ON service_directory TO mcp_agent_role;
GRANT SELECT ON active_agents TO mcp_agent_role;
GRANT SELECT ON queue_summary TO mcp_agent_role;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_least_loaded_agent(TEXT[]) TO mcp_agent_role;
GRANT EXECUTE ON FUNCTION cleanup_old_data(INTEGER) TO mcp_agent_role;

-- Role: mcp_orchestrator_role (for orchestrator/coordinator)
CREATE ROLE mcp_orchestrator_role;

GRANT CONNECT ON DATABASE mcp_ecosystem TO mcp_orchestrator_role;
GRANT USAGE ON SCHEMA public TO mcp_orchestrator_role;

-- Orchestrators have full access
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mcp_orchestrator_role;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO mcp_orchestrator_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO mcp_orchestrator_role;

-- Role: mcp_readonly_role (for monitoring/reporting)
CREATE ROLE mcp_readonly_role;

GRANT CONNECT ON DATABASE mcp_ecosystem TO mcp_readonly_role;
GRANT USAGE ON SCHEMA public TO mcp_readonly_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO mcp_readonly_role;
GRANT SELECT ON service_directory TO mcp_readonly_role;
GRANT SELECT ON active_agents TO mcp_readonly_role;
GRANT SELECT ON queue_summary TO mcp_readonly_role;

-- =====================================================
-- DEFAULT DATA
-- =====================================================

-- Default policies
INSERT INTO policies (policy_name, policy_type, conditions, actions, priority, metadata) VALUES
('high_priority_commands', 'rate_limit',
 '{"max_per_hour": 100, "priority": 9}'::jsonb,
 '{"throttle": false, "alert": true}'::jsonb,
 10,
 '{"description": "High priority commands bypass rate limiting"}'::jsonb),

('destructive_operations_approval', 'command_approval',
 '{"operations": ["delete", "drop", "truncate"], "require_approval": true}'::jsonb,
 '{"approval_required": true, "approvers": ["admin", "ops-lead"]}'::jsonb,
 1,
 '{"description": "Destructive operations require approval"}'::jsonb),

('maintenance_window', 'maintenance_window',
 '{"days": ["Sunday"], "hours": [2, 3, 4, 5]}'::jsonb,
 '{"allow_maintenance": true, "block_user_commands": false}'::jsonb,
 50,
 '{"description": "Sunday 2-6 AM maintenance window"}'::jsonb)
ON CONFLICT (policy_name) DO NOTHING;

-- Default alert rules
INSERT INTO alert_rules (rule_name, metric_name, condition, threshold, duration_seconds, severity, notification_channels, metadata) VALUES
('high_cpu_usage', 'cpu_percent', '>', 90, 300, 'warning',
 ARRAY['email', 'slack'],
 '{"description": "CPU usage above 90% for 5 minutes"}'::jsonb),

('low_disk_space', 'disk_percent', '>', 85, 60, 'critical',
 ARRAY['email', 'slack', 'pagerduty'],
 '{"description": "Disk usage above 85%"}'::jsonb),

('agent_offline', 'agent_heartbeat_age', '>', 300, 0, 'critical',
 ARRAY['email', 'slack'],
 '{"description": "Agent offline for more than 5 minutes"}'::jsonb),

('command_queue_backlog', 'pending_commands', '>', 100, 300, 'warning',
 ARRAY['slack'],
 '{"description": "More than 100 pending commands for 5 minutes"}'::jsonb)
ON CONFLICT (rule_name) DO NOTHING;

-- Default maintenance tasks
INSERT INTO maintenance_tasks (task_name, task_type, schedule_cron, metadata) VALUES
('daily_backup', 'backup', '0 2 * * *',
 '{"description": "Daily PostgreSQL backup at 2 AM"}'::jsonb),

('weekly_vacuum', 'vacuum', '0 3 * * 0',
 '{"description": "Weekly VACUUM ANALYZE on Sunday at 3 AM"}'::jsonb),

('monthly_reindex', 'reindex', '0 4 1 * *',
 '{"description": "Monthly REINDEX on first day of month at 4 AM"}'::jsonb),

('daily_cleanup', 'cleanup', '0 1 * * *',
 '{"description": "Daily cleanup of old data at 1 AM", "retention_days": 90}'::jsonb)
ON CONFLICT DO NOTHING;

-- Sample markdown resources
INSERT INTO markdown_resources (title, content, category, tags, created_by, metadata) VALUES
('MCP Agent Deployment Guide',
 '# MCP Agent Deployment\n\n## Prerequisites\n- Node.js 18+\n- PostgreSQL 16+\n- Redis 7+\n\n## Installation Steps\n...',
 'documentation',
 ARRAY['deployment', 'setup', 'agent'],
 'system',
 '{"version": "1.0", "last_reviewed": "2025-11-05"}'::jsonb),

('Database Backup Procedure',
 '# Database Backup Procedure\n\n## Daily Backups\n1. Run pg_dump with gzip compression\n2. Store in /var/backups/\n3. Verify backup integrity\n...',
 'procedure',
 ARRAY['backup', 'database', 'postgresql'],
 'system',
 '{"version": "1.0", "last_reviewed": "2025-11-05"}'::jsonb),

('Troubleshooting Agent Connection Issues',
 '# Troubleshooting Agent Connections\n\n## Symptom: Agent shows offline\n\n### Check 1: Network connectivity\n```bash\nping agent-hostname\n```\n...',
 'troubleshooting',
 ARRAY['troubleshooting', 'agent', 'networking'],
 'system',
 '{"version": "1.0", "last_reviewed": "2025-11-05"}'::jsonb)
ON CONFLICT DO NOTHING;

-- =====================================================
-- VALIDATION QUERIES
-- =====================================================

-- These queries can be used to validate the schema after creation

COMMENT ON DATABASE mcp_ecosystem IS 'MCP Ecosystem - Distributed agent orchestration and structured thinking';
COMMENT ON TABLE mcp_agents IS 'Central registry of all MCP agents in the ecosystem';
COMMENT ON TABLE agent_heartbeats IS 'Time-series heartbeat data from agents (partitioned by month)';
COMMENT ON TABLE command_queue IS 'Distributed command queue for agent orchestration';
COMMENT ON TABLE command_execution_log IS 'Immutable audit trail of all command executions';
COMMENT ON TABLE thought_sessions IS 'Structured thinking session management';
COMMENT ON TABLE structured_thoughts IS '5-stage cognitive framework for structured reasoning';
COMMENT ON TABLE markdown_resources IS 'Knowledge base for agents (documentation, procedures, references)';
COMMENT ON TABLE policies IS 'Policy definitions for command execution and approvals';
COMMENT ON TABLE audit_log IS 'Immutable audit trail for all system operations (partitioned by month)';
COMMENT ON TABLE approval_requests IS 'Approval workflow for sensitive operations';
COMMENT ON TABLE mesh_topology IS 'Service mesh topology and agent relationships';
COMMENT ON TABLE system_metrics IS 'System-wide metrics and performance data (partitioned by month)';
COMMENT ON TABLE alert_rules IS 'Monitoring alert rule definitions';
COMMENT ON TABLE alerts IS 'Active and historical alerts';
COMMENT ON TABLE backup_registry IS 'Track database and system backups';
COMMENT ON TABLE maintenance_tasks IS 'Scheduled maintenance tasks';

-- =====================================================
-- SCHEMA DEPLOYMENT COMPLETE
-- =====================================================
