-- ============================================================================
-- MCP Ecosystem Database Schema v0.2 - Fresh Installation (Fixed)
-- ============================================================================
-- Purpose: Install complete structured thinking database schema
-- Target: VMI01 (46.250.243.123) - mcp_ecosystem database
-- Date: 2025-11-07
-- ============================================================================

\echo '========================================='
\echo 'MCP Ecosystem Schema v0.2 Installation'
\echo 'Starting at:' `date`
\echo '========================================='
\echo ''

BEGIN;

-- ============================================================================
-- STEP 1: Create ENUM Types
-- ============================================================================
\echo 'Step 1: Creating ENUM types...'

-- Agent status enum
CREATE TYPE agent_status AS ENUM ('active', 'idle', 'offline', 'error');

-- Task status enum
CREATE TYPE task_status AS ENUM ('pending', 'assigned', 'in_progress', 'completed', 'failed');

-- Reasoning stage enum
CREATE TYPE reasoning_stage AS ENUM ('observation', 'hypothesis', 'analysis', 'conclusion', 'reflection');

-- Sync status enum
CREATE TYPE sync_status AS ENUM ('pending', 'synced', 'conflict', 'failed');

-- Branch health enum
CREATE TYPE branch_health AS ENUM ('forming', 'healthy', 'stagnant', 'at_risk', 'unknown');

-- Feedback signal types
CREATE TYPE feedback_signal_type AS ENUM (
  'stage_dwell',
  'quality_drop',
  'repetition',
  'branch_health',
  'context_shift',
  'convergence'
);

-- Feedback severity
CREATE TYPE feedback_severity AS ENUM ('info', 'notice', 'warning', 'critical');

-- Task outcome
CREATE TYPE task_outcome AS ENUM ('success', 'failure', 'partial');

\echo 'ENUM types created'
\echo ''

-- ============================================================================
-- STEP 2: Create Core Agent Tables
-- ============================================================================
\echo 'Step 2: Creating core agent tables...'

