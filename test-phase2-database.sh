#!/bin/bash

# Phase 2: Database Health Assessment Test

set -e

echo "========================================="
echo "Phase 2: Database Health Assessment"
echo "========================================="
echo ""

SSH_CMD="sshpass -p 'C0nnaught' ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@46.250.243.123"

# Test 2.1: PostgreSQL version and uptime
echo "Test 2.1: PostgreSQL version and uptime..."
$SSH_CMD "sudo -u postgres psql -t -c 'SELECT version();'" | head -1
$SSH_CMD "sudo -u postgres psql -t -c 'SELECT pg_postmaster_start_time();'"
echo ""

# Test 2.2: Check replication status
echo "Test 2.2: Streaming replication status..."
$SSH_CMD "sudo -u postgres psql -x -c 'SELECT * FROM pg_stat_replication;'"
echo ""

# Test 2.3: Replication lag
echo "Test 2.3: Replication lag (seconds)..."
$SSH_CMD "sudo -u postgres psql -t -c \"SELECT COALESCE(extract(epoch from (now() - pg_last_xact_replay_timestamp())), 0)::int FROM pg_stat_replication LIMIT 1;\"" || echo "0 (master)"
echo ""

# Test 2.4: Database size and connections
echo "Test 2.4: Database size and active connections..."
$SSH_CMD "sudo -u postgres psql -d mcp_ecosystem -t -c 'SELECT pg_size_pretty(pg_database_size(current_database()));'"
$SSH_CMD "sudo -u postgres psql -d mcp_ecosystem -t -c 'SELECT count(*) FROM pg_stat_activity;'"
echo ""

# Test 2.5: Check mcp_ecosystem schema
echo "Test 2.5: MCP ecosystem tables..."
$SSH_CMD "sudo -u postgres psql -d mcp_ecosystem -t -c '\dt' | grep -E 'mcp_|structured_thoughts'"
echo ""

# Test 2.6: Agent registry status
echo "Test 2.6: Agent registry status..."
$SSH_CMD "sudo -u postgres psql -d mcp_ecosystem -t -c 'SELECT agent_id, agent_type, hostname, status FROM mcp_agents;'"
echo ""

# Test 2.7: Structured thoughts count
echo "Test 2.7: Structured thoughts count..."
$SSH_CMD "sudo -u postgres psql -d mcp_ecosystem -t -c 'SELECT COUNT(*) FROM structured_thoughts;'" || echo "0"
echo ""

# Test 2.8: Database health indicators
echo "Test 2.8: Health indicators..."
echo "Transaction stats:"
$SSH_CMD "sudo -u postgres psql -d mcp_ecosystem -t -c 'SELECT xact_commit, xact_rollback FROM pg_stat_database WHERE datname = current_database();'"
echo ""
echo "Cache hit ratio:"
$SSH_CMD "sudo -u postgres psql -d mcp_ecosystem -t -c 'SELECT round(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) AS cache_hit_ratio FROM pg_stat_database WHERE datname = current_database();'"
echo ""

echo "========================================="
echo "Phase 2 Summary"
echo "========================================="
echo "Test 2.1: PostgreSQL Version - COMPLETED"
echo "Test 2.2: Replication Status - COMPLETED"
echo "Test 2.3: Replication Lag - COMPLETED"
echo "Test 2.4: Database Size - COMPLETED"
echo "Test 2.5: Schema Verification - COMPLETED"
echo "Test 2.6: Agent Registry - COMPLETED"
echo "Test 2.7: Structured Thoughts - COMPLETED"
echo "Test 2.8: Health Indicators - COMPLETED"
echo ""
