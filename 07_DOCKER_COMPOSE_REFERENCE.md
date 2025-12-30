# Docker Compose Configuration Reference

Complete guide to the docker-compose.yml configuration for local development and testing.

---

## Overview

The system consists of:
- **3 Data Stores:** PostgreSQL, Redis, Elasticsearch
- **4 Microservices:** API, Worker, Mail Queue, Payment Service

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Network                         │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  PostgreSQL  │  │    Redis     │  │Elasticsearch │  │
│  │   :5432      │  │    :6379     │  │    :9200     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│  ┌──────▼─────────────────▼──────────────────▼───────┐  │
│  │              Microservices Layer                   │  │
│  │                                                     │  │
│  │  ┌────────┐  ┌────────┐  ┌──────────┐  ┌────────┐ │  │
│  │  │  API   │  │ Worker │  │   Mail   │  │Payment │ │  │
│  │  │ :3000  │  │        │  │  Queue   │  │Service │ │  │
│  │  └────────┘  └────────┘  └──────────┘  └────────┘ │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Complete docker-compose.yml

```yaml
version: '3.8'

services:
  # ============================================================
  # DATA STORES
  # ============================================================

  postgres:
    image: postgres:15-alpine
    container_name: event_postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: event_management
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: event_redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: event_elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9201:9200"  # Custom port to avoid conflicts
      - "9300:9300"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 5
    restart: unless-stopped

  # ============================================================
  # MICROSERVICES
  # ============================================================

  api:
    build:
      context: ./api
      dockerfile: Dockerfile
    container_name: event_api
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - PORT=3000
      # Database
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=event_management
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      # Redis
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      # Elasticsearch
      - ELASTICSEARCH_NODE=http://elasticsearch:9200
      - ELASTICSEARCH_INDEX=events
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      elasticsearch:
        condition: service_healthy
    volumes:
      - ./api:/app
      - /app/node_modules
    command: npm run dev
    restart: unless-stopped

  worker:
    build:
      context: ./worker
      dockerfile: Dockerfile
    container_name: event_worker
    environment:
      - NODE_ENV=development
      # Database
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=event_management
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      # Redis
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      # Elasticsearch
      - ELASTICSEARCH_NODE=http://elasticsearch:9200
      - ELASTICSEARCH_INDEX=events
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      elasticsearch:
        condition: service_healthy
    volumes:
      - ./worker:/app
      - /app/node_modules
    command: npm run dev
    restart: unless-stopped

  mail-queue:
    build:
      context: ./mail-queue
      dockerfile: Dockerfile
    container_name: event_mail_queue
    environment:
      - NODE_ENV=development
      # Redis
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      # SMTP (Gmail example)
      - SMTP_HOST=smtp.gmail.com
      - SMTP_PORT=587
      - SMTP_SECURE=false
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASSWORD=${SMTP_PASSWORD}
      - EMAIL_FROM=${EMAIL_FROM}
    depends_on:
      redis:
        condition: service_healthy
    volumes:
      - ./mail-queue:/app
      - /app/node_modules
    command: npm run dev
    restart: unless-stopped

  payment-service:
    build:
      context: ./payment-service
      dockerfile: Dockerfile
    container_name: event_payment_service
    environment:
      - NODE_ENV=development
      # Redis
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      # Database
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=event_management
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      # Payment Provider
      - PAYMENT_PROVIDER=mock
      - PAYMENT_CURRENCY=USD
      - MOCK_PAYMENT_DELAY=2000
      - MOCK_FAILURE_RATE=0.1
      # For Stripe (when ready)
      # - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      # - STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLISHABLE_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ./payment-service:/app
      - /app/node_modules
    command: npm run dev
    restart: unless-stopped

# ============================================================
# VOLUMES
# ============================================================

volumes:
  postgres_data:
    driver: local
  redis_data:
    driver: local
  elasticsearch_data:
    driver: local
```

---

## Environment Variables

### Required .env File

Create a `.env` file in the project root:

