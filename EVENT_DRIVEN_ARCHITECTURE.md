# Event-Driven Architecture Guide

## 🎯 Overview

Event-driven architecture (EDA) is a pattern where services communicate through events rather than direct API calls. Your system **already uses event-driven patterns** with Bull queues, but there are opportunities to expand this approach.

---

## 📊 Current Event-Driven Usage (Already Implemented)

### ✅ What You're Already Doing Right

#### 1. Background Job Queues
```javascript
// API creates event → Queues background jobs (Event-Driven ✓)
await Promise.all([
  elasticSyncQueue.add('sync-event', { eventId: event.id }),
  mailQueue.add('new-event', { eventId: event.id }),
]);
```

**Why this is event-driven:**
- API doesn't wait for ES sync or email sending
- Workers react to events in the queue
- Loose coupling between API and workers
- Asynchronous processing

#### 2. Scheduled Jobs (Cron)
```javascript
// Time-based events trigger actions
cron.schedule('0 9 * * *', sendEventReminders);
```

**Why this is event-driven:**
- Time triggers events
- Workers react to schedule
- No direct coupling

---

## 🔥 When to Use Event-Driven Architecture

### Use Event-Driven When:

#### ✅ 1. **Multiple Services Need to React to One Action**

**Example: User Registers for Event**

❌ **Without Event-Driven (Tightly Coupled):**
```javascript
// Bad: API does everything synchronously
const registerForEvent = async (req, res) => {
  const registration = await Registration.create({
    userId: req.user.id,
    eventId: req.params.eventId,
  });

  // API is responsible for ALL side effects
  await sendConfirmationEmail(registration);
  await updateEventAttendeeCount(registration.eventId);
  await addToUserCalendar(req.user.id, registration.eventId);
  await notifyEventOrganizer(registration.eventId);
  await updateRecommendationEngine(req.user.id);
  await createAnalyticsEvent(registration);
  await syncToElasticsearch(registration.eventId);

  res.json(registration); // User waits for ALL of this!
};
```

**Problems:**
- Response time: 2-5 seconds (user waits)
- If email fails, entire request fails
- API knows about email, calendar, analytics (tight coupling)
- Hard to add new side effects

✅ **With Event-Driven (Loose Coupling):**
```javascript
// Good: API publishes event, workers react
const registerForEvent = async (req, res) => {
  const registration = await Registration.create({
    userId: req.user.id,
    eventId: req.params.eventId,
  });

  // Publish ONE event
  await eventBus.publish('event.registered', {
    registrationId: registration.id,
    userId: req.user.id,
    eventId: req.params.eventId,
    timestamp: new Date(),
  });

  res.json(registration); // User gets response immediately!
};

// Multiple workers subscribe to this event
eventBus.subscribe('event.registered', async (event) => {
  await sendConfirmationEmail(event);
});

eventBus.subscribe('event.registered', async (event) => {
  await updateEventAttendeeCount(event.eventId);
});

eventBus.subscribe('event.registered', async (event) => {
  await addToUserCalendar(event.userId, event.eventId);
});

eventBus.subscribe('event.registered', async (event) => {
  await notifyEventOrganizer(event.eventId);
});

// Easy to add new subscribers without changing API code!
```

**Benefits:**
- Response time: 50ms (only creates registration)
- If email fails, registration still succeeds
- API doesn't know about email/calendar/analytics
- Easy to add new reactions (just subscribe)

---

#### ✅ 2. **Actions Need to Happen Eventually, Not Immediately**

**Examples:**
- Send confirmation email (can wait 1-2 seconds)
- Sync to Elasticsearch (can wait 1-2 seconds)
- Update analytics (can wait minutes)
- Generate daily reports (can wait hours)
- Clean up old data (can wait days)

**Current Implementation (Already Event-Driven):**
```javascript
// You're already doing this!
await elasticSyncQueue.add('sync-event', data); // ✓ Event-driven
await mailQueue.add('new-event', data);         // ✓ Event-driven
```

---

#### ✅ 3. **You Need to Process Things in Order**

**Example: Event State Machine**

```
Event Lifecycle:
draft → published → started → completed → archived
```

**Event-Driven Approach:**
```javascript
// Each state transition publishes an event
const publishEvent = async (eventId) => {
  await Event.update({ status: 'published' }, { where: { id: eventId } });

  await eventBus.publish('event.published', {
    eventId,
    timestamp: new Date(),
  });
};

// Multiple subscribers react to publication
eventBus.subscribe('event.published', async (data) => {
  // Send notification to followers
  await notifyFollowers(data.eventId);
});

eventBus.subscribe('event.published', async (data) => {
  // Sync to search
  await syncToElasticsearch(data.eventId);
});

eventBus.subscribe('event.published', async (data) => {
  // Add to recommendation engine
  await updateRecommendations(data.eventId);
});

eventBus.subscribe('event.published', async (data) => {
  // Post to social media
  await postToSocialMedia(data.eventId);
});
```

