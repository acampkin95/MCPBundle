#!/bin/bash

# MCP Database Integration Tests
# Tests PostgreSQL connectivity, replication, and v0.2 schema functionality

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
REPORT_FILE="/tmp/database_test_report.json"
PASS_COUNT=0
FAIL_COUNT=0
TESTS_RUN=0

# Database configuration
PRIMARY_HOST="46.250.243.123"
STANDBY_HOST="46.250.241.70"
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"
DB_PASSWORD="MCP#Secure2025!Prod"
VM_PASSWORD="C0nnaught"

# Initialize report
echo "{" > "$REPORT_FILE"
echo '  "test_suite": "database",' >> "$REPORT_FILE"
echo '  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",' >> "$REPORT_FILE"
echo '  "tests": [' >> "$REPORT_FILE"

# Function to log test results
log_test() {
    local test_name=$1
    local status=$2
    local message=$3
    local duration=$4

    TESTS_RUN=$((TESTS_RUN + 1))

    if [ "$status" == "PASS" ]; then
        echo -e "${GREEN}✓${NC} $test_name: $message"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}✗${NC} $test_name: $message"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    # Add to JSON report
    if [ $TESTS_RUN -gt 1 ]; then
        echo "," >> "$REPORT_FILE"
    fi
    echo -n '    {
      "name": "'$test_name'",
      "status": "'$status'",
      "message": "'$message'",
      "duration_ms": '$duration'
    }' >> "$REPORT_FILE"
}

# Function to execute SQL on primary
exec_primary_sql() {
    local sql=$1
    PGPASSWORD="$DB_PASSWORD" psql -h "$PRIMARY_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$sql" 2>/dev/null
}

# Function to execute SQL on standby
exec_standby_sql() {
    local sql=$1
    PGPASSWORD="$DB_PASSWORD" psql -h "$STANDBY_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$sql" 2>/dev/null
}

echo "======================================"
echo "MCP Database Integration Tests"
echo "======================================"
echo ""

# Test 1: Primary Database Connectivity
echo "Testing Primary Database Connectivity..."
start_time=$(date +%s%N)
if exec_primary_sql "SELECT version();" > /dev/null; then
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    version=$(exec_primary_sql "SELECT version();" | head -1)
    log_test "primary_connectivity" "PASS" "Connected to PostgreSQL on $PRIMARY_HOST" $duration
else
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    log_test "primary_connectivity" "FAIL" "Cannot connect to primary database" $duration
fi

# Test 2: Standby Database Connectivity
echo "Testing Standby Database Connectivity..."
start_time=$(date +%s%N)
if exec_standby_sql "SELECT version();" > /dev/null; then
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    log_test "standby_connectivity" "PASS" "Connected to PostgreSQL on $STANDBY_HOST" $duration
else
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    log_test "standby_connectivity" "FAIL" "Cannot connect to standby database" $duration
fi

# Test 3: Replication Status
echo ""
echo "Testing Replication Status..."
start_time=$(date +%s%N)
replication_status=$(sshpass -p "$VM_PASSWORD" ssh -o StrictHostKeyChecking=no root@$PRIMARY_HOST \
    "sudo -u postgres psql -c \"SELECT state, sync_state FROM pg_stat_replication;\" 2>/dev/null | grep streaming" || echo "")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if echo "$replication_status" | grep -q "streaming"; then
    log_test "replication_status" "PASS" "Replication is streaming" $duration
else
    log_test "replication_status" "FAIL" "Replication not streaming" $duration
fi

# Test 4: Schema Tables
echo ""
echo "Testing v0.2 Schema Tables..."
tables=(
    "thoughts"
    "thought_branches"
    "thought_relationships"
    "structured_thoughts"
    "thought_feedback"
    "thought_sessions"
    "sync_queue"
    "users"
    "tools"
    "api_keys"
)

for table in "${tables[@]}"; do
    start_time=$(date +%s%N)
    if exec_primary_sql "SELECT COUNT(*) FROM $table;" > /dev/null 2>&1; then
        end_time=$(date +%s%N)
        duration=$(( (end_time - start_time) / 1000000 ))
        count=$(exec_primary_sql "SELECT COUNT(*) FROM $table;")
        log_test "table_${table}" "PASS" "Table exists with $count rows" $duration
    else
        end_time=$(date +%s%N)
        duration=$(( (end_time - start_time) / 1000000 ))
        log_test "table_${table}" "FAIL" "Table not found or inaccessible" $duration
    fi
done

# Test 5: Stored Functions
echo ""
echo "Testing Stored Functions..."
functions=(
    "create_thought_session"
    "insert_structured_thought"
    "branch_thought"
    "add_thought_relationship"
    "search_thoughts_fts"
    "add_feedback_signal"
)

for func in "${functions[@]}"; do
    start_time=$(date +%s%N)
    exists=$(exec_primary_sql "SELECT COUNT(*) FROM pg_proc WHERE proname = '$func';" 2>/dev/null || echo "0")
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$exists" -gt 0 ]; then
        log_test "function_${func}" "PASS" "Function exists" $duration
    else
        log_test "function_${func}" "FAIL" "Function not found" $duration
    fi
