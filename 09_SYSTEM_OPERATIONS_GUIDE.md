# System Operations Guide

Complete guide for operating and maintaining the event management system.

---

## 📋 Table of Contents

1. [Daily Operations](#daily-operations)
2. [Monitoring](#monitoring)
3. [Backup & Recovery](#backup--recovery)
4. [Performance Tuning](#performance-tuning)
5. [Incident Response](#incident-response)
6. [Maintenance Tasks](#maintenance-tasks)
7. [Scaling Operations](#scaling-operations)

---

## Daily Operations

### Service Health Checks

**Morning Checklist:**
```bash
# 1. Check all services are running
docker-compose ps

# 2. Check API health
curl http://localhost:3000/health

# 3. Check database connections
docker exec -it event_postgres pg_isready

# 4. Check Redis
docker exec -it event_redis redis-cli ping

# 5. Check Elasticsearch
curl http://localhost:9201/_cluster/health
```

**Expected Output:**
- All services: `Up` status
- API health: `{"status":"healthy"}`
- PostgreSQL: `accepting connections`
- Redis: `PONG`
- Elasticsearch: `"status":"green"` or `"status":"yellow"`

---

### Monitor Active Jobs

**Check Queue Status:**
```bash
# Connect to Redis
docker exec -it event_redis redis-cli

# Check payment queue
LLEN bull:payment:wait
LLEN bull:payment:active
LLEN bull:payment:failed

# Check mail queue
LLEN bull:mail:wait
LLEN bull:mail:active
LLEN bull:mail:failed

# Check elasticsearch sync queue
LLEN bull:elastic-sync:wait
LLEN bull:elastic-sync:active
LLEN bull:elastic-sync:failed
```

**Healthy Numbers:**
- `wait`: 0-10 (small backlog is OK)
- `active`: 0-5 (jobs being processed)
- `failed`: 0 (should be empty)

**If failed > 0:**
```bash
# View failed jobs
LRANGE bull:payment:failed 0 -1
LRANGE bull:mail:failed 0 -1
```

---

### Check Payment Processing

**View Recent Payments:**
```bash
docker exec -it event_postgres psql -U postgres -d event_management

# SQL Query
SELECT
  id,
  user_id,
  amount,
  status,
  created_at,
  completed_at
FROM payments
ORDER BY created_at DESC
LIMIT 10;
```

**Check for Stuck Payments:**
```sql
-- Payments pending > 10 minutes
SELECT
  id,
  user_id,
  amount,
  status,
  created_at,
  NOW() - created_at as age
FROM payments
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '10 minutes';
```

**If stuck payments found:**
- Worker recovery job runs every 5 minutes
- Check worker logs: `docker-compose logs -f worker`
- Manual trigger if needed (see [Incident Response](#incident-response))

---

### Review Logs

**API Logs:**
```bash
# Last 100 lines
docker-compose logs --tail=100 api

# Follow real-time
docker-compose logs -f api

# Filter for errors
docker-compose logs api | grep ERROR
```

**Payment Service Logs:**
```bash
# Recent payment processing
docker-compose logs --tail=50 payment-service

# Watch for failures
docker-compose logs -f payment-service | grep -i "failed\|error"
```

**Worker Logs:**
```bash
# Check scheduled jobs
docker-compose logs worker | grep "cron"

# Check recovery operations
docker-compose logs worker | grep "stuck payments"
```

---

## Monitoring

### Key Metrics to Track

**System Resources:**
```bash
# Container stats
docker stats

# Individual service CPU/Memory
docker stats event_api event_postgres event_redis
```

**Database Performance:**
```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity;

-- Long-running queries
SELECT
  pid,
  now() - query_start as duration,
  query
FROM pg_stat_activity
WHERE state = 'active'
  AND now() - query_start > interval '1 minute'
ORDER BY duration DESC;

-- Database size
SELECT
  pg_size_pretty(pg_database_size('event_management')) as db_size;

-- Table sizes
SELECT
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```

**Redis Memory Usage:**
```bash
docker exec -it event_redis redis-cli INFO memory | grep "used_memory_human"
```

**Elasticsearch Index Size:**
```bash
curl -s http://localhost:9201/_cat/indices/events?v
```

---

### Set Up Monitoring (Production)

**Prometheus + Grafana:**

Create `docker-compose.monitoring.yml`:
```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'

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

**Start monitoring:**
```bash
docker-compose -f docker-compose.monitoring.yml up -d
```

Access:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (admin/admin)

---

## Backup & Recovery

### Database Backups

**Manual Backup:**
```bash
# Create backup directory
mkdir -p backups

# Backup database
docker exec event_postgres pg_dump -U postgres event_management > backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Compressed backup
docker exec event_postgres pg_dump -U postgres event_management | gzip > backups/backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

**Automated Daily Backups:**

Create `scripts/backup.sh`:
```bash
#!/bin/bash
BACKUP_DIR="/path/to/backups"
DATE=$(date +%Y%m%d_%H%M%S)
FILENAME="event_db_$DATE.sql.gz"

# Create backup
docker exec event_postgres pg_dump -U postgres event_management | gzip > "$BACKUP_DIR/$FILENAME"

# Keep only last 7 days
find $BACKUP_DIR -name "event_db_*.sql.gz" -mtime +7 -delete

echo "Backup completed: $FILENAME"
```

**Schedule with cron:**
```bash
# Edit crontab
crontab -e

# Add daily backup at 2 AM
0 2 * * * /path/to/scripts/backup.sh >> /var/log/db_backup.log 2>&1
```

---

### Restore from Backup

**Restore Database:**
```bash
# Stop services
docker-compose stop api worker payment-service mail-queue

# Drop and recreate database
docker exec -it event_postgres psql -U postgres -c "DROP DATABASE IF EXISTS event_management;"
docker exec -it event_postgres psql -U postgres -c "CREATE DATABASE event_management;"

# Restore from backup
gunzip < backups/backup_20250130_020000.sql.gz | docker exec -i event_postgres psql -U postgres event_management

# Restart services
docker-compose start api worker payment-service mail-queue
```

**Verify Restoration:**
```bash
docker exec -it event_postgres psql -U postgres -d event_management

# Check tables exist
\dt

# Check record counts
SELECT
  'events' as table_name, COUNT(*) as count FROM events
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'notifications', COUNT(*) FROM notifications;
```

---

### Redis Persistence

**Enable RDB Snapshots:**

Update `docker-compose.yml`:
```yaml
redis:
  command: redis-server --save 60 1000 --appendonly yes
  volumes:
    - redis_data:/data
```

**Backup Redis Data:**
```bash
# Trigger save
docker exec event_redis redis-cli BGSAVE

# Copy RDB file
docker cp event_redis:/data/dump.rdb ./backups/redis_backup_$(date +%Y%m%d).rdb
```

---

## Performance Tuning

### Database Optimization

**Add Indexes:**
```sql
-- Payment queries
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at);
CREATE INDEX idx_payments_idempotency_key ON payments(idempotency_key);

-- Event queries
CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_start_date ON events(start_date);
CREATE INDEX idx_events_status ON events(status);
```

**Analyze Query Performance:**
```sql
-- Enable query timing
\timing on

-- Analyze slow queries
EXPLAIN ANALYZE
SELECT * FROM payments
WHERE user_id = 'user123'
ORDER BY created_at DESC;
```

**Vacuum Database:**
```bash
# Analyze and vacuum
docker exec event_postgres psql -U postgres -d event_management -c "VACUUM ANALYZE;"
```

---

### Redis Performance

**Check Slow Queries:**
```bash
docker exec event_redis redis-cli SLOWLOG GET 10
```

**Monitor Commands:**
```bash
docker exec event_redis redis-cli MONITOR
```

**Optimize Memory:**
```bash
# Set max memory
docker exec event_redis redis-cli CONFIG SET maxmemory 256mb
docker exec event_redis redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

---

### Elasticsearch Performance

**Index Settings:**
```bash
# Increase refresh interval (faster indexing)
curl -X PUT "http://localhost:9201/events/_settings" -H 'Content-Type: application/json' -d'
{
  "index": {
    "refresh_interval": "30s",
    "number_of_replicas": 0
  }
}'

# Check index stats
curl http://localhost:9201/events/_stats?pretty
```

**Force Merge (reduces segment count):**
```bash
curl -X POST "http://localhost:9201/events/_forcemerge?max_num_segments=1"
```

---

## Incident Response

### API Down

**Diagnosis:**
```bash
# Check API container
docker-compose ps api

# Check logs
docker-compose logs --tail=100 api

# Check health endpoint
curl http://localhost:3000/health
```

**Common Causes:**
1. **Database connection lost**
   ```bash
   # Restart PostgreSQL
   docker-compose restart postgres

   # Wait 10 seconds, restart API
   sleep 10
   docker-compose restart api
   ```

2. **Out of memory**
   ```bash
   # Check memory usage
   docker stats event_api

   # Increase memory limit in docker-compose.yml
   # deploy:
   #   resources:
   #     limits:
   #       memory: 1G

   docker-compose up -d api
   ```

3. **Port conflict**
   ```bash
   # Check what's using port 3000
   lsof -i :3000

   # Kill the process or change port in docker-compose.yml
   ```

---

### Payments Not Processing

**Check Payment Service:**
```bash
# Service status
docker-compose ps payment-service

# Recent logs
docker-compose logs --tail=50 payment-service
```

**Check Queue:**
```bash
docker exec event_redis redis-cli LLEN bull:payment:wait
docker exec event_redis redis-cli LLEN bull:payment:failed
```

**Manual Recovery:**
```bash
# Trigger recovery job immediately
docker-compose exec worker node -e "
const { recoverStuckPayments } = require('./jobs/scheduledJobs');
recoverStuckPayments().then(() => console.log('Recovery completed'));
"
```

**Requeue Failed Payment:**
```bash
# Get payment ID from database
docker exec -it event_postgres psql -U postgres -d event_management -c \
  "SELECT id FROM payments WHERE status='pending' LIMIT 1;"

# Manually requeue
docker-compose exec api node -e "
const { paymentQueue } = require('./queues');
paymentQueue.add('process-payment', { paymentId: 'PAYMENT_ID_HERE' });
"
```

---

### Elasticsearch Sync Issues

**Check Sync Queue:**
```bash
docker exec event_redis redis-cli LLEN bull:elastic-sync:failed
```

**Reindex All Events:**
```bash
curl -X POST http://localhost:3000/api/search/reindex
```

**Manual Sync:**
```bash
# Index single event
curl -X POST http://localhost:3000/api/events/EVENT_ID/sync-to-elasticsearch
```

---

### Database Corruption

**Check Database Integrity:**
```bash
docker exec event_postgres psql -U postgres -d event_management -c \
  "SELECT pg_database.datname, pg_size_pretty(pg_database_size(pg_database.datname)) FROM pg_database;"
```

**Restore from Backup:**
See [Backup & Recovery](#restore-from-backup)

---

## Maintenance Tasks

### Weekly Tasks

**1. Check Failed Jobs:**
```bash
docker exec event_redis redis-cli LLEN bull:payment:failed
docker exec event_redis redis-cli LLEN bull:mail:failed
docker exec event_redis redis-cli LLEN bull:elastic-sync:failed

# View failed jobs
docker exec event_redis redis-cli LRANGE bull:payment:failed 0 -1
```

**2. Clean Old Logs:**
```bash
# Truncate docker logs
truncate -s 0 $(docker inspect --format='{{.LogPath}}' event_api)
truncate -s 0 $(docker inspect --format='{{.LogPath}}' event_postgres)
```

**3. Review Database Size:**
```sql
SELECT
  pg_size_pretty(pg_database_size('event_management')) as total_size,
  pg_size_pretty(pg_total_relation_size('payments')) as payments_size,
  pg_size_pretty(pg_total_relation_size('events')) as events_size;
```

---

### Monthly Tasks

**1. Update Docker Images:**
```bash
# Pull latest images
docker-compose pull

# Rebuild custom images
docker-compose build

# Restart with new images
docker-compose up -d
```

**2. Archive Old Data:**
```sql
-- Archive payments older than 1 year
CREATE TABLE payments_archive AS
SELECT * FROM payments
WHERE created_at < NOW() - INTERVAL '1 year';

-- Delete archived payments
DELETE FROM payments
WHERE created_at < NOW() - INTERVAL '1 year';
```

**3. Vacuum Database:**
```bash
docker exec event_postgres psql -U postgres -d event_management -c "VACUUM FULL ANALYZE;"
```

---

### Quarterly Tasks

**1. Security Updates:**
```bash
# Update all dependencies
cd api && npm update && cd ..
cd payment-service && npm update && cd ..
cd worker && npm update && cd ..
cd mail-queue && npm update && cd ..

# Rebuild images
docker-compose build
docker-compose up -d
```

**2. Performance Review:**
- Review slow query logs
- Check index usage
- Analyze growth trends
- Plan capacity upgrades

**3. Backup Verification:**
- Test restore from backup
- Verify backup completeness
- Check backup retention policy

---

## Scaling Operations

### Horizontal Scaling

**Scale Payment Workers:**
```bash
# Add more payment service instances
docker-compose up -d --scale payment-service=3
```

**Scale API Instances (with load balancer):**
```bash
# Add more API instances
docker-compose up -d --scale api=3

# Configure nginx load balancer
# See: 06_AWS_DEPLOYMENT_GUIDE.md
```

---

### Vertical Scaling

**Increase Container Resources:**

Update `docker-compose.yml`:
```yaml
api:
  deploy:
    resources:
      limits:
        cpus: '2.0'
        memory: 2G
      reservations:
        cpus: '1.0'
        memory: 1G

postgres:
  deploy:
    resources:
      limits:
        cpus: '2.0'
        memory: 4G
```

---

### Database Scaling

**Read Replicas (PostgreSQL):**

See: [05_SCALABILITY_PATTERNS.md](05_SCALABILITY_PATTERNS.md)

**Connection Pooling:**

Install PgBouncer:
```yaml
pgbouncer:
  image: pgbouncer/pgbouncer:latest
  environment:
    - DATABASES_HOST=postgres
    - DATABASES_PORT=5432
    - DATABASES_USER=postgres
    - DATABASES_PASSWORD=postgres
    - DATABASES_DBNAME=event_management
    - PGBOUNCER_POOL_MODE=transaction
    - PGBOUNCER_MAX_CLIENT_CONN=1000
    - PGBOUNCER_DEFAULT_POOL_SIZE=25
  ports:
    - "6432:6432"
```

Update API to connect to PgBouncer:
```yaml
api:
  environment:
    - DB_HOST=pgbouncer
    - DB_PORT=6432
```

---

## Emergency Procedures

### Complete System Restart

```bash
# 1. Stop all services gracefully
docker-compose down

# 2. Start infrastructure first
docker-compose up -d postgres redis elasticsearch

# 3. Wait for health checks (60 seconds)
sleep 60

# 4. Start application services
docker-compose up -d api worker payment-service mail-queue

# 5. Verify all services
docker-compose ps
curl http://localhost:3000/health
```

---

### Data Recovery After Crash

```bash
# 1. Check data volumes exist
docker volume ls | grep event

# 2. Start services
docker-compose up -d

# 3. Check database consistency
docker exec -it event_postgres psql -U postgres -d event_management -c "SELECT COUNT(*) FROM events;"

# 4. If data lost, restore from backup
# See: Backup & Recovery section
```

---

## Useful Scripts

### Health Check Script

Save as `scripts/health-check.sh`:
```bash
#!/bin/bash

echo "=== System Health Check ==="
echo ""

# API Health
API_STATUS=$(curl -s http://localhost:3000/health | jq -r '.status' 2>/dev/null || echo "DOWN")
echo "API Status: $API_STATUS"

# PostgreSQL
PG_STATUS=$(docker exec event_postgres pg_isready 2>/dev/null | grep "accepting" && echo "UP" || echo "DOWN")
echo "PostgreSQL: $PG_STATUS"

# Redis
REDIS_STATUS=$(docker exec event_redis redis-cli ping 2>/dev/null || echo "DOWN")
echo "Redis: $REDIS_STATUS"

# Elasticsearch
ES_STATUS=$(curl -s http://localhost:9201/_cluster/health | jq -r '.status' 2>/dev/null || echo "DOWN")
echo "Elasticsearch: $ES_STATUS"

echo ""
echo "=== Queue Status ==="
PAYMENT_QUEUE=$(docker exec event_redis redis-cli LLEN bull:payment:wait 2>/dev/null || echo "N/A")
echo "Payment Queue: $PAYMENT_QUEUE jobs waiting"

echo ""
echo "=== Recent Payments ==="
docker exec event_postgres psql -U postgres -d event_management -c \
  "SELECT COUNT(*) as total, status FROM payments WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY status;" 2>/dev/null
```

Make executable:
```bash
chmod +x scripts/health-check.sh
./scripts/health-check.sh
```

---

## Additional Resources

- **Architecture**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Payment Service**: [01_PAYMENT_SERVICE_OVERVIEW.md](01_PAYMENT_SERVICE_OVERVIEW.md)
- **Monitoring**: [04_MONITORING_OBSERVABILITY.md](04_MONITORING_OBSERVABILITY.md)
- **Scaling**: [05_SCALABILITY_PATTERNS.md](05_SCALABILITY_PATTERNS.md)
- **AWS Deployment**: [06_AWS_DEPLOYMENT_GUIDE.md](06_AWS_DEPLOYMENT_GUIDE.md)
- **Docker Reference**: [07_DOCKER_COMPOSE_REFERENCE.md](07_DOCKER_COMPOSE_REFERENCE.md)

---

**System Operations Guide - Complete** ✅
