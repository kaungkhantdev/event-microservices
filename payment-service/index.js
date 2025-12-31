require('dotenv').config();
const express = require('express');
const RabbitMQWorker = require('./config/rabbitmq');
const {
  processPayment,
  processRefund,
} = require('./processors/paymentProcessor');

const app = express();
const HEALTH_PORT = process.env.HEALTH_PORT || 3003;

const bindings = [
  'payment.created',
  'payment.completed',
  'payment.failed',
  'payment.refund',
  'order.created',
];

const worker = new RabbitMQWorker('payment-service', bindings);

worker.registerHandler('payment.created', async (data) => {
  console.log(`Processing payment.created`);
  await processPayment({ data });
});

worker.registerHandler('payment.refund', async (data) => {
  console.log(`Processing payment.refund`);
  await processRefund({ data });
});

worker.registerHandler('payment.completed', async (data) => {
  console.log(`Payment completed: ${data.paymentId}`);
});

worker.registerHandler('payment.failed', async (data) => {
  console.log(`Payment failed: ${data.paymentId}`);
});

worker.registerHandler('order.created', async (data) => {
  console.log(`Order created, initiating payment: ${data.orderId}`);
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    res.status(200).json({
      status: 'healthy',
      service: 'payment-service',
      timestamp: new Date().toISOString(),
      rabbitmq: worker.connection ? 'connected' : 'disconnected',
      queue: worker.QUEUE
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

worker.start();

console.log('✓ Payment service worker started');
console.log('✓ Listening for events:', bindings);

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing payment service...');
  server.close(() => {
    console.log('✓ HTTP server closed');
  });
  await worker.close();
  console.log('✓ RabbitMQ worker closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing payment service...');
  server.close(() => {
    console.log('✓ HTTP server closed');
  });
  await worker.close();
  console.log('✓ RabbitMQ worker closed');
  process.exit(0);
});
