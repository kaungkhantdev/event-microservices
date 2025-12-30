# Sentry Integration Guide

## 🎯 Overview

Sentry provides real-time error tracking, performance monitoring, and alerts for your Event Management System. It integrates seamlessly with the existing monitoring setup.

---

## 🚀 Quick Setup (10 Minutes)

### 1. Install Sentry SDK

```bash
# In api/ directory
cd api
npm install @sentry/node @sentry/profiling-node

# In worker/ directory
cd ../worker
npm install @sentry/node @sentry/profiling-node

# In mail-queue/ directory
cd ../mail-queue
npm install @sentry/node @sentry/profiling-node
```

### 2. Get Sentry DSN

1. Sign up at https://sentry.io (free tier available)
2. Create a new project for each service:
   - `event-api` (Node.js)
   - `event-worker` (Node.js)
   - `event-mail-queue` (Node.js)
3. Copy the DSN for each project

### 3. Add Environment Variables

Update `.env` files for each service:

```bash
# api/.env
SENTRY_DSN=https://your-api-key@o123456.ingest.sentry.io/7890123
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% of transactions
SENTRY_PROFILES_SAMPLE_RATE=0.1  # 10% of transactions

# worker/.env
SENTRY_DSN=https://your-worker-key@o123456.ingest.sentry.io/7890124
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1

# mail-queue/.env
SENTRY_DSN=https://your-mail-key@o123456.ingest.sentry.io/7890125
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_PROFILES_SAMPLE_RATE=0.1
```

---

## 📝 Implementation

### API Service (api/)

#### A. Create Sentry Config

Create `api/config/sentry.js`:

```javascript
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

const initSentry = (app) => {
  if (!process.env.SENTRY_DSN) {
    console.log('⚠️  Sentry DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',

    // Performance Monitoring
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,

    // Profiling
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE) || 0.1,

    integrations: [
      // HTTP tracing
      new Sentry.Integrations.Http({ tracing: true }),

      // Express integration
      new Sentry.Integrations.Express({ app }),

      // Profiling
      nodeProfilingIntegration(),

      // PostgreSQL tracing
      new Sentry.Integrations.Postgres(),

      // Redis tracing
      new Sentry.Integrations.Redis(),
    ],

    // Ignore certain errors
    ignoreErrors: [
      'ValidationError',
      'SequelizeValidationError',
      'SequelizeUniqueConstraintError',
    ],

    // Filter sensitive data
    beforeSend(event, hint) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }

      // Remove sensitive query params
      if (event.request?.query_string) {
        event.request.query_string = event.request.query_string
          .replace(/password=[^&]*/gi, 'password=[REDACTED]')
          .replace(/token=[^&]*/gi, 'token=[REDACTED]');
      }

      return event;
    },

    // Custom tags
    initialScope: {
      tags: {
        service: 'api',
        version: process.env.npm_package_version || '1.0.0',
      },
    },
  });

  console.log('✓ Sentry initialized for API service');
};

module.exports = { initSentry, Sentry };
```

#### B. Update server.js

Update `api/server.js`:

```javascript
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { initSentry, Sentry } = require('./config/sentry');
const { sequelize } = require('./config/database');
const { checkConnection } = require('./config/elasticsearch');

const eventRoutes = require('./routes/eventRoutes');
const searchRoutes = require('./routes/searchRoutes');
const metricsRoutes = require('./routes/metricsRoutes');
const responseTimeMetrics = require('./middleware/responseTime');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// 1. Initialize Sentry FIRST (before other middleware)
// ========================================
initSentry(app);

// Sentry request handler (must be first)
app.use(Sentry.Handlers.requestHandler());

// Sentry tracing handler (must be after requestHandler)
app.use(Sentry.Handlers.tracingHandler());

// ========================================
// 2. Standard middleware
// ========================================
app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(responseTimeMetrics);

// ========================================
// 3. Routes
// ========================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/events', eventRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/metrics', metricsRoutes);

// ========================================
// 4. Sentry error handler (must be before other error handlers)
// ========================================
app.use(Sentry.Handlers.errorHandler());

// ========================================
// 5. Custom error handler (after Sentry)
// ========================================
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Send error to client
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

// ========================================
// 6. Start server
// ========================================
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected');

    await checkConnection();
    console.log('✓ Elasticsearch connected');

    app.listen(PORT, () => {
      console.log(`✓ API server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    Sentry.captureException(error); // Send startup errors to Sentry
    process.exit(1);
  }
};

