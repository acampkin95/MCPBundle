-- ============================================================================
-- MCP Ecosystem Database Schema v0.2.1 - Optimized for Multi-Project Support
-- ============================================================================
-- Purpose: Production-ready schema with project segregation and scalability
-- Target: VMI01 (46.250.243.123) - Fresh installation
-- Date: 2025-11-08
-- Optimizations:
--   - Multi-project support with cascade cleanup
--   - Table partitioning for high-volume tables
--   - Row-Level Security for multi-tenant isolation
--   - Enhanced indexes for multi-project queries
--   - Cleanup automation and archival
-- ============================================================================

\echo '========================================='
\echo 'MCP Ecosystem Schema v0.2.1 (Optimized)'
\echo 'Starting at:' `date`
\echo '========================================='
\echo ''

BEGIN;

-- ============================================================================
-- STEP 1: EXTENSIONS
-- ============================================================================
\echo 'Step 1: Creating extensions...'

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";           -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";             -- Trigram matching for fuzzy search
CREATE EXTENSION IF NOT EXISTS "btree_gin";           -- GIN indexes for arrays
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";  -- Query performance tracking
CREATE EXTENSION IF NOT EXISTS "pgcrypto";            -- Cryptographic functions

\echo 'Extensions created'
\echo ''

-- ============================================================================
-- STEP 2: ENUM TYPES
-- ============================================================================
\echo 'Step 2: Creating ENUM types...'

-- Cognitive stages for structured thinking
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

-- Importance levels
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
CREATE TYPE feedback_severity AS ENUM (
  'info',
  'notice',
  'warning',
  'critical'
);

-- Sync status
CREATE TYPE sync_status AS ENUM (
  'pending',
  'synced',
  'conflict',
  'failed'
);

-- Agent capabilities
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

-- Project status
CREATE TYPE project_status AS ENUM (
  'active',
  'paused',
  'archived',
  'deleted'
);

-- Project role
CREATE TYPE project_role AS ENUM (
  'owner',
  'contributor',
  'viewer'
);

-- Cleanup job type
CREATE TYPE cleanup_job_type AS ENUM (
  'archive_project',
  'delete_project',
  'prune_stale_branches',
  'vacuum_partitions',
  'expire_audit_logs'
);

\echo 'ENUM types created'
\echo ''

-- ============================================================================
-- STEP 3: PROJECT MANAGEMENT TABLES
-- ============================================================================
\echo 'Step 3: Creating project management tables...'

-- ----------------------------------------------------------------------------
-- Projects - Multi-project support
-- ----------------------------------------------------------------------------
CREATE TABLE projects (
  project_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  owner_agent_id UUID,  -- FK added later after mcp_agents created

  -- Lifecycle
  status project_status NOT NULL DEFAULT 'active',

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',

  -- Retention policy
  retention_days INTEGER DEFAULT 365,
  auto_archive_after_days INTEGER DEFAULT 90,

  -- Activity tracking
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT valid_retention CHECK (retention_days >= 0),
  CONSTRAINT valid_auto_archive CHECK (auto_archive_after_days >= 0)
);

CREATE INDEX idx_projects_status ON projects(status) WHERE status IN ('active', 'paused');
CREATE INDEX idx_projects_owner ON projects(owner_agent_id);
CREATE INDEX idx_projects_tags ON projects USING GIN(tags);
CREATE INDEX idx_projects_activity ON projects(last_activity_at DESC) WHERE status = 'active';
CREATE INDEX idx_projects_metadata ON projects USING GIN(metadata);

COMMENT ON TABLE projects IS 'Multi-project support with lifecycle management and retention policies';
COMMENT ON COLUMN projects.metadata IS 'Flexible metadata: category, priority, team, custom fields';

-- ----------------------------------------------------------------------------
-- Project Access - Multi-agent collaboration
-- ----------------------------------------------------------------------------
CREATE TABLE project_access (
  access_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  agent_id UUID NOT NULL,  -- FK added later

  -- Permissions
  role project_role NOT NULL,
  can_write BOOLEAN NOT NULL DEFAULT true,
  can_delete BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by UUID,  -- FK added later

  CONSTRAINT unique_project_agent UNIQUE (project_id, agent_id)
);

CREATE INDEX idx_project_access_agent ON project_access(agent_id);
CREATE INDEX idx_project_access_project ON project_access(project_id);
CREATE INDEX idx_project_access_role ON project_access(role);

COMMENT ON TABLE project_access IS 'Multi-agent collaboration with role-based access control';

