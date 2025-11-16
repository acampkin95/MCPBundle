#!/bin/bash
set -euo pipefail

# =============================================================================
# MCP Bundle Load Testing Suite
# =============================================================================
# Comprehensive load testing for MCP infrastructure components
#
# Features:
# - Automatic k6 installation and setup
# - Load test scenarios:
#   - MCP services (baseline, peak, stress)
#   - HAProxy routing and failover
#   - PostgreSQL connection pooling
#   - Redis operations
# - Performance baselines and SLA validation
# - Detailed performance reports with metrics
# - HTML report generation
#
# Usage: ./load-testing.sh [options]
# Options:
#   --scenario <name>   Run specific scenario (baseline, peak, stress, all)
#   --target <service>  Test specific service (mcp, haproxy, postgres, redis, all)
#   --duration <time>   Test duration (e.g., 30s, 5m, 1h)
#   --vus <number>      Number of virtual users
#   --output <path>     Custom report output directory
# =============================================================================

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m' # No Color
readonly BOLD='\033[1m'

# VM Configuration
readonly VMI01="46.250.243.123"
readonly VMI02D="46.250.241.70"
readonly VMI03="154.26.158.31"

# Performance Baselines (SLA targets)
readonly BASELINE_P95_MS=500
readonly PEAK_P95_MS=1000
readonly STRESS_P95_MS=2000
readonly ERROR_RATE_THRESHOLD=0.01  # 1%

# Default Configuration
SCENARIO="baseline"
TARGET="all"
DURATION="30s"
VUS=10
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_DIR="/tmp/mcp_load_testing_${TIMESTAMP}"
K6_BINARY=""

# Test results tracking
declare -A TEST_RESULTS
declare -A PERFORMANCE_METRICS
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# =============================================================================
# Utility Functions
# =============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $*"
    ((PASSED_TESTS++)) || true
}

log_error() {
    echo -e "${RED}[✗]${NC} $*"
    ((FAILED_TESTS++)) || true
}

log_warning() {
    echo -e "${YELLOW}[!]${NC} $*"
}

log_header() {
    echo -e "\n${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${CYAN}$*${NC}"
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${NC}\n"
}

increment_test() {
    ((TOTAL_TESTS++)) || true
}

# =============================================================================
# K6 Installation
# =============================================================================

install_k6() {
    log_header "Installing K6 Load Testing Tool"

    # Check if k6 is already installed
    if command -v k6 &> /dev/null; then
        K6_BINARY="k6"
        local version=$(k6 version | head -1)
        log_success "K6 already installed: $version"
        return 0
    fi

    log "K6 not found, installing..."

    # Detect OS
    local os=$(uname -s | tr '[:upper:]' '[:lower:]')
    local arch=$(uname -m)

    case "$arch" in
        x86_64)
            arch="amd64"
            ;;
        aarch64|arm64)
            arch="arm64"
            ;;
        *)
            log_error "Unsupported architecture: $arch"
            return 1
            ;;
    esac

    case "$os" in
        darwin)
            log "Installing k6 on macOS..."
            if command -v brew &> /dev/null; then
                brew install k6
                K6_BINARY="k6"
            else
                log_error "Homebrew not found. Please install from: https://brew.sh/"
                return 1
            fi
            ;;
        linux)
            log "Installing k6 on Linux..."

            # Download k6
            local k6_version="v0.47.0"
            local download_url="https://github.com/grafana/k6/releases/download/${k6_version}/k6-${k6_version}-linux-${arch}.tar.gz"

            local temp_dir=$(mktemp -d)
            cd "$temp_dir"

            log "Downloading k6 ${k6_version}..."
            if curl -L -o k6.tar.gz "$download_url"; then
                tar -xzf k6.tar.gz
                local extracted_dir=$(find . -type d -name "k6-*" | head -1)

                if [ -n "$extracted_dir" ]; then
                    sudo mv "${extracted_dir}/k6" /usr/local/bin/
                    sudo chmod +x /usr/local/bin/k6
                    K6_BINARY="/usr/local/bin/k6"
                    cd - > /dev/null
                    rm -rf "$temp_dir"
                    log_success "K6 installed successfully"
                else
                    log_error "Failed to extract k6"
                    cd - > /dev/null
                    rm -rf "$temp_dir"
                    return 1
                fi
            else
                log_error "Failed to download k6"
                cd - > /dev/null
                rm -rf "$temp_dir"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported operating system: $os"
            return 1
            ;;
    esac

    # Verify installation
    if command -v k6 &> /dev/null || [ -x "$K6_BINARY" ]; then
        local version=$($K6_BINARY version | head -1)
        log_success "K6 installed: $version"
        K6_BINARY="k6"
        return 0
    else
        log_error "K6 installation failed"
        return 1
    fi
}