startServer();

// ========================================
// 7. Graceful shutdown
// ========================================
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await Sentry.close(2000); // Flush events before exit
  await sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  await Sentry.close(2000);
  await sequelize.close();
  process.exit(0);
});
```

#### C. Add Custom Error Tracking

Update `api/controllers/eventController.js` to add custom context:

```javascript
const { Sentry } = require('../config/sentry');
const Event = require('../models/Event');
const { elasticSyncQueue, mailQueue } = require('../queues');
const { invalidateCache } = require('../utils/cache');

const createEvent = async (req, res, next) => {
  // Start a Sentry transaction for performance tracking
  const transaction = Sentry.startTransaction({
    op: 'http.server',
    name: 'POST /api/events',
  });

  try {
    // Validate input
    const eventData = req.body;

    // Create event
    const createSpan = transaction.startChild({
      op: 'db.query',
      description: 'Create event in PostgreSQL',
    });
    const event = await Event.create(eventData);
    createSpan.finish();

    // Queue jobs
    const queueSpan = transaction.startChild({
      op: 'queue',
      description: 'Queue background jobs',
    });
    await Promise.all([
      elasticSyncQueue.add('sync-event', {
        operation: 'create',
        eventId: event.id,
        data: event.toJSON(),
      }),
      mailQueue.add('new-event', {
        eventId: event.id,
        eventTitle: event.title,
      }, { priority: 5 }),
      invalidateCache('event:*'),
    ]);
    queueSpan.finish();

    // Add custom context to Sentry
    Sentry.setContext('event', {
      id: event.id,
      title: event.title,
      category: event.category,
    });

    transaction.setStatus('ok');
    res.status(201).json(event);
  } catch (error) {
    transaction.setStatus('internal_error');

    // Add error context
    Sentry.setContext('request', {
      body: req.body,
      params: req.params,
    });

    // Capture exception with custom tags
    Sentry.captureException(error, {
      tags: {
        operation: 'create_event',
        controller: 'eventController',
      },
      level: 'error',
    });

    next(error);
  } finally {
    transaction.finish();
  }
};

const getAllEvents = async (req, res, next) => {
  const transaction = Sentry.startTransaction({
    op: 'http.server',
    name: 'GET /api/events',
  });

  try {
    const { page = 1, limit = 20, status, category } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const dbSpan = transaction.startChild({
      op: 'db.query',
      description: 'Fetch events from PostgreSQL',
    });

    const { count, rows } = await Event.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['startDate', 'ASC']],
    });

    dbSpan.finish();

    // Track query performance
    Sentry.setMeasurement('query_count', count, 'none');
    Sentry.setMeasurement('page', parseInt(page), 'none');

    transaction.setStatus('ok');
    res.json({
      events: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    transaction.setStatus('internal_error');
    Sentry.captureException(error, {
      tags: { operation: 'get_all_events' },
    });
    next(error);
  } finally {
    transaction.finish();
  }
};

const getEventById = async (req, res, next) => {
  try {
    const event = await Event.findByPk(req.params.id);

    if (!event) {
      // Log 404s to Sentry (optional, might be noisy)
      Sentry.captureMessage(`Event not found: ${req.params.id}`, {
        level: 'warning',
        tags: { operation: 'get_event_by_id' },
      });

      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { operation: 'get_event_by_id' },
      contexts: { event_id: req.params.id },
    });
    next(error);
  }
};

