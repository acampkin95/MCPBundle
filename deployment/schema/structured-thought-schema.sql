-- ============================================================================
-- Structured Thought Database Schema for MCP Ecosystem
-- Production-Ready PostgreSQL 16+ Schema
-- Version: 0.2.0
-- Created: 2025-11-07
-- ============================================================================
--
-- Purpose: Comprehensive metacognitive framework for distributed MCP agents
-- Features:
--   - Hierarchical thought tracking with branching
--   - Quality scoring and feedback mechanisms
--   - Multi-agent collaboration and coordination
--   - Full-text search with tsvector
--   - Temporal tracking and audit trails
--   - Cross-MCP thought synchronization
--
-- Deployment Targets:
--   - VMI01 (46.250.243.123) - Primary PostgreSQL instance
--   - Supports: MCP-Orchestrator, Perplexity-MCP, IT-MCP
--
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Trigram matching for fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gin";      -- GIN indexes for arrays
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements"; -- Query performance tracking

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Cognitive stages for structured thinking framework
CREATE TYPE cognitive_stage AS ENUM (
  'problem_definition',
  'research',
  'analysis',
  'synthesis',
  'conclusion',
  'reflection',
  'implementation',
  'validation'
);

-- Importance levels for thought prioritization
CREATE TYPE importance_level AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

-- Branch health indicators
CREATE TYPE branch_health AS ENUM (
  'forming',
  'healthy',
  'stagnant',
  'at_risk',
  'unknown'
);

-- Feedback signal types for metacognitive monitoring
CREATE TYPE feedback_signal_type AS ENUM (
  'stage_dwell',
  'quality_drop',
  'repetition',
  'branch_health',
  'context_shift',
  'convergence'
);

-- Severity levels for feedback signals
CREATE TYPE feedback_severity AS ENUM (
  'info',
  'notice',
  'warning',
  'critical'
);

-- Sync status for distributed thoughts
CREATE TYPE sync_status AS ENUM (
  'pending',
  'synced',
  'conflict',
  'failed'
);

-- Agent capabilities for targeting
CREATE TYPE agent_capability AS ENUM (
  'local-shell',
  'local-sudo',
  'ssh-linux',
  'ssh-macos',
  'winrm',
  'postgres-admin',
  'redis-admin',
  'keycloak-admin',
  'ubuntu-server',
  'business-intelligence',
  'perplexity-research',
  'diagnostic-tools'
);

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Agent Registry
-- Tracks all MCP agents in the distributed ecosystem
-- ----------------------------------------------------------------------------
CREATE TABLE mcp_agents (
  agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_type VARCHAR(50) NOT NULL CHECK (agent_type IN (
    'mcp-orchestrator',
    'perplexity-mcp',
    'it-mcp'
  )),
  hostname VARCHAR(255) NOT NULL,
  mac_address VARCHAR(17),
  ip_address INET,
  capabilities agent_capability[] NOT NULL DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
  last_heartbeat_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT unique_hostname_type UNIQUE (hostname, agent_type),
  CONSTRAINT valid_capabilities CHECK (cardinality(capabilities) > 0)
);

CREATE INDEX idx_agents_status ON mcp_agents(status) WHERE status = 'active';
CREATE INDEX idx_agents_heartbeat ON mcp_agents(last_heartbeat_at) WHERE status = 'active';
CREATE INDEX idx_agents_capabilities ON mcp_agents USING GIN(capabilities);

COMMENT ON TABLE mcp_agents IS 'Registry of all MCP agents in the distributed ecosystem';
COMMENT ON COLUMN mcp_agents.agent_type IS 'Type of MCP agent: orchestrator, perplexity, or it-mcp';
COMMENT ON COLUMN mcp_agents.capabilities IS 'Array of capabilities this agent supports';
COMMENT ON COLUMN mcp_agents.metadata IS 'Flexible metadata: version, environment, custom config';