# =============================================================================
# K6 Test Script Generators
# =============================================================================

generate_mcp_service_test() {
    local scenario=$1
    local vus=$2
    local duration=$3

    cat << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

EOF

    # Scenario-specific options
    case "$scenario" in
        baseline)
            cat << EOF
export const options = {
    stages: [
        { duration: '10s', target: ${vus} },     // Ramp up
        { duration: '${duration}', target: ${vus} }, // Sustained load
        { duration: '10s', target: 0 },         // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<${BASELINE_P95_MS}'],
        errors: ['rate<${ERROR_RATE_THRESHOLD}'],
    },
};
EOF
            ;;
        peak)
            cat << EOF
export const options = {
    stages: [
        { duration: '30s', target: ${vus} },          // Ramp up
        { duration: '${duration}', target: ${vus} },      // Peak load
        { duration: '30s', target: $((vus * 2)) },    // Spike
        { duration: '1m', target: ${vus} },           // Back to peak
        { duration: '30s', target: 0 },               // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<${PEAK_P95_MS}'],
        errors: ['rate<${ERROR_RATE_THRESHOLD}'],
    },
};
EOF
            ;;
        stress)
            cat << EOF
export const options = {
    stages: [
        { duration: '1m', target: ${vus} },            // Ramp up
        { duration: '2m', target: $((vus * 2)) },      // Double load
        { duration: '${duration}', target: $((vus * 3)) },  // Triple load (stress)
        { duration: '1m', target: ${vus} },            // Recover
        { duration: '30s', target: 0 },                // Ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<${STRESS_P95_MS}'],
        errors: ['rate<0.05'],  // Allow 5% errors under stress
    },
};
EOF
            ;;
    esac

    cat << 'EOF'

export default function () {
    // Test health endpoint
    const healthRes = http.get('http://VMI01_IP:9090/health');

    check(healthRes, {
        'health check status is 200': (r) => r.status === 200,
        'health check response time < 100ms': (r) => r.timings.duration < 100,
    });

    errorRate.add(healthRes.status !== 200);
    responseTime.add(healthRes.timings.duration);

    // Test MCP orchestrator endpoint (simulated)
    const orchRes = http.get('http://VMI01_IP:9090/api/agents');

    check(orchRes, {
        'orchestrator status is 200': (r) => r.status === 200,
        'orchestrator response time < 500ms': (r) => r.timings.duration < 500,
    });

    errorRate.add(orchRes.status !== 200);
    responseTime.add(orchRes.timings.duration);

    sleep(1);
}
EOF
}

generate_haproxy_test() {
    local scenario=$1
    local vus=$2
    local duration=$3

    cat << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const errorRate = new Rate('errors');
const vmi01Requests = new Counter('vmi01_requests');
const vmi02dRequests = new Counter('vmi02d_requests');

EOF

    cat << EOF
export const options = {
    stages: [
        { duration: '10s', target: ${vus} },
        { duration: '${duration}', target: ${vus} },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p(95)<${BASELINE_P95_MS}'],
        errors: ['rate<${ERROR_RATE_THRESHOLD}'],
    },
};
EOF

    cat << 'EOF'

export default function () {
    // Test HAProxy load balancing
    const res = http.get('http://VMI03_IP:8080/health');

    check(res, {
        'status is 200': (r) => r.status === 200,
        'has backend header': (r) => r.headers['X-Backend-Server'] !== undefined,
    });

    errorRate.add(res.status !== 200);

    // Track which backend handled the request
    const backend = res.headers['X-Backend-Server'] || 'unknown';
    if (backend.includes('vmi01')) {
        vmi01Requests.add(1);
    } else if (backend.includes('vmi02d')) {
        vmi02dRequests.add(1);
    }

    sleep(0.1);
}
EOF
}