---

#### ✅ 4. **Different Services Need to Stay in Sync**

**Example: Keeping PostgreSQL and Elasticsearch in Sync**

**You're already doing this!**
```javascript
// API creates event in PostgreSQL
const event = await Event.create(data);

// Queue event to sync to Elasticsearch
await elasticSyncQueue.add('sync-event', {
  operation: 'create',
  eventId: event.id,
});

// Worker reacts to event
elasticSyncQueue.process('sync-event', async (job) => {
  await esClient.index({
    index: 'events',
    id: job.data.eventId,
    document: job.data.data,
  });
});
```

This is **eventual consistency** - a key event-driven pattern.

---

#### ✅ 5. **You Need Audit Logs / Event Sourcing**

**Example: Track All Changes to an Event**

```javascript
const updateEvent = async (req, res) => {
  const oldEvent = await Event.findByPk(req.params.id);
  const newEvent = await oldEvent.update(req.body);

  // Publish detailed change event
  await eventBus.publish('event.updated', {
    eventId: newEvent.id,
    userId: req.user.id,
    changes: {
      before: oldEvent.toJSON(),
      after: newEvent.toJSON(),
      fields: Object.keys(req.body),
    },
    timestamp: new Date(),
  });

  res.json(newEvent);
};

// Audit log subscriber
eventBus.subscribe('event.updated', async (data) => {
  await AuditLog.create({
    action: 'event.updated',
    userId: data.userId,
    resourceId: data.eventId,
    changes: data.changes,
    timestamp: data.timestamp,
  });
});

// Analytics subscriber
eventBus.subscribe('event.updated', async (data) => {
  await Analytics.track('event_updated', {
    eventId: data.eventId,
    fieldsChanged: data.changes.fields,
  });
});
```

---

## ❌ When NOT to Use Event-Driven

### Don't Use Event-Driven When:

#### ❌ 1. **You Need Immediate Response**

**Example: User Login**

```javascript
// Bad: Event-driven for login
const login = async (req, res) => {
  await eventBus.publish('user.login.attempt', { email: req.body.email });
  // ??? How do we return the JWT token?
};

// Good: Synchronous
const login = async (req, res) => {
  const user = await User.findOne({ where: { email: req.body.email } });
  const token = generateJWT(user);
  res.json({ token }); // Immediate response needed
};
```

**When to use synchronous:**
- Authentication
- Real-time validation
- Fetching data for display
- User needs immediate feedback

---

#### ❌ 2. **Simple CRUD with No Side Effects**

**Example: Get Event by ID**

```javascript
// Bad: Event-driven for simple read
const getEvent = async (req, res) => {
  await eventBus.publish('event.read.request', { eventId: req.params.id });
  // ??? How do we return the event data?
};

// Good: Direct read
const getEvent = async (req, res) => {
  const event = await Event.findByPk(req.params.id);
  res.json(event); // Simple and fast
};
```

**Use direct calls for:**
- Reading data
- Simple updates with no side effects
- User expects immediate result

---

#### ❌ 3. **Strong Consistency Required**

**Example: Payment Processing**

```javascript
// Bad: Event-driven for payments
const createPayment = async (req, res) => {
  await eventBus.publish('payment.create', { amount: req.body.amount });
  res.json({ message: 'Payment queued' }); // ❌ User doesn't know if it worked!
};

// Good: Synchronous with immediate confirmation
const createPayment = async (req, res) => {
  const payment = await stripe.charges.create({ amount: req.body.amount });

  if (payment.status === 'succeeded') {
    // NOW publish event for side effects
    await eventBus.publish('payment.succeeded', { paymentId: payment.id });
    res.json({ success: true, paymentId: payment.id });
  } else {
    res.status(400).json({ error: 'Payment failed' });
  }
};
```

---

## 🏗️ Implementing Event Bus in Your System

### Option 1: Extend Bull Queues (Simplest)

**You're already doing this!** Just formalize it.

Create `api/events/eventBus.js`:

```javascript
const Queue = require('bull');

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
  }
};

// Create queues for different event types
const queues = {
  eventLifecycle: new Queue('event-lifecycle', redisConfig),
  userActions: new Queue('user-actions', redisConfig),
  notifications: new Queue('notifications', redisConfig),
  analytics: new Queue('analytics', redisConfig),
};

class EventBus {
  // Publish an event
  static async publish(eventName, data, options = {}) {
    const [category] = eventName.split('.'); // 'event.created' → 'event'

    const queue = queues[`${category}Lifecycle`] || queues.eventLifecycle;

    await queue.add(eventName, {
      event: eventName,
      data,
      timestamp: new Date().toISOString(),
      correlationId: options.correlationId || this.generateId(),
    }, {
      priority: options.priority || 5,
      attempts: options.attempts || 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });

    console.log(`[EVENT] Published: ${eventName}`);
  }

  // Subscribe to an event
  static subscribe(eventName, handler) {
    const [category] = eventName.split('.');
    const queue = queues[`${category}Lifecycle`] || queues.eventLifecycle;

    queue.process(eventName, async (job) => {
      console.log(`[EVENT] Processing: ${eventName}`);
      await handler(job.data.data);
    });

    console.log(`[EVENT] Subscribed to: ${eventName}`);
  }

  static generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = EventBus;
```

### Usage Example

**In API (Publisher):**

```javascript
const EventBus = require('../events/eventBus');

const createEvent = async (req, res) => {
  const event = await Event.create(req.body);

  // Publish event
  await EventBus.publish('event.created', {
    eventId: event.id,
    title: event.title,
    category: event.category,
    organizerId: req.user?.id,
  });

  res.status(201).json(event);
};

const deleteEvent = async (req, res) => {
  const event = await Event.findByPk(req.params.id);
  await event.destroy();

  // Publish deletion event
  await EventBus.publish('event.deleted', {
    eventId: req.params.id,
    title: event.title,
  });

  res.json({ message: 'Event deleted' });
};
```

**In Worker (Subscriber):**

```javascript
const EventBus = require('../events/eventBus');

// Subscribe to event creation
EventBus.subscribe('event.created', async (data) => {
  console.log('Syncing new event to Elasticsearch:', data.eventId);
  await syncToElasticsearch(data.eventId);
});

EventBus.subscribe('event.created', async (data) => {
  console.log('Sending new event notification:', data.eventId);
  await sendNewEventEmail(data.eventId);
});

EventBus.subscribe('event.created', async (data) => {
  console.log('Updating recommendations:', data.eventId);
  await updateRecommendationEngine(data.eventId);
});

// Subscribe to event deletion
EventBus.subscribe('event.deleted', async (data) => {
  console.log('Removing from Elasticsearch:', data.eventId);
  await esClient.delete({ index: 'events', id: data.eventId });
});

EventBus.subscribe('event.deleted', async (data) => {
  console.log('Cleaning up registrations:', data.eventId);
  await Registration.destroy({ where: { eventId: data.eventId } });
});
```

---

### Option 2: Redis Pub/Sub (Real-Time)

**When to use:** Real-time notifications, WebSocket broadcasting

Create `api/events/pubsub.js`:

```javascript
const redis = require('../config/redis');

class PubSub {
  static async publish(channel, message) {
    await redis.publish(channel, JSON.stringify(message));
  }

  static subscribe(channel, handler) {
    const subscriber = redis.duplicate();

    subscriber.subscribe(channel, (err, count) => {
      if (err) {
        console.error(`Failed to subscribe to ${channel}:`, err);
      } else {
        console.log(`Subscribed to ${channel}`);
      }
    });

    subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        handler(JSON.parse(message));
      }
    });

    return subscriber;
  }
}

module.exports = PubSub;
```

**Usage for Real-Time Updates:**

```javascript
// API publishes real-time event
const createEvent = async (req, res) => {
  const event = await Event.create(req.body);

  // Notify all connected WebSocket clients
  await PubSub.publish('events:new', {
    eventId: event.id,
    title: event.title,
  });

  res.status(201).json(event);
};

// WebSocket server subscribes
PubSub.subscribe('events:new', (data) => {
  // Broadcast to all connected clients
  io.emit('new-event', data);
});
```

---

### Option 3: RabbitMQ (Advanced)

**When to use:** High volume, complex routing, microservices

