# Quick Start: Load Testing in 5 Minutes

Get started with load testing your production system in just 5 minutes.

## Step 1: Install k6 (1 minute)

**macOS:**
```bash
brew install k6
```

**Linux:**
```bash
# Install from official repository
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

**Docker (no installation required):**
```bash
alias k6='docker run --rm -i grafana/k6'
```

---

## Step 2: Start Your Services (1 minute)

```bash
# Make sure your system is running
docker-compose up -d

# Verify services are healthy
docker-compose ps
curl http://localhost:3000/health
```

---

## Step 3: Run Your First Load Test (2 minutes)

### Option A: Use the Interactive Script

```bash
./run-load-test.sh
```

Select option 4 for a quick smoke test (10 users, 1 minute).

### Option B: Run Tests Directly

**Test authentication flow:**
```bash
k6 run load-tests/auth-flow.k6.js
```

**Quick smoke test:**
```bash
k6 run --vus 10 --duration 1m load-tests/auth-flow.k6.js
```

---

## Step 4: Monitor the Results (1 minute)

### Watch the Test Output

k6 will show real-time metrics:
```
running (0m30s), 10/10 VUs, 150 complete

✓ register: status is 201
✓ login: status is 200
✓ forgot password: status is 200

http_req_duration...: avg=250ms min=120ms p(95)=450ms
http_req_failed.....: 0.00%
```

### Watch Your System

In another terminal:
```bash
# Watch API logs
docker-compose logs -f api

# Watch email queue
docker-compose logs -f mail-queue

# Monitor system resources
docker stats
```

---

## Understanding the Results

### ✅ Good Results

```
http_req_duration...: p(95)=450ms     ← 95% requests < 450ms
http_req_failed.....: 0.00%           ← No errors
checks..............: 100.00%         ← All validations passed
```

**Action:** Your system is healthy! Can handle more load.

---

### ⚠️ Warning Signs

```
http_req_duration...: p(95)=1.2s      ← Slow responses
http_req_failed.....: 2.5%            ← Some errors
checks..............: 97.50%          ← Some validations failed
```

**Action:**
- Check logs for errors
- Look for bottlenecks
- May need to scale

---

### ❌ Critical Issues

```
http_req_duration...: p(95)=5s        ← Very slow
http_req_failed.....: 15.00%          ← Many errors
checks..............: 85.00%          ← Many failures
```

**Action:**
- Stop the test immediately
- Check for crashed services
- Review error logs
- Fix issues before retesting

---

## Common First-Time Issues

### Issue 1: "k6: command not found"

**Solution:**
```bash
# Use Docker instead
docker run --rm -i grafana/k6 run - <load-tests/auth-flow.k6.js
```

---

### Issue 2: "API health check failed"

**Solution:**
```bash
# Make sure services are running
docker-compose up -d

# Check which services are down
docker-compose ps

# Restart all services
docker-compose restart
```

---

### Issue 3: High error rate on first test

**Solution:**
```bash
# Start with fewer users
k6 run --vus 5 --duration 30s load-tests/auth-flow.k6.js

# If that works, gradually increase
k6 run --vus 10 --duration 1m load-tests/auth-flow.k6.js
```

---

## Next Steps After Your First Test

### 1. Gradually Increase Load

```bash
# 10 users
k6 run --vus 10 --duration 2m load-tests/auth-flow.k6.js

# 25 users
k6 run --vus 25 --duration 3m load-tests/auth-flow.k6.js

# 50 users
k6 run --vus 50 --duration 5m load-tests/auth-flow.k6.js
```

### 2. Test Different Scenarios

```bash
# Test authentication
k6 run load-tests/auth-flow.k6.js

# Test payments (create test user first)
k6 run load-tests/payment-flow.k6.js

# Test email priorities
k6 run load-tests/email-priority.k6.js
```

### 3. Set Up Monitoring

See [LOAD_TESTING_GUIDE.md](LOAD_TESTING_GUIDE.md#monitoring-during-load-tests) for:
- Grafana dashboards
- Prometheus metrics
- APM tools (New Relic, Datadog)

---

## Production Testing Safety

**⚠️ IMPORTANT: Never test production without:**

1. **Team notification** - Tell everyone first
2. **Off-peak hours** - Test when traffic is low
3. **Start small** - Begin with 10 users
4. **Monitor closely** - Watch in real-time
5. **Stop button ready** - Know how to abort
6. **Rollback plan** - Be ready to revert

**Safe production test:**
```bash
# Notify team first!
# Choose off-peak time (e.g., 3 AM)
# Start with tiny load