generate_postgres_test() {
    local scenario=$1
    local vus=$2
    local duration=$3

    cat << 'EOF'
import sql from 'k6/x/sql';
import { check } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const queryTime = new Trend('query_duration');

EOF

    cat << EOF
export const options = {
    stages: [
        { duration: '10s', target: ${vus} },
        { duration: '${duration}', target: ${vus} },
        { duration: '10s', target: 0 },
    ],
    thresholds: {
        query_duration: ['p(95)<100'],
        errors: ['rate<${ERROR_RATE_THRESHOLD}'],
    },
};
EOF

    cat << 'EOF'

// Note: This requires k6 with SQL extension
// Fallback to HTTP-based connection test
import http from 'k6/http';

export default function () {
    // Test PostgreSQL connection through health endpoint
    const res = http.get('http://VMI01_IP:9090/health/database');

    const success = check(res, {
        'database connection successful': (r) => r.status === 200,
        'response time acceptable': (r) => r.timings.duration < 100,
    });

    errorRate.add(!success);
    queryTime.add(res.timings.duration);

    // Simulate think time
    sleep(0.05);
}
EOF
}

generate_redis_test() {
    local scenario=$1
    local vus=$2
    local duration=$3

    cat << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const opTime = new Trend('operation_duration');

EOF

    cat << EOF
export const options = {
    stages: [
        { duration: '5s', target: ${vus} },
        { duration: '${duration}', target: ${vus} },
        { duration: '5s', target: 0 },
    ],
    thresholds: {
        operation_duration: ['p(95)<50'],
        errors: ['rate<${ERROR_RATE_THRESHOLD}'],
    },
};
EOF

    cat << 'EOF'

export default function () {
    // Test Redis through cache health endpoint
    const res = http.get('http://VMI01_IP:9090/health/cache');

    const success = check(res, {
        'cache connection successful': (r) => r.status === 200,
        'cache response time < 50ms': (r) => r.timings.duration < 50,
    });

    errorRate.add(!success);
    opTime.add(res.timings.duration);

    sleep(0.01);
}
EOF
}

# =============================================================================
# Test Execution
# =============================================================================

run_load_test() {
    local test_name=$1
    local script_file=$2
    local scenario=$3

    log_header "Running Load Test: $test_name ($scenario scenario)"

    increment_test

    mkdir -p "${REPORT_DIR}/results"

    # Replace IP placeholders
    sed -i.bak "s/VMI01_IP/${VMI01}/g" "$script_file"
    sed -i.bak "s/VMI02D_IP/${VMI02D}/g" "$script_file"
    sed -i.bak "s/VMI03_IP/${VMI03}/g" "$script_file"
    rm -f "${script_file}.bak"

    local results_file="${REPORT_DIR}/results/${test_name}_${scenario}.json"
    local summary_file="${REPORT_DIR}/results/${test_name}_${scenario}_summary.txt"

    log "Starting test with ${VUS} virtual users for ${DURATION}..."
    log "Test script: $script_file"

    # Run k6 test
    local start_time=$(date +%s)

    if $K6_BINARY run --out json="$results_file" --summary-export="$summary_file" "$script_file"; then
        local end_time=$(date +%s)
        local test_duration=$((end_time - start_time))

        log_success "Test completed in ${test_duration}s"

        # Parse results
        if [ -f "$summary_file" ]; then
            parse_test_results "$test_name" "$summary_file" "$scenario"
        else
            log_warning "Summary file not found, results may be incomplete"
        fi

    else
        log_error "Test failed or exceeded thresholds"
        return 1
    fi
}

