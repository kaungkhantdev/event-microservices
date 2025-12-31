require('dotenv').config();
const express = require('express');
const RabbitMQWorker = require('./config/rabbitmq');
const {
  processNewEvent,
  processForgotPassword,
  processRegistration,
  processReminder,
  processPasswordResetConfirmation,
} = require('./processors/mailProcessor');

const app = express();
const HEALTH_PORT = process.env.HEALTH_PORT || 3005;

const bindings = [
  'user.registered',
  'user.password-reset',
  'order.completed',
  'payment.completed',
  'payment.failed',
  'event.reminder',
  'event.created',
];

const worker = new RabbitMQWorker('mail-service', bindings);

worker.registerHandler('event.created', async (data) => {
  console.log(`Processing event.created`);
  await processNewEvent({ data });
});

worker.registerHandler('user.password-reset', async (data) => {
  console.log(`🔥 Processing user.password-reset - Priority: 1 (HIGHEST)`);
  await processForgotPassword({ data });
});

worker.registerHandler('user.registered', async (data) => {
  console.log(`Processing user.registered`);
  await processRegistration({ data });
});

worker.registerHandler('event.reminder', async (data) => {
  console.log(`Processing event.reminder`);
  await processReminder({ data });
});

worker.registerHandler('payment.completed', async (data) => {
  console.log(`Processing payment.completed - sending receipt`);
  // Send payment receipt email
});

worker.registerHandler('payment.failed', async (data) => {
  console.log(`Processing payment.failed - sending failure notification`);
  // Send payment failure email
});

worker.registerHandler('order.completed', async (data) => {
  console.log(`Processing order.completed - sending confirmation`);
  // Send order confirmation email
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    res.status(200).json({
      status: 'healthy',
      service: 'mail-queue',
      timestamp: new Date().toISOString(),
      rabbitmq: worker.connection ? 'connected' : 'disconnected',
      queue: worker.QUEUE
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

worker.start();

console.log('✓ Mail service worker started');
console.log('✓ Listening for events:', bindings);

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing mail service...');
  server.close(() => {
    console.log('✓ HTTP server closed');
  });
  await worker.close();
  console.log('✓ RabbitMQ worker closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing mail service...');
  server.close(() => {
    console.log('✓ HTTP server closed');
  });
  await worker.close();
  console.log('✓ RabbitMQ worker closed');
  process.exit(0);
});
