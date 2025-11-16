#!/bin/bash

# MCP End-to-End Integration Tests
# Tests complete workflows through the MCP ecosystem

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
REPORT_FILE="/tmp/e2e_test_report.json"
PASS_COUNT=0
FAIL_COUNT=0
TESTS_RUN=0

# Database configuration
DB_HOST="46.250.243.123"
DB_NAME="mcp_ecosystem"
DB_USER="mcp_admin"
DB_PASSWORD=""

# Service endpoints
ORCHESTRATOR_URL="http://46.250.243.123:3000"
PERPLEXITY_URL="http://46.250.241.70:3001"
IT_MCP_URL="http://154.26.158.31:3002"

# Initialize report
echo "{" > "$REPORT_FILE"
echo '  "test_suite": "end_to_end",' >> "$REPORT_FILE"
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

# Function to execute SQL
exec_sql() {
    local sql=$1
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -A -c "$sql" 2>/dev/null
}

echo "======================================"
echo "MCP End-to-End Integration Tests"
echo "======================================"
echo ""

# Test 1: Create Thought Session
echo "Testing Thought Session Creation..."
start_time=$(date +%s%N)

session_id=$(exec_sql "SELECT create_thought_session('E2E Test Session', 'test_user', '{\"test\": true}'::jsonb);")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ -n "$session_id" ]; then
    log_test "create_session" "PASS" "Session created with ID: $session_id" $duration
else
    log_test "create_session" "FAIL" "Failed to create session" $duration
    session_id="00000000-0000-0000-0000-000000000000"
fi

# Test 2: Insert Structured Thought
echo ""
echo "Testing Structured Thought Insertion..."
start_time=$(date +%s%N)

thought_json='{
    "title": "E2E Test Thought",
    "content": "This is a test structured thought for E2E testing",
    "tags": ["test", "e2e", "integration"],
    "priority": "medium",
    "status": "active"
}'

thought_id=$(exec_sql "SELECT insert_structured_thought('$session_id'::uuid, 'test', '$thought_json'::jsonb, '{\"source\": \"e2e_test\"}'::jsonb);")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ -n "$thought_id" ]; then
    log_test "insert_structured_thought" "PASS" "Structured thought created with ID: $thought_id" $duration
else
    log_test "insert_structured_thought" "FAIL" "Failed to create structured thought" $duration
    thought_id="00000000-0000-0000-0000-000000000000"
fi

# Test 3: Branch Thought
echo ""
echo "Testing Thought Branching..."
start_time=$(date +%s%N)

branch_json='{
    "branch_type": "alternative",
    "content": "This is a branched thought for E2E testing",
    "reasoning": "Testing branching functionality"
}'

branch_id=$(exec_sql "SELECT branch_thought('$thought_id'::uuid, '$branch_json'::jsonb, '{\"test\": true}'::jsonb);")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ -n "$branch_id" ]; then
    log_test "branch_thought" "PASS" "Branch created with ID: $branch_id" $duration
else
    log_test "branch_thought" "FAIL" "Failed to create branch" $duration
fi

# Test 4: Add Thought Relationship
echo ""
echo "Testing Thought Relationships..."
start_time=$(date +%s%N)

# Create another thought for relationship
thought2_id=$(exec_sql "SELECT insert_structured_thought('$session_id'::uuid, 'test', '{\"title\": \"Related Thought\", \"content\": \"Related to first thought\"}'::jsonb, '{}'::jsonb);")

if [ -n "$thought2_id" ]; then
    relationship_result=$(exec_sql "SELECT add_thought_relationship('$thought_id'::uuid, '$thought2_id'::uuid, 'relates_to', 0.8, '{\"test\": true}'::jsonb);")
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$relationship_result" == "t" ]; then
        log_test "add_relationship" "PASS" "Relationship created successfully" $duration
    else
        log_test "add_relationship" "FAIL" "Failed to create relationship" $duration
    fi
else
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    log_test "add_relationship" "FAIL" "Could not create second thought" $duration
fi

# Test 5: Full-Text Search
echo ""
echo "Testing Full-Text Search..."
start_time=$(date +%s%N)

search_results=$(exec_sql "SELECT COUNT(*) FROM search_thoughts_fts('E2E testing');")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$search_results" -gt 0 ]; then
    log_test "full_text_search" "PASS" "Found $search_results results" $duration
else
    log_test "full_text_search" "FAIL" "No search results found" $duration
fi

# Test 6: Add Feedback Signal
echo ""
echo "Testing Feedback Signals..."
start_time=$(date +%s%N)

feedback_result=$(exec_sql "SELECT add_feedback_signal('$thought_id'::uuid, 'test_user', 'like', 1.0, '{\"test\": true}'::jsonb);")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$feedback_result" == "t" ]; then
    log_test "add_feedback" "PASS" "Feedback signal added successfully" $duration
else
    log_test "add_feedback" "FAIL" "Failed to add feedback signal" $duration
fi

# Test 7: Sync Queue
echo ""
echo "Testing Sync Queue..."
start_time=$(date +%s%N)

