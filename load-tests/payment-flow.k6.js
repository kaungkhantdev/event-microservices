/**
 * k6 Load Test: Authenticated Payment Flow
 *
 * Tests:
 * - User login
 * - Create payment (authenticated)
 * - Check payment status
 *
 * Usage:
 *   k6 run load-tests/payment-flow.k6.js
 *
 * Prerequisites:
 *   - Create a test user first: email=loadtest@test.com, password=LoadTest123!
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const paymentDuration = new Trend('payment_duration');
const paymentSuccessRate = new Rate('payment_success');
const paymentCount = new Counter('total_payments');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 10 },
    { duration: '30s', target: 25 },
    { duration: '2m', target: 25 },
    { duration: '30s', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 0 },
  ],

  thresholds: {
    'payment_duration': ['p(95)<3000'],  // 95% payments < 3s
    'payment_success': ['rate>0.99'],    // 99% success rate
    'errors': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = __ENV.TEST_USER_EMAIL || 'loadtest@test.com';
const TEST_USER_PASSWORD = __ENV.TEST_USER_PASSWORD || 'LoadTest123!';

// Setup: Create test user if doesn't exist
export function setup() {
  console.log(`🚀 Starting payment flow test against ${BASE_URL}`);

  // Try to login
  let loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  let token;

  // If login fails, register user
  if (loginRes.status !== 200) {
    console.log('Test user not found, creating...');

    const registerRes = http.post(
      `${BASE_URL}/api/auth/register`,
      JSON.stringify({
        email: TEST_USER_EMAIL,
        name: 'Load Test User',
        password: TEST_USER_PASSWORD,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    if (registerRes.status !== 201) {
      throw new Error(`Failed to create test user: ${registerRes.status}`);
    }

    token = registerRes.json('token');
    console.log('✅ Test user created');
  } else {
    token = loginRes.json('token');
    console.log('✅ Test user authenticated');
  }

  return { token };
}

export default function (data) {
  const token = data.token;

  // Group 1: Create Payment
  group('Create Payment', () => {
    const payload = JSON.stringify({
      amount: parseFloat((Math.random() * 100 + 10).toFixed(2)),  // Random amount $10-$110
      currency: 'USD',
      description: `Load test payment ${Date.now()}`,
      metadata: {
        testId: `loadtest-${Date.now()}`,
      },
    });

    const startTime = Date.now();

    const res = http.post(
      `${BASE_URL}/api/payments`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        tags: { name: 'CreatePayment' },
      }
    );

    const duration = Date.now() - startTime;
    paymentDuration.add(duration);
    paymentCount.add(1);

    const success = check(res, {
      'payment: status is 202': (r) => r.status === 202,
      'payment: has jobId': (r) => {
        try {
          return r.json('jobId') !== undefined;
        } catch (e) {
          return false;
        }
      },
      'payment: has message': (r) => {
        try {
          return r.json('message') !== undefined;
        } catch (e) {
          return false;
        }
      },
      'payment: response time < 5s': (r) => r.timings.duration < 5000,
    });

    if (!success) {
      console.error(`Payment creation failed: ${res.status} - ${res.body}`);
      errorRate.add(1);
      paymentSuccessRate.add(0);
    } else {
      errorRate.add(0);
      paymentSuccessRate.add(1);

      // Check payment status
      const jobId = res.json('jobId');

      sleep(2); // Wait for payment to process

      group('Check Payment Status', () => {
        const statusRes = http.get(
          `${BASE_URL}/api/payments/status/${jobId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
            tags: { name: 'PaymentStatus' },
          }
        );

        check(statusRes, {
          'status: response is 200': (r) => r.status === 200,
          'status: has state': (r) => {
            try {
              return r.json('state') !== undefined;
            } catch (e) {
              return false;
            }
          },
        });
      });
    }
  });

  sleep(3);
}

export function teardown(data) {
  console.log('\n🏁 Payment flow test completed!');
  console.log('💳 Check payment service logs for processing details');
}