```javascript
const amqp = require('amqplib');

class EventBus {
  constructor() {
    this.connection = null;
    this.channel = null;
  }

  async connect() {
    this.connection = await amqp.connect(process.env.RABBITMQ_URL);
    this.channel = await this.connection.createChannel();
    await this.channel.assertExchange('events', 'topic', { durable: true });
  }

  async publish(eventName, data) {
    this.channel.publish(
      'events',
      eventName,
      Buffer.from(JSON.stringify(data)),
      { persistent: true }
    );
  }

  async subscribe(pattern, handler) {
    const queue = await this.channel.assertQueue('', { exclusive: true });
    await this.channel.bindQueue(queue.queue, 'events', pattern);

    this.channel.consume(queue.queue, async (msg) => {
      const data = JSON.parse(msg.content.toString());
      await handler(data);
      this.channel.ack(msg);
    });
  }
}

// Usage
const eventBus = new EventBus();
await eventBus.connect();

// Publish
await eventBus.publish('event.created', { eventId: '123' });

// Subscribe to all event.* events
await eventBus.subscribe('event.*', async (data) => {
  console.log('Event occurred:', data);
});
```

---

## 🎯 Recommended Event-Driven Patterns for Your System

### Pattern 1: Event Lifecycle Events

```javascript
// Events to publish
const EVENTS = {
  // Event lifecycle
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_DELETED: 'event.deleted',
  EVENT_PUBLISHED: 'event.published',
  EVENT_CANCELLED: 'event.cancelled',
  EVENT_STARTED: 'event.started',
  EVENT_COMPLETED: 'event.completed',

  // User actions
  USER_REGISTERED: 'user.registered',
  USER_UNREGISTERED: 'user.unregistered',
  USER_CHECKED_IN: 'user.checked_in',

  // Search
  SEARCH_PERFORMED: 'search.performed',
  SEARCH_NO_RESULTS: 'search.no_results',
};
```

**Implementation:**

```javascript
// api/controllers/eventController.js
const EventBus = require('../events/eventBus');
const { EVENTS } = require('../events/constants');

const createEvent = async (req, res) => {
  const event = await Event.create(req.body);

  await EventBus.publish(EVENTS.EVENT_CREATED, {
    eventId: event.id,
    title: event.title,
    category: event.category,
    status: event.status,
  });

  res.status(201).json(event);
};

const publishEvent = async (req, res) => {
  const event = await Event.findByPk(req.params.id);
  await event.update({ status: 'published' });

  await EventBus.publish(EVENTS.EVENT_PUBLISHED, {
    eventId: event.id,
    title: event.title,
    startDate: event.startDate,
  });

  res.json(event);
};
```

**Subscribers:**

```javascript
// worker/subscribers/eventSubscribers.js
const EventBus = require('../events/eventBus');
const { EVENTS } = require('../events/constants');

// Elasticsearch sync
EventBus.subscribe(EVENTS.EVENT_CREATED, syncToES);
EventBus.subscribe(EVENTS.EVENT_UPDATED, syncToES);
EventBus.subscribe(EVENTS.EVENT_DELETED, removeFromES);

// Email notifications
EventBus.subscribe(EVENTS.EVENT_PUBLISHED, sendPublicationEmail);
EventBus.subscribe(EVENTS.EVENT_CANCELLED, sendCancellationEmail);

// Analytics
EventBus.subscribe(EVENTS.EVENT_CREATED, trackEventCreation);
EventBus.subscribe(EVENTS.SEARCH_PERFORMED, trackSearch);
```

---

### Pattern 2: Command Query Responsibility Segregation (CQRS)

**Separate reads and writes:**

```javascript
// Write Model (Commands) - API
const createEvent = async (req, res) => {
  const event = await Event.create(req.body);

  // Publish command result as event
  await EventBus.publish(EVENTS.EVENT_CREATED, event.toJSON());

  res.status(201).json(event);
};

// Read Model (Queries) - Search Service
const searchEvents = async (req, res) => {
  // Read from Elasticsearch (optimized for queries)
  const results = await esClient.search({
    index: 'events',
    body: { query: { match: { title: req.query.q } } },
  });

  res.json(results);
};

// Event handler keeps read model in sync
EventBus.subscribe(EVENTS.EVENT_CREATED, async (event) => {
  await esClient.index({
    index: 'events',
    id: event.id,
    document: event,
  });
});
```

---

### Pattern 3: Saga Pattern (Distributed Transactions)

**Example: Complete Registration Process**