```bash
# SMTP Configuration (for email sending)
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_specific_password
EMAIL_FROM=noreply@yourdomain.com

# Payment Provider (Optional - for Stripe integration)
# STRIPE_SECRET_KEY=sk_test_...
# STRIPE_PUBLISHABLE_KEY=pk_test_...

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:3000
```

### Gmail App Password Setup

For Gmail SMTP:

1. Go to Google Account → Security
2. Enable 2-Factor Authentication
3. Generate App Password (select "Mail" and "Other")
4. Use generated password in `SMTP_PASSWORD`

---

## Service Details

### PostgreSQL

**Image:** `postgres:15-alpine`
**Port:** 5432
**Database:** event_management
**Credentials:** postgres/postgres (dev only)

**Volume:** Persists data at `postgres_data`

**Healthcheck:** Ensures PostgreSQL is ready before starting services

**Access:**
```bash
# Connect to database
docker exec -it event_postgres psql -U postgres -d event_management

# View tables
\dt

# Query payments
SELECT * FROM payments ORDER BY created_at DESC LIMIT 10;
```

---

### Redis

**Image:** `redis:7-alpine`
**Port:** 6379
**Persistence:** AOF disabled (dev mode)

**Volume:** Persists data at `redis_data`

**Access:**
```bash
# Connect to Redis CLI
docker exec -it event_redis redis-cli

# View all keys
KEYS *

# View queue jobs
LRANGE bull:payment:wait 0 -1

# Monitor real-time commands
MONITOR
```

**Queues:**
- `bull:mail` - Email processing
- `bull:payment` - Payment processing
- `bull:elastic-sync` - Elasticsearch sync

---

### Elasticsearch

**Image:** `elasticsearch:8.11.0`
**Port:** 9201 (external), 9200 (internal)
**Memory:** 512MB heap

**Volume:** Persists data at `elasticsearch_data`

**Security:** Disabled (dev only)

**Access:**
```bash
# Check cluster health
curl http://localhost:9201/_cluster/health

# List indices
curl http://localhost:9201/_cat/indices

# Search events
curl http://localhost:9201/events/_search

# View specific document
curl http://localhost:9201/events/_doc/<id>
```

---

### API Service

**Port:** 3000
**Framework:** Express.js

**Endpoints:**
- `GET /health` - Health check
- `GET /api/events` - List events
- `POST /api/events` - Create event
- `POST /api/payments` - Create payment
- `GET /api/search` - Search events

**Hot Reload:** Enabled with nodemon

---

### Worker Service

**No external ports**

**Functions:**
- Process Elasticsearch sync jobs
- Run scheduled cron jobs
- Recover stuck payments

**Cron Jobs:**
- `*/5 * * * *` - Recover stuck payments (every 5 minutes)
- `0 9 * * *` - Send event reminders (9:00 AM daily)
- `0 3 * * *` - Full Elasticsearch sync (3:00 AM daily)
- `*/30 * * * *` - Update event statuses (every 30 minutes)
- `0 4 * * *` - Cleanup old failed payments (4:00 AM daily)

---

### Mail Queue Service

**No external ports**

**Functions:**
- Process email sending jobs
- Handle registration, reminder, password reset emails

**Job Types:**
- `registration` - Welcome emails
- `new-event` - Event creation notifications
- `reminder` - Event reminders
- `forgot-password` - Password reset emails

---

### Payment Service

**No external ports**

**Functions:**
- Process payment transactions
- Handle refunds
- Update payment status in database

**Features:**
- Mock payment provider (configurable failure rate)
- Dual-write pattern (database + queue)
- Automatic retry with exponential backoff
- Idempotency support

---

## Common Commands

### Start All Services

```bash
# Start in detached mode
docker-compose up -d

# Start with logs
docker-compose up

# Start specific services
docker-compose up api postgres redis
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f payment-service

# Last 100 lines
docker-compose logs --tail=100 api
```

### Stop Services

```bash
# Stop all
docker-compose down

# Stop and remove volumes (DELETE ALL DATA)
docker-compose down -v

# Stop specific service
docker-compose stop api
```