-- ----------------------------------------------------------------------------
-- Thought Sessions
-- Represents a cohesive reasoning session across one or more agents
-- ----------------------------------------------------------------------------
CREATE TABLE thought_sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,

  -- Session metadata
  title VARCHAR(500),
  description TEXT,
  context JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',

  -- Session lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',
    'paused',
    'completed',
    'abandoned'
  )),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- Relationships
  parent_session_id UUID REFERENCES thought_sessions(session_id),

  -- Metrics
  total_thoughts INTEGER NOT NULL DEFAULT 0,
  total_branches INTEGER NOT NULL DEFAULT 0,
  average_quality NUMERIC(3, 2) CHECK (average_quality BETWEEN 0 AND 1),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_agent ON thought_sessions(agent_id);
CREATE INDEX idx_sessions_status ON thought_sessions(status) WHERE status = 'active';
CREATE INDEX idx_sessions_activity ON thought_sessions(last_activity_at DESC);
CREATE INDEX idx_sessions_tags ON thought_sessions USING GIN(tags);
CREATE INDEX idx_sessions_parent ON thought_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;

COMMENT ON TABLE thought_sessions IS 'Cohesive reasoning sessions, potentially spanning multiple agents';
COMMENT ON COLUMN thought_sessions.context IS 'Session context: problem statement, constraints, goals';
COMMENT ON COLUMN thought_sessions.parent_session_id IS 'Parent session for hierarchical session trees';

-- ----------------------------------------------------------------------------
-- Structured Thoughts
-- Core thought records with metacognitive metadata
-- ----------------------------------------------------------------------------
CREATE TABLE structured_thoughts (
  thought_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE RESTRICT,

  -- Thought content
  stage cognitive_stage NOT NULL,
  content TEXT NOT NULL,
  content_tsvector TSVECTOR,

  -- Ordering and hierarchy
  order_index INTEGER NOT NULL,
  branch_id VARCHAR(100),
  branch_root_id UUID REFERENCES structured_thoughts(thought_id),
  branch_depth INTEGER DEFAULT 0 CHECK (branch_depth >= 0),

  -- Quality and metadata
  quality_score NUMERIC(3, 2) CHECK (quality_score BETWEEN 0 AND 1),
  importance importance_level DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  references TEXT[] DEFAULT '{}',

  -- Metacognitive flags
  is_revision BOOLEAN DEFAULT FALSE,
  revises_thought_id UUID REFERENCES structured_thoughts(thought_id),
  needs_follow_up BOOLEAN DEFAULT FALSE,
  next_stages cognitive_stage[] DEFAULT '{}',

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_order CHECK (order_index > 0),
  CONSTRAINT valid_references CHECK (cardinality(references) <= 100)
);

-- Indexes for performance
CREATE INDEX idx_thoughts_session ON structured_thoughts(session_id, order_index);
CREATE INDEX idx_thoughts_agent ON structured_thoughts(agent_id);
CREATE INDEX idx_thoughts_stage ON structured_thoughts(stage);
CREATE INDEX idx_thoughts_branch ON structured_thoughts(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_thoughts_quality ON structured_thoughts(quality_score DESC NULLS LAST);
CREATE INDEX idx_thoughts_importance ON structured_thoughts(importance);
CREATE INDEX idx_thoughts_tags ON structured_thoughts USING GIN(tags);
CREATE INDEX idx_thoughts_search ON structured_thoughts USING GIN(content_tsvector);
CREATE INDEX idx_thoughts_revisions ON structured_thoughts(revises_thought_id) WHERE is_revision = TRUE;
CREATE INDEX idx_thoughts_follow_up ON structured_thoughts(needs_follow_up, importance) WHERE needs_follow_up = TRUE;

COMMENT ON TABLE structured_thoughts IS 'Core thought records with full metacognitive metadata';
COMMENT ON COLUMN structured_thoughts.content_tsvector IS 'Full-text search vector, auto-maintained by trigger';
COMMENT ON COLUMN structured_thoughts.branch_id IS 'Identifier for thought branches (alternative reasoning paths)';
COMMENT ON COLUMN structured_thoughts.references IS 'Array of references: file paths, URLs, thought IDs';

-- ----------------------------------------------------------------------------
-- Branch Analytics
-- Pre-computed analytics for thought branches
-- ----------------------------------------------------------------------------
CREATE TABLE branch_analytics (
  branch_id VARCHAR(100) PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,

  -- Branch metadata
  root_thought_id UUID REFERENCES structured_thoughts(thought_id),
  branch_from_thought_id UUID REFERENCES structured_thoughts(thought_id),

  -- Metrics
  thought_count INTEGER NOT NULL DEFAULT 0,
  max_depth INTEGER NOT NULL DEFAULT 0,
  average_quality NUMERIC(3, 2) CHECK (average_quality BETWEEN 0 AND 1),
  health branch_health NOT NULL DEFAULT 'forming',

  -- Activity tracking
  last_thought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  staleness_minutes INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (now() - last_thought_at)) / 60
  ) STORED,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_branch_session ON branch_analytics(session_id);
