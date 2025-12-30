# Load Testing Scripts

Ready-to-use load testing scripts for your microservices system.

## Prerequisites

### Install k6

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Windows:**
```bash
choco install k6
```

**Docker:**
```bash
docker pull grafana/k6
```

---

## Available Tests

### 1. Authentication Flow Test
**File:** `auth-flow.k6.js`

Tests the complete authentication flow including:
- User registration
- User login
- Forgot password (Priority 1 email)
- Get user profile

**Run locally:**
```bash
k6 run load-tests/auth-flow.k6.js
```

**Run against production:**
```bash
API_URL=https://your-api.com k6 run load-tests/auth-flow.k6.js
```

**Run with custom settings:**
```bash
k6 run --vus 50 --duration 5m load-tests/auth-flow.k6.js
```

**Expected Results:**
- ✅ p95 response time < 1s
- ✅ Error rate < 1%
- ✅ Forgot password < 300ms (Priority 1!)

---

### 2. Payment Flow Test
**File:** `payment-flow.k6.js`

Tests authenticated payment processing:
- User login
- Create payment
- Check payment status

**Prerequisites:**
Create a test user first (or script will create one):
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "loadtest@test.com",
    "name": "Load Test User",
    "password": "LoadTest123!"
  }'
```

**Run the test:**
```bash
k6 run load-tests/payment-flow.k6.js
```

**With custom credentials:**
```bash
TEST_USER_EMAIL=your-test@test.com \
TEST_USER_PASSWORD=YourPassword123! \
k6 run load-tests/payment-flow.k6.js
```

**Expected Results:**
- ✅ p95 payment time < 3s
- ✅ Payment success rate > 99%
- ✅ Error rate < 1%

---

### 3. Email Priority Test
**File:** `email-priority.k6.js`

Validates email queue priority system:
- Sends 50 forgot password requests/sec (Priority 1)
- Sends 100 registration requests/sec (Priority 3)
- Verifies Priority 1 emails are processed faster

**Run the test:**
```bash
k6 run load-tests/email-priority.k6.js
```

**What to monitor:**
```bash
# In another terminal, watch the mail queue
docker-compose logs -f mail-queue

# You should see Priority 1 emails processed first:
# 🔥 Processing forgot-password job: X - Priority: 1 (HIGHEST)
```

**Expected Results:**
- ✅ Forgot password p95 < 500ms
- ✅ Registration p95 < 1s (can be slower)
- ✅ Priority 1 emails processed first

---

## Running Tests with Docker

If you don't want to install k6 locally:

```bash
# Auth flow test
docker run --rm -i grafana/k6 run - <load-tests/auth-flow.k6.js

# Payment flow test
docker run --rm -i \
  -e TEST_USER_EMAIL=loadtest@test.com \
  -e TEST_USER_PASSWORD=LoadTest123! \
  grafana/k6 run - <load-tests/payment-flow.k6.js

# Email priority test
docker run --rm -i grafana/k6 run - <load-tests/email-priority.k6.js
```

---

## Monitoring During Tests

### 1. Watch API Logs
```bash
docker-compose logs -f api
```

### 2. Watch Mail Queue
```bash
docker-compose logs -f mail-queue
```

### 3. Watch Payment Service
```bash
docker-compose logs -f payment-service
```

### 4. Monitor Redis Queue
```bash
# Check queue depth
docker-compose exec redis redis-cli LLEN bull:mail:wait
docker-compose exec redis redis-cli LLEN bull:mail:active

# Watch in real-time
watch -n 1 'docker-compose exec redis redis-cli LLEN bull:mail:wait'
```

### 5. Monitor System Resources
```bash
# CPU and Memory
docker stats

