# POC: Redis Caching & Message Queue Integration

## Overview

This POC demonstrates a production-ready architecture using:
- **Redis** for multi-layer caching strategy
- **Bull Queue** (Redis-backed) for async task processing
- **Event-driven patterns** for decoupled microservices

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Request                            │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API Gateway / Load Balancer                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Redis Cache Layer                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  L1: Application Cache (TTL: 5-10 min)                   │   │
│  │  - Event lists, search results, user sessions            │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  L2: Query Result Cache (TTL: 1 hour)                    │   │
│  │  - Database query results, aggregations                  │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  L3: Static/Reference Data (TTL: 24 hours)               │   │
│  │  - Categories, configs, lookup tables                    │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Service (Express)                       │
│  - Event CRUD operations                                         │
│  - Input validation                                              │
│  - Business logic                                                │
│  - Queue job publishing                                          │
└─────┬───────────────────────────────────┬───────────────────────┘
      │                                   │
      ▼                                   ▼
┌─────────────────┐              ┌──────────────────────────────┐
│   PostgreSQL    │              │     Redis Queue (Bull)       │
│   - Events      │              │  ┌────────────────────────┐  │
│   - Users       │              │  │  Mail Queue            │  │
│   - Orders      │              │  │  Priority: 1-4         │  │
│                 │              │  ├────────────────────────┤  │
└─────────────────┘              │  │  Payment Queue         │  │
                                 │  │  Retry: 3 attempts     │  │
                                 │  ├────────────────────────┤  │
                                 │  │  Elastic Sync Queue    │  │
                                 │  │  Batch processing      │  │
                                 │  ├────────────────────────┤  │
                                 │  │  Notification Queue    │  │
                                 │  │  WebSocket/Push        │  │
                                 │  └────────────────────────┘  │
                                 └───┬──────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
        ▼                            ▼                            ▼
┌───────────────┐          ┌──────────────────┐        ┌──────────────────┐
│ Mail Worker   │          │ Payment Worker   │        │ Elastic Worker   │
│ - Process     │          │ - Process        │        │ - Sync to ES     │
│   emails      │          │   payments       │        │ - Index update   │
│ - Retry on    │          │ - Webhook        │        │ - Bulk ops       │
│   failure     │          │   handling       │        │                  │
└───────────────┘          └──────────────────┘        └──────────────────┘
        │                            │                            │
        ▼                            ▼                            ▼
┌───────────────┐          ┌──────────────────┐        ┌──────────────────┐
│ SMTP Server   │          │ Payment Gateway  │        │ Elasticsearch    │
│ (Nodemailer)  │          │ (Stripe/PayPal)  │        │ - Full-text      │
└───────────────┘          └──────────────────┘        │   search         │
                                                        └──────────────────┘
```

## Key Patterns Demonstrated

### 1. Multi-Layer Caching Strategy

**L1 - Application Cache (Short TTL)**
- Frequently changing data
- User sessions, shopping carts
- TTL: 5-10 minutes

**L2 - Query Result Cache (Medium TTL)**
- Database query results
- Complex aggregations
- TTL: 1 hour

**L3 - Reference Data Cache (Long TTL)**
- Static/rarely changing data
- Categories, configurations
- TTL: 24 hours

### 2. Message Queue Patterns

**Pattern A: Fire-and-Forget**
```javascript
// Send email notification (non-blocking)
await mailQueue.add('welcome-email', { userId, email });
return res.json({ success: true });
```

**Pattern B: Priority Queue**
```javascript
// High priority: Password reset
await mailQueue.add('forgot-password', data, { priority: 1 });

// Low priority: Newsletter
await mailQueue.add('newsletter', data, { priority: 10 });
```

**Pattern C: Delayed Jobs**
```javascript
// Send reminder 1 hour before event
await mailQueue.add('reminder', data, {
  delay: eventTime - 3600000
});
```

**Pattern D: Retry with Backoff**
```javascript
// Retry failed payments with exponential backoff
await paymentQueue.add('charge', data, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
});
```

**Pattern E: Batch Processing**
```javascript
// Bulk sync to Elasticsearch
await elasticQueue.add('bulk-sync', {
  batchSize: 1000,
  offset: 0
});
```

### 3. Cache Invalidation Strategies

**Strategy 1: Write-Through Cache**
```javascript
// Update DB + Cache together
await Event.update(data);
await cache.set(`event:${id}`, updatedEvent, 600);
```

**Strategy 2: Cache-Aside (Lazy Loading)**
```javascript
// Check cache first, then DB
const cached = await cache.get(key);
if (cached) return cached;

