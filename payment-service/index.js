require('dotenv').config();
const express = require('express');
const Queue = require('bull');
const {
  processPayment,
  processRefund,
} = require('./processors/paymentProcessor');

const app = express();
const HEALTH_PORT = process.env.HEALTH_PORT || 3003;

const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT,
    password: process.env.REDIS_PASSWORD || undefined,
  }
};

const paymentQueue = new Queue('payment', redisConfig);

paymentQueue.process('process-payment', 3, async (job) => {
  console.log(`Processing process-payment job: ${job.id}`);
  return await processPayment(job);
});

paymentQueue.process('process-refund', 2, async (job) => {
  console.log(`Processing process-refund job: ${job.id}`);
  return await processRefund(job);
});

paymentQueue.on('completed', (job, result) => {
  console.log(`✓ Job ${job.id} completed successfully:`, result);
});

paymentQueue.on('failed', (job, err) => {
  console.error(`✗ Job ${job.id} failed:`, err.message);
});

paymentQueue.on('error', (error) => {
  console.error('✗ Queue error:', error);
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const queueHealth = await paymentQueue.client.ping();
    const jobCounts = await paymentQueue.getJobCounts();

    res.status(200).json({
      status: 'healthy',
      service: 'payment-service',
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
      service: 'payment-service',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

const server = app.listen(HEALTH_PORT, () => {
  console.log(`✓ Health check endpoint running on port ${HEALTH_PORT}`);
});

console.log('✓ Payment queue worker started');
console.log('✓ Listening for jobs: process-payment, process-refund');

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing payment service...');
  server.close(() => {
    console.log('✓ HTTP server closed');
  });
  await paymentQueue.close();
  console.log('✓ Payment queue closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing payment service...');
  server.close(() => {
    console.log('✓ HTTP server closed');
  });
  await paymentQueue.close();
  console.log('✓ Payment queue closed');
  process.exit(0);
});