const updateEvent = async (req, res, next) => {
  try {
    const event = await Event.findByPk(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const oldData = { ...event.toJSON() };
    await event.update(req.body);

    // Track what changed
    Sentry.addBreadcrumb({
      category: 'event',
      message: 'Event updated',
      level: 'info',
      data: {
        eventId: event.id,
        changes: Object.keys(req.body),
      },
    });

    await Promise.all([
      elasticSyncQueue.add('sync-event', {
        operation: 'update',
        eventId: event.id,
        data: event.toJSON(),
      }),
      invalidateCache(`event:${event.id}`),
      invalidateCache('event:*'),
    ]);

    res.json(event);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { operation: 'update_event' },
    });
    next(error);
  }
};

const deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findByPk(req.params.id);

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const eventId = event.id;
    await event.destroy();

    // Track deletion
    Sentry.addBreadcrumb({
      category: 'event',
      message: 'Event deleted',
      level: 'warning',
      data: {
        eventId,
        title: event.title,
      },
    });

    await Promise.all([
      elasticSyncQueue.add('sync-event', {
        operation: 'delete',
        eventId,
      }),
      invalidateCache(`event:${eventId}`),
      invalidateCache('event:*'),
    ]);

    res.json({ message: 'Event deleted successfully' });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { operation: 'delete_event' },
    });
    next(error);
  }
};

module.exports = {
  createEvent,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
};
```

---

### Worker Service (worker/)

#### A. Create Sentry Config

Create `worker/config/sentry.js`:

```javascript
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

const initSentry = () => {
  if (!process.env.SENTRY_DSN) {
    console.log('⚠️  Sentry DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE) || 0.1,

    integrations: [
      nodeProfilingIntegration(),
      new Sentry.Integrations.Postgres(),
      new Sentry.Integrations.Redis(),
    ],

    initialScope: {
      tags: {
        service: 'worker',
        version: process.env.npm_package_version || '1.0.0',
      },
    },
  });

  console.log('✓ Sentry initialized for Worker service');
};

module.exports = { initSentry, Sentry };
```

#### B. Update worker/index.js

```javascript
require('dotenv').config();
const Queue = require('bull');
const { initSentry, Sentry } = require('./config/sentry');
const { checkConnection, initializeIndex } = require('./config/elasticsearch');
const { sequelize } = require('./config/database');
const {
  syncEventToElastic,
  bulkSyncToElastic,
} = require('./processors/elasticSyncProcessor');
const { initializeScheduledJobs } = require('./jobs/scheduledJobs');

// Initialize Sentry FIRST
initSentry();

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
  }
};

const elasticSyncQueue = new Queue('elastic-sync', redisConfig);