const data = await Event.findById(id);
await cache.set(key, data, 600);
return data;
```

**Strategy 3: Pattern-Based Invalidation**
```javascript
// Invalidate all event-related caches
await cache.delPattern('event:*');
await cache.delPattern('search:events:*');
```

**Strategy 4: Event-Driven Invalidation**
```javascript
// Publish invalidation event to all instances
await redisClient.publish('cache:invalidate', {
  pattern: 'event:*'
});
```

## Implementation Examples

### Example 1: User Registration Flow

```javascript
// POST /api/users/register
async function registerUser(req, res) {
  const { email, name, password } = req.body;

  // 1. Create user in database
  const user = await User.create({ email, name, password });

  // 2. Cache user data (L1 - short TTL)
  await cache.set(`user:${user.id}`, user, 300);

  // 3. Queue welcome email (async, non-blocking)
  await mailQueue.add('registration', {
    email: user.email,
    name: user.name,
    userId: user.id
  }, {
    priority: 3,
    attempts: 3
  });

  // 4. Queue user profile indexing
  await elasticQueue.add('index-user', {
    userId: user.id,
    action: 'create'
  });

  // 5. Return immediately (don't wait for email/indexing)
  return res.json({
    success: true,
    data: { userId: user.id }
  });
}
```

### Example 2: Event Creation with Notifications

```javascript
// POST /api/events
async function createEvent(req, res) {
  const eventData = req.body;

  // 1. Create event in database
  const event = await Event.create(eventData);

  // 2. Invalidate list caches
  await cache.delPattern('events:list:*');
  await cache.delPattern('search:events:*');

  // 3. Cache new event (L1)
  await cache.set(`event:${event.id}`, event, 600);

  // 4. Queue Elasticsearch sync
  await elasticQueue.add('sync-event', {
    eventId: event.id,
    action: 'create'
  });

  // 5. Queue notifications to subscribers (fan-out)
  const subscribers = await getEventSubscribers(event.category);

  for (const subscriber of subscribers) {
    await mailQueue.add('new-event', {
      email: subscriber.email,
      eventTitle: event.title,
      eventId: event.id
    }, {
      priority: 5
    });
  }

  // 6. Schedule reminder (delayed job)
  const reminderTime = event.startDate - (24 * 60 * 60 * 1000);
  await mailQueue.add('reminder', {
    eventId: event.id
  }, {
    delay: reminderTime - Date.now()
  });

  return res.json({ success: true, data: event });
}
```

### Example 3: Order Processing with Payment

```javascript
// POST /api/orders
async function createOrder(req, res) {
  const { userId, items, paymentMethod } = req.body;

  // 1. Create order in database (status: pending)
  const order = await Order.create({
    userId,
    items,
    status: 'pending',
    total: calculateTotal(items)
  });

  // 2. Queue payment processing (critical - high priority)
  await paymentQueue.add('process-payment', {
    orderId: order.id,
    amount: order.total,
    paymentMethod
  }, {
    priority: 1,
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  });

  // 3. Return immediately with order ID
  return res.json({
    success: true,
    data: { orderId: order.id, status: 'pending' }
  });
}

// Payment Worker
async function processPayment(job) {
  const { orderId, amount, paymentMethod } = job.data;

  try {
    // Process payment with payment gateway
    const result = await paymentGateway.charge(amount, paymentMethod);

    // Update order status
    await Order.update(orderId, {
      status: 'paid',
      transactionId: result.transactionId
    });

    // Invalidate order cache
    await cache.del(`order:${orderId}`);

    // Queue fulfillment
    await fulfillmentQueue.add('fulfill-order', { orderId });

    // Queue confirmation email
    await mailQueue.add('order-confirmation', {
      orderId,
      amount,
      transactionId: result.transactionId
    }, { priority: 2 });

  } catch (error) {
    // Update order with error
    await Order.update(orderId, {
      status: 'failed',
      error: error.message
    });

    // Queue refund notification
    await mailQueue.add('payment-failed', {
      orderId,
      error: error.message
    }, { priority: 1 });

    throw error; // Bull will retry
  }
}
```

### Example 4: Search with Aggressive Caching

```javascript
// GET /api/search/events
async function searchEvents(req, res) {
  const { q, category, page, limit } = req.query;

  // 1. Generate cache key from query params
  const cacheKey = cache.generateKey('search:events', {
    q, category, page, limit
  });

  // 2. Check cache (L2 - query result cache)
  const cached = await cache.get(cacheKey);
  if (cached) {
    return res.json({
      success: true,
      data: cached,
      cached: true
    });
  }

  // 3. Query Elasticsearch
  const results = await esClient.search({
    index: 'events',
    body: {
      query: {
        bool: {
          must: [
            { match: { title: q } }
          ],
          filter: [
            { term: { category } }
          ]
        }
      },
      from: (page - 1) * limit,
      size: limit
    }
  });

  // 4. Cache results (1 hour TTL)
  await cache.set(cacheKey, results, 3600);

  // 5. Return results
  return res.json({
    success: true,
    data: results,
    cached: false
  });
}
```

## Performance Benefits

### Before (No Caching/Queuing)

```
User Registration:
- Database write: 50ms
- Send email (blocking): 2000ms
- Index Elasticsearch: 100ms
Total Response Time: 2150ms ❌
```

### After (With Caching/Queuing)

```
User Registration:
- Database write: 50ms
- Queue email job: 2ms
- Queue index job: 2ms
Total Response Time: 54ms ✅ (40x faster)

