-- Performance Index Migration for Structural Thinking Database
-- Created: 2025-01-14
-- Purpose: Add indexes to frequently queried columns for improved query performance

-- ============================================================================
-- PostgreSQL Indexes
-- ============================================================================

-- Composite index for session queries with filtering
CREATE INDEX IF NOT EXISTS idx_thoughts_session_stage
ON structured_thoughts(session_id, stage);

-- Quality score for sorting and filtering high-quality thoughts
CREATE INDEX IF NOT EXISTS idx_thoughts_quality_score
ON structured_thoughts(quality_score DESC)
WHERE quality_score IS NOT NULL;

-- Created timestamp for time-based queries (DESC for recent-first)
CREATE INDEX IF NOT EXISTS idx_thoughts_created_at
ON structured_thoughts(created_at DESC);

-- Updated timestamp for tracking modifications
CREATE INDEX IF NOT EXISTS idx_thoughts_updated_at
ON structured_thoughts(updated_at DESC)
WHERE updated_at IS NOT NULL;

-- Session status for filtering active/completed sessions
CREATE INDEX IF NOT EXISTS idx_sessions_status
ON thought_sessions(last_active_at DESC);

-- Project-based queries
CREATE INDEX IF NOT EXISTS idx_thoughts_project_id
ON structured_thoughts(project_id)
WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_project_id
ON thought_sessions(project_id)
WHERE project_id IS NOT NULL;

-- Parent-child thought relationships
CREATE INDEX IF NOT EXISTS idx_thoughts_parent
ON structured_thoughts(parent_thought_id)
WHERE parent_thought_id IS NOT NULL;

-- ============================================================================
-- Full-Text Search Index (PostgreSQL)
-- ============================================================================

-- Full-text search on thought content (English language)
CREATE INDEX IF NOT EXISTS idx_thoughts_fts
ON structured_thoughts
USING GIN(to_tsvector('english', content));

-- Full-text search on session origin
CREATE INDEX IF NOT EXISTS idx_sessions_fts
ON thought_sessions
USING GIN(to_tsvector('english', origin));

-- ============================================================================
-- JSONB Indexes for Metadata (PostgreSQL)
-- ============================================================================

-- GIN index for JSONB metadata queries
CREATE INDEX IF NOT EXISTS idx_thoughts_metadata_gin
ON structured_thoughts
USING GIN(metadata jsonb_path_ops)
WHERE metadata IS NOT NULL;

-- Specific metadata fields (if using PostgreSQL 12+)
-- Uncomment if you frequently query specific metadata fields:
-- CREATE INDEX IF NOT EXISTS idx_thoughts_metadata_importance
-- ON structured_thoughts((metadata->>'importance'))
-- WHERE metadata->>'importance' IS NOT NULL;

-- CREATE INDEX IF NOT EXISTS idx_thoughts_metadata_tags
-- ON structured_thoughts
-- USING GIN((metadata->'tags') jsonb_path_ops)
-- WHERE metadata->'tags' IS NOT NULL;

-- ============================================================================
-- Statistics Update
-- ============================================================================

-- Update table statistics for better query planning
ANALYZE structured_thoughts;
ANALYZE thought_sessions;

-- ============================================================================
-- SQLite Indexes (for local mode)
-- ============================================================================
-- Note: These are handled programmatically in DatabaseService.ts
-- but documented here for reference:
--
-- CREATE INDEX IF NOT EXISTS idx_thoughts_session_id ON structured_thoughts(session_id);
-- CREATE INDEX IF NOT EXISTS idx_thoughts_stage ON structured_thoughts(stage);
-- CREATE INDEX IF NOT EXISTS idx_thoughts_quality_score ON structured_thoughts(quality_score);
-- CREATE INDEX IF NOT EXISTS idx_thoughts_created ON structured_thoughts(created_at DESC);
-- CREATE INDEX IF NOT EXISTS idx_sessions_created ON thought_sessions(created_at DESC);
--
-- For FTS5 full-text search (handled in SearchService):
-- CREATE VIRTUAL TABLE IF NOT EXISTS thoughts_fts USING fts5(
--   thought_id UNINDEXED,
--   content,
--   tokenize='porter'
-- );
