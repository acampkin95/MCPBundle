-- Perplexity MCP Database Schema Extension
-- Add to mcp_ecosystem database

-- Research results storage
CREATE TABLE IF NOT EXISTS perplexity_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('acdev', 'public')),
  tool_name TEXT NOT NULL,
  query_content TEXT,
  response JSONB NOT NULL,
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  cost_usd FLOAT NOT NULL DEFAULT 0.0,
  citations JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_perplexity_research_mode ON perplexity_research(mode);
CREATE INDEX idx_perplexity_research_tool ON perplexity_research(tool_name);
CREATE INDEX idx_perplexity_research_created ON perplexity_research(created_at DESC);
CREATE INDEX idx_perplexity_research_confidence ON perplexity_research(confidence_score DESC);

-- Cost tracking per day per mode
CREATE TABLE IF NOT EXISTS perplexity_cost_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('acdev', 'public')),
  total_requests INT DEFAULT 0,
  total_cost_usd FLOAT DEFAULT 0.0,
  budget_limit_usd FLOAT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, mode)
);

CREATE INDEX idx_cost_tracking_date ON perplexity_cost_tracking(date DESC);
CREATE INDEX idx_cost_tracking_mode ON perplexity_cost_tracking(mode);

-- Circuit breaker state tracking
CREATE TABLE IF NOT EXISTS perplexity_circuit_breaker_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state TEXT NOT NULL CHECK (state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
  failure_count INT DEFAULT 0,
  last_failure_time TIMESTAMPTZ,
  last_success_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rate limiting state (per mode)
CREATE TABLE IF NOT EXISTS perplexity_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('acdev', 'public')),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mode, window_start)
);

CREATE INDEX idx_rate_limits_mode_window ON perplexity_rate_limits(mode, window_start DESC);

-- Business opportunities identified (for BI tools)
CREATE TABLE IF NOT EXISTS business_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  passive_income_score FLOAT CHECK (passive_income_score >= 0 AND passive_income_score <= 1),
  automation_potential FLOAT CHECK (automation_potential >= 0 AND automation_potential <= 1),
  market_size_estimate FLOAT,
  research_data JSONB NOT NULL,
  status TEXT DEFAULT 'identified' CHECK (status IN ('identified', 'evaluating', 'approved', 'rejected', 'implemented')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_opportunities_score ON business_opportunities(passive_income_score DESC);
CREATE INDEX idx_opportunities_status ON business_opportunities(status);
CREATE INDEX idx_opportunities_created ON business_opportunities(created_at DESC);

-- Query deduplication tracking (loop prevention)
CREATE TABLE IF NOT EXISTS perplexity_query_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash TEXT NOT NULL,
  query_content TEXT,
  mode TEXT NOT NULL,
  tool_name TEXT,
  occurrence_count INT DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_query_history_hash ON perplexity_query_history(query_hash);
CREATE INDEX idx_query_history_last_seen ON perplexity_query_history(last_seen_at DESC);

-- Auto-update timestamps trigger
CREATE OR REPLACE FUNCTION update_perplexity_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER perplexity_research_update
  BEFORE UPDATE ON perplexity_research
  FOR EACH ROW
  EXECUTE FUNCTION update_perplexity_timestamp();

CREATE TRIGGER perplexity_cost_tracking_update
  BEFORE UPDATE ON perplexity_cost_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_perplexity_timestamp();

CREATE TRIGGER business_opportunities_update
  BEFORE UPDATE ON business_opportunities
  FOR EACH ROW
  EXECUTE FUNCTION update_perplexity_timestamp();

-- Function to get daily cost for a mode
CREATE OR REPLACE FUNCTION get_daily_perplexity_cost(p_mode TEXT, p_date DATE DEFAULT CURRENT_DATE)
RETURNS FLOAT AS $$
DECLARE
  v_cost FLOAT;
BEGIN
  SELECT COALESCE(total_cost_usd, 0.0)
  INTO v_cost
  FROM perplexity_cost_tracking
  WHERE mode = p_mode AND date = p_date;

  RETURN COALESCE(v_cost, 0.0);
END;
$$ LANGUAGE plpgsql;

-- Function to check if budget exceeded
CREATE OR REPLACE FUNCTION is_budget_exceeded(p_mode TEXT, p_date DATE DEFAULT CURRENT_DATE)
RETURNS BOOLEAN AS $$
DECLARE
  v_cost FLOAT;
  v_budget FLOAT;
BEGIN
  SELECT total_cost_usd, budget_limit_usd
  INTO v_cost, v_budget
  FROM perplexity_cost_tracking
  WHERE mode = p_mode AND date = p_date;

  RETURN COALESCE(v_cost, 0.0) >= COALESCE(v_budget, 999.99);
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE perplexity_research IS 'Stores all research results from Perplexity API calls';
COMMENT ON TABLE perplexity_cost_tracking IS 'Tracks daily API costs per mode for budget enforcement';
COMMENT ON TABLE business_opportunities IS 'Business opportunities identified through BI research';
COMMENT ON TABLE perplexity_query_history IS 'Query deduplication for loop prevention';
COMMENT ON COLUMN perplexity_research.confidence_score IS 'Quality/confidence score 0.0-1.0';
COMMENT ON COLUMN business_opportunities.passive_income_score IS 'Score for passive income potential 0.0-1.0';
COMMENT ON COLUMN business_opportunities.automation_potential IS 'Automation potential score 0.0-1.0';
