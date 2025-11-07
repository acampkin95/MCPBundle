-- ============================================================================
-- MCP Ecosystem Database Migration: v0.1 → v0.2
-- ============================================================================
-- Purpose: Add enhanced structured thinking capabilities to existing schema
-- Target: VMI01 (46.250.243.123) - mcp_ecosystem database
-- Date: 2025-11-07
-- Estimated Duration: 10-15 minutes
-- ============================================================================
--
-- IMPORTANT: This migration is NON-DESTRUCTIVE
-- - No existing data will be lost
-- - All existing agents continue to work
-- - New features are additive only
--
-- Pre-flight Checklist:
-- ✅ Backup completed: pg_dump -Fc mcp_ecosystem
-- ✅ Current PostgreSQL version: 16+
-- ✅ Current schema version: 0.1
-- ✅ All MCP services stopped
--
-- ============================================================================

\echo '========================================='
\echo 'MCP Ecosystem Migration: v0.1 → v0.2'
\echo 'Starting at:' `date`
\echo '========================================='
\echo ''

BEGIN;

-- ============================================================================
-- STEP 1: Create Backup Point
-- ============================================================================
\echo 'Step 1: Creating backup point...'

CREATE SCHEMA IF NOT EXISTS migration_backup;

-- Save current counts for validation
CREATE TABLE IF NOT EXISTS migration_backup.pre_migration_counts AS
SELECT
  'thoughts' as table_name,
  COUNT(*) as row_count,
  now() as captured_at
FROM structured_thoughts
UNION ALL
SELECT 'sessions', COUNT(*), now() FROM thought_sessions
UNION ALL
SELECT 'agents', COUNT(*), now() FROM mcp_agents;

\echo 'Backup point created'
\echo ''

-- ============================================================================
-- STEP 2: Create New ENUM Types
-- ============================================================================
\echo 'Step 2: Creating new ENUM types...'