### Restart Services

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart api
```

### Rebuild Services

```bash
# Rebuild all
docker-compose build

# Rebuild specific service
docker-compose build api

# Rebuild and start
docker-compose up --build
```

### Execute Commands in Containers

```bash
# API container
docker-compose exec api sh
docker-compose exec api npm install <package>

# Worker container
docker-compose exec worker node -e "console.log('test')"

# Database
docker-compose exec postgres psql -U postgres -d event_management
```

---

## Development Workflow

### Initial Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd system-design

# 2. Create .env file
cat > .env << EOF
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM=noreply@yourdomain.com
EOF

# 3. Start services
docker-compose up -d

# 4. Check logs
docker-compose logs -f
```

### Making Code Changes

**API/Worker/Services:** Hot reload enabled (nodemon)
- Edit code
- Save file
- Service automatically restarts

**Dependencies Changed:**
```bash
# Rebuild service
docker-compose build api
docker-compose up -d api
```

**Database Schema Changed:**
```bash
# Sequelize auto-syncs in development
# Or run migration manually
docker-compose exec api npx sequelize-cli db:migrate
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs <service-name>

# Check healthchecks
docker inspect event_postgres | grep Health -A 10
```

### Port Already in Use

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or change port in docker-compose.yml
ports:
  - "3001:3000"  # Use 3001 instead
```

### Database Connection Failed

```bash
# Check PostgreSQL is healthy
docker-compose ps postgres

# Test connection
docker-compose exec api sh
nc -zv postgres 5432

# Reset database
docker-compose down
docker volume rm system-design_postgres_data
docker-compose up -d
```

### Redis Connection Failed

```bash
# Check Redis is running
docker-compose exec redis redis-cli ping
# Should return: PONG

# View Redis logs
docker-compose logs redis
```

### Elasticsearch Not Starting

```bash
# Check memory
docker stats event_elasticsearch

# Increase memory (in docker-compose.yml)
environment:
  - "ES_JAVA_OPTS=-Xms1g -Xmx1g"

# Or use smaller heap for development
environment:
  - "ES_JAVA_OPTS=-Xms256m -Xmx256m"
```

### Volumes Taking Too Much Space

```bash
# Check volume sizes
docker system df -v

# Clean up unused volumes
docker volume prune

# Remove specific volume (DATA WILL BE LOST)
docker volume rm system-design_elasticsearch_data
```

---

## Performance Optimization

### For Development

```yaml
# Reduce Elasticsearch memory
environment:
  - "ES_JAVA_OPTS=-Xms256m -Xmx256m"

# Use bind mounts instead of volumes
volumes:
  - ./api:/app
  - /app/node_modules  # Prevents overwriting node_modules
```

### For Testing

```yaml
# Disable hot reload
command: npm start  # Instead of npm run dev

# Remove volume mounts
# volumes:
#   - ./api:/app
```

---

## Security Notes

⚠️ **This configuration is for DEVELOPMENT ONLY**

**Production changes needed:**

1. **Remove default credentials**
   ```yaml
   environment:
     POSTGRES_PASSWORD: ${DB_PASSWORD}  # From .env
   ```

2. **Enable Elasticsearch security**
   ```yaml
   environment:
     - xpack.security.enabled=true
     - ELASTIC_PASSWORD=${ES_PASSWORD}
   ```

3. **Use secrets management**
   - AWS Secrets Manager
   - Docker Secrets
   - Kubernetes Secrets

4. **Enable SSL/TLS**
   - Use nginx reverse proxy
   - Configure HTTPS
   - Encrypt inter-service communication

5. **Network isolation**
   - Remove published ports for internal services
   - Use Docker networks
   - Firewall rules

---

## Summary

This Docker Compose setup provides:

✅ **Complete local development environment**
✅ **Automatic service orchestration**
✅ **Hot reload for rapid development**
✅ **Persistent data volumes**
✅ **Health checks and dependencies**
✅ **Easy debugging and logging**

For production deployment, see [06_AWS_DEPLOYMENT_GUIDE.md](06_AWS_DEPLOYMENT_GUIDE.md).
