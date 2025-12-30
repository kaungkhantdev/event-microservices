# Scheduled Jobs Documentation

## Overview

The **Worker Service** handles scheduled jobs using `node-cron`. All scheduled tasks run in the background and perform maintenance, notifications, and data synchronization.

## Architecture

```
Worker Service
      ↓
  node-cron scheduler
      ↓
  Scheduled jobs (cron expressions)
      ↓
  Execute tasks:
  - Send emails
  - Cleanup data
  - Sync Elasticsearch
  - Update statuses
  - Generate reports
```

## Where Scheduled Jobs Live

```
worker/
├── jobs/
│   └── scheduledJobs.js     ← All scheduled job definitions
├── index.js                  ← Initializes schedulers on startup
└── package.json              ← Includes node-cron dependency
```

## Implemented Scheduled Jobs

### 1. Send Event Reminders
**Schedule:** Daily at 9:00 AM
**Cron:** `0 9 * * *`

**Purpose:** Send reminder emails for events happening within 24 hours

**Logic:**
```javascript
// Find events starting tomorrow
const upcomingEvents = await Event.findAll({
  where: {
    startDate: { between: [tomorrow, dayAfterTomorrow] },
    status: 'published'
  }
});

// Queue reminder emails
for (const event of upcomingEvents) {
  await mailQueue.add('reminder', { ... });
}
```

**Use Case:** Attendees get reminder 24 hours before event starts

---

### 2. Cleanup Old Events
**Schedule:** Daily at 2:00 AM
**Cron:** `0 2 * * *`

**Purpose:** Delete completed events older than 6 months

**Logic:**
```javascript
const sixMonthsAgo = new Date();
sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

await Event.destroy({
  where: {
    endDate: { lt: sixMonthsAgo },
    status: 'completed'
  }
});
```

**Use Case:** Keep database clean, reduce storage costs

---

### 3. Full Elasticsearch Sync
**Schedule:** Daily at 3:00 AM
**Cron:** `0 3 * * *`

**Purpose:** Perform full re-index of all events to Elasticsearch

**Logic:**
```javascript
const allEvents = await Event.findAll();

// Bulk index to Elasticsearch
await esClient.bulk({
  operations: [...eventsData]
});
```

**Use Case:**
- Recover from any sync failures
- Ensure data consistency
- Apply mapping changes

---

### 4. Update Event Statuses
**Schedule:** Every 30 minutes
**Cron:** `*/30 * * * *`

**Purpose:** Automatically mark events as "completed" after end date

**Logic:**
```javascript
await Event.update(
  { status: 'completed' },
  {
    where: {
      endDate: { lt: new Date() },
      status: { ne: 'completed' }
    }
  }
);
```

**Use Case:** Automatic status management without manual intervention

---

### 5. Generate Daily Report
**Schedule:** Daily at 8:00 AM
**Cron:** `0 8 * * *`

**Purpose:** Generate and email daily statistics

**Logic:**
```javascript
const stats = {
  totalEvents: await Event.count(),
  publishedEvents: await Event.count({ where: { status: 'published' } }),
  upcomingEvents: ...,
  todayEvents: ...
};

// Send report via email
await mailQueue.add('registration', { stats });
```

**Use Case:** Daily overview for administrators

---

## Cron Expression Syntax

```
 ┌────────────── second (optional, 0-59)
 │ ┌──────────── minute (0-59)
 │ │ ┌────────── hour (0-23)
 │ │ │ ┌──────── day of month (1-31)
 │ │ │ │ ┌────── month (1-12 or names)
 │ │ │ │ │ ┌──── day of week (0-7 or names, 0 and 7 = Sunday)
 │ │ │ │ │ │
 * * * * * *
```

### Common Examples

| Expression | Description |
|------------|-------------|
| `0 9 * * *` | Every day at 9:00 AM |
| `0 */6 * * *` | Every 6 hours |
| `*/30 * * * *` | Every 30 minutes |
| `0 0 * * 0` | Every Sunday at midnight |
| `0 2 1 * *` | First day of month at 2:00 AM |
| `0 8-18 * * 1-5` | Every hour 8AM-6PM, Monday-Friday |

## How to Add a New Scheduled Job

### Step 1: Define the Job Function