-- ----------------------------------------------------------------------------
-- Cleanup Jobs - Automated maintenance
-- ----------------------------------------------------------------------------
CREATE TABLE cleanup_jobs (
  job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Job type
  job_type cleanup_job_type NOT NULL,

  -- Target
  target_type VARCHAR(50),
  target_id UUID,

  -- Criteria
  criteria JSONB NOT NULL,

  -- Execution
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Results
  items_processed INTEGER DEFAULT 0,
  items_deleted INTEGER DEFAULT 0,
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cleanup_status ON cleanup_jobs(status, scheduled_at);
CREATE INDEX idx_cleanup_type ON cleanup_jobs(job_type, status);
CREATE INDEX idx_cleanup_target ON cleanup_jobs(target_type, target_id);

COMMENT ON TABLE cleanup_jobs IS 'Automated cleanup and maintenance job tracking';
COMMENT ON COLUMN cleanup_jobs.criteria IS 'Job criteria: {"older_than_days": 90, "status": "abandoned"}';

\echo 'Project management tables created'
\echo ''

-- ============================================================================
-- STEP 4: AGENT REGISTRY
-- ============================================================================
\echo 'Step 4: Creating agent registry...'

-- ----------------------------------------------------------------------------
-- MCP Agents
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
CREATE INDEX idx_agents_type ON mcp_agents(agent_type);

COMMENT ON TABLE mcp_agents IS 'Registry of all MCP agents in the distributed ecosystem';

-- Add foreign key constraints to projects/project_access now that mcp_agents exists
ALTER TABLE projects ADD CONSTRAINT fk_projects_owner
  FOREIGN KEY (owner_agent_id) REFERENCES mcp_agents(agent_id) ON DELETE SET NULL;

ALTER TABLE project_access ADD CONSTRAINT fk_project_access_agent
  FOREIGN KEY (agent_id) REFERENCES mcp_agents(agent_id) ON DELETE CASCADE;

ALTER TABLE project_access ADD CONSTRAINT fk_project_access_granted_by
  FOREIGN KEY (granted_by) REFERENCES mcp_agents(agent_id) ON DELETE SET NULL;

\echo 'Agent registry created'
\echo ''

-- ============================================================================
-- STEP 5: THOUGHT STORAGE TABLES
-- ============================================================================
\echo 'Step 5: Creating thought storage tables...'

-- ----------------------------------------------------------------------------
-- Thought Sessions
-- ----------------------------------------------------------------------------
CREATE TABLE thought_sessions (
  session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE RESTRICT,

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

CREATE INDEX idx_sessions_project ON thought_sessions(project_id, status, last_activity_at DESC);
CREATE INDEX idx_sessions_agent ON thought_sessions(agent_id);
CREATE INDEX idx_sessions_status ON thought_sessions(status) WHERE status = 'active';
CREATE INDEX idx_sessions_activity ON thought_sessions(last_activity_at DESC);
CREATE INDEX idx_sessions_tags ON thought_sessions USING GIN(tags);
CREATE INDEX idx_sessions_parent ON thought_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;

COMMENT ON TABLE thought_sessions IS 'Reasoning sessions with project segregation';

-- ----------------------------------------------------------------------------
-- Structured Thoughts (Partitioned)
-- ----------------------------------------------------------------------------
CREATE TABLE structured_thoughts (
  thought_id UUID DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES mcp_agents(agent_id) ON DELETE RESTRICT,

  -- Thought content
  stage cognitive_stage NOT NULL,
  content TEXT NOT NULL,
  content_tsvector TSVECTOR,

  -- Ordering and hierarchy
  order_index INTEGER NOT NULL,
  branch_id VARCHAR(100),
  branch_root_id UUID,  -- Self-reference, added as FK after table creation
  branch_depth INTEGER DEFAULT 0 CHECK (branch_depth >= 0),

  -- Quality and metadata
  quality_score NUMERIC(3, 2) CHECK (quality_score BETWEEN 0 AND 1),
  importance importance_level DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  external_refs TEXT[] DEFAULT '{}',

  -- Metacognitive flags
  is_revision BOOLEAN DEFAULT FALSE,
  revises_thought_id UUID,  -- Self-reference, added as FK after table creation
  needs_follow_up BOOLEAN DEFAULT FALSE,
  next_stages cognitive_stage[] DEFAULT '{}',

  -- Additional metadata
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_order CHECK (order_index > 0),
  CONSTRAINT valid_references CHECK (cardinality(external_refs) <= 100),
  PRIMARY KEY (thought_id, created_at)
) PARTITION BY RANGE (created_at);

-- Add self-referencing foreign keys
ALTER TABLE structured_thoughts ADD CONSTRAINT fk_thoughts_branch_root
  FOREIGN KEY (branch_root_id, created_at) REFERENCES structured_thoughts(thought_id, created_at) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE structured_thoughts ADD CONSTRAINT fk_thoughts_revises
  FOREIGN KEY (revises_thought_id, created_at) REFERENCES structured_thoughts(thought_id, created_at) DEFERRABLE INITIALLY DEFERRED;

-- Create partitions (2025 monthly partitions)
CREATE TABLE structured_thoughts_2025_01 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE structured_thoughts_2025_02 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

CREATE TABLE structured_thoughts_2025_03 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

CREATE TABLE structured_thoughts_2025_04 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

CREATE TABLE structured_thoughts_2025_05 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');

CREATE TABLE structured_thoughts_2025_06 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');

CREATE TABLE structured_thoughts_2025_07 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');

CREATE TABLE structured_thoughts_2025_08 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE TABLE structured_thoughts_2025_09 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE structured_thoughts_2025_10 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE structured_thoughts_2025_11 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

CREATE TABLE structured_thoughts_2025_12 PARTITION OF structured_thoughts
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Create default partition for future data
CREATE TABLE structured_thoughts_default PARTITION OF structured_thoughts DEFAULT;

-- Indexes on partitioned table (applied to all partitions)
CREATE INDEX ON structured_thoughts(project_id, session_id, order_index);
CREATE INDEX ON structured_thoughts(project_id, quality_score DESC) WHERE quality_score IS NOT NULL;
CREATE INDEX ON structured_thoughts(project_id, stage);
CREATE INDEX ON structured_thoughts(project_id, created_at DESC, quality_score DESC);
CREATE INDEX ON structured_thoughts(agent_id);
CREATE INDEX ON structured_thoughts(stage);
CREATE INDEX ON structured_thoughts(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX ON structured_thoughts(quality_score DESC NULLS LAST);
CREATE INDEX ON structured_thoughts(importance);
CREATE INDEX ON structured_thoughts USING GIN(tags);
CREATE INDEX ON structured_thoughts USING GIN(content_tsvector);
CREATE INDEX ON structured_thoughts(revises_thought_id, created_at) WHERE is_revision = TRUE;
CREATE INDEX ON structured_thoughts(needs_follow_up, importance, project_id) WHERE needs_follow_up = TRUE;

COMMENT ON TABLE structured_thoughts IS 'Core thought records with project segregation and partitioning';

-- ----------------------------------------------------------------------------
-- Branch Analytics
-- ----------------------------------------------------------------------------
CREATE TABLE branch_analytics (
  branch_id VARCHAR(100) PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,

  -- Branch metadata
  root_thought_id UUID,  -- FK added later via trigger
  branch_from_thought_id UUID,  -- FK added later via trigger

  -- Metrics
  thought_count INTEGER NOT NULL DEFAULT 0,
  max_depth INTEGER NOT NULL DEFAULT 0,
  average_quality NUMERIC(3, 2) CHECK (average_quality BETWEEN 0 AND 1),
  health branch_health NOT NULL DEFAULT 'forming',

  -- Activity tracking
  last_thought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  staleness_minutes INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_branch_project ON branch_analytics(project_id);
CREATE INDEX idx_branch_session ON branch_analytics(session_id);
CREATE INDEX idx_branch_health ON branch_analytics(health);
CREATE INDEX idx_branch_staleness ON branch_analytics(staleness_minutes) WHERE health != 'healthy';
CREATE INDEX idx_branch_project_health ON branch_analytics(project_id, health, staleness_minutes);

COMMENT ON TABLE branch_analytics IS 'Branch analytics with project context';

\echo 'Thought storage tables created (partitioned)'
\echo ''

-- ============================================================================
-- STEP 6: FEEDBACK AND RELATIONSHIP TABLES
-- ============================================================================
\echo 'Step 6: Creating feedback and relationship tables...'

-- ----------------------------------------------------------------------------
-- Feedback Signals
-- ----------------------------------------------------------------------------
CREATE TABLE feedback_signals (
  signal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES thought_sessions(session_id) ON DELETE CASCADE,
  thought_id UUID,  -- FK added via trigger due to partitioning

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

CREATE INDEX idx_signals_project ON feedback_signals(project_id, created_at DESC);
CREATE INDEX idx_signals_session ON feedback_signals(session_id, created_at DESC);
CREATE INDEX idx_signals_thought ON feedback_signals(thought_id) WHERE thought_id IS NOT NULL;
CREATE INDEX idx_signals_type_severity ON feedback_signals(signal_type, severity);
CREATE INDEX idx_signals_unacknowledged ON feedback_signals(acknowledged, severity, project_id) WHERE NOT acknowledged;

COMMENT ON TABLE feedback_signals IS 'Metacognitive feedback with project context';

-- ----------------------------------------------------------------------------
-- Thought Relationships
-- ----------------------------------------------------------------------------
CREATE TABLE thought_relationships (
  relationship_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  source_thought_id UUID NOT NULL,  -- FK added via trigger
  target_thought_id UUID NOT NULL,  -- FK added via trigger

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

CREATE INDEX idx_relationships_project ON thought_relationships(project_id);
CREATE INDEX idx_relationships_source ON thought_relationships(source_thought_id);
CREATE INDEX idx_relationships_target ON thought_relationships(target_thought_id);
CREATE INDEX idx_relationships_type ON thought_relationships(relationship_type);
CREATE INDEX idx_relationships_strength ON thought_relationships(strength DESC NULLS LAST);

COMMENT ON TABLE thought_relationships IS 'Explicit thought relationships with project context';

\echo 'Feedback and relationship tables created'
\echo ''

-- ============================================================================
-- STEP 7: SYNC AND COMMAND TABLES
-- ============================================================================
\echo 'Step 7: Creating sync and command tables...'

-- ----------------------------------------------------------------------------
-- Sync Queue
-- ----------------------------------------------------------------------------
CREATE TABLE sync_queue (
  sync_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(project_id) ON DELETE CASCADE,
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
CREATE INDEX idx_sync_project ON sync_queue(project_id);
CREATE INDEX idx_sync_agent ON sync_queue(agent_id);
CREATE INDEX idx_sync_entity ON sync_queue(entity_type, entity_id);

COMMENT ON TABLE sync_queue IS 'Synchronization queue with project context';

-- ----------------------------------------------------------------------------
-- Command Queue
-- ----------------------------------------------------------------------------
CREATE TABLE command_queue (
  job_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,

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
CREATE INDEX idx_commands_project ON command_queue(project_id);
CREATE INDEX idx_commands_target ON command_queue(target_agent_id) WHERE target_agent_id IS NOT NULL;
CREATE INDEX idx_commands_capabilities ON command_queue USING GIN(requested_capabilities);
CREATE INDEX idx_commands_timeout ON command_queue(timeout_at) WHERE status IN ('queued', 'picked', 'executing');
CREATE INDEX idx_commands_completed ON command_queue(completed_at DESC) WHERE status IN ('completed', 'failed');

COMMENT ON TABLE command_queue IS 'Distributed command queue with project context';

\echo 'Sync and command tables created'
\echo ''

-- ============================================================================
-- STEP 8: AUDIT LOG (PARTITIONED)
-- ============================================================================
\echo 'Step 8: Creating audit log (partitioned)...'

-- ----------------------------------------------------------------------------
-- Audit Log
-- ----------------------------------------------------------------------------
CREATE TABLE audit_log (
  audit_id UUID DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(project_id) ON DELETE SET NULL,
  agent_id UUID REFERENCES mcp_agents(agent_id) ON DELETE SET NULL,

  -- Event details
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50) NOT NULL CHECK (event_category IN (
    'thought',
    'session',
    'command',
    'sync',
    'project',
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

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, created_at)
) PARTITION BY RANGE (created_at);

-- Create weekly partitions for 2025
CREATE TABLE audit_log_2025_w01 PARTITION OF audit_log
  FOR VALUES FROM ('2025-01-01') TO ('2025-01-08');
CREATE TABLE audit_log_2025_w02 PARTITION OF audit_log
  FOR VALUES FROM ('2025-01-08') TO ('2025-01-15');
CREATE TABLE audit_log_2025_w03 PARTITION OF audit_log
  FOR VALUES FROM ('2025-01-15') TO ('2025-01-22');
CREATE TABLE audit_log_2025_w04 PARTITION OF audit_log
  FOR VALUES FROM ('2025-01-22') TO ('2025-01-29');
CREATE TABLE audit_log_2025_w05 PARTITION OF audit_log
  FOR VALUES FROM ('2025-01-29') TO ('2025-02-05');

-- Continue for more weeks...
-- Note: In production, use a script to auto-create partitions monthly

-- Default partition
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

-- Indexes
CREATE INDEX ON audit_log(project_id, created_at DESC);
CREATE INDEX ON audit_log(agent_id, created_at DESC);
CREATE INDEX ON audit_log(created_at DESC);
CREATE INDEX ON audit_log(event_category, event_type);
CREATE INDEX ON audit_log(entity_type, entity_id);
CREATE INDEX ON audit_log USING GIN(details);

COMMENT ON TABLE audit_log IS 'Comprehensive audit trail with partitioning and project context';

\echo 'Audit log created (partitioned)'
\echo ''

-- ============================================================================
-- STEP 9: TRIGGERS
-- ============================================================================
\echo 'Step 9: Creating triggers...'

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

CREATE TRIGGER tr_projects_updated_at
  BEFORE UPDATE ON projects
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
  -- Update session metrics
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

  -- Update project activity
  UPDATE projects
  SET last_activity_at = now()
  WHERE project_id = NEW.project_id;

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
      project_id,
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
      NEW.project_id,
      NEW.session_id,
      NEW.branch_root_id,
      1,
      NEW.branch_depth,
      NEW.quality_score,
      NEW.created_at,
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
      last_thought_at = now(),
      staleness_minutes = 0;
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
      project_id,
      agent_id,
      event_type,
      event_category,
      entity_type,
      entity_id,
      details
    ) VALUES (
      NEW.project_id,
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
      project_id,
      agent_id,
      event_type,
      event_category,
      entity_type,
      entity_id,
      details
    ) VALUES (
      NEW.project_id,
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

\echo 'Triggers created'
\echo ''

-- ============================================================================
-- STEP 10: FUNCTIONS
-- ============================================================================
\echo 'Step 10: Creating functions...'

-- ----------------------------------------------------------------------------
-- Search Thoughts (Full-text search with project scope)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION search_thoughts(
  p_project_id UUID,
  search_query TEXT,
  p_min_quality NUMERIC DEFAULT 0.0,
  limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
  thought_id UUID,
  session_id UUID,
  content TEXT,
  stage cognitive_stage,
  quality_score NUMERIC,
  rank REAL,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.thought_id,
    t.session_id,
    t.content,
    t.stage,
    t.quality_score,
    ts_rank(t.content_tsvector, plainto_tsquery('english', search_query)) AS rank,
    t.created_at
  FROM structured_thoughts t
  WHERE t.project_id = p_project_id
  AND t.content_tsvector @@ plainto_tsquery('english', search_query)
  AND (t.quality_score >= p_min_quality OR t.quality_score IS NULL)
  ORDER BY rank DESC, t.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION search_thoughts IS 'Full-text search with project scope and quality filter';

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
-- Get Session Tree (Recursive)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_session_tree(
  p_root_session_id UUID
)
RETURNS TABLE (
  session_id UUID,
  parent_session_id UUID,
  depth INTEGER,
  path UUID[],
  total_thoughts INTEGER,
  title VARCHAR(500)
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE session_tree AS (
    -- Base case
    SELECT
      ts.session_id,
      ts.parent_session_id,
      0 as depth,
      ARRAY[ts.session_id] as path,
      ts.total_thoughts,
      ts.title
    FROM thought_sessions ts
    WHERE ts.session_id = p_root_session_id

    UNION ALL

    -- Recursive case
    SELECT
      ts.session_id,
      ts.parent_session_id,
      st.depth + 1,
      st.path || ts.session_id,
      ts.total_thoughts,
      ts.title
    FROM thought_sessions ts
    INNER JOIN session_tree st ON ts.parent_session_id = st.session_id
  )
  SELECT * FROM session_tree ORDER BY depth, session_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_session_tree IS 'Recursive session hierarchy traversal';

-- ----------------------------------------------------------------------------
-- Soft Delete Project
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION soft_delete_project(
  p_project_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Update project status
  UPDATE projects
  SET status = 'deleted', deleted_at = now()
  WHERE project_id = p_project_id;

  -- Log audit
  INSERT INTO audit_log (project_id, event_type, event_category, details)
  VALUES (
    p_project_id,
    'project_deleted',
    'project',
    jsonb_build_object('reason', p_reason, 'deleted_at', now())
  );

  -- Return summary
  SELECT jsonb_build_object(
    'project_id', p_project_id,
    'thoughts_count', (SELECT COUNT(*) FROM structured_thoughts WHERE project_id = p_project_id),
    'sessions_count', (SELECT COUNT(*) FROM thought_sessions WHERE project_id = p_project_id),
    'status', 'deleted'
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION soft_delete_project IS 'Soft-delete project (mark as deleted, preserve data)';

-- ----------------------------------------------------------------------------
-- Hard Delete Project
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION hard_delete_project(
  p_project_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Get counts before deletion
  SELECT jsonb_build_object(
    'thoughts_deleted', (SELECT COUNT(*) FROM structured_thoughts WHERE project_id = p_project_id),
    'sessions_deleted', (SELECT COUNT(*) FROM thought_sessions WHERE project_id = p_project_id)
  ) INTO v_result;

  -- Delete project (cascade handles thoughts/sessions)
  DELETE FROM projects WHERE project_id = p_project_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION hard_delete_project IS 'Permanently delete project and all associated data';

-- ----------------------------------------------------------------------------
-- Archive Old Projects
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION archive_old_projects(
  p_older_than_days INTEGER DEFAULT 90
)
RETURNS JSONB AS $$
DECLARE
  v_archived INTEGER := 0;
BEGIN
  UPDATE projects
  SET status = 'archived', archived_at = now()
  WHERE status = 'active'
  AND last_activity_at < (now() - (p_older_than_days || ' days')::INTERVAL);

  GET DIAGNOSTICS v_archived = ROW_COUNT;

  RETURN jsonb_build_object('projects_archived', v_archived);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION archive_old_projects IS 'Auto-archive projects inactive for N days';

-- ----------------------------------------------------------------------------
-- Update Branch Staleness
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_branch_staleness()
RETURNS void AS $$
BEGIN
  UPDATE branch_analytics
  SET staleness_minutes = EXTRACT(EPOCH FROM (now() - last_thought_at))::INTEGER / 60;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_branch_staleness IS 'Recalculate staleness for all branches';

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

COMMENT ON FUNCTION pick_next_command IS 'Atomically pick next command matching agent capabilities';

\echo 'Functions created'
\echo ''

-- ============================================================================
-- STEP 11: VIEWS
-- ============================================================================
\echo 'Step 11: Creating views...'

-- ----------------------------------------------------------------------------
-- Active Sessions with Summary
-- ----------------------------------------------------------------------------
CREATE VIEW v_active_sessions AS
SELECT
  s.session_id,
  s.project_id,
  p.project_name,
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
  array_agg(DISTINCT st.stage) FILTER (WHERE st.stage IS NOT NULL) AS stages_used,
  array_agg(DISTINCT unnested_tag ORDER BY unnested_tag) FILTER (WHERE unnested_tag IS NOT NULL) AS all_tags
FROM thought_sessions s
JOIN projects p ON s.project_id = p.project_id
JOIN mcp_agents a ON s.agent_id = a.agent_id
LEFT JOIN structured_thoughts st ON s.session_id = st.session_id
LEFT JOIN LATERAL unnest(st.tags) AS unnested_tag ON TRUE
WHERE s.status = 'active'
GROUP BY s.session_id, p.project_id, p.project_name, a.agent_id, a.agent_type, a.hostname;

COMMENT ON VIEW v_active_sessions IS 'Active sessions with project context and aggregated metrics';

-- ----------------------------------------------------------------------------
-- Thought Timeline with Context
-- ----------------------------------------------------------------------------
CREATE VIEW v_thought_timeline AS
SELECT
  t.thought_id,
  t.project_id,
  p.project_name,
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
JOIN projects p ON t.project_id = p.project_id
JOIN thought_sessions s ON t.session_id = s.session_id
JOIN mcp_agents a ON t.agent_id = a.agent_id
LEFT JOIN branch_analytics ba ON t.branch_id = ba.branch_id
ORDER BY t.project_id, t.session_id, t.order_index;

COMMENT ON VIEW v_thought_timeline IS 'Complete thought timeline with project and branch context';

-- ----------------------------------------------------------------------------
-- Pending Commands by Priority
-- ----------------------------------------------------------------------------
CREATE VIEW v_pending_commands AS
SELECT
  c.job_id,
  c.project_id,
  p.project_name,
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
LEFT JOIN projects p ON c.project_id = p.project_id
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

COMMENT ON VIEW v_pending_commands IS 'Pending commands with project context ordered by priority';

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

COMMENT ON VIEW v_agent_health IS 'Agent health metrics for monitoring';

-- ----------------------------------------------------------------------------
-- Project Summary
-- ----------------------------------------------------------------------------
CREATE VIEW v_project_summary AS
SELECT
  p.project_id,
  p.project_name,
  p.description,
  p.status,
  p.owner_agent_id,
  a.hostname AS owner_hostname,
  COUNT(DISTINCT ts.session_id) AS session_count,
  COUNT(DISTINCT st.thought_id) AS thought_count,
  COUNT(DISTINCT st.branch_id) FILTER (WHERE st.branch_id IS NOT NULL) AS branch_count,
  AVG(st.quality_score) AS avg_quality,
  MAX(ts.last_activity_at) AS last_activity,
  EXTRACT(EPOCH FROM (now() - MAX(ts.last_activity_at))) / 86400 AS days_since_activity,
  p.retention_days,
  p.created_at
FROM projects p
LEFT JOIN mcp_agents a ON p.owner_agent_id = a.agent_id
LEFT JOIN thought_sessions ts ON p.project_id = ts.project_id
LEFT JOIN structured_thoughts st ON ts.session_id = st.session_id
WHERE p.status IN ('active', 'paused')
GROUP BY p.project_id, p.project_name, p.description, p.status, p.owner_agent_id, a.hostname, p.retention_days, p.created_at;

COMMENT ON VIEW v_project_summary IS 'Project summary with activity metrics';

\echo 'Views created'
\echo ''

-- ============================================================================
-- STEP 12: MATERIALIZED VIEWS
-- ============================================================================
\echo 'Step 12: Creating materialized views...'

-- ----------------------------------------------------------------------------
-- Materialized Project Summary (for dashboards)
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW mv_project_dashboard AS
SELECT
  p.project_id,
  p.project_name,
  p.status,
  COUNT(DISTINCT ts.session_id) AS session_count,
  COUNT(DISTINCT st.thought_id) AS thought_count,
  COUNT(DISTINCT st.branch_id) AS branch_count,
  AVG(st.quality_score) AS avg_quality,
  MAX(ts.last_activity_at) AS last_activity,
  EXTRACT(EPOCH FROM (now() - MAX(ts.last_activity_at))) / 86400 AS days_since_activity,
  COUNT(DISTINCT fs.signal_id) FILTER (WHERE fs.severity IN ('warning', 'critical')) AS critical_signals
FROM projects p
LEFT JOIN thought_sessions ts ON p.project_id = ts.project_id
LEFT JOIN structured_thoughts st ON ts.session_id = st.session_id
LEFT JOIN feedback_signals fs ON p.project_id = fs.project_id AND NOT fs.acknowledged
WHERE p.status IN ('active', 'paused')
GROUP BY p.project_id, p.project_name, p.status;

CREATE UNIQUE INDEX ON mv_project_dashboard(project_id);
CREATE INDEX ON mv_project_dashboard(status, days_since_activity);

COMMENT ON MATERIALIZED VIEW mv_project_dashboard IS 'Materialized view for fast dashboard queries (refresh hourly)';

\echo 'Materialized views created'
\echo ''

-- ============================================================================
-- STEP 13: ROW-LEVEL SECURITY
-- ============================================================================
\echo 'Step 13: Enabling Row-Level Security...'

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE thought_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE structured_thoughts ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_signals ENABLE ROW LEVEL SECURITY;

-- Policy: Agents see only projects they own or have access to
CREATE POLICY project_access_policy ON projects
  FOR ALL
  USING (
    owner_agent_id = current_setting('app.current_agent_id', true)::UUID
    OR EXISTS (
      SELECT 1 FROM project_access pa
      WHERE pa.project_id = projects.project_id
      AND pa.agent_id = current_setting('app.current_agent_id', true)::UUID
    )
    OR current_setting('app.current_agent_id', true) IS NULL  -- Allow superuser
  );

-- Policy: Sessions belong to accessible projects
CREATE POLICY session_access_policy ON thought_sessions
  FOR ALL
  USING (
    project_id IN (SELECT project_id FROM projects)  -- RLS policy applied
    OR current_setting('app.current_agent_id', true) IS NULL
  );

-- Policy: Thoughts belong to accessible projects
CREATE POLICY thought_access_policy ON structured_thoughts
  FOR ALL
  USING (
    project_id IN (SELECT project_id FROM projects)  -- RLS policy applied
    OR current_setting('app.current_agent_id', true) IS NULL
  );

-- Policy: Feedback signals belong to accessible projects
CREATE POLICY feedback_access_policy ON feedback_signals
  FOR ALL
  USING (
    project_id IN (SELECT project_id FROM projects)  -- RLS policy applied
    OR current_setting('app.current_agent_id', true) IS NULL
  );

COMMENT ON POLICY project_access_policy ON projects IS 'Agents see only owned or granted projects';
COMMENT ON POLICY session_access_policy ON thought_sessions IS 'Sessions inherit project RLS';
COMMENT ON POLICY thought_access_policy ON structured_thoughts IS 'Thoughts inherit project RLS';
COMMENT ON POLICY feedback_access_policy ON feedback_signals IS 'Signals inherit project RLS';

\echo 'Row-Level Security enabled'
\echo ''

-- ============================================================================
-- STEP 14: INITIAL DATA
-- ============================================================================
\echo 'Step 14: Inserting seed data...'

-- Insert system agent
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

-- Insert default project
INSERT INTO projects (
  project_id,
  project_name,
  description,
  owner_agent_id,
  status,
  metadata
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'default',
  'Default project for initial thoughts and testing',
  '00000000-0000-0000-0000-000000000001',
  'active',
  '{"system": true, "description": "System default project"}'::JSONB
);

\echo 'Seed data inserted'
\echo ''

-- ============================================================================
-- STEP 15: GRANTS AND PERMISSIONS
-- ============================================================================
\echo 'Step 15: Setting up permissions...'

-- Create application role
CREATE ROLE mcp_app_role;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO mcp_app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mcp_app_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mcp_app_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO mcp_app_role;

-- Alter default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mcp_app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mcp_app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO mcp_app_role;

-- Create application user (credentials from MCP_CREDENTIALS.txt)
-- CREATE USER mcp_admin WITH PASSWORD '';
-- GRANT mcp_app_role TO mcp_admin;

\echo 'Permissions configured'
\echo ''

-- ============================================================================
-- STEP 16: MAINTENANCE CONFIGURATION
-- ============================================================================
\echo 'Step 16: Configuring maintenance...'

-- Enable auto-vacuum for all tables (skip partitioned tables - must be set on leaf partitions)
ALTER TABLE mcp_agents SET (autovacuum_vacuum_scale_factor = 0.05);
-- ALTER TABLE structured_thoughts SET (autovacuum_vacuum_scale_factor = 0.05); -- Partitioned table
ALTER TABLE command_queue SET (autovacuum_vacuum_scale_factor = 0.1);
-- ALTER TABLE audit_log SET (autovacuum_vacuum_scale_factor = 0.2); -- Partitioned table
ALTER TABLE projects SET (autovacuum_vacuum_scale_factor = 0.1);

-- Add table comments
COMMENT ON DATABASE mcp_ecosystem IS 'MCP Ecosystem Database v0.2.1 - Optimized Multi-Project Support';

\echo 'Maintenance configured'
\echo ''

-- ============================================================================
-- STEP 17: VALIDATION
-- ============================================================================
\echo 'Step 17: Validating installation...'

DO $$
DECLARE
  table_count INTEGER;
  function_count INTEGER;
  index_count INTEGER;
  view_count INTEGER;
BEGIN
  -- Count tables
  SELECT COUNT(*) INTO table_count
  FROM pg_tables
  WHERE schemaname = 'public'
  AND tablename NOT LIKE '%_2025%'  -- Exclude partitions
  AND tablename NOT LIKE 'audit_log_2025%';

  -- Count functions
  SELECT COUNT(*) INTO function_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
  AND proname NOT LIKE 'pg_%';

  -- Count indexes
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public';

  -- Count views
  SELECT COUNT(*) INTO view_count
  FROM pg_views
  WHERE schemaname = 'public';

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Installation Summary:';
  RAISE NOTICE '  Tables: % (expected 14+)', table_count;
  RAISE NOTICE '  Functions: % (expected 10+)', function_count;
  RAISE NOTICE '  Indexes: % (expected 80+)', index_count;
  RAISE NOTICE '  Views: % (expected 5+)', view_count;
  RAISE NOTICE '========================================';

  IF table_count < 14 THEN
    RAISE EXCEPTION 'Installation incomplete - expected at least 14 tables, got %', table_count;
  END IF;

  IF function_count < 10 THEN
    RAISE WARNING 'Low function count - expected at least 10, got %', function_count;
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
\echo 'Database: mcp_ecosystem v0.2.1'
\echo 'Features:'
\echo '  - Multi-project support with cascade cleanup'
\echo '  - Table partitioning (thoughts, audit log)'
\echo '  - Row-Level Security (RLS) for multi-tenant isolation'
\echo '  - Project-scoped search and queries'
\echo '  - Automated cleanup functions'
\echo '  - Materialized views for dashboards'
\echo ''
\echo 'Usage Examples:'
\echo '  - Create project: INSERT INTO projects (project_name) VALUES (''my-project'');'
\echo '  - Search thoughts: SELECT * FROM search_thoughts(''<project-id>'', ''query'', 0.7, 50);'
\echo '  - Get session tree: SELECT * FROM get_session_tree(''<session-id>'');'
\echo '  - Soft delete: SELECT soft_delete_project(''<project-id>'', ''reason'');'
\echo '  - Hard delete: SELECT hard_delete_project(''<project-id>'');'
\echo '  - Archive old: SELECT archive_old_projects(90);'
\echo ''
\echo 'Configuration Required:'
\echo '  1. Set agent context: SET app.current_agent_id = ''<agent-uuid>'';'
\echo '  2. Refresh materialized views: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_project_dashboard;'
\echo '  3. Setup cron for partition creation (monthly)'
\echo '  4. Setup cron for cleanup jobs (daily)'
\echo ''

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