parse_test_results() {
    local test_name=$1
    local summary_file=$2
    local scenario=$3

    log "Parsing test results..."

    # Extract key metrics using jq
    if ! command -v jq &> /dev/null; then
        log_warning "jq not found, skipping detailed result parsing"
        return 0
    fi

    # Read summary
    local p95=$(jq -r '.metrics.http_req_duration.values.p95 // 0' "$summary_file")
    local avg=$(jq -r '.metrics.http_req_duration.values.avg // 0' "$summary_file")
    local max=$(jq -r '.metrics.http_req_duration.values.max // 0' "$summary_file")
    local requests=$(jq -r '.metrics.http_reqs.values.count // 0' "$summary_file")
    local failures=$(jq -r '.metrics.http_req_failed.values.rate // 0' "$summary_file")

    log "Performance metrics:"
    log "  Requests: $requests"
    log "  P95: ${p95}ms"
    log "  Average: ${avg}ms"
    log "  Max: ${max}ms"
    log "  Error rate: $(awk "BEGIN {printf \"%.2f%%\", $failures * 100}")"

    # Store metrics
    PERFORMANCE_METRICS["${test_name}_${scenario}_p95"]=$p95
    PERFORMANCE_METRICS["${test_name}_${scenario}_avg"]=$avg
    PERFORMANCE_METRICS["${test_name}_${scenario}_requests"]=$requests
    PERFORMANCE_METRICS["${test_name}_${scenario}_errors"]=$failures

    # Check against baseline
    local threshold
    case "$scenario" in
        baseline)
            threshold=$BASELINE_P95_MS
            ;;
        peak)
            threshold=$PEAK_P95_MS
            ;;
        stress)
            threshold=$STRESS_P95_MS
            ;;
    esac

    local p95_int=${p95%.*}
    if [ "$p95_int" -le "$threshold" ]; then
        log_success "P95 latency ($p95_int ms) meets SLA (<${threshold}ms)"
        TEST_RESULTS["${test_name}_${scenario}"]="PASS"
    else
        log_error "P95 latency ($p95_int ms) exceeds SLA threshold (${threshold}ms)"
        TEST_RESULTS["${test_name}_${scenario}"]="FAIL"
    fi

    # Check error rate
    local error_pct=$(awk "BEGIN {print $failures}")
    if (( $(awk "BEGIN {print ($error_pct < $ERROR_RATE_THRESHOLD)}") )); then
        log_success "Error rate (${error_pct}) within acceptable limits"
    else
        log_error "Error rate (${error_pct}) exceeds threshold ($ERROR_RATE_THRESHOLD)"
        TEST_RESULTS["${test_name}_${scenario}"]="FAIL"
    fi
}

# =============================================================================
# Test Scenarios
# =============================================================================

run_mcp_service_tests() {
    log_header "MCP Service Load Tests"

    local scenarios=("baseline" "peak" "stress")

    for scenario in "${scenarios[@]}"; do
        if [ "$SCENARIO" != "all" ] && [ "$SCENARIO" != "$scenario" ]; then
            continue
        fi

        local script_file="${REPORT_DIR}/scripts/mcp_${scenario}_test.js"
        mkdir -p "$(dirname "$script_file")"

        # Adjust VUs based on scenario
        local scenario_vus=$VUS
        case "$scenario" in
            baseline)
                scenario_vus=$VUS
                ;;
            peak)
                scenario_vus=$((VUS * 2))
                ;;
            stress)
                scenario_vus=$((VUS * 5))
                ;;
        esac

        generate_mcp_service_test "$scenario" "$scenario_vus" "$DURATION" > "$script_file"
        run_load_test "mcp_service" "$script_file" "$scenario"
    done
}

run_haproxy_tests() {
    log_header "HAProxy Load Balancing Tests"

    local scenarios=("baseline" "peak")

    for scenario in "${scenarios[@]}"; do
        if [ "$SCENARIO" != "all" ] && [ "$SCENARIO" != "$scenario" ]; then
            continue
        fi

        local script_file="${REPORT_DIR}/scripts/haproxy_${scenario}_test.js"
        mkdir -p "$(dirname "$script_file")"

        local scenario_vus=$VUS
        [ "$scenario" = "peak" ] && scenario_vus=$((VUS * 3))

        generate_haproxy_test "$scenario" "$scenario_vus" "$DURATION" > "$script_file"
        run_load_test "haproxy" "$script_file" "$scenario"
    done
}

