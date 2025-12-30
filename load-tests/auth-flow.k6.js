/**
 * k6 Load Test: Authentication Flow
 *
 * Tests:
 * - User registration
 * - User login
 * - Forgot password (Priority 1 email)
 * - Get profile (authenticated)
 *
 * Usage:
 *   k6 run load-tests/auth-flow.k6.js
 *
 * With custom options:
 *   k6 run --vus 100 --duration 5m load-tests/auth-flow.k6.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const forgotPasswordDuration = new Trend('forgot_password_duration');
const registrationDuration = new Trend('registration_duration');
const loginDuration = new Trend('login_duration');
const forgotPasswordCount = new Counter('forgot_password_requests');

// Test configuration
export const options = {
  // Gradually ramp up load
  stages: [
    { duration: '1m', target: 20 },    // Warm up: ramp to 20 users
    { duration: '2m', target: 20 },    // Stay at 20 users
    { duration: '1m', target: 50 },    // Ramp to 50 users
    { duration: '3m', target: 50 },    // Stay at 50 users
    { duration: '1m', target: 100 },   // Ramp to 100 users
    { duration: '3m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 0 },     // Ramp down
  ],

  // Performance thresholds
  thresholds: {
    'http_req_duration': ['p(95)<1000'],           // 95% requests < 1s
    'http_req_duration{name:Register}': ['p(95)<800'],
    'http_req_duration{name:Login}': ['p(95)<500'],
    'http_req_duration{name:ForgotPassword}': ['p(95)<300'],  // Priority 1 should be fast!
    'http_req_failed': ['rate<0.01'],              // Error rate < 1%
    'errors': ['rate<0.01'],
  },
};

// Configuration
const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const THINK_TIME = 2; // seconds between requests

// Utility functions
function randomString(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function randomEmail() {
  return `loadtest-${Date.now()}-${randomString(8)}@test.com`;
}

// Main test function
export default function () {
  const email = randomEmail();
  const password = 'LoadTest123!';
  const name = 'Load Test User';
  let authToken;

  // Group 1: User Registration
  group('User Registration', () => {
    const payload = JSON.stringify({
      email: email,
      name: name,
      password: password,
    });

    const startTime = Date.now();

    const res = http.post(
      `${BASE_URL}/api/auth/register`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'Register' },
      }
    );

    const duration = Date.now() - startTime;
    registrationDuration.add(duration);

    const success = check(res, {
      'register: status is 201': (r) => r.status === 201,
      'register: has token': (r) => {
        try {
          return r.json('token') !== undefined;
        } catch (e) {
          return false;
        }
      },
      'register: has user id': (r) => {
        try {
          return r.json('user.id') !== undefined;
        } catch (e) {
          return false;
        }
      },
      'register: response time < 1s': (r) => r.timings.duration < 1000,
    });

    if (!success) {
      console.error(`Registration failed: ${res.status} - ${res.body}`);
      errorRate.add(1);
    } else {
      errorRate.add(0);
      try {
        authToken = res.json('token');
      } catch (e) {
        console.error('Failed to parse token from response');
      }
    }
  });

  sleep(THINK_TIME);

  // Group 2: User Login
  group('User Login', () => {
    const payload = JSON.stringify({
      email: email,
      password: password,
    });

    const startTime = Date.now();

    const res = http.post(
      `${BASE_URL}/api/auth/login`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'Login' },
      }
    );

    const duration = Date.now() - startTime;
    loginDuration.add(duration);

    const success = check(res, {
      'login: status is 200': (r) => r.status === 200,
      'login: has token': (r) => {
        try {
          return r.json('token') !== undefined;
        } catch (e) {
          return false;
        }
      },
      'login: response time < 500ms': (r) => r.timings.duration < 500,
    });

    if (!success) {
      errorRate.add(1);
    } else {
      errorRate.add(0);
      try {
        authToken = res.json('token');
      } catch (e) {
        console.error('Failed to parse token from login response');
      }
    }
  });

  sleep(THINK_TIME);

  // Group 3: Forgot Password (PRIORITY 1 EMAIL)
  group('Forgot Password (Priority 1)', () => {
    const payload = JSON.stringify({
      email: email,
    });

    const startTime = Date.now();

    const res = http.post(
      `${BASE_URL}/api/auth/forgot-password`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'ForgotPassword' },
      }
    );

    const duration = Date.now() - startTime;
    forgotPasswordDuration.add(duration);
    forgotPasswordCount.add(1);

    const success = check(res, {
      'forgot password: status is 200': (r) => r.status === 200,
      'forgot password: has message': (r) => {
        try {
          return r.json('message') !== undefined;
        } catch (e) {
          return false;
        }
      },
      'forgot password: response time < 500ms': (r) => r.timings.duration < 500,
      'forgot password: FAST (< 200ms)': (r) => r.timings.duration < 200,  // Should be very fast!
    });

    if (!success) {
      console.error(`Forgot password failed: ${res.status} - ${res.body}`);
      errorRate.add(1);
    } else {
      errorRate.add(0);
    }
  });

  sleep(THINK_TIME);

  // Group 4: Get Profile (Authenticated)
  if (authToken) {
    group('Get User Profile', () => {
      const res = http.get(
        `${BASE_URL}/api/auth/me`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          },
          tags: { name: 'GetProfile' },
        }
      );

      const success = check(res, {
        'get profile: status is 200': (r) => r.status === 200,
        'get profile: has user data': (r) => {
          try {
            return r.json('user') !== undefined;
          } catch (e) {
            return false;
          }
        },
        'get profile: has email': (r) => {
          try {
            return r.json('user.email') === email;
          } catch (e) {
            return false;
          }
        },
      });

      if (!success) {
        errorRate.add(1);
      } else {
        errorRate.add(0);
      }
    });
  }

  sleep(THINK_TIME);
}

// Setup function (runs once before test)
export function setup() {
  console.log(`🚀 Starting load test against ${BASE_URL}`);
  console.log('📊 Test will gradually ramp up to 100 concurrent users');
  console.log('⏱️  Total duration: ~13 minutes');

  // Verify API is accessible
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`API health check failed: ${res.status}`);
  }

  console.log('✅ API is healthy, starting test...\n');

  return { apiUrl: BASE_URL };
}

// Teardown function (runs once after test)
export function teardown(data) {
  console.log('\n🏁 Load test completed!');
  console.log('📈 Check the summary above for results');
  console.log('🔍 Check your monitoring dashboards for detailed metrics');
}

// Handle summary
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-tests/results/auth-flow-summary.json': JSON.stringify(data),
  };
}

// Helper function for text summary
function textSummary(data, opts = {}) {
  const indent = opts.indent || '';
  const enableColors = opts.enableColors || false;

  let summary = '\n';
  summary += `${indent}Test Summary:\n`;
  summary += `${indent}  Total Requests: ${data.metrics.http_reqs.values.count}\n`;
  summary += `${indent}  Failed Requests: ${data.metrics.http_req_failed.values.rate * 100}%\n`;
  summary += `${indent}  Avg Duration: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms\n`;
  summary += `${indent}  P95 Duration: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms\n`;
  summary += `${indent}  P99 Duration: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms\n`;

  return summary;
}
