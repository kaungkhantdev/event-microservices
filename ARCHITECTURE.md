# System Architecture

## Overview

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ HTTP Requests
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                      API Service                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────┐ │
│  │  Validation  │───▶│  Controller  │───▶│   Model  │ │
│  │  Middleware  │    │   (Business  │    │(Sequelize)│ │
│  └──────────────┘    │     Logic)   │    └────┬─────┘ │
│                      └───────┬──────┘         │        │
│                              │                │        │
│                              │ Queue Jobs     │        │
│                              ▼                ▼        │
│                      ┌──────────────┐  ┌──────────┐   │
│                      │ Redis Cache  │  │PostgreSQL│   │
│                      │  (GET cache) │  │    DB    │   │
│                      └──────┬───────┘  └──────────┘   │
└─────────────────────────────┼──────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
         ┌──────────▼────────┐   ┌─────▼──────────┐
         │   Bull Queues     │   │  Bull Queues   │
         │  (elastic-sync)   │   │    (mail)      │
         └──────────┬────────┘   └─────┬──────────┘
                    │                   │
         ┌──────────▼────────┐   ┌─────▼──────────┐
         │  Worker Service   │   │  Mail Queue    │
         │                   │   │    Service     │
         │ ┌───────────────┐ │   │ ┌────────────┐ │
         │ │ Elasticsearch │ │   │ │ Nodemailer │ │
         │ │     Sync      │ │   │ │  Templates │ │
         │ └───────┬───────┘ │   │ └────────────┘ │
         └─────────┼─────────┘   └────────────────┘
                   │
                   ▼
         ┌──────────────────┐
         │  Elasticsearch   │
         │    (Search)      │
         └──────────────────┘
```

## Request Flow

### 1. GET Request (with caching)

```
Client ──GET /api/events──▶ API
                             │
                             ├─▶ Check Redis Cache
                             │   │
                             │   ├─▶ Cache HIT ──▶ Return cached data ──▶ Client
                             │   │
                             │   └─▶ Cache MISS
                             │       │
                             │       ├─▶ Query PostgreSQL
                             │       │
                             │       ├─▶ Store in Redis Cache (TTL: 300s)
                             │       │
                             │       └─▶ Return data ──▶ Client
```

### 2. POST/PUT/DELETE Request (with cache invalidation)

```
Client ──POST /api/events──▶ API
                              │
                              ├─▶ Validate Input
                              │
                              ├─▶ Save to PostgreSQL
                              │
                              ├─▶ Invalidate Cache (DELETE event:*)
                              │
                              ├─▶ Queue Elasticsearch Sync Job
                              │
                              ├─▶ Queue Email Job
                              │
                              └─▶ Return response ──▶ Client

                         Background Jobs:
                              │
                    ┌─────────┴─────────┐
                    │                   │
         Worker processes         Mail Queue processes
         Elasticsearch sync       Email sending
```

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                         Write Path                           │
└──────────────────────────────────────────────────────────────┘

Event CREATE/UPDATE/DELETE
        │
        ▼
   PostgreSQL ───┬───▶ Invalidate Redis Cache
        │        │
        │        ├───▶ Queue: elastic-sync ──▶ Worker ──▶ Elasticsearch
        │        │
        │        └───▶ Queue: mail ──▶ Mail Service ──▶ SMTP
        │
        └───▶ Response to Client


┌──────────────────────────────────────────────────────────────┐
│                         Read Path                            │
└──────────────────────────────────────────────────────────────┘

Event GET Request
        │
        ▼
   Check Redis Cache
        │
        ├─── HIT ──▶ Return from Cache (1-2ms)
        │
        └─── MISS ──▶ Query PostgreSQL (50-100ms)
                           │
                           └──▶ Store in Cache ──▶ Return to Client
```

## Caching Strategy

### Cache-Aside Pattern
1. Application checks cache before database
2. On cache miss, query database and populate cache
3. On data mutation, invalidate relevant cache entries

### Cache Invalidation
- **Pattern-based**: `event:*` deletes all event-related caches
- **Timing**: Synchronous invalidation on write operations
- **Trade-off**: Ensures data consistency at cost of cache misses

### TTL Strategy
```javascript
// Short TTL for frequently changing data
GET /api/events          → 300s (5 min)  // List can change often

// Longer TTL for single items
GET /api/events/:id      → 600s (10 min) // Single event changes less
```

## Queue Priority System

### Mail Queue Priorities
```
Priority 1 (Highest)  → forgot-password  (Security-critical)
Priority 5 (Normal)   → new-event        (Notifications)
Priority 5 (Normal)   → registration     (Welcome emails)
Priority 5 (Normal)   → reminder         (Event reminders)
```

## Scalability Considerations

### Horizontal Scaling
```
                    ┌──── API Instance 1 ────┐
                    │                         │
Client ──▶ Load ────┼──── API Instance 2 ────┼──▶ Shared Redis
      Balancer      │                         │     (Cache + Queue)
                    └──── API Instance N ────┘           │
                                                          │
                                              ┌───────────┴──────────┐
                                              │                      │
                                       Worker Pool 1           Worker Pool 2
                                    (Elasticsearch Sync)    (Mail Processing)
```

### Benefits of Redis for Caching + Queue
- **Single source of truth**: All API instances share cache
- **Distributed queue**: Workers can scale independently
- **Session affinity not required**: Any API instance can serve any request

## Performance Metrics

### Without Cache
- Average response time: 50-100ms
- Database queries: 100% of requests
- Database load: High

### With Cache (90% hit rate)
- Average response time: 5-10ms
- Database queries: 10% of requests
- Database load: Reduced by 90%

## Technology Stack Summary

| Component | Technology | Purpose |
|-----------|------------|---------|
| **API** | Express.js | REST API & Business Logic |
| **Cache** | Redis | Response caching |
| **Queue** | Bull (Redis) | Job queue management |
| **Database** | PostgreSQL | Primary data store |
| **Search** | Elasticsearch | Full-text search |
| **Email** | Nodemailer | Email delivery |
| **ORM** | Sequelize | Database abstraction |

## Why Redis for Both Cache and Queue?

### Advantages
✅ **Single dependency** for multiple use cases
✅ **In-memory performance** for both caching and queuing
✅ **Simple deployment** with Docker Compose
✅ **Bull features**: Priority, retry, scheduling
✅ **Atomic operations** ensure consistency

### When to Consider Alternatives
- **RabbitMQ**: If you need complex routing or AMQP protocol
- **Memcached**: If you only need caching (no queue)
- **Kafka**: If you need event streaming or high-throughput logs
- **SQS**: If you're on AWS and want managed service

## Best Practices Implemented

1. **Cache Invalidation**: Proactive invalidation on writes
2. **Error Handling**: Cache failures don't break the application
3. **TTL Strategy**: Different TTLs based on data volatility
4. **Queue Separation**: Separate queues for different job types
5. **Background Processing**: Heavy tasks don't block API responses
6. **Parallel Operations**: Queue jobs run concurrently with response