done

# Test 6: Triggers
echo ""
echo "Testing Triggers..."
triggers=(
    "update_thoughts_updated_at"
    "update_thought_branches_updated_at"
    "update_thought_sessions_updated_at"
)

for trigger in "${triggers[@]}"; do
    start_time=$(date +%s%N)
    exists=$(exec_primary_sql "SELECT COUNT(*) FROM pg_trigger WHERE tgname = '$trigger';" 2>/dev/null || echo "0")
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$exists" -gt 0 ]; then
        log_test "trigger_${trigger}" "PASS" "Trigger exists" $duration
    else
        log_test "trigger_${trigger}" "FAIL" "Trigger not found" $duration
    fi
done

# Test 7: Full-Text Search
echo ""
echo "Testing Full-Text Search..."
start_time=$(date +%s%N)

# Insert test data
test_thought_id=$(exec_primary_sql "INSERT INTO thoughts (content, thought_type, metadata) VALUES ('Test thought for FTS integration testing', 'test', '{}'::jsonb) RETURNING id;")

if [ -n "$test_thought_id" ]; then
    # Test search
    search_result=$(exec_primary_sql "SELECT COUNT(*) FROM search_thoughts_fts('integration testing');")
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$search_result" -gt 0 ]; then
        log_test "full_text_search" "PASS" "FTS working, found $search_result results" $duration
    else
        log_test "full_text_search" "FAIL" "FTS not returning results" $duration
    fi

    # Cleanup
    exec_primary_sql "DELETE FROM thoughts WHERE id = '$test_thought_id';" > /dev/null 2>&1
else
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    log_test "full_text_search" "FAIL" "Could not insert test data" $duration
fi

# Test 8: Write on Primary, Read from Standby
echo ""
echo "Testing Write/Read Replication..."
start_time=$(date +%s%N)

# Write to primary
test_id=$(exec_primary_sql "INSERT INTO thoughts (content, thought_type, metadata) VALUES ('Replication test thought', 'test', '{}'::jsonb) RETURNING id;")

if [ -n "$test_id" ]; then
    # Wait for replication
    sleep 2

    # Read from standby
    standby_result=$(exec_standby_sql "SELECT content FROM thoughts WHERE id = '$test_id';" 2>/dev/null || echo "")
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if echo "$standby_result" | grep -q "Replication test thought"; then
        log_test "write_read_replication" "PASS" "Data replicated successfully" $duration
    else
        log_test "write_read_replication" "FAIL" "Data not found on standby" $duration
    fi

    # Cleanup
    exec_primary_sql "DELETE FROM thoughts WHERE id = '$test_id';" > /dev/null 2>&1
else
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    log_test "write_read_replication" "FAIL" "Could not write to primary" $duration
fi

# Test 9: Query Performance
echo ""
echo "Testing Query Performance..."
queries=(
    "SELECT COUNT(*) FROM thoughts"
    "SELECT * FROM thoughts ORDER BY created_at DESC LIMIT 10"
    "SELECT COUNT(*) FROM thought_sessions"
)

for i in "${!queries[@]}"; do
    query="${queries[$i]}"
    start_time=$(date +%s%N)
    exec_primary_sql "$query;" > /dev/null 2>&1
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ $duration -lt 1000 ]; then
        log_test "query_performance_$i" "PASS" "Query executed in ${duration}ms" $duration
    else
        log_test "query_performance_$i" "FAIL" "Query slow: ${duration}ms" $duration
    fi
done

# Test 10: Connection Pooling
echo ""
echo "Testing Connection Pooling..."
start_time=$(date +%s%N)

# Test multiple concurrent connections
for i in {1..10}; do
    exec_primary_sql "SELECT 1;" > /dev/null 2>&1 &
done
wait

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ $duration -lt 5000 ]; then
    log_test "connection_pooling" "PASS" "10 concurrent connections handled in ${duration}ms" $duration
else
    log_test "connection_pooling" "FAIL" "Slow concurrent connections: ${duration}ms" $duration
fi

# Close JSON report
echo "" >> "$REPORT_FILE"
echo '  ],' >> "$REPORT_FILE"
echo '  "summary": {' >> "$REPORT_FILE"
echo '    "total": '$TESTS_RUN',' >> "$REPORT_FILE"
echo '    "passed": '$PASS_COUNT',' >> "$REPORT_FILE"
echo '    "failed": '$FAIL_COUNT',' >> "$REPORT_FILE"
echo '    "success_rate": '$(echo "scale=2; $PASS_COUNT * 100 / $TESTS_RUN" | bc)'
  }
}' >> "$REPORT_FILE"

# Print summary
echo ""
echo "======================================"
echo "Database Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo "Success Rate: $(echo "scale=2; $PASS_COUNT * 100 / $TESTS_RUN" | bc)%"
echo ""
echo "Detailed report saved to: $REPORT_FILE"