# Add item to sync queue
sync_id=$(exec_sql "INSERT INTO sync_queue (entity_type, entity_id, action, priority, metadata) VALUES ('thought', '$thought_id', 'update', 1, '{\"test\": true}'::jsonb) RETURNING id;")

if [ -n "$sync_id" ]; then
    # Check if it was added
    queue_count=$(exec_sql "SELECT COUNT(*) FROM sync_queue WHERE id = '$sync_id';")
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))

    if [ "$queue_count" == "1" ]; then
        log_test "sync_queue" "PASS" "Sync queue item added successfully" $duration
        # Clean up
        exec_sql "DELETE FROM sync_queue WHERE id = '$sync_id';" > /dev/null 2>&1
    else
        log_test "sync_queue" "FAIL" "Sync queue item not found" $duration
    fi
else
    end_time=$(date +%s%N)
    duration=$(( (end_time - start_time) / 1000000 ))
    log_test "sync_queue" "FAIL" "Failed to add to sync queue" $duration
fi

# Test 8: API Integration - Orchestrator
echo ""
echo "Testing API Integration..."
start_time=$(date +%s%N)

api_response=$(curl -s -X POST "$ORCHESTRATOR_URL/api/thoughts" \
    -H "Content-Type: application/json" \
    -d "{\"session_id\":\"$session_id\",\"content\":\"API test thought\",\"type\":\"test\"}" \
    -w "\n%{http_code}" 2>/dev/null | tail -1 || echo "000")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$api_response" == "200" ] || [ "$api_response" == "201" ]; then
    log_test "api_orchestrator" "PASS" "API call successful" $duration
else
    log_test "api_orchestrator" "FAIL" "API returned $api_response" $duration
fi

# Test 9: Search API - Perplexity
start_time=$(date +%s%N)

search_response=$(curl -s -X GET "$PERPLEXITY_URL/api/search?q=test&session_id=$session_id" \
    -w "\n%{http_code}" 2>/dev/null | tail -1 || echo "000")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$search_response" == "200" ]; then
    log_test "api_perplexity_search" "PASS" "Search API working" $duration
else
    log_test "api_perplexity_search" "FAIL" "Search API returned $search_response" $duration
fi

# Test 10: Thought Retrieval
echo ""
echo "Testing Thought Retrieval..."
start_time=$(date +%s%N)

retrieved_thought=$(exec_sql "SELECT content FROM thoughts WHERE id = '$thought_id';")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if echo "$retrieved_thought" | grep -q "E2E testing"; then
    log_test "retrieve_thought" "PASS" "Thought retrieved successfully" $duration
else
    log_test "retrieve_thought" "FAIL" "Could not retrieve thought content" $duration
fi

# Test 11: Session Thoughts Count
echo ""
echo "Testing Session Thoughts Count..."
start_time=$(date +%s%N)

session_thoughts=$(exec_sql "SELECT COUNT(*) FROM thoughts WHERE session_id = '$session_id';")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$session_thoughts" -gt 0 ]; then
    log_test "session_thoughts_count" "PASS" "Session has $session_thoughts thoughts" $duration
else
    log_test "session_thoughts_count" "FAIL" "No thoughts found in session" $duration
fi

# Test 12: Cleanup Test Data
echo ""
echo "Cleaning up test data..."
start_time=$(date +%s%N)

# Delete test data in correct order (respecting foreign keys)
exec_sql "DELETE FROM thought_feedback WHERE thought_id IN (SELECT id FROM thoughts WHERE session_id = '$session_id');" > /dev/null 2>&1
exec_sql "DELETE FROM thought_relationships WHERE source_thought_id IN (SELECT id FROM thoughts WHERE session_id = '$session_id');" > /dev/null 2>&1
exec_sql "DELETE FROM thought_branches WHERE parent_thought_id IN (SELECT id FROM thoughts WHERE session_id = '$session_id');" > /dev/null 2>&1
exec_sql "DELETE FROM structured_thoughts WHERE thought_id IN (SELECT id FROM thoughts WHERE session_id = '$session_id');" > /dev/null 2>&1
exec_sql "DELETE FROM thoughts WHERE session_id = '$session_id';" > /dev/null 2>&1
exec_sql "DELETE FROM thought_sessions WHERE id = '$session_id';" > /dev/null 2>&1

# Verify cleanup
remaining=$(exec_sql "SELECT COUNT(*) FROM thoughts WHERE session_id = '$session_id';")

end_time=$(date +%s%N)
duration=$(( (end_time - start_time) / 1000000 ))

if [ "$remaining" == "0" ]; then
    log_test "cleanup" "PASS" "Test data cleaned up successfully" $duration
else
    log_test "cleanup" "FAIL" "$remaining thoughts still remain" $duration
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
echo "End-to-End Test Summary"
echo "======================================"
echo "Total Tests: $TESTS_RUN"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo "Success Rate: $(echo "scale=2; $PASS_COUNT * 100 / $TESTS_RUN" | bc)%"
echo ""
echo "Detailed report saved to: $REPORT_FILE"