const startWorker = async () => {
  const transaction = Sentry.startTransaction({
    op: 'worker.start',
    name: 'Start Worker Service',
  });

  try {
    await sequelize.authenticate();
    console.log('✓ Database connected');

    await checkConnection();
    console.log('✓ Elasticsearch connected');

    await initializeIndex();
    console.log('✓ Elasticsearch index initialized');

    // Process Elasticsearch sync jobs
    elasticSyncQueue.process('sync-event', 5, async (job) => {
      const jobTransaction = Sentry.startTransaction({
        op: 'queue.process',
        name: 'Process Elasticsearch Sync Job',
      });

      try {
        Sentry.setContext('job', {
          id: job.id,
          operation: job.data.operation,
          eventId: job.data.eventId,
        });

        await syncEventToElastic(job);

        jobTransaction.setStatus('ok');
        console.log(`✓ Job ${job.id} completed`);
      } catch (error) {
        jobTransaction.setStatus('internal_error');

        Sentry.captureException(error, {
          tags: {
            job_id: job.id,
            job_type: 'elastic-sync',
            operation: job.data.operation,
          },
        });

        throw error; // Re-throw to trigger Bull retry
      } finally {
        jobTransaction.finish();
      }
    });

    // Job event handlers
    elasticSyncQueue.on('completed', (job) => {
      Sentry.addBreadcrumb({
        category: 'queue',
        message: 'Job completed',
        level: 'info',
        data: { jobId: job.id },
      });
      console.log(`✓ Job ${job.id} completed`);
    });

    elasticSyncQueue.on('failed', (job, err) => {
      Sentry.captureException(err, {
        tags: {
          job_id: job.id,
          job_type: 'elastic-sync',
          event: 'job_failed',
        },
        contexts: {
          job_data: job.data,
        },
      });
      console.error(`✗ Job ${job.id} failed:`, err.message);
    });

    elasticSyncQueue.on('error', (error) => {
      Sentry.captureException(error, {
        tags: {
          component: 'queue',
          event: 'queue_error',
        },
      });
      console.error('✗ Queue error:', error);
    });

    initializeScheduledJobs();

    transaction.setStatus('ok');
    console.log('✓ Background worker started');
    console.log('✓ Listening for Elasticsearch sync jobs');
  } catch (error) {
    transaction.setStatus('internal_error');
    console.error('✗ Failed to start worker:', error);

    Sentry.captureException(error, {
      tags: { event: 'worker_startup_failed' },
    });

    await Sentry.close(2000);
    process.exit(1);
  } finally {
    transaction.finish();
  }
};

startWorker();

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing worker...');
  await elasticSyncQueue.close();
  await sequelize.close();
  await Sentry.close(2000);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing worker...');
  await elasticSyncQueue.close();
  await sequelize.close();
  await Sentry.close(2000);
  process.exit(0);
});
```

#### C. Update Scheduled Jobs

Update `worker/jobs/scheduledJobs.js`:

```javascript
const cron = require('node-cron');
const { Sentry } = require('../config/sentry');
const { sequelize } = require('../config/database');
const Event = require('../models/Event');
const { Op } = require('sequelize');
const { bulkSyncToElastic } = require('../processors/elasticSyncProcessor');

const sendEventReminders = async () => {
  const transaction = Sentry.startTransaction({
    op: 'cron.job',
    name: 'Send Event Reminders',
  });

  try {
    console.log('[CRON] Running: Send event reminders (9 AM daily)');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

    const upcomingEvents = await Event.findAll({
      where: {
        startDate: {
          [Op.gte]: tomorrow,
          [Op.lt]: dayAfterTomorrow,
        },
        status: 'published',
      },
    });

    console.log(`Found ${upcomingEvents.length} events happening tomorrow`);

    // Queue reminder emails (would need mail queue integration)
    for (const event of upcomingEvents) {
      // await mailQueue.add('reminder', { eventId: event.id }, { priority: 5 });
      Sentry.addBreadcrumb({
        category: 'cron',
        message: 'Reminder queued',
        data: { eventId: event.id, eventTitle: event.title },
      });
    }

    Sentry.setMeasurement('reminders_sent', upcomingEvents.length, 'none');
    transaction.setStatus('ok');
  } catch (error) {
    transaction.setStatus('internal_error');
    Sentry.captureException(error, {
      tags: { cron_job: 'send_event_reminders' },
    });
    console.error('[CRON ERROR] Send event reminders failed:', error);
  } finally {
    transaction.finish();
  }
};

const cleanupOldEvents = async () => {
  const transaction = Sentry.startTransaction({
    op: 'cron.job',
    name: 'Cleanup Old Events',
  });

  try {
    console.log('[CRON] Running: Cleanup old events (2 AM daily)');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const result = await Event.destroy({
      where: {
        endDate: { [Op.lt]: sixMonthsAgo },
        status: 'completed',
      },
    });

    console.log(`Deleted ${result} old events`);

    Sentry.setMeasurement('events_deleted', result, 'none');
    transaction.setStatus('ok');
  } catch (error) {
    transaction.setStatus('internal_error');
    Sentry.captureException(error, {
      tags: { cron_job: 'cleanup_old_events' },
    });
    console.error('[CRON ERROR] Cleanup old events failed:', error);
  } finally {
    transaction.finish();
  }
};

