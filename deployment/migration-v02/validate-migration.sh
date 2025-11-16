#!/bin/bash
# ============================================================================
# MCP Ecosystem - Migration Validation Script
# ============================================================================
# Purpose: Comprehensive validation of v0.2 migration
# Version: 0.2.0
# Date: 2025-11-07
# ============================================================================

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Database configuration
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"
DB_HOST="localhost"
DB_PORT="5432"
DB_PASS=""

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_WARNING=0

# ============================================================================
# Helper Functions
# ============================================================================

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $*"
}

pass() {
    echo -e "${GREEN}✓${NC} $*"
    ((TESTS_PASSED++))
    ((TESTS_RUN++))
}

fail() {
    echo -e "${RED}✗${NC} $*"
    ((TESTS_FAILED++))
    ((TESTS_RUN++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $*"
    ((TESTS_WARNING++))
    ((TESTS_RUN++))
}

run_query() {
    PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "$1" 2>/dev/null
}

# ============================================================================
# Validation Tests
# ============================================================================

validate_schema_version() {
    log "Checking schema version..."

    VERSION=$(run_query "SELECT version FROM schema_version ORDER BY applied_at DESC LIMIT 1" || echo "ERROR")

    if [ "$VERSION" = "0.2.0" ]; then
        pass "Schema version: $VERSION"
    else
        fail "Schema version: $VERSION (expected 0.2.0)"
    fi
}

validate_new_tables() {
    log "Validating new tables..."

    local tables=(
        "thought_branches"
        "feedback_signals"
        "thought_relationships"
        "thought_sync_queue"
    )

    for table in "${tables[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM pg_tables WHERE tablename='$table'" || echo "0")
        if [ "$COUNT" = "1" ]; then
            # Check if table is accessible
            if run_query "SELECT COUNT(*) FROM $table" >/dev/null 2>&1; then
                pass "Table $table exists and is accessible"
            else
                fail "Table $table exists but is not accessible"
            fi
        else
            fail "Table $table does not exist"
        fi
    done
}

validate_new_columns() {
    log "Validating enhanced columns on existing tables..."

    # Check structured_thoughts columns
    local st_columns=(
        "content_tsvector"
        "branch_id"
        "branch_root_id"
        "branch_depth"
        "is_revision"
        "revises_thought_id"
        "next_stages"
    )

    for col in "${st_columns[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM information_schema.columns
                          WHERE table_name='structured_thoughts' AND column_name='$col'" || echo "0")
        if [ "$COUNT" = "1" ]; then
            pass "Column structured_thoughts.$col exists"
        else
            fail "Column structured_thoughts.$col missing"
        fi
    done

    # Check thought_sessions columns
    local ts_columns=(
        "parent_session_id"
        "total_branches"
        "average_quality"
    )

    for col in "${ts_columns[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM information_schema.columns
                          WHERE table_name='thought_sessions' AND column_name='$col'" || echo "0")
        if [ "$COUNT" = "1" ]; then
            pass "Column thought_sessions.$col exists"
        else
            fail "Column thought_sessions.$col missing"
        fi
    done
}

validate_new_functions() {
    log "Validating new functions..."

    local functions=(
        "search_thoughts"
        "get_thought_branch"
        "get_branch_health"
        "update_thought_tsvector"
        "update_branch_analytics"
    )

    for func in "${functions[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM pg_proc p
                          JOIN pg_namespace n ON p.pronamespace = n.oid
                          WHERE n.nspname = 'public' AND p.proname = '$func'" || echo "0")
        if [ "$COUNT" -ge "1" ]; then
            pass "Function $func exists"
        else
            fail "Function $func missing"
        fi
    done
}

validate_indexes() {
    log "Validating performance indexes..."

    local indexes=(
        "idx_thoughts_fts"
        "idx_thoughts_branch"
        "idx_thoughts_branch_root"
        "idx_thoughts_revision"
        "idx_sessions_parent"
        "idx_branch_session"
        "idx_branch_health"
        "idx_signals_session"
        "idx_relationships_source"
        "idx_sync_status"
    )

    for idx in "${indexes[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM pg_indexes
                          WHERE schemaname='public' AND indexname='$idx'" || echo "0")
        if [ "$COUNT" = "1" ]; then
            pass "Index $idx exists"
        else
            warn "Index $idx missing (non-critical)"
        fi
    done
}

validate_views() {
    log "Validating views..."

    local views=(
        "v_thought_timeline_v2"
        "v_branch_summary"
    )

    for view in "${views[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM pg_views
                          WHERE schemaname='public' AND viewname='$view'" || echo "0")
        if [ "$COUNT" = "1" ]; then
            pass "View $view exists"
        else
            warn "View $view missing (non-critical)"
        fi
    done
}

validate_triggers() {
    log "Validating triggers..."

    local triggers=(
        "tr_thoughts_tsvector"
        "tr_thoughts_update_session"
        "tr_thoughts_update_branch"
    )

    for trigger in "${triggers[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM pg_trigger
                          WHERE tgname='$trigger'" || echo "0")
        if [ "$COUNT" = "1" ]; then
            pass "Trigger $trigger exists"
        else
            fail "Trigger $trigger missing"
        fi
    done
}

test_fulltext_search() {
    log "Testing full-text search functionality..."

    # Test search function
    if run_query "SELECT COUNT(*) FROM search_thoughts('test', 1)" >/dev/null 2>&1; then
        pass "Full-text search function is callable"

        # Check if tsvector is populated
        TSVECTOR_COUNT=$(run_query "SELECT COUNT(*) FROM structured_thoughts WHERE content_tsvector IS NOT NULL" || echo "0")
        TOTAL_COUNT=$(run_query "SELECT COUNT(*) FROM structured_thoughts" || echo "0")

        if [ "$TOTAL_COUNT" -gt "0" ]; then
            if [ "$TSVECTOR_COUNT" = "$TOTAL_COUNT" ]; then
                pass "All thoughts have tsvector populated ($TSVECTOR_COUNT/$TOTAL_COUNT)"
            else
                warn "Only $TSVECTOR_COUNT/$TOTAL_COUNT thoughts have tsvector populated"
            fi
        else
            warn "No thoughts in database to test search"
        fi
    else
        fail "Full-text search function not working"
    fi
}

test_branch_functions() {
    log "Testing branch functions..."

    # Test get_branch_health
    if run_query "SELECT * FROM get_branch_health() LIMIT 1" >/dev/null 2>&1; then
        pass "get_branch_health() function works"
    else
        fail "get_branch_health() function fails"
    fi

    # Test get_thought_branch (needs a valid branch_id, so we'll test callability)
    if run_query "SELECT * FROM get_thought_branch('test-branch') LIMIT 1" >/dev/null 2>&1; then
        pass "get_thought_branch() function is callable"
    else
        fail "get_thought_branch() function not callable"
    fi
}

check_data_integrity() {
    log "Checking data integrity..."

    # Check original data preservation
    local tables=("structured_thoughts" "thought_sessions" "mcp_agents")

    for table in "${tables[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM $table" || echo "ERROR")
        if [ "$COUNT" != "ERROR" ]; then
            if [ "$COUNT" -ge "0" ]; then
                pass "Table $table has $COUNT rows (accessible)"
            fi
        else
            fail "Cannot access table $table"
        fi
    done

    # Check foreign key constraints
    if run_query "SELECT COUNT(*) FROM pg_constraint WHERE contype='f'" >/dev/null 2>&1; then
        FK_COUNT=$(run_query "SELECT COUNT(*) FROM pg_constraint WHERE contype='f'")
        pass "Foreign key constraints present: $FK_COUNT"
    else
        warn "Cannot verify foreign key constraints"
    fi
}