# Just API service
docker stats event_api
```

---

## Understanding k6 Output

### Key Metrics

```
http_req_duration...: avg=250ms min=120ms med=230ms max=1.2s p(95)=450ms p(99)=800ms
```
- **avg**: Average response time
- **min**: Fastest request
- **med**: Median (50th percentile)
- **p(95)**: 95% of requests faster than this
- **p(99)**: 99% of requests faster than this

```
http_req_failed.....: 0.50% ✓ 50  ✗ 9950
```
- **0.50%**: Error rate (0.5% = 50 failures out of 10,000)

```
vus.................: 100 min=0 max=100
```
- **100**: Current virtual users (simulated users)

### Thresholds

```
✓ http_req_duration..........: p(95) < 1000ms
✗ errors....................: rate < 0.01
```
- **✓** Threshold passed
- **✗** Threshold failed

---

## Production Testing Checklist

Before running in production:

- [ ] **Notify team** - Alert everyone you're testing
- [ ] **Check timing** - Run during off-peak hours
- [ ] **Start small** - Begin with 10-20 users
- [ ] **Monitor closely** - Watch dashboards in real-time
- [ ] **Have rollback ready** - Know how to stop/revert
- [ ] **Use test accounts** - Don't impact real users
- [ ] **Set rate limits** - Protect your infrastructure
- [ ] **Document results** - Share findings with team

---

## Gradual Load Testing Approach

### Week 1: Baseline
```bash
# Day 1: Tiny load (10 users)
k6 run --vus 10 --duration 2m load-tests/auth-flow.k6.js

# Day 2: Small load (25 users)
k6 run --vus 25 --duration 5m load-tests/auth-flow.k6.js

# Day 3: Analyze results and optimize
```

### Week 2: Medium Load
```bash
# Day 1: Medium load (50 users)
k6 run --vus 50 --duration 5m load-tests/payment-flow.k6.js

# Day 2: Sustained load (100 users, 10 min)
k6 run --vus 100 --duration 10m load-tests/auth-flow.k6.js
```

### Week 3: Stress Test
```bash
# Spike test
k6 run load-tests/auth-flow.k6.js  # Uses staged load

# Email priority under stress
k6 run load-tests/email-priority.k6.js
```

---

## Common Issues & Solutions

### Issue: High error rate
**Symptom:** `http_req_failed > 5%`

**Check:**
```bash
# Are services running?
docker-compose ps

# Check API logs
docker-compose logs api | tail -50
```

**Solution:**
- Reduce number of VUs
- Increase `sleep()` time between requests
- Check database connection pool size

---

### Issue: Slow response times
**Symptom:** `p(95) > threshold`

**Check:**
```bash
# CPU/Memory usage
docker stats

# Database connections
docker-compose logs postgres | grep "connection"
```

**Solution:**
- Scale horizontally (more API instances)
- Increase database pool size
- Add caching layer (Redis)

---

### Issue: Queue backing up
**Symptom:** Redis queue growing, emails delayed

**Check:**
```bash
# Queue depth
docker-compose exec redis redis-cli LLEN bull:mail:wait

# Worker logs
docker-compose logs mail-queue
```

**Solution:**
```yaml
# Scale workers in docker-compose.yml
mail-queue:
  deploy:
    replicas: 3  # Run 3 worker instances
```

---

## Advanced Testing

### Distributed Load Testing

Run tests from multiple machines:

**Machine 1:**
```bash
k6 run --vus 100 load-tests/auth-flow.k6.js
```

**Machine 2:**
```bash
k6 run --vus 100 load-tests/payment-flow.k6.js
```

**Machine 3:**
```bash
k6 run --vus 100 load-tests/email-priority.k6.js
```

### Cloud Load Testing

Use k6 Cloud for distributed testing:

```bash
# Sign up at k6.io
k6 login cloud

# Run in cloud
k6 cloud load-tests/auth-flow.k6.js
```

---

## Next Steps

1. Run tests in **staging** environment first
2. Start with **small load** (10 users)
3. **Monitor** all metrics
4. **Gradually increase** load
5. **Document** bottlenecks
6. **Optimize** and re-test
7. Schedule **regular** load tests

For more details, see [LOAD_TESTING_GUIDE.md](../LOAD_TESTING_GUIDE.md)