CREATE INDEX idx_branch_health ON branch_analytics(health);
CREATE INDEX idx_branch_staleness ON branch_analytics(staleness_minutes) WHERE health != 'healthy';

COMMENT ON TABLE branch_analytics IS 'Pre-computed analytics for thought branches, updated via triggers';
COMMENT ON COLUMN branch_analytics.staleness_minutes IS 'Automatically computed staleness indicator';

-- ----------------------------------------------------------------------------
-- Feedback Signals
-- Metacognitive feedback for reasoning quality
-- ----------------------------------------------------------------------------
CREATE TABLE feedback_signals (
  signal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,
  thought_id UUID REFERENCES structured_thoughts(thought_id) ON DELETE CASCADE,

  -- Signal classification
  signal_type feedback_signal_type NOT NULL,
  severity feedback_severity NOT NULL,

  -- Context
  stage_id cognitive_stage,
  branch_id VARCHAR(100),
  message TEXT NOT NULL,

  -- Metrics and suggestions
  metrics JSONB DEFAULT '{}',
  suggested_next_stages cognitive_stage[] DEFAULT '{}',

  -- Resolution tracking
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES mcp_agents(agent_id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signals_session ON feedback_signals(session_id, created_at DESC);
CREATE INDEX idx_signals_thought ON feedback_signals(thought_id) WHERE thought_id IS NOT NULL;
CREATE INDEX idx_signals_type_severity ON feedback_signals(signal_type, severity);
CREATE INDEX idx_signals_unacknowledged ON feedback_signals(acknowledged, severity) WHERE NOT acknowledged;

COMMENT ON TABLE feedback_signals IS 'Metacognitive feedback signals for reasoning quality monitoring';
COMMENT ON COLUMN feedback_signals.metrics IS 'Signal-specific metrics: dwell count, quality delta, etc.';

-- ----------------------------------------------------------------------------
-- Thought Relationships
-- Explicit relationships between thoughts
-- ----------------------------------------------------------------------------
CREATE TABLE thought_relationships (
  relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_thought_id UUID NOT NULL REFERENCES structured_thoughts(thought_id) ON DELETE CASCADE,
  target_thought_id UUID NOT NULL REFERENCES structured_thoughts(thought_id) ON DELETE CASCADE,

  -- Relationship type
  relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN (
    'extends',
    'contradicts',
    'supports',
    'branches_from',
    'revises',
    'references',
    'merges_with'
  )),

  -- Metadata
  strength NUMERIC(3, 2) CHECK (strength BETWEEN 0 AND 1),
  description TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES mcp_agents(agent_id),

  CONSTRAINT no_self_reference CHECK (source_thought_id != target_thought_id),
  CONSTRAINT unique_relationship UNIQUE (source_thought_id, target_thought_id, relationship_type)
);

CREATE INDEX idx_relationships_source ON thought_relationships(source_thought_id);
CREATE INDEX idx_relationships_target ON thought_relationships(target_thought_id);
CREATE INDEX idx_relationships_type ON thought_relationships(relationship_type);
CREATE INDEX idx_relationships_strength ON thought_relationships(strength DESC NULLS LAST);

COMMENT ON TABLE thought_relationships IS 'Explicit semantic relationships between thoughts';
COMMENT ON COLUMN thought_relationships.strength IS 'Relationship strength: 0 (weak) to 1 (strong)';

-- ----------------------------------------------------------------------------
-- Sync Queue
-- Tracks synchronization between local SQLite and PostgreSQL
-- ----------------------------------------------------------------------------
CREATE TABLE sync_queue (
  sync_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE CASCADE,

  -- Sync target
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
    'thought',
    'session',
    'signal',
    'relationship'
  )),
  entity_id UUID NOT NULL,

  -- Sync metadata
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  status sync_status NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL,

  -- Retry tracking
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);