API_URL=https://your-production-api.com \
k6 run --vus 5 --duration 2m load-tests/auth-flow.k6.js

# If successful, gradually increase
# Never jump from 10 to 100 users!
```

---

## Quick Reference Commands

### Basic Tests

```bash
# Smoke test (quick validation)
k6 run --vus 10 --duration 1m load-tests/auth-flow.k6.js

# Load test (sustained load)
k6 run --vus 50 --duration 5m load-tests/auth-flow.k6.js

# Stress test (find limits)
k6 run --vus 100 --duration 5m load-tests/auth-flow.k6.js
```

### Monitoring

```bash
# Watch all logs
docker-compose logs -f

# Watch specific service
docker-compose logs -f api
docker-compose logs -f mail-queue

# Check queue depth
docker-compose exec redis redis-cli LLEN bull:mail:wait

# Monitor resources
docker stats
```

### Stopping

```bash
# Stop load test
Ctrl+C

# Stop services
docker-compose down

# Emergency: force stop everything
docker kill $(docker ps -q)
```

---

## Example: Your First Complete Test

```bash
# 1. Start services
docker-compose up -d

# 2. Verify health
curl http://localhost:3000/health

# 3. Open monitoring in terminal 1
docker-compose logs -f api

# 4. Run test in terminal 2
k6 run --vus 10 --duration 1m load-tests/auth-flow.k6.js

# 5. Review results
# - Check k6 output for metrics
# - Check logs for errors
# - Check docker stats for resources

# 6. If successful, increase load
k6 run --vus 25 --duration 2m load-tests/auth-flow.k6.js
```

---

## Interpreting Your First Results

After your test completes, you'll see:

```
✓ register: status is 201
✓ login: status is 200
✓ forgot password: status is 200
✓ get profile: status is 200

checks.........................: 100.00% ✓ 400  ✗ 0
data_received..................: 250 kB  4.2 kB/s
data_sent......................: 180 kB  3.0 kB/s
http_req_blocked...............: avg=1.2ms   min=500µs  max=15ms
http_req_connecting............: avg=800µs   min=200µs  max=10ms
http_req_duration..............: avg=250ms   min=120ms  max=1.2s
  { expected_response:true }...: avg=250ms   min=120ms  max=1.2s
http_req_failed................: 0.00%   ✓ 0    ✗ 400
http_req_receiving.............: avg=1.5ms   min=500µs  max=8ms
http_req_sending...............: avg=800µs   min=200µs  max=5ms
http_req_tls_handshaking.......: avg=0s      min=0s     max=0s
http_req_waiting...............: avg=248ms   min=118ms  max=1.19s
http_reqs......................: 400     6.67/s
iteration_duration.............: avg=11.5s   min=10.8s  max=13.2s
iterations.....................: 100     1.67/s
vus............................: 10      min=10  max=10
vus_max........................: 10      min=10  max=10
```

### What to Focus On:

1. **http_req_duration (p95)** - 95% of requests should be < 1s
2. **http_req_failed** - Should be < 1% (ideally 0%)
3. **checks** - Should be 100%
4. **http_reqs** - Throughput (requests/second)

### Is Your System Healthy?

**✅ Healthy if:**
- ✅ checks = 100%
- ✅ http_req_failed < 1%
- ✅ p95 < 1s
- ✅ No errors in logs

**⚠️ Needs attention if:**
- ⚠️ checks = 95-99%
- ⚠️ http_req_failed = 1-5%
- ⚠️ p95 = 1-3s
- ⚠️ Some errors in logs

**❌ Critical if:**
- ❌ checks < 95%
- ❌ http_req_failed > 5%
- ❌ p95 > 3s
- ❌ Many errors in logs

---

## Getting Help

**Check logs first:**
```bash
docker-compose logs --tail=50 api
docker-compose logs --tail=50 mail-queue
docker-compose logs --tail=50 payment-service
```

**Common issues:**
- See [load-tests/README.md](load-tests/README.md#common-issues--solutions)
- See [LOAD_TESTING_GUIDE.md](LOAD_TESTING_GUIDE.md#analysis--optimization)

**Still stuck?**
- Check GitHub issues
- Review system logs
- Verify environment variables
- Restart services: `docker-compose restart`

---

## Summary

You've now:
- ✅ Installed k6
- ✅ Run your first load test
- ✅ Monitored the results
- ✅ Understood the metrics

**Next:** Read [LOAD_TESTING_GUIDE.md](LOAD_TESTING_GUIDE.md) for advanced topics like:
- Production testing strategies
- Monitoring and observability
- Performance optimization
- Distributed load testing
