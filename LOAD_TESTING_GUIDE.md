# Load Testing Guide for Production

Complete guide for load testing your microservices architecture in production.

## Table of Contents
1. [Overview](#overview)
2. [Load Testing Tools](#load-testing-tools)
3. [Test Scenarios](#test-scenarios)
4. [Metrics to Monitor](#metrics-to-monitor)
5. [Production Testing Strategy](#production-testing-strategy)
6. [Step-by-Step Guides](#step-by-step-guides)
7. [Analysis & Optimization](#analysis--optimization)

---

## Overview

Your system has multiple components that need different testing approaches:

```
┌─────────────────────────────────────────────────────┐
│                  Load Balancer                       │
│                (ALB / NGINX)                         │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│                   API Gateway                        │
│  - Auth endpoints (login, register, reset)          │
│  - Payment endpoints (requires auth)                 │
│  - Event endpoints                                   │
└─────────────────────────────────────────────────────┘
                         │
          ┌──────────────┴──────────────┐
          ▼                             ▼
    ┌──────────┐                 ┌──────────┐
    │  Redis   │                 │ MongoDB  │
    │ (Queue)  │                 │ (Users)  │
    └──────────┘                 └──────────┘
          │
          ▼
    ┌──────────────────────────────┐
    │  Background Workers          │
    │  - Mail Queue (Priority 1-5) │
    │  - Payment Service           │
    │  - ElasticSync Worker        │
    └──────────────────────────────┘
```

---

## Load Testing Tools

### 1. **k6** (Recommended) ⭐
Modern, developer-friendly load testing tool with JavaScript.

**Pros:**
- Easy to write tests in JavaScript
- Great for CI/CD integration
- Excellent metrics and reporting
- Can test WebSockets, gRPC
- Cloud integration available

**Install:**
```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker pull grafana/k6
```

---

### 2. **Artillery**
Node.js based load testing toolkit.

**Install:**
```bash
npm install -g artillery
```

---

### 3. **Apache JMeter**
Java-based GUI tool for complex scenarios.

**Download:** https://jmeter.apache.org/download_jmeter.cgi

---

### 4. **Gatling**
Scala-based tool with beautiful reports.

**Download:** https://gatling.io/

---

### 5. **Locust**
Python-based, great for custom scenarios.

**Install:**
```bash
pip install locust
```

---

## Test Scenarios

### Scenario 1: Authentication Flow Load Test
Test user registration, login, and forgot password endpoints.

**Target Metrics:**
- 1,000 requests/second
- < 200ms p95 latency
- < 1% error rate

---

### Scenario 2: Payment Processing with Authentication
Test authenticated payment flow under load.

**Target Metrics:**
- 500 payments/second
- < 500ms p95 latency
- 0% payment failures
- Queue doesn't overflow

---

### Scenario 3: Email Queue Priority Testing
Verify forgot password emails (Priority 1) are processed first under heavy load.

**Target Metrics:**
- 10,000 emails queued
- Forgot password emails processed within 5 seconds
- Lower priority emails can wait
- No queue saturation

---

### Scenario 4: Database Performance
Test read/write performance under concurrent load.

**Target Metrics:**
- 5,000 writes/second
- 10,000 reads/second
- < 100ms query time

---

## Metrics to Monitor

### Application Metrics
```bash
# API Response Time
- p50, p95, p99 latency
- Requests per second
- Error rate (4xx, 5xx)
- Success rate

# Authentication
- Login time
- Token generation time
- Password hash time (bcrypt)
- JWT verification time

# Queue Metrics
- Jobs queued per second
- Jobs processed per second
- Queue depth (waiting jobs)
- Job processing time by priority
- Failed jobs rate

# Payment Processing
- Payment success rate
- Payment processing time
- Transaction throughput
```

### Infrastructure Metrics
```bash
# CPU & Memory
- CPU utilization %
- Memory usage
- Swap usage
- OOM kills

# Network
- Network I/O
- Connections established
- Connections in TIME_WAIT

# Database
- Connection pool usage
- Query execution time
- Deadlocks
- Slow queries

# Redis
- Memory usage
- Commands/sec
- Hit rate
- Evictions
```

---

## Production Testing Strategy

### ⚠️ Safety First

**NEVER** load test production without:

1. **Notification** - Alert team before testing
2. **Monitoring** - Have dashboards ready
3. **Rollback Plan** - Know how to stop and recover
4. **Off-Peak Hours** - Test during low traffic
5. **Gradual Ramp-Up** - Start small, increase slowly
6. **Rate Limiting** - Protect your infrastructure
7. **Synthetic Data** - Use test accounts, not real users

---

### Testing Approaches

#### **A. Shadow Traffic** (Safest)
Mirror production traffic to test environment.

```yaml
# NGINX configuration
location /api/ {
    mirror /mirror;
    proxy_pass http://production;
}

location /mirror {
    internal;
    proxy_pass http://test-environment;
}
```

---

#### **B. Canary Testing**
Route small percentage of traffic to new deployment.

```yaml
# 5% traffic to new version
upstream backend {
    server new-version:3000 weight=5;
    server old-version:3000 weight=95;
}
```

---

#### **C. Blue/Green Testing**
Test on identical environment, then switch.

```
Production (Blue) ─────> Users
Testing (Green)   ─────> Load Test
```

---

#### **D. Synthetic Load** (Recommended)
Generate artificial traffic with load testing tools.

---

## Step-by-Step Guides

### Guide 1: k6 Authentication Flow Test

Create `load-tests/auth-flow.js`:

```javascript
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up to 100 users
    { duration: '5m', target: 100 },   // Stay at 100 users
    { duration: '2m', target: 200 },   // Ramp up to 200 users
    { duration: '5m', target: 200 },   // Stay at 200 users
    { duration: '2m', target: 0 },     // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],  // 95% requests < 500ms
    'errors': ['rate<0.01'],              // Error rate < 1%
  },
};

const BASE_URL = 'https://your-production-api.com';

// Generate random email
function randomEmail() {
  return `loadtest-${Date.now()}-${Math.random().toString(36).substring(7)}@test.com`;
}

export default function () {
  let authToken;

  // Test 1: Register
  group('Register User', () => {
    const registerPayload = JSON.stringify({
      email: randomEmail(),
      name: 'Load Test User',
      password: 'TestPassword123!',
    });

    const registerRes = http.post(
      `${BASE_URL}/api/auth/register`,
      registerPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'Register' },
      }
    );

    const registerSuccess = check(registerRes, {
      'register status is 201': (r) => r.status === 201,
      'register has token': (r) => r.json('token') !== undefined,
    });

    errorRate.add(!registerSuccess);

    if (registerSuccess) {
      authToken = registerRes.json('token');
    }
  });

  sleep(1);

  // Test 2: Login
  group('Login User', () => {
    const loginPayload = JSON.stringify({
      email: randomEmail(),
      password: 'TestPassword123!',
    });

    const loginRes = http.post(
      `${BASE_URL}/api/auth/login`,
      loginPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'Login' },
      }
    );

    // We expect this to fail since we're using a different email
    check(loginRes, {
      'login attempted': (r) => r.status === 401 || r.status === 200,
    });
  });

  sleep(1);

  // Test 3: Forgot Password (Priority 1 Email)
  group('Forgot Password', () => {
    const forgotPayload = JSON.stringify({
      email: randomEmail(),
    });

    const forgotRes = http.post(
      `${BASE_URL}/api/auth/forgot-password`,
      forgotPayload,
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'ForgotPassword' },
      }
    );

    const forgotSuccess = check(forgotRes, {
      'forgot password status is 200': (r) => r.status === 200,
      'forgot password response time < 1s': (r) => r.timings.duration < 1000,
    });

    errorRate.add(!forgotSuccess);
  });

  sleep(1);

  // Test 4: Get Profile (Authenticated)
  if (authToken) {
    group('Get Profile', () => {
      const profileRes = http.get(`${BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        tags: { name: 'GetProfile' },
      });

      const profileSuccess = check(profileRes, {
        'profile status is 200': (r) => r.status === 200,
        'profile has user data': (r) => r.json('user') !== undefined,
      });

      errorRate.add(!profileSuccess);
    });
  }

  sleep(1);
}
```

**Run the test:**
```bash
k6 run load-tests/auth-flow.js

# With cloud output
k6 run --out cloud load-tests/auth-flow.js
```

---

### Guide 2: k6 Payment Flow Test

Create `load-tests/payment-flow.js`:

```javascript
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const paymentDuration = new Trend('payment_duration');

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '3m', target: 100 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    'payment_duration': ['p(95)<2000'],  // 95% payments < 2s
    'errors': ['rate<0.001'],             // Error rate < 0.1%
  },
};