// Similar pattern for other cron jobs...

const initializeScheduledJobs = () => {
  console.log('Initializing scheduled jobs...');

  cron.schedule('0 9 * * *', sendEventReminders);
  cron.schedule('0 2 * * *', cleanupOldEvents);
  // ... other jobs

  console.log('✓ Scheduled jobs initialized');
};

module.exports = { initializeScheduledJobs };
```

---

### Mail Queue Service (mail-queue/)

#### A. Create Sentry Config

Create `mail-queue/config/sentry.js`:

```javascript
const Sentry = require('@sentry/node');
const { nodeProfilingIntegration } = require('@sentry/profiling-node');

const initSentry = () => {
  if (!process.env.SENTRY_DSN) {
    console.log('⚠️  Sentry DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || 'development',
    tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE) || 0.1,

    integrations: [
      nodeProfilingIntegration(),
      new Sentry.Integrations.Redis(),
    ],

    initialScope: {
      tags: {
        service: 'mail-queue',
        version: process.env.npm_package_version || '1.0.0',
      },
    },
  });

  console.log('✓ Sentry initialized for Mail Queue service');
};

module.exports = { initSentry, Sentry };
```

#### B. Update mail-queue/index.js

```javascript
require('dotenv').config();
const Queue = require('bull');
const { initSentry, Sentry } = require('./config/sentry');
const { processMailJob } = require('./processors/mailProcessor');

// Initialize Sentry FIRST
initSentry();

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
  }
};

const mailQueue = new Queue('mail', redisConfig);

// Process mail jobs with Sentry tracking
mailQueue.process(async (job) => {
  const transaction = Sentry.startTransaction({
    op: 'queue.process',
    name: 'Process Mail Job',
  });

  try {
    Sentry.setContext('mail', {
      type: job.data.type,
      to: job.data.to,
      jobId: job.id,
    });

    await processMailJob(job);

    transaction.setStatus('ok');
    console.log(`✓ Mail sent: ${job.data.type} to ${job.data.to}`);
  } catch (error) {
    transaction.setStatus('internal_error');

    Sentry.captureException(error, {
      tags: {
        job_id: job.id,
        mail_type: job.data.type,
      },
      contexts: {
        mail_data: {
          to: job.data.to,
          subject: job.data.subject,
        },
      },
    });

    console.error(`✗ Mail failed: ${job.data.type}`, error);
    throw error;
  } finally {
    transaction.finish();
  }
});

mailQueue.on('completed', (job) => {
  Sentry.addBreadcrumb({
    category: 'mail',
    message: 'Mail sent successfully',
    data: { type: job.data.type, to: job.data.to },
  });
});

mailQueue.on('failed', (job, err) => {
  Sentry.captureException(err, {
    tags: { event: 'mail_failed', mail_type: job.data.type },
  });
});

console.log('✓ Mail queue worker started');

process.on('SIGTERM', async () => {
  await mailQueue.close();
  await Sentry.close(2000);
  process.exit(0);
});
```

---

## 📊 Sentry Features You Get

### 1. **Error Tracking**
- Automatic error capture
- Stack traces
- Request context
- User context
- Environment info

### 2. **Performance Monitoring**
- Transaction tracing
- Database query performance
- API endpoint response times
- Background job duration
- Custom measurements

### 3. **Breadcrumbs**
- Track user actions
- Debug errors with context
- See events leading to errors

### 4. **Alerts**
- Email/Slack notifications
- Error rate thresholds
- Performance degradation
- Custom alert rules

### 5. **Releases & Deployments**
- Track which version has errors
- Monitor error trends
- Compare release performance

---

## 🔔 Configure Alerts in Sentry Dashboard

### 1. Error Rate Alert

```
Alert Name: High Error Rate - API
Conditions:
  - Errors > 10 in 5 minutes
  - Environment: production
  - Service: api
