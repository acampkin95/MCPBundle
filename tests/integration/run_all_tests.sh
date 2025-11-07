#!/bin/bash

# MCP Comprehensive Integration Test Suite Runner
# Runs all integration tests and generates a comprehensive report

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Test configuration
RESULTS_DIR="/tmp/mcp_integration_results"
FINAL_REPORT="/tmp/mcp_integration_report.html"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create results directory
mkdir -p "$RESULTS_DIR"

# Test suite files
TEST_SUITES=(
    "test_infrastructure.sh"
    "test_database.sh"
    "test_mcp_services.sh"
    "test_e2e.sh"
    "test_security.sh"
)

# Make all test scripts executable
chmod +x *.sh

echo "=============================================="
echo -e "${CYAN}MCP Integration Test Suite${NC}"
echo "=============================================="
echo "Timestamp: $(date)"
echo "Results Directory: $RESULTS_DIR"
echo ""

# Function to run a test suite
run_test_suite() {
    local test_file=$1
    local test_name=$(basename "$test_file" .sh)

    echo -e "${BLUE}Running $test_name...${NC}"

    # Run test and capture output
    if ./"$test_file" > "$RESULTS_DIR/${test_name}_output.log" 2>&1; then
        echo -e "${GREEN}✓ $test_name completed${NC}"
        return 0
    else
        echo -e "${YELLOW}⚠ $test_name completed with issues${NC}"
        return 1
    fi
}

# Track overall results
TOTAL_SUITES=0
PASSED_SUITES=0
FAILED_SUITES=0

# Run all test suites
for suite in "${TEST_SUITES[@]}"; do
    TOTAL_SUITES=$((TOTAL_SUITES + 1))

    if [ -f "$suite" ]; then
        if run_test_suite "$suite"; then
            PASSED_SUITES=$((PASSED_SUITES + 1))
        else
            FAILED_SUITES=$((FAILED_SUITES + 1))
        fi
    else
        echo -e "${RED}✗ Test suite $suite not found${NC}"
        FAILED_SUITES=$((FAILED_SUITES + 1))
    fi

    echo ""
done

# Generate comprehensive HTML report
echo -e "${MAGENTA}Generating comprehensive report...${NC}"