const BASE_URL = 'https://your-production-api.com';

let globalToken = null;

// Setup: Login once to get token
export function setup() {
  // In production, use a dedicated test account
  const loginPayload = JSON.stringify({
    email: 'loadtest@example.com',
    password: 'LoadTestPassword123!',
  });

  const loginRes = http.post(
    `${BASE_URL}/api/auth/login`,
    loginPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (loginRes.status === 200) {
    return { token: loginRes.json('token') };
  }

  throw new Error('Setup failed: Could not login');
}

export default function (data) {
  const token = data.token;

  // Test: Create Payment
  group('Create Payment', () => {
    const paymentPayload = JSON.stringify({
      amount: 29.99,
      currency: 'USD',
      description: 'Load test payment',
    });

    const startTime = Date.now();

    const paymentRes = http.post(
      `${BASE_URL}/api/payments`,
      paymentPayload,
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

    const paymentSuccess = check(paymentRes, {
      'payment status is 202': (r) => r.status === 202,
      'payment has jobId': (r) => r.json('jobId') !== undefined,
      'payment response time < 3s': (r) => r.timings.duration < 3000,
    });

    errorRate.add(!paymentSuccess);

    // Check payment status
    if (paymentSuccess) {
      const jobId = paymentRes.json('jobId');

      sleep(2); // Wait for processing

      const statusRes = http.get(
        `${BASE_URL}/api/payments/status/${jobId}`,
        {
          headers: { 'Authorization': `Bearer ${token}` },
          tags: { name: 'PaymentStatus' },
        }
      );

      check(statusRes, {
        'status check successful': (r) => r.status === 200,
      });
    }
  });

  sleep(3);
}
```

**Run the test:**
```bash
k6 run load-tests/payment-flow.js
```

---

### Guide 3: Artillery Email Queue Priority Test

Create `load-tests/email-queue.yml`:

```yaml
config:
  target: "https://your-production-api.com"
  phases:
    - duration: 60
      arrivalRate: 10      # 10 requests/sec
      name: "Warm up"
    - duration: 120
      arrivalRate: 50      # 50 requests/sec
      name: "Ramp up"
    - duration: 300
      arrivalRate: 100     # 100 requests/sec
      name: "Sustained load"
    - duration: 60
      arrivalRate: 10      # 10 requests/sec
      name: "Cool down"
  plugins:
    expect: {}
    metrics-by-endpoint: {}

scenarios:
  - name: "Forgot Password (Priority 1)"
    weight: 30  # 30% of traffic
    flow:
      - post:
          url: "/api/auth/forgot-password"
          json:
            email: "loadtest-{{ $randomString() }}@test.com"
          expect:
            - statusCode: 200
            - contentType: json
          capture:
            - json: "$.message"
              as: "message"

  - name: "Register (Priority 3)"
    weight: 50  # 50% of traffic
    flow:
      - post:
          url: "/api/auth/register"
          json:
            email: "user-{{ $randomString() }}@test.com"
            name: "Load Test User"
            password: "TestPassword123!"
          expect:
            - statusCode: 201
            - contentType: json

  - name: "Login"
    weight: 20  # 20% of traffic
    flow:
      - post:
          url: "/api/auth/login"
          json:
            email: "existing-user@test.com"
            password: "ExistingPassword123!"
          expect:
            - statusCode: [200, 401]  # May fail if user doesn't exist
```

**Run the test:**
```bash
artillery run load-tests/email-queue.yml

# With HTML report
artillery run --output report.json load-tests/email-queue.yml
artillery report report.json
```

---

### Guide 4: Locust Load Test (Python)

Create `load-tests/locustfile.py`:

```python
from locust import HttpUser, task, between
import random
import string

def random_email():
    """Generate random email for testing"""
    random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
    return f"loadtest-{random_str}@test.com"

class AuthUser(HttpUser):
    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks

    def on_start(self):
        """Login once when user starts"""
        self.token = None
        self.login()

    def login(self):
        """Login to get auth token"""
        response = self.client.post("/api/auth/login", json={
            "email": "loadtest@example.com",
            "password": "LoadTestPassword123!"
        })

        if response.status_code == 200:
            self.token = response.json().get("token")

    @task(5)  # Weight: 5 (runs 5x more often)
    def register_user(self):
        """Register new user"""
        self.client.post("/api/auth/register", json={
            "email": random_email(),
            "name": "Load Test User",
            "password": "TestPassword123!"
        }, name="Register")

    @task(3)  # Weight: 3
    def forgot_password(self):
        """Test forgot password (Priority 1 email)"""
        self.client.post("/api/auth/forgot-password", json={
            "email": random_email()
        }, name="Forgot Password (Priority 1)")

    @task(2)  # Weight: 2
    def get_profile(self):
        """Get user profile (authenticated)"""
        if self.token:
            self.client.get("/api/auth/me",
                headers={"Authorization": f"Bearer {self.token}"},
                name="Get Profile")

    @task(1)  # Weight: 1
    def create_payment(self):
        """Create payment (authenticated)"""
        if self.token:
            response = self.client.post("/api/payments",
                json={
                    "amount": 29.99,
                    "currency": "USD",
                    "description": "Load test payment"
                },
                headers={"Authorization": f"Bearer {self.token}"},
                name="Create Payment")

            # Check payment status
            if response.status_code == 202:
                job_id = response.json().get("jobId")
                self.client.get(f"/api/payments/status/{job_id}",
                    headers={"Authorization": f"Bearer {self.token}"},
                    name="Payment Status")
```

**Run Locust:**
```bash
# Web UI mode
locust -f load-tests/locustfile.py --host=https://your-production-api.com

# Headless mode
locust -f load-tests/locustfile.py \
  --host=https://your-production-api.com \
  --users 100 \
  --spawn-rate 10 \
  --run-time 5m \
  --headless
```

---

## Monitoring During Load Tests

### 1. Real-Time Monitoring Dashboard

**Create Grafana Dashboard:**

```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus

  node-exporter:
    image: prom/node-exporter:latest
    ports:
      - "9100:9100"

volumes:
  prometheus_data:
  grafana_data:
```

---

### 2. Application Performance Monitoring (APM)

**Option A: New Relic**
```javascript
// api/server.js
require('newrelic');
```

**Option B: Datadog**
```javascript
// api/server.js
const tracer = require('dd-trace').init();
```

**Option C: Sentry (Already integrated)**
```javascript
// Already configured in your system
```

---

### 3. Redis Queue Monitoring

**Monitor Queue Depth:**
```bash
# Watch queue stats in real-time
watch -n 1 'redis-cli -h localhost -p 6379 INFO stats | grep instantaneous'

# Check queue lengths
redis-cli LLEN bull:mail:wait
redis-cli LLEN bull:mail:active
redis-cli LLEN bull:mail:completed
redis-cli LLEN bull:mail:failed
```

**Bull Board Dashboard:**
```javascript
// Add to api/server.js
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const serverAdapter = new ExpressAdapter();
createBullBoard({
  queues: [
    new BullAdapter(mailQueue),
    new BullAdapter(paymentQueue),
  ],
  serverAdapter,
});

serverAdapter.setBasePath('/admin/queues');
app.use('/admin/queues', serverAdapter.getRouter());
```

Access at: `http://localhost:3000/admin/queues`

---

## Analysis & Optimization

### Analyzing Results

#### 1. Response Time Analysis
```
Target: p95 < 500ms

Results:
- p50: 180ms ✅
- p95: 650ms ❌
- p99: 1200ms ❌

Action: Need optimization
```

#### 2. Throughput Analysis
```
Target: 1000 req/s

Results:
- Achieved: 750 req/s ❌
- Bottleneck: Database connections

Action: Increase connection pool
```

#### 3. Error Rate Analysis
```
Target: < 1% errors

Results:
- 4xx errors: 0.5% ✅
- 5xx errors: 2.3% ❌

Action: Check application logs
```

---

### Common Bottlenecks & Solutions

#### **1. Database Connection Pool Exhausted**

**Symptom:**
```
Error: Connection pool timeout
```

**Solution:**
```javascript
// api/config/database.js
mongoose.connect(uri, {
  maxPoolSize: 100,    // Increase from 10
  minPoolSize: 10,
  socketTimeoutMS: 45000,
});
```

---

#### **2. Redis Queue Saturated**

**Symptom:**
```
Queue depth growing exponentially
Workers can't keep up
```

**Solution:**
```yaml
# docker-compose.yml - Scale workers
mail-queue:
  deploy:
    replicas: 5  # Run 5 worker instances
```

---

#### **3. CPU/Memory Limits**

**Symptom:**
```
High CPU usage (> 80%)
Memory growing
```

**Solution:**
```yaml
# docker-compose.yml
api:
  deploy:
    resources:
      limits:
        cpus: '2'
        memory: 2G
      reservations:
        cpus: '1'
        memory: 512M
```

---

#### **4. JWT Verification Overhead**

**Symptom:**
```
Slow authenticated requests
High CPU on token verification
```

**Solution:**
```javascript
// Add token caching
const NodeCache = require('node-cache');
const tokenCache = new NodeCache({ stdTTL: 300 }); // 5 min cache

const authenticate = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  // Check cache first
  let decoded = tokenCache.get(token);

  if (!decoded) {
    decoded = jwt.verify(token, jwtConfig.secret);
    tokenCache.set(token, decoded);
  }

  // ... rest of authentication
};
```

---

#### **5. Bcrypt Password Hashing Too Slow**

**Symptom:**
```
Registration taking > 500ms
High CPU on auth endpoints
```

**Solution:**
```javascript
// Reduce salt rounds in high-load scenarios (with caution)
// api/config/auth.js
bcrypt: {
  saltRounds: 8,  // Reduce from 10 (less secure but faster)
}

// Or use argon2 (faster, more secure)
const argon2 = require('argon2');
```

---

## Production Load Test Checklist

- [ ] **Pre-Test**
  - [ ] Notify team in Slack/Discord
  - [ ] Set up monitoring dashboards
  - [ ] Configure alerts
  - [ ] Prepare rollback plan
  - [ ] Test in staging first
  - [ ] Choose off-peak hours
  - [ ] Set rate limits

- [ ] **During Test**
  - [ ] Monitor error rates
  - [ ] Watch queue depths
  - [ ] Check database performance
  - [ ] Monitor memory/CPU
  - [ ] Track response times
  - [ ] Be ready to stop test

- [ ] **Post-Test**
  - [ ] Analyze results
  - [ ] Document findings
  - [ ] Identify bottlenecks
  - [ ] Create optimization tickets
  - [ ] Share results with team
  - [ ] Plan next test

---

## Sample Production Test Plan

### Week 1: Baseline Testing
```bash
# Day 1: Small scale (50 users)
k6 run --vus 50 --duration 5m load-tests/auth-flow.js

# Day 2: Medium scale (200 users)
k6 run --vus 200 --duration 10m load-tests/auth-flow.js

# Day 3: Analyze & optimize
```

### Week 2: Stress Testing
```bash
# Day 1: High load (500 users)
k6 run --vus 500 --duration 15m load-tests/payment-flow.js

# Day 2: Spike test
k6 run --stage 1m:100,1m:1000,1m:100 load-tests/auth-flow.js

# Day 3: Soak test (sustained load)
k6 run --vus 200 --duration 2h load-tests/payment-flow.js
```

### Week 3: Recovery Testing
```bash
# Test system recovery after failure
# Simulate database failure, Redis failure, etc.
```

---

## Conclusion

Load testing in production requires:
1. **Careful planning** - Know what you're testing
2. **Gradual approach** - Start small, increase slowly
3. **Constant monitoring** - Watch metrics in real-time
4. **Quick response** - Be ready to stop if needed
5. **Analysis** - Learn from results and optimize

Start with staging environment, then carefully test production with synthetic traffic during off-peak hours.

---

## Next Steps

1. Set up monitoring (Grafana/Prometheus)
2. Create baseline tests in staging
3. Run small production test (50 users)
4. Analyze and optimize
5. Gradually increase load
6. Document findings and improve

For questions or issues, check the logs and monitoring dashboards first!