run_postgres_tests() {
    log_header "PostgreSQL Connection Pool Tests"

    local scenarios=("baseline" "peak" "stress")

    for scenario in "${scenarios[@]}"; do
        if [ "$SCENARIO" != "all" ] && [ "$SCENARIO" != "$scenario" ]; then
            continue
        fi

        local script_file="${REPORT_DIR}/scripts/postgres_${scenario}_test.js"
        mkdir -p "$(dirname "$script_file")"

        local scenario_vus=$VUS
        case "$scenario" in
            baseline)
                scenario_vus=$((VUS * 2))
                ;;
            peak)
                scenario_vus=$((VUS * 5))
                ;;
            stress)
                scenario_vus=$((VUS * 10))
                ;;
        esac

        generate_postgres_test "$scenario" "$scenario_vus" "$DURATION" > "$script_file"
        run_load_test "postgres" "$script_file" "$scenario"
    done
}

run_redis_tests() {
    log_header "Redis Cache Performance Tests"

    local scenarios=("baseline" "peak" "stress")

    for scenario in "${scenarios[@]}"; do
        if [ "$SCENARIO" != "all" ] && [ "$SCENARIO" != "$scenario" ]; then
            continue
        fi

        local script_file="${REPORT_DIR}/scripts/redis_${scenario}_test.js"
        mkdir -p "$(dirname "$script_file")"

        local scenario_vus=$VUS
        case "$scenario" in
            baseline)
                scenario_vus=$((VUS * 5))
                ;;
            peak)
                scenario_vus=$((VUS * 10))
                ;;
            stress)
                scenario_vus=$((VUS * 20))
                ;;
        esac

        generate_redis_test "$scenario" "$scenario_vus" "$DURATION" > "$script_file"
        run_load_test "redis" "$script_file" "$scenario"
    done
}

# =============================================================================
# Report Generation
# =============================================================================