```javascript
// Step 1: Create registration
const registerForEvent = async (req, res) => {
  const registration = await Registration.create({
    userId: req.user.id,
    eventId: req.params.eventId,
  });

  // Start saga
  await EventBus.publish('registration.saga.start', {
    registrationId: registration.id,
    userId: req.user.id,
    eventId: req.params.eventId,
  });

  res.json(registration);
};

// Step 2: Reduce available seats
EventBus.subscribe('registration.saga.start', async (data) => {
  const event = await Event.findByPk(data.eventId);

  if (event.availableSeats > 0) {
    await event.decrement('availableSeats');

    await EventBus.publish('registration.seats.reduced', data);
  } else {
    // Compensating transaction
    await Registration.destroy({ where: { id: data.registrationId } });
    await EventBus.publish('registration.saga.failed', {
      ...data,
      reason: 'No seats available',
    });
  }
});

// Step 3: Send confirmation email
EventBus.subscribe('registration.seats.reduced', async (data) => {
  try {
    await sendConfirmationEmail(data.userId, data.eventId);
    await EventBus.publish('registration.saga.completed', data);
  } catch (error) {
    // Compensating transaction: restore seat
    await Event.increment('availableSeats', {
      where: { id: data.eventId },
    });
    await EventBus.publish('registration.saga.failed', {
      ...data,
      reason: error.message,
    });
  }
});
```

---

## 📊 Event-Driven vs Request-Response Comparison

| Aspect | Request-Response | Event-Driven |
|--------|-----------------|--------------|
| **Coupling** | Tight | Loose |
| **Response Time** | Synchronous (slow) | Asynchronous (fast) |
| **Failure Handling** | Immediate failure | Retry mechanism |
| **Scalability** | Limited | High |
| **Complexity** | Low | Medium |
| **Debugging** | Easy | Harder |
| **Consistency** | Strong | Eventual |
| **Best For** | CRUD, Auth, Reads | Side effects, Integration |

---

## 🚀 Migration Strategy

### Phase 1: Current State (What You Have)
```
✓ Bull queues for ES sync
✓ Bull queues for email
✓ Cron jobs for scheduled tasks
```

### Phase 2: Formalize Event Bus (Recommended Next)
```
□ Create EventBus wrapper around Bull
□ Define event constants (EVENTS)
□ Publish events for all CRUD operations
□ Subscribe workers to events
```

### Phase 3: Add New Event Types
```
□ User registration events
□ Search events (for analytics)
□ Event lifecycle events
□ Audit log events
```

### Phase 4: Advanced Patterns (Future)
```
□ CQRS (separate read/write models)
□ Event sourcing (store all events)
□ Saga pattern (distributed transactions)
□ Real-time notifications (Redis Pub/Sub)
```

---

## ✅ When to Use Event-Driven - Decision Tree

```
Should I use event-driven for this?

1. Does the user need an immediate response?
   YES → Use synchronous (request-response)
   NO → Continue to #2

2. Do multiple services need to react to this action?
   YES → Use event-driven ✓
   NO → Continue to #3

3. Can this happen asynchronously (in background)?
   YES → Use event-driven ✓
   NO → Continue to #4

4. Do I need eventual consistency (vs strong consistency)?
   YES → Use event-driven ✓
   NO → Use synchronous

5. Is this a simple CRUD with no side effects?
   YES → Use synchronous
   NO → Use event-driven ✓
```

---

## 🎯 Your System: Event-Driven Recommendations

### Already Event-Driven (Keep As-Is) ✓
```javascript
✓ Elasticsearch sync (background)
✓ Email sending (background)
✓ Scheduled jobs (cron)
```

### Should Be Event-Driven (Recommended)
```javascript
✓ Event creation → Multiple side effects
  - Sync to ES
  - Send notifications
  - Update analytics
  - Post to social media

✓ Event updates → Keep services in sync
  - Update ES
  - Notify followers
  - Update recommendations

✓ User registration → Multi-step process
  - Reduce available seats
  - Send confirmation
  - Add to calendar
  - Notify organizer

✓ Search tracking → Analytics
  - Track popular searches
  - Track no-result searches
  - Update recommendations
```

### Should NOT Be Event-Driven (Keep Synchronous)
```javascript
✓ Get event by ID (simple read)
✓ List events (simple query)
✓ Login/authentication (needs immediate response)
✓ Validate input (needs immediate feedback)
```

---

## 📚 Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Current architecture
- [SCALABILITY_ANALYSIS.md](SCALABILITY_ANALYSIS.md) - Scaling patterns
- [SERVICE_GROWTH_ANALYSIS.md](SERVICE_GROWTH_ANALYSIS.md) - Service evolution

---

## 🎓 Summary

**You're already using event-driven architecture!** Bull queues are a form of event-driven design.

**Next steps:**
1. **Formalize it:** Create EventBus wrapper around Bull
2. **Expand usage:** Publish events for more operations (registration, updates, etc.)
3. **Add subscribers:** Multiple workers can react to same events
4. **Monitor events:** Track event flow with Sentry

**Key principle:** Use event-driven when you have side effects that can happen asynchronously. Use synchronous when users need immediate responses.

---

**Event-driven = Loose coupling + Scalability + Resilience 🚀**