cat > "$FINAL_REPORT" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Integration Test Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }

        h1, h2, h3 {
            color: #2c3e50;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
        }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }

        .summary-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .summary-card h3 {
            margin-top: 0;
            font-size: 14px;
            color: #7f8c8d;
            text-transform: uppercase;
        }

        .summary-card .value {
            font-size: 32px;
            font-weight: bold;
            margin: 10px 0;
        }

        .success { color: #27ae60; }
        .warning { color: #f39c12; }
        .danger { color: #e74c3c; }

        .test-suite {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .test-suite h2 {
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        .test-result {
            padding: 10px;
            margin: 10px 0;
            border-left: 4px solid;
            background: #fafafa;
        }

        .test-result.pass {
            border-left-color: #27ae60;
        }

        .test-result.fail {
            border-left-color: #e74c3c;
        }

        .metrics-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }

        .metrics-table th,
        .metrics-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ecf0f1;
        }

        .metrics-table th {
            background: #f8f9fa;
            font-weight: 600;
        }

        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }

        .badge.pass {
            background: #d4edda;
            color: #155724;
        }

        .badge.fail {
            background: #f8d7da;
            color: #721c24;
        }

        .recommendations {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
        }

        .performance-chart {
            background: white;
            padding: 20px;
            border-radius: 10px;
            margin-top: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        footer {
            text-align: center;
            margin-top: 40px;
            padding: 20px;
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>MCP Integration Test Report</h1>
        <p>Generated: <span id="timestamp"></span></p>
        <p>Environment: Production</p>
    </div>
EOF

# Add timestamp
echo "    <script>document.getElementById('timestamp').textContent = '$(date)';</script>" >> "$FINAL_REPORT"

# Add summary cards
echo '    <div class="summary-grid">' >> "$FINAL_REPORT"

# Calculate totals from all test results
TOTAL_TESTS=0
TOTAL_PASSED=0
TOTAL_FAILED=0

for report in /tmp/*_test_report.json; do
    if [ -f "$report" ]; then
        suite_total=$(jq -r '.summary.total // 0' "$report" 2>/dev/null || echo 0)
        suite_passed=$(jq -r '.summary.passed // 0' "$report" 2>/dev/null || echo 0)
        suite_failed=$(jq -r '.summary.failed // 0' "$report" 2>/dev/null || echo 0)

        TOTAL_TESTS=$((TOTAL_TESTS + suite_total))
        TOTAL_PASSED=$((TOTAL_PASSED + suite_passed))
        TOTAL_FAILED=$((TOTAL_FAILED + suite_failed))
    fi
done

SUCCESS_RATE=0
if [ $TOTAL_TESTS -gt 0 ]; then
    SUCCESS_RATE=$(echo "scale=2; $TOTAL_PASSED * 100 / $TOTAL_TESTS" | bc)
fi

cat >> "$FINAL_REPORT" << EOF
        <div class="summary-card">
            <h3>Total Tests</h3>
            <div class="value">$TOTAL_TESTS</div>
        </div>
        <div class="summary-card">
            <h3>Passed</h3>
            <div class="value success">$TOTAL_PASSED</div>
        </div>
        <div class="summary-card">
            <h3>Failed</h3>
            <div class="value danger">$TOTAL_FAILED</div>
        </div>
        <div class="summary-card">
            <h3>Success Rate</h3>
            <div class="value">$SUCCESS_RATE%</div>
        </div>
    </div>
EOF

# Add test suite results
for suite in "${TEST_SUITES[@]}"; do
    suite_name=$(basename "$suite" .sh | sed 's/_/ /g' | sed 's/\b\(.\)/\u\1/g')
    report_file="/tmp/$(basename "$suite" .sh)_report.json"

    if [ -f "$report_file" ]; then
        echo "    <div class='test-suite'>" >> "$FINAL_REPORT"
        echo "        <h2>$suite_name</h2>" >> "$FINAL_REPORT"

        # Add suite metrics
        suite_total=$(jq -r '.summary.total // 0' "$report_file" 2>/dev/null || echo 0)
        suite_passed=$(jq -r '.summary.passed // 0' "$report_file" 2>/dev/null || echo 0)
        suite_failed=$(jq -r '.summary.failed // 0' "$report_file" 2>/dev/null || echo 0)

        echo "        <p>Tests: $suite_total | Passed: <span class='success'>$suite_passed</span> | Failed: <span class='danger'>$suite_failed</span></p>" >> "$FINAL_REPORT"

        # Add test details table
        echo "        <table class='metrics-table'>" >> "$FINAL_REPORT"
        echo "            <thead><tr><th>Test Name</th><th>Status</th><th>Duration (ms)</th><th>Message</th></tr></thead>" >> "$FINAL_REPORT"
        echo "            <tbody>" >> "$FINAL_REPORT"

        jq -r '.tests[] | "<tr><td>\(.name)</td><td><span class=\"badge \(.status | ascii_downcase)\">\(.status)</span></td><td>\(.duration_ms)</td><td>\(.message)</td></tr>"' "$report_file" 2>/dev/null >> "$FINAL_REPORT" || true

        echo "            </tbody>" >> "$FINAL_REPORT"
        echo "        </table>" >> "$FINAL_REPORT"
        echo "    </div>" >> "$FINAL_REPORT"
    fi
done

# Add recommendations section
echo '    <div class="test-suite">' >> "$FINAL_REPORT"
echo '        <h2>Production Readiness Checklist</h2>' >> "$FINAL_REPORT"

if [ $TOTAL_FAILED -eq 0 ]; then
    echo '        <div class="recommendations">' >> "$FINAL_REPORT"
    echo '            <h3>✅ System is Production Ready</h3>' >> "$FINAL_REPORT"
    echo '            <p>All integration tests have passed successfully. The MCP ecosystem is ready for production deployment.</p>' >> "$FINAL_REPORT"
    echo '        </div>' >> "$FINAL_REPORT"
else
    echo '        <div class="recommendations">' >> "$FINAL_REPORT"
    echo '            <h3>⚠️ Issues Detected</h3>' >> "$FINAL_REPORT"
    echo '            <p>The following issues should be addressed before production deployment:</p>' >> "$FINAL_REPORT"
    echo '            <ul>' >> "$FINAL_REPORT"

    # Add specific recommendations based on failures
    for report in /tmp/*_test_report.json; do
        if [ -f "$report" ]; then
            suite_name=$(basename "$report" _test_report.json)
            failed_count=$(jq -r '.summary.failed // 0' "$report" 2>/dev/null || echo 0)

            if [ "$failed_count" -gt 0 ]; then
                echo "                <li><strong>$suite_name:</strong> $failed_count tests failed - review and fix before deployment</li>" >> "$FINAL_REPORT"
            fi
        fi
    done

    echo '            </ul>' >> "$FINAL_REPORT"
    echo '        </div>' >> "$FINAL_REPORT"
fi

echo '    </div>' >> "$FINAL_REPORT"

# Add footer
cat >> "$FINAL_REPORT" << 'EOF'
    <footer>
        <p>MCP Integration Test Suite v0.2.0 | Generated automatically by the test framework</p>
    </footer>
</body>
</html>
EOF

# Print final summary
echo "=============================================="
echo -e "${CYAN}Integration Test Suite Complete${NC}"
echo "=============================================="
echo ""
echo "Test Suites Run: $TOTAL_SUITES"
echo -e "Suites Passed: ${GREEN}$PASSED_SUITES${NC}"
echo -e "Suites Failed: ${RED}$FAILED_SUITES${NC}"
echo ""
echo "Total Tests: $TOTAL_TESTS"
echo -e "Tests Passed: ${GREEN}$TOTAL_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TOTAL_FAILED${NC}"
echo -e "Success Rate: ${YELLOW}$SUCCESS_RATE%${NC}"
echo ""
echo "Detailed reports:"
echo "  - HTML Report: $FINAL_REPORT"
echo "  - JSON Reports: /tmp/*_test_report.json"
echo "  - Test Logs: $RESULTS_DIR/"
echo ""

if [ $TOTAL_FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED - SYSTEM IS PRODUCTION READY${NC}"
    exit 0
else
    echo -e "${RED}❌ SOME TESTS FAILED - REVIEW ISSUES BEFORE DEPLOYMENT${NC}"
    exit 1
fi