generate_html_report() {
    log_header "Generating HTML Report"

    local html_file="${REPORT_DIR}/load_test_report.html"

    cat > "$html_file" << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Bundle Load Testing Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            border-bottom: 3px solid #4CAF50;
            padding-bottom: 10px;
        }
        h2 {
            color: #555;
            margin-top: 30px;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        .metric-card {
            background: #f9f9f9;
            padding: 20px;
            border-radius: 6px;
            border-left: 4px solid #4CAF50;
        }
        .metric-card.warning {
            border-left-color: #ff9800;
        }
        .metric-card.error {
            border-left-color: #f44336;
        }
        .metric-label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 5px;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            color: #333;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #4CAF50;
            color: white;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .pass {
            color: #4CAF50;
            font-weight: bold;
        }
        .fail {
            color: #f44336;
            font-weight: bold;
        }
        .timestamp {
            color: #999;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>MCP Bundle Load Testing Report</h1>
        <p class="timestamp">Generated: TIMESTAMP_PLACEHOLDER</p>

        <h2>Executive Summary</h2>
        <div class="summary">
            <div class="metric-card">
                <div class="metric-label">Total Tests</div>
                <div class="metric-value">TOTAL_TESTS</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Passed</div>
                <div class="metric-value">PASSED_TESTS</div>
            </div>
            <div class="metric-card FAILED_CLASS">
                <div class="metric-label">Failed</div>
                <div class="metric-value">FAILED_TESTS</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Success Rate</div>
                <div class="metric-value">SUCCESS_RATE%</div>
            </div>
        </div>

        <h2>Performance Baselines</h2>
        <table>
            <tr>
                <th>Scenario</th>
                <th>P95 Latency Target</th>
                <th>Error Rate Threshold</th>
            </tr>
            <tr>
                <td>Baseline</td>
                <td>&lt; 500ms</td>
                <td>&lt; 1%</td>
            </tr>
            <tr>
                <td>Peak</td>
                <td>&lt; 1000ms</td>
                <td>&lt; 1%</td>
            </tr>
            <tr>
                <td>Stress</td>
                <td>&lt; 2000ms</td>
                <td>&lt; 5%</td>
            </tr>
        </table>

        <h2>Test Results</h2>
        <table>
            <tr>
                <th>Test</th>
                <th>Scenario</th>
                <th>Requests</th>
                <th>P95 Latency</th>
                <th>Avg Latency</th>
                <th>Error Rate</th>
                <th>Result</th>
            </tr>
            TEST_RESULTS_PLACEHOLDER
        </table>

        <h2>Detailed Metrics</h2>
        <p>Full test results and raw data available in the results directory.</p>
    </div>
</body>
</html>
EOF

    # Replace placeholders
    sed -i.bak "s/TIMESTAMP_PLACEHOLDER/$(date)/" "$html_file"
    sed -i.bak "s/TOTAL_TESTS/$TOTAL_TESTS/" "$html_file"
    sed -i.bak "s/PASSED_TESTS/$PASSED_TESTS/" "$html_file"
    sed -i.bak "s/FAILED_TESTS/$FAILED_TESTS/" "$html_file"

    local success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    sed -i.bak "s/SUCCESS_RATE/$success_rate/" "$html_file"

    if [ $FAILED_TESTS -gt 0 ]; then
        sed -i.bak "s/FAILED_CLASS/error/" "$html_file"
    else
        sed -i.bak "s/FAILED_CLASS//" "$html_file"
    fi

    # Build results table
    local results_html=""
    for test_key in "${!TEST_RESULTS[@]}"; do
        local test_name=$(echo "$test_key" | cut -d'_' -f1-2)
        local scenario=$(echo "$test_key" | rev | cut -d'_' -f1 | rev)
        local result="${TEST_RESULTS[$test_key]}"

        local requests="${PERFORMANCE_METRICS[${test_name}_${scenario}_requests]:-0}"
        local p95="${PERFORMANCE_METRICS[${test_name}_${scenario}_p95]:-0}"
        local avg="${PERFORMANCE_METRICS[${test_name}_${scenario}_avg]:-0}"
        local errors="${PERFORMANCE_METRICS[${test_name}_${scenario}_errors]:-0}"

        local result_class="pass"
        [ "$result" = "FAIL" ] && result_class="fail"

        results_html+="<tr>"
        results_html+="<td>$test_name</td>"
        results_html+="<td>$scenario</td>"
        results_html+="<td>$requests</td>"
        results_html+="<td>${p95}ms</td>"
        results_html+="<td>${avg}ms</td>"
        results_html+="<td>$(awk "BEGIN {printf \"%.2f%%\", $errors * 100}")</td>"
        results_html+="<td class='$result_class'>$result</td>"
        results_html+="</tr>"
    done

    sed -i.bak "s|TEST_RESULTS_PLACEHOLDER|$results_html|" "$html_file"

    rm -f "${html_file}.bak"

    log_success "HTML report generated: $html_file"
}

generate_summary_report() {
    log_header "Generating Summary Report"

    cat > "${REPORT_DIR}/LOAD_TEST_SUMMARY.md" << EOF
# MCP Bundle Load Testing Summary
**Generated:** $(date)

## Overview

- **Total Tests:** $TOTAL_TESTS
- **Passed:** $PASSED_TESTS
- **Failed:** $FAILED_TESTS
- **Success Rate:** $(( PASSED_TESTS * 100 / TOTAL_TESTS ))%

## Performance Baselines

| Scenario | P95 Target | Error Rate Threshold |
|----------|-----------|---------------------|
| Baseline | < 500ms   | < 1%               |
| Peak     | < 1000ms  | < 1%               |
| Stress   | < 2000ms  | < 5%               |

## Test Results

EOF

    for test_key in "${!TEST_RESULTS[@]}"; do
        local test_name=$(echo "$test_key" | cut -d'_' -f1-2)
        local scenario=$(echo "$test_key" | rev | cut -d'_' -f1 | rev)
        local result="${TEST_RESULTS[$test_key]}"

        local requests="${PERFORMANCE_METRICS[${test_name}_${scenario}_requests]:-0}"
        local p95="${PERFORMANCE_METRICS[${test_name}_${scenario}_p95]:-0}"
        local avg="${PERFORMANCE_METRICS[${test_name}_${scenario}_avg]:-0}"

        cat >> "${REPORT_DIR}/LOAD_TEST_SUMMARY.md" << EOF
### $test_name - $scenario

- **Result:** $result
- **Requests:** $requests
- **P95 Latency:** ${p95}ms
- **Avg Latency:** ${avg}ms

EOF
    done

    cat >> "${REPORT_DIR}/LOAD_TEST_SUMMARY.md" << EOF

## Recommendations

EOF

    if [ $FAILED_TESTS -gt 0 ]; then
        cat >> "${REPORT_DIR}/LOAD_TEST_SUMMARY.md" << EOF
**ACTION REQUIRED:** $FAILED_TESTS test(s) failed to meet performance baselines.

1. Review failed tests in detail
2. Investigate infrastructure bottlenecks
3. Consider scaling resources or optimizing code
4. Re-run tests after remediation

EOF
    else
        cat >> "${REPORT_DIR}/LOAD_TEST_SUMMARY.md" << EOF
All tests passed performance baselines. System is ready for production load.

Next steps:
1. Establish ongoing performance monitoring
2. Schedule regular load tests (monthly)
3. Document baseline metrics for future comparison

EOF
    fi

    log_success "Summary report generated: ${REPORT_DIR}/LOAD_TEST_SUMMARY.md"
}

# =============================================================================
# Main Execution
# =============================================================================

print_usage() {
    cat << EOF
Usage: $0 [options]

Options:
  --scenario <name>   Run specific scenario (baseline, peak, stress, all) [default: baseline]
  --target <service>  Test specific service (mcp, haproxy, postgres, redis, all) [default: all]
  --duration <time>   Test duration (e.g., 30s, 5m, 1h) [default: 30s]
  --vus <number>      Number of virtual users [default: 10]
  --output <path>     Custom report output directory
  -h, --help          Show this help message

Examples:
  $0                                    # Run baseline tests on all services
  $0 --scenario all --vus 50            # Run all scenarios with 50 VUs
  $0 --target postgres --scenario peak  # Peak test PostgreSQL only
  $0 --duration 5m --vus 100            # 5-minute test with 100 VUs

EOF
}

main() {
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --scenario)
                SCENARIO="$2"
                shift 2
                ;;
            --target)
                TARGET="$2"
                shift 2
                ;;
            --duration)
                DURATION="$2"
                shift 2
                ;;
            --vus)
                VUS="$2"
                shift 2
                ;;
            --output)
                REPORT_DIR="$2"
                shift 2
                ;;
            -h|--help)
                print_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done

    # Create report directory
    mkdir -p "$REPORT_DIR"

    log_header "MCP Bundle Load Testing Suite"
    log "Scenario: $SCENARIO"
    log "Target: $TARGET"
    log "Duration: $DURATION"
    log "Virtual Users: $VUS"
    log "Report Directory: $REPORT_DIR"

    # Install k6
    install_k6 || exit 1

    # Run tests based on target
    case "$TARGET" in
        mcp)
            run_mcp_service_tests
            ;;
        haproxy)
            run_haproxy_tests
            ;;
        postgres)
            run_postgres_tests
            ;;
        redis)
            run_redis_tests
            ;;
        all)
            run_mcp_service_tests
            run_haproxy_tests
            run_postgres_tests
            run_redis_tests
            ;;
        *)
            log_error "Unknown target: $TARGET"
            print_usage
            exit 1
            ;;
    esac

    # Generate reports
    generate_summary_report
    generate_html_report

    # Print final summary
    log_header "Load Testing Complete"
    log "Total Tests: $TOTAL_TESTS"
    log_success "Passed: $PASSED_TESTS ($(( PASSED_TESTS * 100 / TOTAL_TESTS ))%)"

    if [ $FAILED_TESTS -gt 0 ]; then
        log_error "Failed: $FAILED_TESTS"
    fi

    log ""
    log "Reports available at:"
    log "  Summary: ${REPORT_DIR}/LOAD_TEST_SUMMARY.md"
    log "  HTML: ${REPORT_DIR}/load_test_report.html"
    log "  Raw results: ${REPORT_DIR}/results/"

    # Exit with appropriate code
    if [ $FAILED_TESTS -gt 0 ]; then
        exit 1
    fi

    exit 0
}

# Run main function
main "$@"