check_enum_types() {
    log "Checking ENUM types..."

    local enums=(
        "branch_health"
        "feedback_signal_type"
        "feedback_severity"
        "sync_status"
    )

    for enum in "${enums[@]}"; do
        COUNT=$(run_query "SELECT COUNT(*) FROM pg_type WHERE typname='$enum'" || echo "0")
        if [ "$COUNT" = "1" ]; then
            pass "ENUM type $enum exists"
        else
            fail "ENUM type $enum missing"
        fi
    done
}

performance_check() {
    log "Running performance checks..."

    # Check database size
    DB_SIZE=$(run_query "SELECT pg_size_pretty(pg_database_size('$DB_NAME'))" || echo "Unknown")
    log "Database size: $DB_SIZE"

    # Check index usage
    UNUSED_INDEXES=$(run_query "SELECT COUNT(*) FROM pg_stat_user_indexes WHERE idx_scan = 0" || echo "Unknown")
    if [ "$UNUSED_INDEXES" != "Unknown" ]; then
        if [ "$UNUSED_INDEXES" -gt "5" ]; then
            warn "Found $UNUSED_INDEXES unused indexes (monitor after data load)"
        else
            pass "Index usage appears normal ($UNUSED_INDEXES unused)"
        fi
    fi

    # Check for bloat
    DEAD_TUPLES=$(run_query "SELECT SUM(n_dead_tup) FROM pg_stat_user_tables" || echo "0")
    if [ "$DEAD_TUPLES" -gt "10000" ]; then
        warn "High dead tuple count: $DEAD_TUPLES (consider VACUUM)"
    else
        pass "Dead tuple count normal: $DEAD_TUPLES"
    fi
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║         MCP Ecosystem Migration Validation v0.2               ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""

    log "Starting validation tests..."
    echo ""

    # Run all validation tests
    validate_schema_version
    echo ""

    validate_new_tables
    echo ""

    validate_new_columns
    echo ""

    validate_new_functions
    echo ""

    validate_indexes
    echo ""

    validate_views
    echo ""

    validate_triggers
    echo ""

    test_fulltext_search
    echo ""

    test_branch_functions
    echo ""

    check_data_integrity
    echo ""

    check_enum_types
    echo ""

    performance_check
    echo ""

    # Summary
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║                    VALIDATION SUMMARY                         ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo ""
    echo -e "Tests Run:     $TESTS_RUN"
    echo -e "Tests Passed:  ${GREEN}$TESTS_PASSED${NC}"
    echo -e "Tests Failed:  ${RED}$TESTS_FAILED${NC}"
    echo -e "Tests Warning: ${YELLOW}$TESTS_WARNING${NC}"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ MIGRATION VALIDATION SUCCESSFUL${NC}"
        echo ""
        echo "All critical components are in place and functional."
        exit 0
    else
        echo -e "${RED}✗ MIGRATION VALIDATION FAILED${NC}"
        echo ""
        echo "Critical issues detected. Review failures above."
        echo "Consider rolling back if services are not functioning."
        exit 1
    fi
}

# Run validation
main "$@"