Actions:
  - Send email to team@company.com
  - Post to Slack #alerts
```

### 2. Slow Transaction Alert

```
Alert Name: Slow API Responses
Conditions:
  - P95 response time > 500ms for 10 minutes
  - Transaction: POST /api/events
Actions:
  - Send email to devops@company.com
```

### 3. Failed Jobs Alert

```
Alert Name: Background Job Failures
Conditions:
  - Job failures > 5 in 10 minutes
  - Service: worker
Actions:
  - Page on-call engineer
  - Post to Slack #critical
```

---

## 📈 Custom Metrics Integration

### Combine Sentry with Existing Monitoring

Update `api/middleware/searchMetrics.js`:

```javascript
const { Sentry } = require('../config/sentry');

const logSearchMetrics = async (metrics) => {
  // Existing Redis logging...

  // Add to Sentry
  Sentry.setMeasurement('search_duration', metrics.duration, 'millisecond');
  Sentry.setMeasurement('search_results', metrics.resultCount, 'none');

  if (metrics.duration > 500) {
    Sentry.captureMessage('Slow search query', {
      level: 'warning',
      tags: {
        search_query: metrics.query,
        duration: metrics.duration,
      },
    });
  }

  if (metrics.resultCount === 0) {
    Sentry.addBreadcrumb({
      category: 'search',
      message: 'Empty search results',
      data: {
        query: metrics.query,
        filters: metrics.filters,
      },
    });
  }
};
```

---

## 🎯 Best Practices

### 1. Filter Sensitive Data

```javascript
beforeSend(event) {
  // Remove passwords
  if (event.request?.data?.password) {
    event.request.data.password = '[REDACTED]';
  }

  // Remove API keys
  if (event.request?.headers?.authorization) {
    delete event.request.headers.authorization;
  }

  return event;
}
```

### 2. Set User Context (when you add auth)

```javascript
app.use((req, res, next) => {
  if (req.user) {
    Sentry.setUser({
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
    });
  }
  next();
});
```

### 3. Tag by Feature

```javascript
Sentry.setTag('feature', 'search');
Sentry.setTag('category', req.query.category);
```

### 4. Add Custom Context

```javascript
Sentry.setContext('business', {
  eventCategory: event.category,
  isPremium: event.isPremium,
  organizerId: event.organizerId,
});
```

---

## 💰 Sentry Pricing

### Free Tier (Good for Development)
- 5,000 errors/month
- 10,000 performance units/month
- 30-day retention
- 1 project

### Team Plan ($26/month)
- 50,000 errors/month
- 100,000 performance units/month
- 90-day retention
- Unlimited projects
- Slack/email alerts

### Business Plan ($80/month)
- 250,000 errors/month
- 500,000 performance units/month
- Advanced features
- Priority support

---

## 🚀 Deploy with Docker

Update `docker-compose.yml`:

```yaml
services:
  api:
    build: ./api
    environment:
      - SENTRY_DSN=${API_SENTRY_DSN}
      - SENTRY_ENVIRONMENT=production
      - SENTRY_TRACES_SAMPLE_RATE=0.1
    # ... rest of config

  worker:
    build: ./worker
    environment:
      - SENTRY_DSN=${WORKER_SENTRY_DSN}
      - SENTRY_ENVIRONMENT=production
      - SENTRY_TRACES_SAMPLE_RATE=0.1
    # ... rest of config

  mail-queue:
    build: ./mail-queue
    environment:
      - SENTRY_DSN=${MAIL_SENTRY_DSN}
      - SENTRY_ENVIRONMENT=production
      - SENTRY_TRACES_SAMPLE_RATE=0.1
    # ... rest of config