-- Branch health enum
DO $$ BEGIN
  CREATE TYPE branch_health AS ENUM (
    'forming',
    'healthy',
    'stagnant',
    'at_risk',
    'unknown'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Feedback signal types
DO $$ BEGIN
  CREATE TYPE feedback_signal_type AS ENUM (
    'stage_dwell',
    'quality_drop',
    'repetition',
    'branch_health',
    'context_shift',
    'convergence'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Feedback severity
DO $$ BEGIN
  CREATE TYPE feedback_severity AS ENUM (
    'info',
    'notice',
    'warning',
    'critical'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Sync status
DO $$ BEGIN
  CREATE TYPE sync_status AS ENUM (
    'pending',
    'synced',
    'conflict',
    'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

\echo 'ENUM types created'
\echo ''

-- ============================================================================
-- STEP 3: Alter Existing Tables (Non-Destructive)
-- ============================================================================
\echo 'Step 3: Enhancing structured_thoughts table...'

-- Add new columns to structured_thoughts (if not exists)
ALTER TABLE structured_thoughts
ADD COLUMN IF NOT EXISTS content_tsvector TSVECTOR,
ADD COLUMN IF NOT EXISTS branch_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS branch_root_id UUID REFERENCES structured_thoughts(id),
ADD COLUMN IF NOT EXISTS branch_depth INTEGER DEFAULT 0 CHECK (branch_depth >= 0),
ADD COLUMN IF NOT EXISTS is_revision BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS revises_thought_id UUID REFERENCES structured_thoughts(id),
ADD COLUMN IF NOT EXISTS next_stages TEXT[];

-- Add new columns to thought_sessions
ALTER TABLE thought_sessions
ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES thought_sessions(session_id),
ADD COLUMN IF NOT EXISTS total_branches INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_quality NUMERIC(3, 2) CHECK (average_quality BETWEEN 0 AND 1);

\echo 'Existing tables enhanced'
\echo ''

-- ============================================================================
-- STEP 4: Create New Tables
-- ============================================================================
\echo 'Step 4: Creating new tables...'

-- ----------------------------------------------------------------------------
-- Thought Branches Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS thought_branches (
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
  staleness_minutes INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (now() - last_thought_at)) / 60
  ) STORED,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_session ON thought_branches(session_id);
CREATE INDEX IF NOT EXISTS idx_branch_health ON thought_branches(health);
CREATE INDEX IF NOT EXISTS idx_branch_staleness ON thought_branches(staleness_minutes) WHERE health != 'healthy';

COMMENT ON TABLE thought_branches IS 'Branch analytics for parallel reasoning paths';

-- ----------------------------------------------------------------------------
-- Feedback Signals Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback_signals (
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

CREATE INDEX IF NOT EXISTS idx_signals_session ON feedback_signals(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_thought ON feedback_signals(thought_id) WHERE thought_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_type_severity ON feedback_signals(signal_type, severity);
CREATE INDEX IF NOT EXISTS idx_signals_unacknowledged ON feedback_signals(acknowledged, severity) WHERE NOT acknowledged;

COMMENT ON TABLE feedback_signals IS 'Metacognitive feedback signals for reasoning quality';

-- ----------------------------------------------------------------------------
-- Thought Relationships Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS thought_relationships (
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

CREATE INDEX IF NOT EXISTS idx_relationships_source ON thought_relationships(source_thought_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON thought_relationships(target_thought_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON thought_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_strength ON thought_relationships(strength DESC NULLS LAST);

COMMENT ON TABLE thought_relationships IS 'Explicit semantic relationships between thoughts';

-- ----------------------------------------------------------------------------
-- Thought Sync Queue Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS thought_sync_queue (
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

CREATE INDEX IF NOT EXISTS idx_sync_status ON thought_sync_queue(status, next_retry_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_sync_agent ON thought_sync_queue(agent_id);
CREATE INDEX IF NOT EXISTS idx_sync_entity ON thought_sync_queue(entity_type, entity_id);

COMMENT ON TABLE thought_sync_queue IS 'Synchronization queue for distributed thought system';

\echo 'New tables created (4 tables)'
\echo ''

-- ============================================================================
-- STEP 5: Create New Indexes on Existing Tables
-- ============================================================================
\echo 'Step 5: Creating performance indexes...'

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_thoughts_fts
ON structured_thoughts USING GIN(content_tsvector);

-- Branch indexes
CREATE INDEX IF NOT EXISTS idx_thoughts_branch
ON structured_thoughts(branch_id) WHERE branch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_thoughts_branch_root
ON structured_thoughts(branch_root_id) WHERE branch_root_id IS NOT NULL;

-- Revision indexes
CREATE INDEX IF NOT EXISTS idx_thoughts_revision
ON structured_thoughts(revises_thought_id) WHERE is_revision = TRUE;

-- Session parent index
CREATE INDEX IF NOT EXISTS idx_sessions_parent
ON thought_sessions(parent_session_id) WHERE parent_session_id IS NOT NULL;

\echo 'Performance indexes created'
\echo ''

-- ============================================================================
-- STEP 6: Create/Update Functions
-- ============================================================================
\echo 'Step 6: Creating enhanced functions...'

-- ----------------------------------------------------------------------------
-- Update tsvector trigger function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_thought_tsvector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_tsvector = to_tsvector('english', NEW.thought);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS tr_thoughts_tsvector ON structured_thoughts;

CREATE TRIGGER tr_thoughts_tsvector
  BEFORE INSERT OR UPDATE OF thought ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_thought_tsvector();

-- ----------------------------------------------------------------------------
-- Update session metrics function (enhanced)
-- ----------------------------------------------------------------------------
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

-- Recreate trigger
DROP TRIGGER IF EXISTS tr_thoughts_update_session ON structured_thoughts;

CREATE TRIGGER tr_thoughts_update_session
  AFTER INSERT OR UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_session_metrics();

-- ----------------------------------------------------------------------------
-- Update branch analytics function
-- ----------------------------------------------------------------------------
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
      last_thought_at
    )
    VALUES (
      NEW.branch_id,
      NEW.session_id,
      NEW.branch_root_id,
      1,
      NEW.branch_depth,
      NEW.quality_score,
      NEW.timestamp::TIMESTAMPTZ
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
      updated_at = now();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS tr_thoughts_update_branch ON structured_thoughts;

CREATE TRIGGER tr_thoughts_update_branch
  AFTER INSERT OR UPDATE ON structured_thoughts
  FOR EACH ROW EXECUTE FUNCTION update_branch_analytics();

-- ----------------------------------------------------------------------------
-- Search thoughts function
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Get thought branch function
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- Get branch health function
-- ----------------------------------------------------------------------------
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

\echo 'Functions created (5 functions)'
\echo ''

-- ============================================================================
-- STEP 7: Populate tsvector for Existing Thoughts
-- ============================================================================
\echo 'Step 7: Populating full-text search vectors...'

UPDATE structured_thoughts
SET content_tsvector = to_tsvector('english', thought)
WHERE content_tsvector IS NULL;

\echo 'Full-text search vectors populated'
\echo ''

-- ============================================================================
-- STEP 8: Create Views
-- ============================================================================
\echo 'Step 8: Creating helper views...'

-- Thought timeline view with branch context
CREATE OR REPLACE VIEW v_thought_timeline_v2 AS
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
CREATE OR REPLACE VIEW v_branch_summary AS
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

\echo 'Views created (2 views)'
\echo ''

-- ============================================================================
-- STEP 9: Update Metadata and Version
-- ============================================================================
\echo 'Step 9: Updating database metadata...'

-- Update database comment with new version
COMMENT ON DATABASE mcp_ecosystem IS 'MCP Ecosystem Database - Version 0.2.0 - Enhanced Structured Thinking';

-- Create version tracking table if it doesn't exist
CREATE TABLE IF NOT EXISTS schema_version (
  version VARCHAR(20) PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by VARCHAR(255) NOT NULL,
  migration_duration INTERVAL
);

-- Record migration
INSERT INTO schema_version (version, description, applied_by)
VALUES ('0.2.0', 'Enhanced structured thinking with branches, feedback signals, and relationships', current_user)
ON CONFLICT (version) DO NOTHING;

\echo 'Metadata updated'
\echo ''

-- ============================================================================
-- STEP 10: Validation
-- ============================================================================
\echo 'Step 10: Validating migration...'

-- Create validation results table
CREATE TEMP TABLE validation_results (
  check_name TEXT,
  expected INTEGER,
  actual INTEGER,
  status TEXT
);

-- Count new tables
INSERT INTO validation_results
SELECT
  'New tables created' as check_name,
  4 as expected,
  COUNT(*) as actual,
  CASE WHEN COUNT(*) = 4 THEN 'PASS' ELSE 'FAIL' END as status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('thought_branches', 'feedback_signals', 'thought_relationships', 'thought_sync_queue');

-- Count new columns on structured_thoughts
INSERT INTO validation_results
SELECT
  'New columns on structured_thoughts' as check_name,
  7 as expected,
  COUNT(*) as actual,
  CASE WHEN COUNT(*) = 7 THEN 'PASS' ELSE 'FAIL' END as status
FROM information_schema.columns
WHERE table_name = 'structured_thoughts'
AND column_name IN ('content_tsvector', 'branch_id', 'branch_root_id',
                    'branch_depth', 'is_revision', 'revises_thought_id', 'next_stages');

-- Count new indexes
INSERT INTO validation_results
SELECT
  'New indexes created' as check_name,
  5 as expected,
  COUNT(*) as actual,
  CASE WHEN COUNT(*) >= 5 THEN 'PASS' ELSE 'FAIL' END as status
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename = 'structured_thoughts'
AND indexname IN ('idx_thoughts_fts', 'idx_thoughts_branch', 'idx_thoughts_branch_root',
                  'idx_thoughts_revision', 'idx_sessions_parent');

-- Count new functions
INSERT INTO validation_results
SELECT
  'New functions created' as check_name,
  5 as expected,
  COUNT(*) as actual,
  CASE WHEN COUNT(*) >= 5 THEN 'PASS' ELSE 'FAIL' END as status
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname IN ('search_thoughts', 'get_thought_branch', 'get_branch_health',
                'update_thought_tsvector', 'update_branch_analytics');

-- Verify no data loss
INSERT INTO validation_results
SELECT
  'No data loss' as check_name,
  (SELECT row_count FROM migration_backup.pre_migration_counts WHERE table_name = 'thoughts') as expected,
  (SELECT COUNT(*) FROM structured_thoughts) as actual,
  CASE
    WHEN (SELECT COUNT(*) FROM structured_thoughts) >=
         (SELECT row_count FROM migration_backup.pre_migration_counts WHERE table_name = 'thoughts')
    THEN 'PASS'
    ELSE 'FAIL'
  END as status;

-- Display validation results
\echo '========================================='
\echo 'Migration Validation Results:'
\echo '========================================='
SELECT * FROM validation_results ORDER BY check_name;

-- Check if all validations passed
DO $$
DECLARE
  failed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO failed_count
  FROM validation_results
  WHERE status = 'FAIL';

  IF failed_count > 0 THEN
    RAISE EXCEPTION 'Migration validation failed! % checks failed', failed_count;
  ELSE
    RAISE NOTICE 'All validation checks passed successfully!';
  END IF;
END $$;

-- ============================================================================
-- COMMIT OR ROLLBACK
-- ============================================================================

-- If we got here, all validations passed
COMMIT;

\echo ''
\echo '========================================='
\echo 'Migration completed successfully!'
\echo 'Completed at:' `date`
\echo '========================================='
\echo ''
\echo 'Post-migration steps:'
\echo '1. Verify application connectivity'
\echo '2. Test new search_thoughts function'
\echo '3. Monitor performance of new indexes'
\echo '4. Update MCP service configurations'
\echo ''
\echo 'New capabilities available:'
\echo '- Full-text search: SELECT * FROM search_thoughts(''query'', 50);'
\echo '- Branch health: SELECT * FROM get_branch_health();'
\echo '- Branch details: SELECT * FROM get_thought_branch(''branch-id'');'
\echo '- Timeline view: SELECT * FROM v_thought_timeline_v2;'
\echo '- Branch summary: SELECT * FROM v_branch_summary;'
\echo ''

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
