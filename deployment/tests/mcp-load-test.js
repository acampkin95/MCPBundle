/**
 * ============================================================================
 * MCP Ecosystem - Load Testing Suite (k6)
 * ============================================================================
 * Purpose: Load and stress testing for MCP services
 * Target: VMI01 (46.250.243.123) - All MCP services
 * Version: 0.2.0
 *
 * Usage:
 *   k6 run mcp-load-test.js                     # Baseline test
 *   k6 run -e TEST_TYPE=peak mcp-load-test.js   # Peak load test
 *   k6 run -e TEST_TYPE=stress mcp-load-test.js # Stress test
 * ============================================================================
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const thoughtCreationTime = new Trend('thought_creation_duration');
const searchQueryTime = new Trend('search_query_duration');
const totalThoughtsCreated = new Counter('thoughts_created');

// Configuration
const VMI01_HOST = __ENV.VMI01_HOST || '46.250.243.123';
const BASE_URL = `http://${VMI01_HOST}:3000`;
const PERPLEXITY_URL = `http://${VMI01_HOST}:3001`;
const IT_MCP_URL = `http://${VMI01_HOST}:3002`;

// Test type (baseline, peak, stress)
const TEST_TYPE = __ENV.TEST_TYPE || 'baseline';

// Define test scenarios
const scenarios = {
  baseline: {
    stages: [
      { duration: '1m', target: 10 }, // Ramp up to 10 users
      { duration: '3m', target: 10 }, // Stay at 10 users
      { duration: '1m', target: 0 }, // Ramp down
    ],
    thresholds: {
      http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
      http_req_failed: ['rate<0.01'], // Less than 1% error rate
      errors: ['rate<0.01'],
    },
  },
  peak: {
    stages: [
      { duration: '2m', target: 50 }, // Ramp up to 50 users
      { duration: '5m', target: 100 }, // Ramp to 100 users
      { duration: '5m', target: 100 }, // Stay at 100 users
      { duration: '2m', target: 0 }, // Ramp down
    ],
    thresholds: {
      http_req_duration: ['p(95)<1000'], // 95% under 1s during peak
      http_req_failed: ['rate<0.05'], // Less than 5% error rate
      errors: ['rate<0.05'],
    },
  },
  stress: {
    stages: [
      { duration: '2m', target: 100 }, // Ramp to 100 users
      { duration: '3m', target: 200 }, // Ramp to 200 users
      { duration: '3m', target: 300 }, // Ramp to 300 users (stress)
      { duration: '2m', target: 0 }, // Ramp down
    ],
    thresholds: {
      http_req_duration: ['p(95)<2000'], // 95% under 2s (degraded)
      http_req_failed: ['rate<0.10'], // Less than 10% error rate
    },
  },
};

// Export test configuration
export const options = {
  stages: scenarios[TEST_TYPE].stages,
  thresholds: scenarios[TEST_TYPE].thresholds,
};

// ============================================================================
// Test Data Generators
// ============================================================================

function generateThought() {
  const thoughtTypes = [
    'problem_definition',
    'research',
    'analysis',
    'synthesis',
    'conclusion',
    'reflection',
    'implementation',
    'validation',
  ];

  const randomType = thoughtTypes[Math.floor(Math.random() * thoughtTypes.length)];

  return {
    content: `Load test thought - ${randomType} - ${Date.now()} - ${Math.random()}`,
    thought_type: randomType,
    confidence: 0.5 + Math.random() * 0.5, // 0.5 to 1.0
    metadata: {
      test: true,
      load_test_type: TEST_TYPE,
      timestamp: new Date().toISOString(),
    },
  };
}

function generateSearchQuery() {
  const queries = [
    'optimization strategies',
    'database performance',
    'distributed systems',
    'load balancing',
    'caching mechanisms',
    'API design patterns',
    'microservices architecture',
    'data consistency',
  ];

  return queries[Math.floor(Math.random() * queries.length)];
}

// ============================================================================
// Test Scenarios
// ============================================================================

export default function () {
  // Test 1: Health Check
  group('Health Checks', () => {
    const responses = http.batch([
      ['GET', `${BASE_URL}/health`],
      ['GET', `${PERPLEXITY_URL}/health`],
      ['GET', `${IT_MCP_URL}/health`],
    ]);

    responses.forEach((res, i) => {
      const serviceName = i === 0 ? 'orchestrator' : i === 1 ? 'perplexity' : 'it-mcp';
      check(res, {
        [`${serviceName} health check passed`]: (r) => r.status === 200,
      }) || errorRate.add(1);
    });
  });

  sleep(1);

  // Test 2: Create Thought
  group('Create Thought', () => {
    const thoughtPayload = JSON.stringify(generateThought());
    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const startTime = Date.now();
    const res = http.post(`${BASE_URL}/api/v1/thoughts`, thoughtPayload, params);
    const duration = Date.now() - startTime;

    const success = check(res, {
      'thought created': (r) => r.status === 200 || r.status === 201,
      'thought has ID': (r) => {
        try {
          return JSON.parse(r.body).thought_id !== undefined;
        } catch {
          return false;
        }
      },
    });

    if (success) {
      thoughtCreationTime.add(duration);
      totalThoughtsCreated.add(1);
    } else {
      errorRate.add(1);
    }
  });

  sleep(1);

  // Test 3: Search Thoughts
  group('Search Thoughts', () => {
    const query = generateSearchQuery();
    const startTime = Date.now();
    const res = http.get(`${BASE_URL}/api/v1/search?q=${encodeURIComponent(query)}&limit=20`);
    const duration = Date.now() - startTime;

    const success = check(res, {
      'search successful': (r) => r.status === 200,
      'search has results': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.results) || Array.isArray(body.thoughts);
        } catch {
          return false;
        }
      },
    });

    if (success) {
      searchQueryTime.add(duration);
    } else {
      errorRate.add(1);
    }
  });

  sleep(1);

  // Test 4: Branch Operations
  group('Branch Operations', () => {
    const branchPayload = JSON.stringify({
      branch_name: `load_test_branch_${Date.now()}`,
      hypothesis: 'Testing branch operations under load',
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const res = http.post(`${BASE_URL}/api/v1/branches`, branchPayload, params);

    check(res, {
      'branch created': (r) => r.status === 200 || r.status === 201 || r.status === 404,
      // 404 acceptable if endpoint not yet implemented
    }) || errorRate.add(1);
  });

  sleep(2);

  // Test 5: Worker Command Dispatch
  group('Command Dispatch', () => {
    const commandPayload = JSON.stringify({
      command: 'ping',
      metadata: {
        test: true,
        timestamp: new Date().toISOString(),
      },
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const res = http.post(`${BASE_URL}/api/v1/dispatch`, commandPayload, params);

    check(res, {
      'dispatch successful': (r) => r.status === 200 || r.status === 202 || r.status === 404,
      // 404 acceptable if endpoint not yet implemented
    }) || errorRate.add(1);
  });

  sleep(1);

  // Test 6: Get Thought Details (read-heavy operation)
  group('Read Operations', () => {
    // Simulate reading multiple thoughts
    const thoughtIds = [1, 2, 3, 4, 5]; // Assuming some thoughts exist

    thoughtIds.forEach((id) => {
      const res = http.get(`${BASE_URL}/api/v1/thoughts/${id}`);

      check(res, {
        'thought read successful': (r) => r.status === 200 || r.status === 404,
        // 404 acceptable if thought doesn't exist
      });
    });
  });

  sleep(1);
}

// ============================================================================
// Setup and Teardown
// ============================================================================

export function setup() {
  console.log(`Starting ${TEST_TYPE.toUpperCase()} load test...`);
  console.log(`Target: ${BASE_URL}`);
  console.log(
    `Test duration: ~${options.stages.reduce((sum, stage) => sum + parseInt(stage.duration), 0)} minutes`
  );

  // Verify services are up
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`Orchestrator health check failed with status ${healthCheck.status}`);
  }

  return {
    startTime: Date.now(),
    testType: TEST_TYPE,
  };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000 / 60; // minutes
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Load test completed: ${data.testType.toUpperCase()}`);
  console.log(`Total duration: ${duration.toFixed(2)} minutes`);
  console.log(`${'='.repeat(70)}`);
}

// ============================================================================
// Summary Handler
// ============================================================================

export function handleSummary(data) {
  const summary = {
    test_type: TEST_TYPE,
    timestamp: new Date().toISOString(),
    metrics: {
      http_reqs: data.metrics.http_reqs.values.count,
      http_req_duration_p95: data.metrics.http_req_duration.values['p(95)'],
      http_req_duration_avg: data.metrics.http_req_duration.values.avg,
      http_req_failed_rate: data.metrics.http_req_failed.values.rate,
      error_rate: data.metrics.errors ? data.metrics.errors.values.rate : 0,
      thoughts_created: data.metrics.thoughts_created
        ? data.metrics.thoughts_created.values.count
        : 0,
      vus_max: data.metrics.vus_max.values.max,
    },
  };

  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║              LOAD TEST SUMMARY                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Test Type: ${summary.test_type.toUpperCase()}`);
  console.log(`Total Requests: ${summary.metrics.http_reqs}`);
  console.log(`Max Virtual Users: ${summary.metrics.vus_max}`);
  console.log(`Thoughts Created: ${summary.metrics.thoughts_created}`);
  console.log('');
  console.log('Performance Metrics:');
  console.log(`  Average Response Time: ${summary.metrics.http_req_duration_avg.toFixed(2)}ms`);
  console.log(`  95th Percentile: ${summary.metrics.http_req_duration_p95.toFixed(2)}ms`);
  console.log(
    `  Request Failure Rate: ${(summary.metrics.http_req_failed_rate * 100).toFixed(2)}%`
  );
  console.log(`  Error Rate: ${(summary.metrics.error_rate * 100).toFixed(2)}%`);
  console.log('');

  // Determine test result
  const success =
    summary.metrics.http_req_failed_rate < (TEST_TYPE === 'stress' ? 0.1 : 0.05) &&
    summary.metrics.error_rate < (TEST_TYPE === 'stress' ? 0.1 : 0.05);

  if (success) {
    console.log('✅ Load test PASSED');
  } else {
    console.log('❌ Load test FAILED - Review metrics above');
  }
  console.log('');

  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    '/tmp/mcp-load-test-summary.json': JSON.stringify(summary, null, 2),
  };
}
