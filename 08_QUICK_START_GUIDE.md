# Quick Start Guide

Get your event management system running in 5 minutes.

---

## Prerequisites

- Docker Desktop installed
- 8GB RAM minimum
- 10GB free disk space
- Gmail account (for email testing)

---

## 🚀 Quick Start (5 Minutes)

### Step 1: Clone & Setup

```bash
# Clone repository
git clone <your-repo>
cd system-design

# Create environment file
cat > .env << 'EOF'
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
EMAIL_FROM=noreply@yourdomain.com
FRONTEND_URL=http://localhost:3000
EOF
```

### Step 2: Start Services

```bash
# Start all services
docker-compose up -d

# Wait for services to be healthy (30-60 seconds)
docker-compose ps
```

### Step 3: Test the System

```bash
# Test API health
curl http://localhost:3000/health

# Create a test event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Event",
    "description": "Test event",
    "location": "Virtual",
    "startDate": "2025-12-31T10:00:00Z",
    "endDate": "2025-12-31T12:00:00Z",
    "category": "conference",
    "organizer": "John Doe",
    "maxAttendees": 100
  }'

# Test payment processing
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "amount": 29.99,
    "currency": "USD",
    "description": "Test payment"
  }'

# Search events
curl "http://localhost:3000/api/search?query=event"
```

**That's it! Your system is running. 🎉**

---

## 📋 Verify Everything Works

### Check Service Status

```bash
docker-compose ps

# Should show:
# ✓ event_postgres       - healthy
# ✓ event_redis          - healthy
# ✓ event_elasticsearch  - healthy/unhealthy (OK if unhealthy)
# ✓ event_api            - up
# ✓ event_worker         - up
# ✓ event_mail_queue     - up
# ✓ event_payment_service - up
```

### View Logs

```bash
# API logs
docker-compose logs -f api

# Payment service logs
docker-compose logs -f payment-service

# All services
docker-compose logs -f
```

### Access Databases

```bash
# PostgreSQL
docker exec -it event_postgres psql -U postgres -d event_management

# Redis
docker exec -it event_redis redis-cli

# Elasticsearch
curl http://localhost:9201/_cluster/health
```

---

## 🎯 Common Tasks

### Create an Event

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Tech Conference 2025",
    "description": "Annual tech conference",
    "location": "San Francisco, CA",
    "startDate": "2025-06-15T09:00:00Z",
    "endDate": "2025-06-15T17:00:00Z",
    "category": "conference",
    "organizer": "Tech Corp",
    "maxAttendees": 500,
    "status": "published"
  }'
```

### List All Events

```bash
curl http://localhost:3000/api/events | jq
```

### Create a Payment

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user_abc123",
    "amount": 99.99,
    "currency": "USD",
    "description": "Event registration fee",
    "idempotencyKey": "payment_001"
  }' | jq
```

### Check Payment Status

```bash
# Get payment ID from previous response
PAYMENT_ID="<payment-id>"
curl http://localhost:3000/api/payments/$PAYMENT_ID | jq
```

### Search Events

```bash
# Search by keyword
curl "http://localhost:3000/api/search?query=conference" | jq

# Search by category
curl "http://localhost:3000/api/search?category=conference" | jq

# Search by location
curl "http://localhost:3000/api/search?location=San%20Francisco" | jq
```

---

## 🛠️ Development Commands

### Stop Services

```bash
# Stop all
docker-compose down

# Stop but keep data
docker-compose stop
```

### Restart After Code Changes

```bash
# API auto-reloads (nodemon), no restart needed
# Just save your file

# If dependencies changed:
docker-compose build api
docker-compose up -d api
```

### Reset Everything

```bash
# Stop and remove all data
docker-compose down -v

# Start fresh
docker-compose up -d
```

### View Database Data

```bash
# Connect to PostgreSQL
docker exec -it event_postgres psql -U postgres -d event_management

# Inside PostgreSQL:
\dt                          # List tables
SELECT * FROM events;        # View events
SELECT * FROM payments;      # View payments

# Check payment recovery system
SELECT * FROM payments WHERE status = 'pending';
```

### Monitor Queues

```bash
# Connect to Redis
docker exec -it event_redis redis-cli

# Inside Redis:
KEYS bull:*                  # List all queues
LRANGE bull:payment:wait 0 -1    # View pending payment jobs
LRANGE bull:mail:wait 0 -1       # View pending email jobs
```

---

## 📚 Next Steps

### Learn the System

1. **Architecture** → [ARCHITECTURE.md](ARCHITECTURE.md)
2. **Payment Service** → [01_PAYMENT_SERVICE_OVERVIEW.md](01_PAYMENT_SERVICE_OVERVIEW.md)
3. **API Reference** → [API_ENDPOINTS.md](API_ENDPOINTS.md)
4. **Deployment** → [06_AWS_DEPLOYMENT_GUIDE.md](06_AWS_DEPLOYMENT_GUIDE.md)

### Try Advanced Features

**Test Payment Recovery:**
```bash
# 1. Create payment
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "amount": 50.00}'

# 2. Stop payment service
docker-compose stop payment-service

# 3. Wait 5+ minutes
# 4. Check worker logs - it will recover the stuck payment
docker-compose logs -f worker
```