Add to `worker/jobs/scheduledJobs.js`:

```javascript
const myCustomJob = async () => {
  try {
    console.log('🔧 Running scheduled job: My Custom Job');

    // Your job logic here
    const result = await Event.findAll({ ... });

    // Process results
    // ...

    console.log('✓ My custom job completed');
  } catch (error) {
    console.error('✗ Error in myCustomJob:', error);
  }
};
```

### Step 2: Schedule the Job

In the `initializeScheduledJobs()` function:

```javascript
const initializeScheduledJobs = () => {
  // ... existing jobs ...

  // Add your new scheduled job
  cron.schedule('0 12 * * *', () => {
    myCustomJob();
  });
  console.log('✓ Scheduled: My custom job daily at noon');
};
```

### Step 3: Export the Function

```javascript
module.exports = {
  initializeScheduledJobs,
  // ... existing exports ...
  myCustomJob
};
```

### Step 4: Test Manually

You can test jobs without waiting for schedule:

```javascript
// In worker/index.js or via Node REPL
const { myCustomJob } = require('./jobs/scheduledJobs');
await myCustomJob();
```

## Real-World Use Cases

### 1. Send Weekly Newsletter
```javascript
// Every Monday at 10 AM
cron.schedule('0 10 * * 1', async () => {
  const upcomingEvents = await Event.findAll({
    where: {
      startDate: { gte: new Date(), lte: nextWeek },
      status: 'published'
    }
  });

  // Send newsletter email with upcoming events
});
```

### 2. Auto-Publish Scheduled Events
```javascript
// Every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  await Event.update(
    { status: 'published' },
    {
      where: {
        status: 'scheduled',
        publishDate: { lte: new Date() }
      }
    }
  );
});
```

### 3. Backup Database
```javascript
// Every day at 1 AM
cron.schedule('0 1 * * *', async () => {
  const { exec } = require('child_process');
  exec('pg_dump event_management > backup.sql');
});
```

### 4. Send Birthday Emails
```javascript
// Every day at 8 AM
cron.schedule('0 8 * * *', async () => {
  const today = new Date();
  const users = await User.findAll({
    where: {
      birthMonth: today.getMonth() + 1,
      birthDay: today.getDate()
    }
  });

  for (const user of users) {
    await mailQueue.add('birthday', { userId: user.id });
  }
});
```

### 5. Generate Monthly Analytics
```javascript
// First day of month at midnight
cron.schedule('0 0 1 * *', async () => {
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const analytics = {
    eventsCreated: await Event.count({
      where: { createdAt: { gte: lastMonth } }
    }),
    // ... more analytics
  };

  // Save to analytics table or send report
});
```

## Testing Scheduled Jobs

### 1. Test Immediately
```javascript
// worker/index.js
const { sendEventReminders } = require('./jobs/scheduledJobs');

// Test job immediately
await sendEventReminders();
```

### 2. Test with Mock Schedule
```javascript
// Use shorter intervals for testing
if (process.env.NODE_ENV === 'development') {
  // Run every minute instead of daily
  cron.schedule('* * * * *', () => {
    sendEventReminders();
  });
}
```

### 3. Manual Trigger via API
```javascript
// Add a test endpoint in API service (dev only!)
if (process.env.NODE_ENV === 'development') {
  app.post('/api/test/trigger-job/:jobName', async (req, res) => {
    const { jobName } = req.params;
    const jobs = require('./jobs/scheduledJobs');

    if (jobs[jobName]) {
      await jobs[jobName]();
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Job not found' });
    }
  });
}
```

## Monitoring Scheduled Jobs

### 1. Check Logs
```bash
# View worker logs
docker-compose logs -f worker

# Filter for scheduled job logs
docker-compose logs worker | grep "Running scheduled job"
```

### 2. Add Logging
```javascript
const myJob = async () => {
  const startTime = Date.now();
  console.log(`⏰ [${new Date().toISOString()}] Starting myJob`);

  try {
    // Job logic
    const duration = Date.now() - startTime;
    console.log(`✓ myJob completed in ${duration}ms`);
  } catch (error) {
    console.error(`✗ myJob failed:`, error);
    // Optionally: send error notification
  }
};
```