CREATE INDEX idx_sync_status ON sync_queue(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_sync_agent ON sync_queue(agent_id);
CREATE INDEX idx_sync_entity ON sync_queue(entity_type, entity_id);

COMMENT ON TABLE sync_queue IS 'Synchronization queue for distributed thought system';
COMMENT ON COLUMN sync_queue.payload IS 'Full entity data for synchronization';

-- ============================================================================
-- COMMAND QUEUE (Inter-MCP Communication)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Command Queue
-- Distributed command dispatch and execution tracking
-- ----------------------------------------------------------------------------
CREATE TABLE command_queue (
  job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Targeting
  target_agent_id UUID REFERENCES mcp_agents(agent_id) ON DELETE SET NULL,
  requested_capabilities agent_capability[] NOT NULL,

  -- Command details
  tool_name VARCHAR(100) NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (priority IN (
    'low',
    'normal',
    'high',
    'urgent'
  )),

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued',
    'picked',
    'executing',
    'completed',
    'failed',
    'timeout',
    'cancelled'
  )),

  -- Results
  result JSONB,
  error TEXT,

  -- Retry tracking
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  timeout_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES mcp_agents(agent_id),
  executed_by UUID REFERENCES mcp_agents(agent_id),

  CONSTRAINT valid_timeout CHECK (timeout_at IS NULL OR timeout_at > created_at)
);

CREATE INDEX idx_commands_status_priority ON command_queue(status, priority DESC, created_at)
  WHERE status = 'queued';
CREATE INDEX idx_commands_target ON command_queue(target_agent_id) WHERE target_agent_id IS NOT NULL;
CREATE INDEX idx_commands_capabilities ON command_queue USING GIN(requested_capabilities);
CREATE INDEX idx_commands_timeout ON command_queue(timeout_at) WHERE status IN ('queued', 'picked', 'executing');
CREATE INDEX idx_commands_completed ON command_queue(completed_at DESC) WHERE status IN ('completed', 'failed');

COMMENT ON TABLE command_queue IS 'Distributed command queue for inter-MCP communication';
COMMENT ON COLUMN command_queue.requested_capabilities IS 'Required capabilities for command execution';

-- ============================================================================
-- AUDIT AND COMPLIANCE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Audit Log
-- Comprehensive audit trail for all operations
-- ----------------------------------------------------------------------------
CREATE TABLE audit_log (
  audit_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES mcp_agents(agent_id) ON DELETE SET NULL,

  -- Event details
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50) NOT NULL CHECK (event_category IN (
    'thought',
    'session',
    'command',
    'sync',
    'admin'
  )),

  -- Context
  entity_type VARCHAR(50),
  entity_id UUID,

  -- Event data
  details JSONB DEFAULT '{}',

  -- User/agent context
  user_id VARCHAR(255),
  ip_address INET,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_agent ON audit_log(agent_id);