Background Processing:
- Email sent: 2000ms (async)
- Elasticsearch indexed: 100ms (async)
```

### Caching Benefits

```
Search Query (without cache):
- Elasticsearch query: 80ms
- Data transformation: 20ms
Total: 100ms

Search Query (with cache):
- Redis lookup: 1-2ms
Total: 2ms ✅ (50x faster)
```

## Queue Metrics & Monitoring

### Key Metrics to Track

1. **Queue Depth**
   - Number of jobs waiting to be processed
   - Alert if > 1000 jobs

2. **Processing Rate**
   - Jobs/second processed
   - Target: > 10 jobs/sec

3. **Job Completion Time**
   - Average time per job type
   - P95, P99 latencies

4. **Failure Rate**
   - % of failed jobs
   - Alert if > 5%

5. **Retry Rate**
   - How often jobs are retried
   - Indicates instability if high

### Monitoring Implementation

```javascript
// Queue event handlers
mailQueue.on('completed', (job) => {
  metrics.increment('mail_queue.completed');
  metrics.timing('mail_queue.duration', job.finishedOn - job.processedOn);
});

mailQueue.on('failed', (job, err) => {
  metrics.increment('mail_queue.failed');
  logger.error('Mail job failed', { jobId: job.id, error: err });
});

mailQueue.on('stalled', (job) => {
  metrics.increment('mail_queue.stalled');
  logger.warn('Mail job stalled', { jobId: job.id });
});
```

## Cache Metrics & Monitoring

```javascript
// Cache hit/miss tracking
async function getWithMetrics(key) {
  const value = await cache.get(key);

  if (value) {
    metrics.increment('cache.hit');
  } else {
    metrics.increment('cache.miss');
  }

  return value;
}

// Calculate hit rate
const hitRate = hits / (hits + misses);
// Target: > 80% hit rate
```

## Scalability Considerations

### Horizontal Scaling

**API Service (Stateless)**
```yaml
services:
  api:
    deploy:
      replicas: 5
    environment:
      - REDIS_HOST=redis-cluster
```

**Worker Service (Multiple Instances)**
```yaml
services:
  mail-worker:
    deploy:
      replicas: 3
  payment-worker:
    deploy:
      replicas: 2
```

### Redis Scaling

**Option 1: Redis Sentinel (HA)**
- Master-slave replication
- Automatic failover
- Read replicas for scaling reads

**Option 2: Redis Cluster**
- Sharding for horizontal scaling
- 16,384 hash slots
- Multi-master setup

### Queue Scaling

**Strategy 1: Queue Prioritization**
```javascript
// Critical jobs get processed first
await paymentQueue.add(data, { priority: 1 });
await mailQueue.add(data, { priority: 5 });
```

**Strategy 2: Dedicated Workers**
```javascript
// Separate workers for different job types
paymentWorker.process('charge', 2, processPayment);
mailWorker.process('registration', 5, sendEmail);
```

**Strategy 3: Dynamic Concurrency**
```javascript
// Adjust based on load
const concurrency = process.env.NODE_ENV === 'production' ? 10 : 2;
worker.process(concurrency, processJob);
```

## Testing the POC

### 1. Start Services
```bash
docker-compose up -d
```

### 2. Create Test Events
```bash
# See POC_DEMO.sh for automated tests
./POC_DEMO.sh
```

### 3. Monitor Cache
```bash
redis-cli MONITOR
# Watch cache operations in real-time
```

### 4. Monitor Queues
```bash
docker-compose logs -f mail-queue
docker-compose logs -f worker
```

### 5. Check Metrics
```bash
# Cache hit rate
redis-cli INFO stats | grep keyspace

# Queue status
curl http://localhost:3000/api/queues/stats
```

## Production Checklist

- [ ] Redis persistence enabled (AOF + RDB)
- [ ] Redis password authentication
- [ ] Queue job retention limits
- [ ] Dead letter queue for failed jobs
- [ ] Monitoring & alerting setup
- [ ] Cache warming strategy
- [ ] Rate limiting on APIs
- [ ] Circuit breakers for external services
- [ ] Graceful shutdown handling
- [ ] Queue metrics dashboard
- [ ] Cache eviction policy configured
- [ ] Backup strategy for Redis

## Next Steps

1. Review the POC demo script: [POC_DEMO.sh](./POC_DEMO.sh)
2. Review example implementations: [examples/](./examples/)
3. Run load tests: [LOAD_TESTING_GUIDE.md](./LOAD_TESTING_GUIDE.md)
4. Deploy to staging: [AWS_DEPLOYMENT_GUIDE.md](./AWS_DEPLOYMENT_GUIDE.md)

## References

- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
- [Bull Queue Documentation](https://github.com/OptimalBits/bull)
- [Caching Strategies](https://docs.aws.amazon.com/AmazonElastiCache/latest/mem-ug/Strategies.html)