### 3. Track Job Execution
```javascript
// Create a job_logs table
const JobLog = sequelize.define('JobLog', {
  jobName: DataTypes.STRING,
  status: DataTypes.ENUM('success', 'failure'),
  duration: DataTypes.INTEGER,
  errorMessage: DataTypes.TEXT
});

const myJob = async () => {
  const startTime = Date.now();
  let status = 'success';
  let errorMessage = null;

  try {
    // Job logic
  } catch (error) {
    status = 'failure';
    errorMessage = error.message;
  } finally {
    await JobLog.create({
      jobName: 'myJob',
      status,
      duration: Date.now() - startTime,
      errorMessage
    });
  }
};
```

## Best Practices

### 1. Idempotency
Jobs should be safe to run multiple times:

```javascript
// ❌ BAD: Not idempotent
const sendReminders = async () => {
  const events = await Event.findAll({ ... });
  for (const event of events) {
    await mailQueue.add('reminder', { eventId: event.id });
  }
};

// ✅ GOOD: Idempotent with tracking
const sendReminders = async () => {
  const events = await Event.findAll({
    where: {
      reminderSent: false,
      startDate: { ... }
    }
  });

  for (const event of events) {
    await mailQueue.add('reminder', { eventId: event.id });
    await event.update({ reminderSent: true });
  }
};
```

### 2. Error Handling
Always wrap jobs in try-catch:

```javascript
const myJob = async () => {
  try {
    // Job logic
  } catch (error) {
    console.error('Job failed:', error);
    // Don't throw - let other jobs continue
    // Optionally: send alert notification
  }
};
```

### 3. Performance
Limit query sizes and batch operations:

```javascript
// ✅ GOOD: Process in batches
const BATCH_SIZE = 100;
let offset = 0;

while (true) {
  const events = await Event.findAll({
    limit: BATCH_SIZE,
    offset
  });

  if (events.length === 0) break;

  // Process batch
  await processBatch(events);

  offset += BATCH_SIZE;
}
```

### 4. Timing
Choose appropriate schedules:

```javascript
// Heavy operations - off-peak hours
cron.schedule('0 2 * * *', cleanupOldData);      // 2 AM
cron.schedule('0 3 * * *', fullElasticsearchSync); // 3 AM

// User-facing - business hours
cron.schedule('0 9 * * *', sendDailyDigest);     // 9 AM
cron.schedule('0 12 * * *', sendLunchReminders); // Noon

// Frequent checks - every few minutes
cron.schedule('*/5 * * * *', checkPaymentStatus); // Every 5 min
```

## Timezone Considerations

By default, `node-cron` uses the server's timezone.

### Set Timezone
```javascript
cron.schedule('0 9 * * *', myJob, {
  timezone: "America/New_York"
});
```

### Common Timezones
- `America/New_York` (EST/EDT)
- `America/Los_Angeles` (PST/PDT)
- `America/Chicago` (CST/CDT)
- `Europe/London` (GMT/BST)
- `Asia/Tokyo` (JST)
- `UTC` (Universal Time)

## Disabling Scheduled Jobs

### Environment Variable
```javascript
if (process.env.ENABLE_SCHEDULED_JOBS !== 'false') {
  initializeScheduledJobs();
}
```

### Toggle Individual Jobs
```javascript
const ENABLED_JOBS = {
  sendReminders: process.env.JOB_SEND_REMINDERS !== 'false',
  cleanup: process.env.JOB_CLEANUP !== 'false',
};

if (ENABLED_JOBS.sendReminders) {
  cron.schedule('0 9 * * *', sendEventReminders);
}
```

## Summary

✅ **All scheduled jobs run in the Worker Service**
✅ **Uses node-cron for scheduling**
✅ **5 built-in jobs for common tasks**
✅ **Easy to add new jobs**
✅ **Follows best practices for production use**

## Quick Reference

| Job | Schedule | Purpose |
|-----|----------|---------|
| Send Reminders | Daily 9 AM | 24-hour event reminders |
| Cleanup Old Events | Daily 2 AM | Delete 6-month-old events |
| ES Full Sync | Daily 3 AM | Re-index all events |
| Update Statuses | Every 30 min | Mark past events completed |
| Daily Report | Daily 8 AM | Email statistics |
