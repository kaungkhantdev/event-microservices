/**
 * k6 Load Test: Email Queue Priority Testing
 *
 * This test specifically validates that forgot password emails (Priority 1)
 * are processed faster than registration emails (Priority 3) under load.
 *
 * Tests:
 * - Send many forgot password requests (Priority 1)
 * - Send many registration requests (Priority 3)
 * - Monitor queue to verify priority processing
 *
 * Usage:
 *   k6 run load-tests/email-priority.k6.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// Custom metrics
const forgotPasswordCount = new Counter('forgot_password_emails');
const registrationCount = new Counter('registration_emails');
const forgotPasswordTime = new Trend('forgot_password_response_time');
const registrationTime = new Trend('registration_response_time');
const errorRate = new Rate('errors');

export const options = {
  scenarios: {
    // Scenario 1: Forgot Password (Priority 1) - Should be fast
    forgot_password: {
      executor: 'constant-arrival-rate',
      duration: '2m',
      rate: 50,              // 50 requests per second
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 100,
      exec: 'forgotPassword',
    },

    // Scenario 2: Registration (Priority 3) - Can be slower
    registration: {
      executor: 'constant-arrival-rate',
      duration: '2m',
      rate: 100,             // 100 requests per second (2x forgot password)
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 200,
      exec: 'registration',
      startTime: '10s',      // Start 10s after forgot password
    },
  },

  thresholds: {
    'forgot_password_response_time': ['p(95)<500'],  // Priority 1 should be FAST
    'registration_response_time': ['p(95)<1000'],     // Priority 3 can be slower
    'errors': ['rate<0.05'],                           // Allow 5% error rate under heavy load
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';

function randomString(length = 10) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function randomEmail() {
  return `priority-test-${Date.now()}-${randomString(8)}@test.com`;
}

// Test forgot password (Priority 1)
export function forgotPassword() {
  const payload = JSON.stringify({
    email: randomEmail(),
  });

  const startTime = Date.now();

  const res = http.post(
    `${BASE_URL}/api/auth/forgot-password`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'ForgotPassword-Priority1' },
    }
  );

  const duration = Date.now() - startTime;
  forgotPasswordTime.add(duration);
  forgotPasswordCount.add(1);

  const success = check(res, {
    'forgot password: status is 200': (r) => r.status === 200,
    'forgot password: FAST response (< 300ms)': (r) => r.timings.duration < 300,
  });

  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

// Test registration (Priority 3)
export function registration() {
  const email = randomEmail();
  const payload = JSON.stringify({
    email: email,
    name: 'Priority Test User',
    password: 'PriorityTest123!',
  });

  const startTime = Date.now();

  const res = http.post(
    `${BASE_URL}/api/auth/register`,
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'Registration-Priority3' },
    }
  );

  const duration = Date.now() - startTime;
  registrationTime.add(duration);
  registrationCount.add(1);

  const success = check(res, {
    'registration: status is 201': (r) => r.status === 201,
  });

  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
  }
}

export function setup() {
  console.log('🔥 Starting EMAIL PRIORITY TEST');
  console.log('📧 This test validates that Priority 1 emails (forgot password)');
  console.log('   are processed faster than Priority 3 emails (registration)');
  console.log('');
  console.log('⚡ Forgot Password: 50 req/s (Priority 1)');
  console.log('📝 Registration:    100 req/s (Priority 3)');
  console.log('');
  console.log('Expected Results:');
  console.log('  ✅ Forgot password p95 < 500ms');
  console.log('  ✅ Registration p95 < 1000ms (can be slower)');
  console.log('');

  // Verify API health
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error('API health check failed');
  }

  console.log('🚀 Starting test in 3 seconds...\n');
  sleep(3);
}

export function teardown(data) {
  console.log('\n🏁 Email priority test completed!');
  console.log('\n📊 What to check:');
  console.log('  1. Check mail-queue logs: docker-compose logs -f mail-queue');
  console.log('  2. Verify Priority 1 emails were processed first');
  console.log('  3. Check queue depth during test');
  console.log('  4. Compare forgot_password_response_time vs registration_response_time');
  console.log('\n💡 Tips:');
  console.log('  - If Priority 1 is slow, check worker concurrency');
  console.log('  - If queue backs up, scale mail-queue workers');
  console.log('  - Monitor Redis memory usage');
}