```

Add to root `.env`:

```bash
API_SENTRY_DSN=https://xxx@sentry.io/123
WORKER_SENTRY_DSN=https://xxx@sentry.io/124
MAIL_SENTRY_DSN=https://xxx@sentry.io/125
```

---

## 🧪 Test Sentry Integration

### Test Error Capture

```bash
# Add test endpoint to api/server.js
app.get('/debug-sentry', (req, res) => {
  throw new Error('Test Sentry error');
});

# Trigger error
curl http://localhost:3000/debug-sentry

# Check Sentry dashboard - error should appear in 1-2 seconds
```

### Test Performance Monitoring

```bash
# Make some API calls
curl http://localhost:3000/api/events
curl http://localhost:3000/api/search?q=concert

# Check Sentry Performance tab
# You should see transaction traces
```

---

## 📊 What You'll See in Sentry

### Issues Dashboard
```
Event Management API - Production

Recent Issues:
🔴 TypeError: Cannot read property 'id' of null
   api/controllers/eventController.js:42
   Occurred: 15 times in last hour
   Users affected: 3

⚠️  Slow API Response: POST /api/events
   Average: 850ms (expected <200ms)
   Occurred: 45 times

🟡 Empty search results for "xyz"
   Occurred: 23 times
```

### Performance Dashboard
```
Transactions:
├─ POST /api/events - P95: 120ms
├─ GET /api/events - P95: 45ms
├─ GET /api/search - P95: 180ms ⚠️
└─ Queue: elastic-sync - P95: 250ms

Slow Queries:
├─ SELECT * FROM events WHERE... - 450ms
└─ ES search with aggregations - 680ms
```

---

## 🔗 Integration with Monitoring Setup

Sentry **complements** the monitoring setup in [MONITORING_SETUP.md](MONITORING_SETUP.md):

| Feature | Custom Monitoring | Sentry |
|---------|------------------|--------|
| **Metrics** | Redis counters | Built-in |
| **Errors** | Console logs | Full stack traces |
| **Alerts** | Manual setup | Automatic |
| **Performance** | Response time tracking | Transaction tracing |
| **Dashboard** | Custom API | Web UI |
| **Retention** | Custom (Redis TTL) | 30-90 days |
| **Cost** | Free | Free tier available |

**Recommendation:** Use both!
- Custom monitoring for real-time metrics
- Sentry for error tracking and alerting

---

## ✅ Setup Checklist

```bash
# 1. Install Sentry SDK
□ npm install @sentry/node @sentry/profiling-node (in all 3 services)

# 2. Create Sentry projects
□ Sign up at sentry.io
□ Create 3 projects (api, worker, mail-queue)
□ Copy DSNs

# 3. Add configuration
□ Create config/sentry.js in each service
□ Add SENTRY_DSN to .env files
□ Update server/index files

# 4. Add error tracking
□ Update controllers with Sentry.captureException
□ Add transaction tracking
□ Add breadcrumbs

# 5. Test integration
□ Trigger test errors
□ Check Sentry dashboard
□ Configure alerts

# 6. Deploy
□ Update docker-compose.yml
□ Set production environment variables
□ Deploy and monitor
```

---

## 🎓 Next Steps

1. **Set up Sentry** (today):
   - Create account
   - Install SDK
   - Test error capture

2. **Configure alerts** (this week):
   - Set error rate thresholds
   - Add Slack integration
   - Test alert delivery

3. **Monitor in production** (ongoing):
   - Review errors daily
   - Track performance trends
   - Optimize slow transactions

---

## 📚 Related Documentation

- [MONITORING_SETUP.md](MONITORING_SETUP.md) - Custom metrics monitoring
- [SERVICE_GROWTH_ANALYSIS.md](SERVICE_GROWTH_ANALYSIS.md) - Which services to monitor closely
- [SCALABILITY_ANALYSIS.md](SCALABILITY_ANALYSIS.md) - Performance targets

---

**Sentry + Custom Monitoring = Complete Observability 🎯**