CREATE INDEX idx_audit_time ON audit_log(created_at DESC);
CREATE INDEX idx_audit_category_type ON audit_log(event_category, event_type);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for compliance and debugging';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Update timestamps automatically
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_agents_updated_at
  BEFORE UPDATE ON mcp_agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_sessions_updated_at
  BEFORE UPDATE ON thought_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_thoughts_updated_at
  BEFORE UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_branch_analytics_updated_at
  BEFORE UPDATE ON branch_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- Maintain full-text search vector
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_thought_tsvector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_tsvector = to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_thoughts_tsvector
  BEFORE INSERT OR UPDATE OF content ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_thought_tsvector();

-- ----------------------------------------------------------------------------
-- Update session metrics on thought changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_session_metrics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update total thoughts count
  UPDATE thought_sessions
  SET
    total_thoughts = (
      SELECT COUNT(*)
      FROM structured_thoughts
      WHERE session_id = NEW.session_id
    ),
    average_quality = (
      SELECT AVG(quality_score)
      FROM structured_thoughts
      WHERE session_id = NEW.session_id AND quality_score IS NOT NULL
    ),
    last_activity_at = now()
  WHERE session_id = NEW.session_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_thoughts_update_session
  AFTER INSERT OR UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_session_metrics();

-- ----------------------------------------------------------------------------
-- Update branch analytics on thought changes
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_branch_analytics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    INSERT INTO branch_analytics (
      branch_id,
      session_id,
      root_thought_id,
      thought_count,
      max_depth,
      average_quality,
      last_thought_at
    )
    VALUES (
      NEW.branch_id,
      NEW.session_id,
      NEW.branch_root_id,
      1,
      NEW.branch_depth,
      NEW.quality_score,
      NEW.created_at
    )
    ON CONFLICT (branch_id) DO UPDATE SET
      thought_count = (
        SELECT COUNT(*)
        FROM structured_thoughts
        WHERE branch_id = NEW.branch_id
      ),
      max_depth = (
        SELECT MAX(branch_depth)
        FROM structured_thoughts
        WHERE branch_id = NEW.branch_id
      ),
      average_quality = (
        SELECT AVG(quality_score)
        FROM structured_thoughts
        WHERE branch_id = NEW.branch_id AND quality_score IS NOT NULL
      ),
      last_thought_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_thoughts_update_branch
  AFTER INSERT OR UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_branch_analytics();