**Test Email Notifications:**
```bash
# Create event (triggers notification)
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Email Test Event",
    "startDate": "2025-12-31T10:00:00Z",
    "endDate": "2025-12-31T12:00:00Z"
  }'

# Check mail queue logs
docker-compose logs -f mail-queue
```

**Test Elasticsearch Sync:**
```bash
# Create event
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Search Test",
    "description": "Testing Elasticsearch sync",
    "startDate": "2025-12-31T10:00:00Z",
    "endDate": "2025-12-31T12:00:00Z"
  }'

# Wait 2-3 seconds for sync

# Search for it
curl "http://localhost:3000/api/search?query=Search%20Test" | jq
```

---

## 🐛 Troubleshooting

### API Returns "Cannot connect to database"

```bash
# Check PostgreSQL is healthy
docker-compose ps postgres

# If not healthy, restart it
docker-compose restart postgres

# Wait 10 seconds, then restart API
docker-compose restart api
```

### Payment Jobs Not Processing

```bash
# Check payment-service logs
docker-compose logs payment-service

# Check Redis is running
docker-compose exec redis redis-cli ping

# Manually trigger recovery
docker-compose exec worker node -e "
  const { recoverStuckPayments } = require('./jobs/scheduledJobs');
  recoverStuckPayments();
"
```

### Elasticsearch Unhealthy

```bash
# This is OK - it works even if marked unhealthy
# Test it:
curl http://localhost:9201/_cluster/health

# If it doesn't respond, increase memory:
# Edit docker-compose.yml:
# ES_JAVA_OPTS=-Xms1g -Xmx1g

# Restart
docker-compose restart elasticsearch
```

### Port 3000 Already in Use

```bash
# Find what's using it
lsof -i :3000

# Kill it
kill -9 <PID>

# Or change API port in docker-compose.yml:
# ports:
#   - "3001:3000"
```

---

## 💡 Tips

### Development Best Practices

1. **Check logs often**
   ```bash
   docker-compose logs -f api payment-service
   ```

2. **Use .env for secrets**
   ```bash
   # Never commit .env to git
   echo ".env" >> .gitignore
   ```

3. **Monitor payment recovery**
   ```bash
   # Worker runs recovery every 5 minutes
   docker-compose logs -f worker | grep "stuck payments"
   ```

4. **Test with curl or Postman**
   - Postman Collection: [link]
   - curl examples above

5. **Database queries**
   ```sql
   -- Check recent payments
   SELECT id, user_id, amount, status, created_at
   FROM payments
   ORDER BY created_at DESC
   LIMIT 10;

   -- Check pending payments (should be empty or processing)
   SELECT * FROM payments WHERE status = 'pending';
   ```

### Performance Tips

**For faster startup:**
```yaml
# In docker-compose.yml, reduce Elasticsearch memory:
ES_JAVA_OPTS=-Xms256m -Xmx256m
```

**For faster rebuilds:**
```bash
# Use Docker BuildKit
export DOCKER_BUILDKIT=1
docker-compose build
```

---

## 📊 System Health Dashboard

### Quick Health Check

```bash
#!/bin/bash
echo "=== System Health Check ==="

echo "✓ API:" && curl -s http://localhost:3000/health | jq -r '.status'
echo "✓ PostgreSQL:" && docker-compose exec -T postgres pg_isready
echo "✓ Redis:" && docker-compose exec -T redis redis-cli ping
echo "✓ Elasticsearch:" && curl -s http://localhost:9201/_cluster/health | jq -r '.status'

echo ""
echo "=== Service Status ==="
docker-compose ps
```

Save as `health-check.sh` and run:
```bash
chmod +x health-check.sh
./health-check.sh
```

---

## 🎓 Learning Path

**Day 1:** Get system running (this guide)
**Day 2:** Learn architecture → [ARCHITECTURE.md](ARCHITECTURE.md)
**Day 3:** Understand payments → [02_DUAL_WRITE_PATTERN.md](02_DUAL_WRITE_PATTERN.md)
**Day 4:** Study scaling → [05_SCALABILITY_PATTERNS.md](05_SCALABILITY_PATTERNS.md)
**Day 5:** Deploy to AWS → [06_AWS_DEPLOYMENT_GUIDE.md](06_AWS_DEPLOYMENT_GUIDE.md)

---

## ✅ Checklist

Before considering the system "working":

- [ ] All 7 services running (`docker-compose ps`)
- [ ] Can create events (`POST /api/events`)
- [ ] Can search events (`GET /api/search`)
- [ ] Can create payments (`POST /api/payments`)
- [ ] Payment recovery works (check worker logs after 5 min)
- [ ] Elasticsearch syncing (create event, search for it)
- [ ] Email queue processing (check mail-queue logs)

---

## 🆘 Get Help

1. **Check logs:** `docker-compose logs -f <service>`
2. **Review docs:** [00_DOCUMENTATION_INDEX.md](00_DOCUMENTATION_INDEX.md)
3. **Common issues:** [07_DOCKER_COMPOSE_REFERENCE.md](07_DOCKER_COMPOSE_REFERENCE.md#troubleshooting)
4. **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)

---

**You're ready to start developing! 🚀**