-- Agent Registry
CREATE TABLE agent_registry (
  agent_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name VARCHAR(255) NOT NULL UNIQUE,
  capabilities JSONB NOT NULL DEFAULT '{}',
  status agent_status NOT NULL DEFAULT 'offline',
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_capabilities ON agent_registry USING GIN (capabilities);
CREATE INDEX idx_agent_status ON agent_registry (status, last_heartbeat);

COMMENT ON TABLE agent_registry IS 'Registry of all agents in the MCP ecosystem';

-- MCP Agents (compatibility table)
CREATE TABLE mcp_agents (
  agent_id VARCHAR(255) PRIMARY KEY,
  capabilities JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_agents_capabilities ON mcp_agents USING GIN (capabilities);

COMMENT ON TABLE mcp_agents IS 'MCP agent registry (legacy compatibility)';

\echo 'Core agent tables created'
\echo ''

-- ============================================================================
-- STEP 3: Create Task Management Tables
-- ============================================================================
\echo 'Step 3: Creating task management tables...'

-- Task Ledger
CREATE TABLE task_ledger (
  task_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assigned_to UUID REFERENCES agent_registry(agent_id),
  status task_status NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  task_spec JSONB NOT NULL,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_status ON task_ledger (status, priority DESC);
CREATE INDEX idx_task_assignment ON task_ledger (assigned_to, status);

COMMENT ON TABLE task_ledger IS 'Distributed task queue for agent coordination';

-- Capability Cache
CREATE TABLE capability_cache (
  capability_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agent_registry(agent_id),
  capability_type TEXT NOT NULL,
  version TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  ttl TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_capability_type ON capability_cache (capability_type);
CREATE INDEX idx_capability_ttl ON capability_cache (ttl) WHERE ttl IS NOT NULL;

COMMENT ON TABLE capability_cache IS 'Cache of agent capabilities with TTL support';

\echo 'Task management tables created'
\echo ''

-- ============================================================================
-- STEP 4: Create Thought Storage Tables
-- ============================================================================
\echo 'Step 4: Creating thought storage tables...'

-- Thought Sessions
CREATE TABLE thought_sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id VARCHAR(255) NOT NULL,
  task_description TEXT,
  context JSONB DEFAULT '{}',
  parent_session_id UUID REFERENCES thought_sessions(session_id),
  total_thoughts INTEGER NOT NULL DEFAULT 0,
  total_branches INTEGER NOT NULL DEFAULT 0,
  average_quality NUMERIC(3, 2) CHECK (average_quality BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_agent ON thought_sessions(agent_id, created_at DESC);
CREATE INDEX idx_sessions_parent ON thought_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;

COMMENT ON TABLE thought_sessions IS 'Thought session management with branch tracking';

-- Structured Thoughts (Main Table)
CREATE TABLE structured_thoughts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,
  agent_id VARCHAR(255) NOT NULL,

  -- Core content
  stage VARCHAR(50) NOT NULL,
  thought TEXT NOT NULL,
  ordering INTEGER NOT NULL DEFAULT 0,

  -- Quality and importance
  quality_score NUMERIC(3, 2) CHECK (quality_score BETWEEN 0 AND 1),
  importance NUMERIC(3, 2) CHECK (importance BETWEEN 0 AND 1),
  confidence NUMERIC(3, 2) CHECK (confidence BETWEEN 0 AND 1),

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  context JSONB DEFAULT '{}',
  evidence JSONB DEFAULT '{}',

  -- Full-text search
  content_tsvector TSVECTOR,

  -- Branching support
  branch_id VARCHAR(100),
  branch_root_id UUID REFERENCES structured_thoughts(id),
  branch_depth INTEGER DEFAULT 0 CHECK (branch_depth >= 0),

  -- Revision tracking
  is_revision BOOLEAN DEFAULT FALSE,
  revises_thought_id UUID REFERENCES structured_thoughts(id),
  next_stages TEXT[],

  -- Timestamps
  timestamp TIMESTAMP NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_thoughts_session ON structured_thoughts(session_id, ordering);
CREATE INDEX idx_thoughts_quality ON structured_thoughts(quality_score DESC) WHERE quality_score IS NOT NULL;
CREATE INDEX idx_thoughts_importance ON structured_thoughts(importance DESC) WHERE importance IS NOT NULL;
CREATE INDEX idx_thoughts_stage ON structured_thoughts(stage);
CREATE INDEX idx_thoughts_tags ON structured_thoughts USING GIN (tags);
CREATE INDEX idx_thoughts_fts ON structured_thoughts USING GIN(content_tsvector);
CREATE INDEX idx_thoughts_branch ON structured_thoughts(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_thoughts_branch_root ON structured_thoughts(branch_root_id) WHERE branch_root_id IS NOT NULL;
CREATE INDEX idx_thoughts_revision ON structured_thoughts(revises_thought_id) WHERE is_revision = TRUE;

COMMENT ON TABLE structured_thoughts IS 'Core thought storage with quality scoring and branching';

-- Thought Branches (without generated column)
CREATE TABLE thought_branches (
  branch_id VARCHAR(100) PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,

  -- Branch metadata
  root_thought_id UUID REFERENCES structured_thoughts(id),
  branch_from_thought_id UUID REFERENCES structured_thoughts(id),

  -- Metrics
  thought_count INTEGER NOT NULL DEFAULT 0,
  max_depth INTEGER NOT NULL DEFAULT 0,
  average_quality NUMERIC(3, 2) CHECK (average_quality BETWEEN 0 AND 1),
  health branch_health NOT NULL DEFAULT 'forming',

  -- Activity tracking
  last_thought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  staleness_minutes INTEGER,  -- Will be calculated via trigger

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_branch_session ON thought_branches(session_id);
CREATE INDEX idx_branch_health ON thought_branches(health);
CREATE INDEX idx_branch_staleness ON thought_branches(staleness_minutes) WHERE health != 'healthy';

COMMENT ON TABLE thought_branches IS 'Branch analytics for parallel reasoning paths';

\echo 'Thought storage tables created'
\echo ''

-- ============================================================================
-- STEP 5: Create Feedback and Relationship Tables
-- ============================================================================
\echo 'Step 5: Creating feedback and relationship tables...'

-- Feedback Signals
CREATE TABLE feedback_signals (
  signal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,
  thought_id UUID REFERENCES structured_thoughts(id) ON DELETE CASCADE,

  -- Signal classification
  signal_type feedback_signal_type NOT NULL,
  severity feedback_severity NOT NULL,

  -- Context
  stage_id VARCHAR(50),
  branch_id VARCHAR(100) REFERENCES thought_branches(branch_id),
  message TEXT NOT NULL,

  -- Metrics and suggestions
  metrics JSONB DEFAULT '{}',
  suggested_next_stages TEXT[] DEFAULT '{}',

  -- Resolution tracking
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by VARCHAR(255),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_signals_session ON feedback_signals(session_id, created_at DESC);
CREATE INDEX idx_signals_thought ON feedback_signals(thought_id) WHERE thought_id IS NOT NULL;
CREATE INDEX idx_signals_type_severity ON feedback_signals(signal_type, severity);
CREATE INDEX idx_signals_unacknowledged ON feedback_signals(acknowledged, severity) WHERE NOT acknowledged;

COMMENT ON TABLE feedback_signals IS 'Metacognitive feedback signals for reasoning quality';

-- Thought Relationships
CREATE TABLE thought_relationships (
  relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_thought_id UUID NOT NULL REFERENCES structured_thoughts(id) ON DELETE CASCADE,
  target_thought_id UUID NOT NULL REFERENCES structured_thoughts(id) ON DELETE CASCADE,

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
  created_by VARCHAR(255),

  CONSTRAINT no_self_reference CHECK (source_thought_id != target_thought_id),
  CONSTRAINT unique_relationship UNIQUE (source_thought_id, target_thought_id, relationship_type)
);

CREATE INDEX idx_relationships_source ON thought_relationships(source_thought_id);
CREATE INDEX idx_relationships_target ON thought_relationships(target_thought_id);
CREATE INDEX idx_relationships_type ON thought_relationships(relationship_type);
CREATE INDEX idx_relationships_strength ON thought_relationships(strength DESC NULLS LAST);

COMMENT ON TABLE thought_relationships IS 'Explicit semantic relationships between thoughts';

\echo 'Feedback and relationship tables created'
\echo ''

-- ============================================================================
-- STEP 6: Create Audit and Sync Tables
-- ============================================================================
\echo 'Step 6: Creating audit and sync tables...'

-- Audit Log
CREATE TABLE audit_log (
  log_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES agent_registry(agent_id),
  operation_type TEXT NOT NULL,
  operation_details JSONB NOT NULL,
  outcome task_outcome,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_agent ON audit_log (agent_id, created_at DESC);
CREATE INDEX idx_audit_operation ON audit_log (operation_type, created_at DESC);
CREATE INDEX idx_audit_details ON audit_log USING GIN (operation_details);

COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for all operations';

-- Thought Sync Queue
CREATE TABLE thought_sync_queue (
  sync_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id VARCHAR(255) NOT NULL,

  -- Sync target
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
    'thought',
    'session',
    'signal',
    'relationship',
    'branch'
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

CREATE INDEX idx_sync_status ON thought_sync_queue(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX idx_sync_agent ON thought_sync_queue(agent_id);
CREATE INDEX idx_sync_entity ON thought_sync_queue(entity_type, entity_id);

COMMENT ON TABLE thought_sync_queue IS 'Synchronization queue for distributed thought system';

\echo 'Audit and sync tables created'
\echo ''

-- ============================================================================
-- STEP 7: Create Functions
-- ============================================================================
\echo 'Step 7: Creating functions...'

-- Update tsvector trigger function
CREATE OR REPLACE FUNCTION update_thought_tsvector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_tsvector = to_tsvector('english', NEW.thought);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_thoughts_tsvector
  BEFORE INSERT OR UPDATE OF thought ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_thought_tsvector();

-- Update session metrics function
CREATE OR REPLACE FUNCTION update_session_metrics()
RETURNS TRIGGER AS $$
BEGIN
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
    updated_at = now()
  WHERE session_id = NEW.session_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_thoughts_update_session
  AFTER INSERT OR UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_session_metrics();

-- Update branch analytics function
CREATE OR REPLACE FUNCTION update_branch_analytics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.branch_id IS NOT NULL THEN
    INSERT INTO thought_branches (
      branch_id,
      session_id,
      root_thought_id,
      thought_count,
      max_depth,
      average_quality,
      last_thought_at,
      staleness_minutes
    )
    VALUES (
      NEW.branch_id,
      NEW.session_id,
      NEW.branch_root_id,
      1,
      NEW.branch_depth,
      NEW.quality_score,
      NEW.timestamp::TIMESTAMPTZ,
      0
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
      last_thought_at = NEW.timestamp::TIMESTAMPTZ,
      staleness_minutes = EXTRACT(EPOCH FROM (now() - NEW.timestamp::TIMESTAMPTZ)) / 60,
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_thoughts_update_branch
  AFTER INSERT OR UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_branch_analytics();

-- Function to update branch staleness
CREATE OR REPLACE FUNCTION update_branch_staleness()
RETURNS void AS $$
BEGIN
  UPDATE thought_branches
  SET staleness_minutes = EXTRACT(EPOCH FROM (now() - last_thought_at)) / 60;
END;
$$ LANGUAGE plpgsql;

-- Search thoughts function
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

COMMENT ON FUNCTION search_thoughts IS 'Full-text search across thought content';

-- Get thought branch function
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

COMMENT ON FUNCTION get_thought_branch IS 'Retrieve all thoughts in a specific branch';

-- Get branch health function
CREATE OR REPLACE FUNCTION get_branch_health(
  input_session_id UUID DEFAULT NULL
)
RETURNS TABLE (
  branch_id VARCHAR(100),
  health branch_health,
  thought_count INTEGER,
  avg_quality NUMERIC,
  staleness_minutes INTEGER,
  last_activity TIMESTAMPTZ
) AS $$
BEGIN
  -- Update staleness before returning results
  PERFORM update_branch_staleness();

  RETURN QUERY
  SELECT
    tb.branch_id,
    tb.health,
    tb.thought_count,
    tb.average_quality,
    tb.staleness_minutes,
    tb.last_thought_at
  FROM thought_branches tb
  WHERE input_session_id IS NULL OR tb.session_id = input_session_id
  ORDER BY tb.health DESC, tb.last_thought_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_branch_health IS 'Get health status of all branches in a session';

\echo 'Functions created'
\echo ''

-- ============================================================================
-- STEP 8: Create Views
-- ============================================================================
\echo 'Step 8: Creating views...'

-- Thought timeline view with branch context
CREATE VIEW v_thought_timeline_v2 AS
SELECT
  t.id::UUID as thought_id,
  t.session_id,
  s.task_description as session_title,
  t.agent_id,
  t.stage,
  t.thought as content,
  t.ordering,
  t.quality_score,
  t.importance,
  t.tags,
  t.branch_id,
  t.branch_depth,
  t.is_revision,
  t.timestamp::TIMESTAMPTZ as created_at,
  tb.health AS branch_health,
  tb.average_quality AS branch_avg_quality
FROM structured_thoughts t
JOIN thought_sessions s ON t.session_id = s.session_id
LEFT JOIN thought_branches tb ON t.branch_id = tb.branch_id
ORDER BY t.session_id, t.ordering;

COMMENT ON VIEW v_thought_timeline_v2 IS 'Enhanced thought timeline with branch context';

-- Branch summary view
CREATE VIEW v_branch_summary AS
SELECT
  tb.branch_id,
  tb.session_id,
  s.task_description as session_title,
  tb.thought_count,
  tb.max_depth,
  tb.average_quality,
  tb.health,
  tb.staleness_minutes,
  tb.last_thought_at,
  COUNT(DISTINCT fs.signal_id) FILTER (WHERE fs.severity IN ('warning', 'critical')) as critical_signals
FROM thought_branches tb
JOIN thought_sessions s ON tb.session_id = s.session_id
LEFT JOIN feedback_signals fs ON tb.branch_id = fs.branch_id
GROUP BY tb.branch_id, tb.session_id, s.task_description,
         tb.thought_count, tb.max_depth, tb.average_quality,
         tb.health, tb.staleness_minutes, tb.last_thought_at;

COMMENT ON VIEW v_branch_summary IS 'Branch health summary with signal counts';

\echo 'Views created'
\echo ''

-- ============================================================================
-- STEP 9: Create Metadata Tables
-- ============================================================================
\echo 'Step 9: Creating metadata tables...'

-- Schema version tracking
CREATE TABLE schema_version (
  version VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by VARCHAR(255) NOT NULL,
  migration_duration INTERVAL
);

-- Insert initial version
INSERT INTO schema_version (version, description, applied_by)
VALUES ('0.2.0', 'Initial v0.2 schema with enhanced structured thinking', current_user);

-- Database metadata
COMMENT ON DATABASE mcp_ecosystem IS 'MCP Ecosystem Database - Version 0.2.0 - Enhanced Structured Thinking';

\echo 'Metadata tables created'
\echo ''

-- ============================================================================
-- STEP 10: Validation
-- ============================================================================
\echo 'Step 10: Validating installation...'

DO $$
DECLARE
  table_count INTEGER;
  function_count INTEGER;
  index_count INTEGER;
BEGIN
  -- Count tables
  SELECT COUNT(*) INTO table_count
  FROM pg_tables
  WHERE schemaname = 'public';

  -- Count functions
  SELECT COUNT(*) INTO function_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace;

  -- Count indexes
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public';

  RAISE NOTICE 'Installation Summary:';
  RAISE NOTICE '  Tables created: %', table_count;
  RAISE NOTICE '  Functions created: %', function_count;
  RAISE NOTICE '  Indexes created: %', index_count;

  IF table_count < 10 THEN
    RAISE EXCEPTION 'Installation incomplete - expected at least 10 tables, got %', table_count;
  END IF;
END $$;

-- ============================================================================
-- COMMIT
-- ============================================================================

COMMIT;

\echo ''
\echo '========================================='
\echo 'Installation completed successfully!'
\echo 'Completed at:' `date`
\echo '========================================='
\echo ''
\echo 'Database ready for use!'
\echo 'Connection details:'
\echo '  Host: 46.250.243.123'
\echo '  Port: 5432'
\echo '  Database: mcp_ecosystem'
\echo '  User: mcp_admin'
\echo '  Password: '
\echo ''
\echo 'Available capabilities:'
\echo '- Full-text search: SELECT * FROM search_thoughts(''query'', 50);'
\echo '- Branch health: SELECT * FROM get_branch_health();'
\echo '- Branch details: SELECT * FROM get_thought_branch(''branch-id'');'
\echo '- Timeline view: SELECT * FROM v_thought_timeline_v2;'
\echo '- Branch summary: SELECT * FROM v_branch_summary;'
\echo ''

-- ============================================================================
-- END OF INSTALLATION
-- ============================================================================