-- ----------------------------------------------------------------------------
-- Auto-create audit log entries
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_thought_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (
      agent_id,
      event_type,
      event_category,
      entity_type,
      entity_id,
      details
    ) VALUES (
      NEW.agent_id,
      'thought_created',
      'thought',
      'thought',
      NEW.thought_id,
      jsonb_build_object(
        'stage', NEW.stage,
        'importance', NEW.importance,
        'session_id', NEW.session_id
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (
      agent_id,
      event_type,
      event_category,
      entity_type,
      entity_id,
      details
    ) VALUES (
      NEW.agent_id,
      'thought_updated',
      'thought',
      'thought',
      NEW.thought_id,
      jsonb_build_object(
        'changes', jsonb_build_object(
          'old_stage', OLD.stage,
          'new_stage', NEW.stage,
          'old_quality', OLD.quality_score,
          'new_quality', NEW.quality_score
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_thoughts_audit
  AFTER INSERT OR UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION log_thought_changes();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Active Sessions with Summary
-- ----------------------------------------------------------------------------
CREATE VIEW v_active_sessions AS
SELECT
  s.session_id,
  s.agent_id,
  a.agent_type,
  a.hostname,
  s.title,
  s.status,
  s.total_thoughts,
  s.total_branches,
  s.average_quality,
  s.started_at,
  s.last_activity_at,
  EXTRACT(EPOCH FROM (now() - s.last_activity_at)) / 60 AS inactive_minutes,
  array_agg(DISTINCT st.stage) AS stages_used,
  array_agg(DISTINCT tag ORDER BY tag) AS all_tags
FROM thought_sessions s
JOIN mcp_agents a ON s.agent_id = a.agent_id
LEFT JOIN structured_thoughts st ON s.session_id = st.session_id
WHERE s.status = 'active'
GROUP BY s.session_id, a.agent_id, a.agent_type, a.hostname;

COMMENT ON VIEW v_active_sessions IS 'Active sessions with aggregated metrics';

-- ----------------------------------------------------------------------------
-- Thought Timeline with Context
-- ----------------------------------------------------------------------------
CREATE VIEW v_thought_timeline AS
SELECT
  t.thought_id,
  t.session_id,
  s.title AS session_title,
  t.agent_id,
  a.agent_type,
  t.stage,
  t.content,
  t.order_index,
  t.quality_score,
  t.importance,
  t.tags,
  t.branch_id,
  t.branch_depth,
  t.is_revision,
  t.needs_follow_up,
  t.created_at,
  ba.health AS branch_health,
  ba.average_quality AS branch_avg_quality
FROM structured_thoughts t
JOIN thought_sessions s ON t.session_id = s.session_id
JOIN mcp_agents a ON t.agent_id = a.agent_id
LEFT JOIN branch_analytics ba ON t.branch_id = ba.branch_id
ORDER BY t.session_id, t.order_index;

COMMENT ON VIEW v_thought_timeline IS 'Complete thought timeline with session and branch context';

-- ----------------------------------------------------------------------------
-- Pending Commands by Priority
-- ----------------------------------------------------------------------------
CREATE VIEW v_pending_commands AS
SELECT
  c.job_id,
  c.tool_name,
  c.priority,
  c.requested_capabilities,
  c.target_agent_id,
  a.hostname AS target_hostname,
  a.agent_type AS target_type,
  c.retry_count,
  c.max_retries,
  c.created_at,
  EXTRACT(EPOCH FROM (now() - c.created_at)) / 60 AS age_minutes,
  c.timeout_at
FROM command_queue c
LEFT JOIN mcp_agents a ON c.target_agent_id = a.agent_id
WHERE c.status = 'queued'
ORDER BY
  CASE c.priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  c.created_at;

COMMENT ON VIEW v_pending_commands IS 'Pending commands ordered by priority and age';

-- ----------------------------------------------------------------------------
-- Agent Health Dashboard
-- ----------------------------------------------------------------------------
CREATE VIEW v_agent_health AS
SELECT
  a.agent_id,
  a.agent_type,
  a.hostname,
  a.status,
  a.capabilities,
  a.last_heartbeat_at,
  EXTRACT(EPOCH FROM (now() - a.last_heartbeat_at)) / 60 AS heartbeat_age_minutes,
  COUNT(DISTINCT s.session_id) AS active_sessions,
  COUNT(DISTINCT t.thought_id) AS total_thoughts,
  COUNT(DISTINCT c.job_id) FILTER (WHERE c.status = 'executing') AS executing_commands,
  COUNT(DISTINCT sq.sync_id) FILTER (WHERE sq.status = 'pending') AS pending_syncs
FROM mcp_agents a
LEFT JOIN thought_sessions s ON a.agent_id = s.agent_id AND s.status = 'active'
LEFT JOIN structured_thoughts t ON a.agent_id = t.agent_id
LEFT JOIN command_queue c ON a.agent_id = c.executed_by
LEFT JOIN sync_queue sq ON a.agent_id = sq.agent_id
GROUP BY a.agent_id;

COMMENT ON VIEW v_agent_health IS 'Agent health metrics for monitoring dashboard';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Search Thoughts (Full-text search)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_thoughts(
  search_query TEXT,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  thought_id UUID,
  session_id UUID,
  content TEXT,
  stage cognitive_stage,
  quality_score NUMERIC,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.thought_id,
    t.session_id,
    t.content,
    t.stage,
    t.quality_score,
    ts_rank(t.content_tsvector, plainto_tsquery('english', search_query)) AS rank
  FROM structured_thoughts t
  WHERE t.content_tsvector @@ plainto_tsquery('english', search_query)
  ORDER BY rank DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_thoughts IS 'Full-text search across thought content';

-- ----------------------------------------------------------------------------
-- Get Thought Branch
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_thought_branch(
  input_branch_id VARCHAR(100)
)
RETURNS TABLE (
  thought_id UUID,
  content TEXT,
  stage cognitive_stage,
  order_index INTEGER,
  branch_depth INTEGER,
  quality_score NUMERIC,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.thought_id,
    t.content,
    t.stage,
    t.order_index,
    t.branch_depth,
    t.quality_score,
    t.created_at
  FROM structured_thoughts t
  WHERE t.branch_id = input_branch_id
  ORDER BY t.order_index;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_thought_branch IS 'Retrieve all thoughts in a specific branch';

-- ----------------------------------------------------------------------------
-- Pick Next Command from Queue
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pick_next_command(
  agent_id_param UUID,
  capabilities_param agent_capability[]
)
RETURNS UUID AS $$
DECLARE
  selected_job_id UUID;
BEGIN
  SELECT job_id INTO selected_job_id
  FROM command_queue
  WHERE
    status = 'queued' AND
    (target_agent_id IS NULL OR target_agent_id = agent_id_param) AND
    requested_capabilities <@ capabilities_param AND
    (timeout_at IS NULL OR timeout_at > now())
  ORDER BY
    CASE priority
      WHEN 'urgent' THEN 1
      WHEN 'high' THEN 2
      WHEN 'normal' THEN 3
      WHEN 'low' THEN 4
    END,
    created_at
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF selected_job_id IS NOT NULL THEN
    UPDATE command_queue
    SET
      status = 'picked',
      picked_at = now(),
      executed_by = agent_id_param
    WHERE job_id = selected_job_id;
  END IF;

  RETURN selected_job_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION pick_next_command IS 'Atomically pick next command from queue matching agent capabilities';

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default system agent
INSERT INTO mcp_agents (
  agent_id,
  agent_type,
  hostname,
  capabilities,
  status,
  metadata
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'mcp-orchestrator',
  'system',
  ARRAY['postgres-admin', 'redis-admin', 'keycloak-admin']::agent_capability[],
  'active',
  '{"system": true, "description": "System orchestrator agent"}'::JSONB
);

-- ============================================================================
-- GRANTS AND PERMISSIONS
-- ============================================================================

-- Create application role
CREATE ROLE mcp_app_role;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO mcp_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mcp_app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mcp_app_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO mcp_app_role;

-- Alter default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mcp_app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mcp_app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO mcp_app_role;

-- Create application user (update credentials as needed)
-- CREATE USER mcp_admin WITH PASSWORD '<see deployment/resume.md>';
-- GRANT mcp_app_role TO mcp_admin;

-- ============================================================================
-- MAINTENANCE
-- ============================================================================

COMMENT ON DATABASE mcp_ecosystem IS 'Structured Thought Database for MCP Ecosystem v0.2.0';

-- Enable auto-vacuum for all tables
ALTER TABLE mcp_agents SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE structured_thoughts SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE command_queue SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE audit_log SET (autovacuum_vacuum_scale_factor = 0.2);

-- ============================================================================
-- PERFORMANCE TUNING RECOMMENDATIONS
-- ============================================================================

-- Recommended PostgreSQL settings (in postgresql.conf):
-- shared_buffers = 256MB (for VMI01 with 8GB RAM)
-- effective_cache_size = 4GB
-- maintenance_work_mem = 64MB
-- checkpoint_completion_target = 0.9
-- wal_buffers = 16MB
-- default_statistics_target = 100
-- random_page_cost = 1.1
-- effective_io_concurrency = 200
-- work_mem = 16MB
-- min_wal_size = 1GB
-- max_wal_size = 4GB

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
