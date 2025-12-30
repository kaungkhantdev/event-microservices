require('dotenv').config();
const express = require('express');
const Queue = require('bull');
const {
  processNewEvent,
  processForgotPassword,
  processRegistration,
  processReminder,
  processPasswordResetConfirmation,
} = require('./processors/mailProcessor');

const app = express();
const HEALTH_PORT = process.env.HEALTH_PORT || 3005;

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
  }
};

const mailQueue = new Queue('mail', redisConfig);

mailQueue.process('new-event', 5, async (job) => {
  console.log(`Processing new-event job: ${job.id}`);
  return await processNewEvent(job);
});

mailQueue.process('forgot-password', 10, async (job) => {
  console.log(`🔥 Processing forgot-password job: ${job.id} - Priority: 1 (HIGHEST)`);
  return await processForgotPassword(job);
});

mailQueue.process('registration', 5, async (job) => {
  console.log(`Processing registration job: ${job.id}`);
  return await processRegistration(job);
});

mailQueue.process('reminder', 5, async (job) => {
  console.log(`Processing reminder job: ${job.id}`);
  return await processReminder(job);
});

mailQueue.process('password-reset-confirmation', 5, async (job) => {
  console.log(`Processing password-reset-confirmation job: ${job.id} - Priority: 2`);
  return await processPasswordResetConfirmation(job);
});

mailQueue.on('completed', (job, result) => {
  console.log(`✓ Job ${job.id} completed successfully:`, result);
});

mailQueue.on('failed', (job, err) => {
  console.error(`✗ Job ${job.id} failed:`, err.message);
});

mailQueue.on('error', (error) => {
  console.error('✗ Queue error:', error);
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const queueHealth = await mailQueue.client.ping();
    const jobCounts = await mailQueue.getJobCounts();

    res.status(200).json({
      status: 'healthy',
      service: 'mail-queue',
      timestamp: new Date().toISOString(),
      redis: queueHealth === 'PONG' ? 'connected' : 'disconnected',
      queue: {
        waiting: jobCounts.waiting,
        active: jobCounts.active,
        completed: jobCounts.completed,
        failed: jobCounts.failed,
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'mail-queue',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

const server = app.listen(HEALTH_PORT, () => {
  console.log(`✓ Health check endpoint running on port ${HEALTH_PORT}`);
});

console.log('✓ Mail queue worker started');
console.log('✓ Listening for jobs with priorities:');
console.log('  - forgot-password (Priority: 1 - HIGHEST)');
console.log('  - password-reset-confirmation (Priority: 2 - HIGH)');
console.log('  - registration (Priority: 3 - MEDIUM)');
console.log('  - new-event (Priority: 5 - NORMAL)');
console.log('  - reminder (Priority: 5 - NORMAL)');

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing mail service...');
  server.close(() => {
    console.log('✓ HTTP server closed');
  });
  await mailQueue.close();
  console.log('✓ Mail queue closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing mail service...');
  server.close(() => {
    console.log('✓ HTTP server closed');
  });
  await mailQueue.close();
  console.log('✓ Mail queue closed');
  process.exit(0);
});
