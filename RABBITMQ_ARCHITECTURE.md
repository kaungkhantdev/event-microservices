# RabbitMQ Architecture for Payment & Worker Services

## Overview

This document outlines a production-ready RabbitMQ architecture designed for **future scale** with payment processing and async worker services. Built for growth from day one.

## Why RabbitMQ for Future Scale?

### Current Scale Preparation
- **Day 1-6 months:** 1K-10K messages/day
- **6-12 months:** 10K-100K messages/day
- **Year 2+:** 100K-1M messages/day

### Key Benefits
✅ **Message Durability:** Payments never lost, even on crashes
✅ **Fan-out Pattern:** One event → Multiple services
✅ **Complex Routing:** Topic-based routing for microservices
✅ **Better Guarantees:** Publisher confirms + consumer acknowledgments
✅ **Scalability:** Handles 50K-200K msg/sec per node
✅ **Multi-language Support:** Easy to add Python/Go services later

---

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
│  (Keep Redis for caching - RabbitMQ only for messaging)          │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Service (Express)                       │
│  - Event CRUD operations                                         │
│  - Publish events to RabbitMQ                                    │
│  - Publisher confirms enabled                                    │
└─────┬───────────────────────────────────┬───────────────────────┘
      │                                   │
      ▼                                   ▼
┌─────────────────┐              ┌──────────────────────────────────┐
│   PostgreSQL    │              │         RabbitMQ Cluster         │
│   - Events      │              │                                  │
│   - Users       │              │  ┌────────────────────────────┐  │
│   - Orders      │              │  │   Exchange: 'events.topic'  │  │
│   - Payments    │              │  │   Type: Topic               │  │
└─────────────────┘              │  └──────────┬─────────────────┘  │
                                 │             │                     │
                                 │   ┌─────────┴──────────────────┐ │
                                 │   │  Routing Keys:             │ │
                                 │   │  - payment.created         │ │
                                 │   │  - payment.completed       │ │
                                 │   │  - payment.failed          │ │
                                 │   │  - order.created           │ │
                                 │   │  - order.completed         │ │
                                 │   │  - user.registered         │ │
                                 │   │  - event.created           │ │
                                 │   └────────────────────────────┘ │
                                 │                                  │
                                 │  ┌────────────────────────────┐  │
                                 │  │  Queue: payment-service    │  │
                                 │  │  Bindings: payment.*       │  │
                                 │  │  Priority: 1-10            │  │
                                 │  │  Durable: true             │  │
                                 │  ├────────────────────────────┤  │
                                 │  │  Queue: mail-service       │  │
                                 │  │  Bindings: user.*,         │  │
                                 │  │            order.*,        │  │
                                 │  │            payment.*       │  │
                                 │  ├────────────────────────────┤  │
                                 │  │  Queue: search-service     │  │
                                 │  │  Bindings: event.*,        │  │
                                 │  │            order.*         │  │
                                 │  ├────────────────────────────┤  │
                                 │  │  Queue: analytics-service  │  │
                                 │  │  Bindings: #  (all)        │  │
                                 │  ├────────────────────────────┤  │
                                 │  │  Queue: notification       │  │
                                 │  │  Bindings: payment.*,      │  │
                                 │  │            order.*         │  │
                                 │  └────────────────────────────┘  │
                                 └───┬──────────────────────────────┘
                                     │
        ┌────────────────────────────┼────────────────┬──────────────┐
        │                            │                │              │
        ▼                            ▼                ▼              ▼
┌───────────────┐          ┌──────────────────┐ ┌──────────┐ ┌──────────┐
│ Payment       │          │ Mail             │ │ Search   │ │Analytics │
│ Worker        │          │ Worker           │ │ Worker   │ │ Worker   │
│ ┌───────────┐ │          │ ┌──────────────┐ │ │          │ │          │
│ │ Process   │ │          │ │ Send emails  │ │ │ Sync to  │ │ Track    │
│ │ payments  │ │          │ │ - Welcome    │ │ │ ES       │ │ events   │
│ │           │ │          │ │ - Receipt    │ │ │          │ │          │
│ │ Retry: 5x │ │          │ │ - Reminder   │ │ │ Index    │ │ Store    │
│ │ Backoff   │ │          │ │              │ │ │ update   │ │ metrics  │
│ │ DLQ: Yes  │ │          │ │ Retry: 3x    │ │ │          │ │          │
│ └───────────┘ │          │ └──────────────┘ │ └──────────┘ └──────────┘
└───────┬───────┘          └────────┬─────────┘      │             │
        │                           │                │             │
        ▼                           ▼                ▼             ▼
┌───────────────┐          ┌──────────────────┐ ┌──────────┐ ┌──────────┐
│ Payment       │          │ SMTP Server      │ │Elastic-  │ │ MongoDB  │
│ Gateway       │          │ (Nodemailer)     │ │ search   │ │ (Analytics)
│ (Stripe)      │          └──────────────────┘ └──────────┘ └──────────┘
└───────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                  Dead Letter Exchange (DLX)                       │
│  Failed messages after max retries → DLQ for manual inspection   │
└──────────────────────────────────────────────────────────────────┘
```

---

## RabbitMQ Exchange & Queue Design

### Exchange Configuration

```javascript
// Topic Exchange for flexible routing
const EXCHANGE = {
  name: 'events.topic',
  type: 'topic',
  options: {
    durable: true,      // Survives broker restart
    autoDelete: false,
    internal: false,
  }
};

// Dead Letter Exchange for failed messages
const DLX = {
  name: 'events.dlx',
  type: 'topic',
  options: {
    durable: true,
    autoDelete: false,
  }
};
```

### Queue Configuration

```javascript
// Payment Queue - Highest Priority
const PAYMENT_QUEUE = {
  name: 'payment-service',
  options: {
    durable: true,           // Persist to disk
    exclusive: false,        // Multiple consumers allowed
    autoDelete: false,
    maxPriority: 10,         // Enable priority 1-10
    deadLetterExchange: 'events.dlx',
    deadLetterRoutingKey: 'payment.failed',
    messageTtl: 86400000,    // 24 hours
  },
  bindings: [
    'payment.created',
    'payment.completed',
    'payment.failed',
    'order.created',          // Payments triggered by orders
  ]
};

// Mail Queue
const MAIL_QUEUE = {
  name: 'mail-service',
  options: {
    durable: true,
    maxPriority: 10,
    deadLetterExchange: 'events.dlx',
    messageTtl: 86400000,
  },
  bindings: [
    'user.registered',
    'user.password-reset',
    'order.completed',
    'payment.completed',
    'event.reminder',
  ]
};

// Search/Elasticsearch Queue
const SEARCH_QUEUE = {
  name: 'search-service',
  options: {
    durable: true,
    deadLetterExchange: 'events.dlx',
  },
  bindings: [
    'event.created',
    'event.updated',
    'event.deleted',
    'order.created',
  ]
};

// Analytics Queue (receives ALL events)
const ANALYTICS_QUEUE = {
  name: 'analytics-service',
  options: {
    durable: true,
    deadLetterExchange: 'events.dlx',
  },
  bindings: [
    '#',  // Wildcard - receives everything
  ]
};

// Notification Queue
const NOTIFICATION_QUEUE = {
  name: 'notification-service',
  options: {
    durable: true,
    deadLetterExchange: 'events.dlx',
  },
  bindings: [
    'payment.completed',
    'payment.failed',
    'order.completed',
    'event.reminder',
  ]
};
```

---

## Routing Key Patterns

### Naming Convention
```
{entity}.{action}.{detail?}

Examples:
- payment.created
- payment.completed
- payment.failed
- order.created
- order.completed
- order.cancelled
- user.registered
- user.verified
- event.created
- event.updated
- event.reminder
```

### Topic Binding Patterns
```javascript
// Exact match
'payment.created'          → Only payment.created

// Single word wildcard
'payment.*'                → payment.created, payment.completed, payment.failed

// Multi-word wildcard
'#'                        → ALL messages
'payment.#'                → payment.created, payment.completed.stripe, etc
```

---

## Implementation Examples

### 1. Payment Service Setup

#### RabbitMQ Publisher (API Service)

```javascript
// payment-service/config/rabbitmq.js
const amqp = require('amqplib');

class RabbitMQPublisher {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.EXCHANGE = 'events.topic';
  }

  async connect() {
    try {
      // Connection with retry
      this.connection = await amqp.connect({
        hostname: process.env.RABBITMQ_HOST || 'localhost',
        port: process.env.RABBITMQ_PORT || 5672,
        username: process.env.RABBITMQ_USER || 'guest',
        password: process.env.RABBITMQ_PASS || 'guest',
        heartbeat: 60,
      });

      this.channel = await this.connection.createChannel();

      // Create exchange
      await this.channel.assertExchange(this.EXCHANGE, 'topic', {
        durable: true,
      });

      // Create DLX
      await this.channel.assertExchange('events.dlx', 'topic', {
        durable: true,
      });

      // Enable publisher confirms
      await this.channel.confirmChannel();

      console.log('✅ Connected to RabbitMQ');

      // Handle connection errors
      this.connection.on('error', (err) => {
        console.error('❌ RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        console.log('⚠️  RabbitMQ connection closed, reconnecting...');
        setTimeout(() => this.connect(), 5000);
      });

    } catch (error) {
      console.error('❌ Failed to connect to RabbitMQ:', error);
      setTimeout(() => this.connect(), 5000);
    }
  }

  async publish(routingKey, message, options = {}) {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const msgBuffer = Buffer.from(JSON.stringify({
      ...message,
      timestamp: Date.now(),
      messageId: this.generateMessageId(),
    }));

    try {
      // Publish with confirm
      await this.channel.publish(
        this.EXCHANGE,
        routingKey,
        msgBuffer,
        {
          persistent: true,           // Persist to disk
          contentType: 'application/json',
          priority: options.priority || 5,
          messageId: message.messageId,
          timestamp: Date.now(),
          ...options,
        }
      );

      console.log(`✅ Published: ${routingKey}`);
      return true;

    } catch (error) {
      console.error(`❌ Failed to publish ${routingKey}:`, error);
      throw error;
    }
  }

  generateMessageId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async close() {
    await this.channel?.close();
    await this.connection?.close();
  }
}

module.exports = new RabbitMQPublisher();
```

#### Payment Controller with RabbitMQ

```javascript
// payment-service/controllers/paymentController.js
const Payment = require('../models/Payment');
const rabbitmq = require('../config/rabbitmq');
const stripe = require('../config/stripe');

class PaymentController {

  // Create payment and publish event
  async createPayment(req, res) {
    const { orderId, amount, userId, paymentMethod } = req.body;

    try {
      // 1. Create payment record in DB (status: pending)
      const payment = await Payment.create({
        orderId,
        userId,
        amount,
        status: 'pending',
        paymentMethod,
      });

      // 2. Publish to RabbitMQ (async processing)
      await rabbitmq.publish('payment.created', {
        paymentId: payment.id,
        orderId,
        userId,
        amount,
        paymentMethod,
      }, {
        priority: 10,  // Highest priority
      });

      // 3. Return immediately (don't wait for payment processing)
      return res.status(201).json({
        success: true,
        data: {
          paymentId: payment.id,
          status: 'pending',
          message: 'Payment is being processed',
        }
      });

    } catch (error) {
      console.error('Payment creation failed:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Webhook from Stripe
  async handleStripeWebhook(req, res) {
    const event = req.body;

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await rabbitmq.publish('payment.completed', {
            paymentId: event.data.object.metadata.paymentId,
            transactionId: event.data.object.id,
            amount: event.data.object.amount / 100,
          }, { priority: 9 });
          break;

        case 'payment_intent.failed':
          await rabbitmq.publish('payment.failed', {
            paymentId: event.data.object.metadata.paymentId,
            error: event.data.object.last_payment_error?.message,
          }, { priority: 10 });
          break;
      }

      res.json({ received: true });

    } catch (error) {
      console.error('Webhook processing failed:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new PaymentController();
```

### 2. Payment Worker Service

```javascript
// payment-service/workers/paymentWorker.js
const amqp = require('amqplib');
const Payment = require('../models/Payment');
const stripe = require('../config/stripe');
const rabbitmq = require('../config/rabbitmq');

class PaymentWorker {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.QUEUE = 'payment-service';
    this.EXCHANGE = 'events.topic';
  }

  async start() {
    try {
      // Connect to RabbitMQ
      this.connection = await amqp.connect({
        hostname: process.env.RABBITMQ_HOST || 'localhost',
        port: process.env.RABBITMQ_PORT || 5672,
        username: process.env.RABBITMQ_USER || 'guest',
        password: process.env.RABBITMQ_PASS || 'guest',
        heartbeat: 60,
      });

      this.channel = await this.connection.createChannel();

      // Set prefetch (only process 1 message at a time)
      await this.channel.prefetch(1);

      // Assert exchange
      await this.channel.assertExchange(this.EXCHANGE, 'topic', {
        durable: true,
      });

      // Assert queue
      await this.channel.assertQueue(this.QUEUE, {
        durable: true,
        maxPriority: 10,
        deadLetterExchange: 'events.dlx',
        deadLetterRoutingKey: 'payment.failed',
        messageTtl: 86400000, // 24 hours
      });

      // Bind queue to routing keys
      await this.channel.bindQueue(this.QUEUE, this.EXCHANGE, 'payment.created');
      await this.channel.bindQueue(this.QUEUE, this.EXCHANGE, 'payment.completed');
      await this.channel.bindQueue(this.QUEUE, this.EXCHANGE, 'payment.failed');
      await this.channel.bindQueue(this.QUEUE, this.EXCHANGE, 'order.created');

      console.log(`✅ Payment Worker listening on queue: ${this.QUEUE}`);

      // Start consuming
      await this.channel.consume(this.QUEUE, this.handleMessage.bind(this), {
        noAck: false,  // Manual acknowledgment
      });

    } catch (error) {
      console.error('❌ Payment Worker failed to start:', error);
      setTimeout(() => this.start(), 5000);
    }
  }

  async handleMessage(msg) {
    if (!msg) return;

    const routingKey = msg.fields.routingKey;
    const content = JSON.parse(msg.content.toString());

    console.log(`📨 Processing: ${routingKey}`, content);

    try {
      // Route to appropriate handler
      switch (routingKey) {
        case 'payment.created':
          await this.processPayment(content);
          break;

        case 'payment.completed':
          await this.handlePaymentCompleted(content);
          break;

        case 'payment.failed':
          await this.handlePaymentFailed(content);
          break;

        case 'order.created':
          await this.initiatePaymentForOrder(content);
          break;
      }

      // Acknowledge message (success)
      this.channel.ack(msg);
      console.log(`✅ Processed: ${routingKey}`);

    } catch (error) {
      console.error(`❌ Error processing ${routingKey}:`, error);

      // Retry logic
      const retryCount = msg.properties.headers?.['x-retry-count'] || 0;

      if (retryCount < 5) {
        // Requeue with incremented retry count
        setTimeout(() => {
          this.channel.nack(msg, false, true); // Requeue
        }, Math.pow(2, retryCount) * 1000); // Exponential backoff

      } else {
        // Max retries reached - send to DLX
        this.channel.nack(msg, false, false); // Don't requeue (goes to DLX)
        console.error(`❌ Max retries reached for ${routingKey}, sent to DLQ`);
      }
    }
  }

  // Process payment with Stripe
  async processPayment(data) {
    const { paymentId, amount, paymentMethod } = data;

    try {
      // 1. Create Stripe payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100, // Convert to cents
        currency: 'usd',
        payment_method: paymentMethod,
        confirm: true,
        metadata: { paymentId },
      });

      // 2. Update payment in database
      await Payment.update(paymentId, {
        status: 'processing',
        stripePaymentIntentId: paymentIntent.id,
      });

      // 3. Publish completion event
      if (paymentIntent.status === 'succeeded') {
        await rabbitmq.publish('payment.completed', {
          paymentId,
          transactionId: paymentIntent.id,
          amount,
        }, { priority: 9 });
      }

    } catch (error) {
      // Publish failure event
      await rabbitmq.publish('payment.failed', {
        paymentId,
        error: error.message,
      }, { priority: 10 });

      throw error;
    }
  }

  // Handle successful payment
  async handlePaymentCompleted(data) {
    const { paymentId, transactionId, amount } = data;

    // Update payment status
    await Payment.update(paymentId, {
      status: 'completed',
      transactionId,
      completedAt: new Date(),
    });

    // Publish order completion
    const payment = await Payment.findById(paymentId);
    await rabbitmq.publish('order.completed', {
      orderId: payment.orderId,
      paymentId,
      amount,
    }, { priority: 8 });

    console.log(`✅ Payment completed: ${paymentId}`);
  }

  // Handle failed payment
  async handlePaymentFailed(data) {
    const { paymentId, error } = data;

    await Payment.update(paymentId, {
      status: 'failed',
      error,
      failedAt: new Date(),
    });

    console.log(`❌ Payment failed: ${paymentId}`, error);
  }

  // Initiate payment for new order
  async initiatePaymentForOrder(data) {
    const { orderId, amount, userId, paymentMethod } = data;

    // Publish payment.created event
    await rabbitmq.publish('payment.created', {
      orderId,
      amount,
      userId,
      paymentMethod,
    }, { priority: 10 });
  }
}

// Start worker
const worker = new PaymentWorker();
worker.start();

module.exports = worker;
```

### 3. Mail Worker Service

```javascript
// mail-service/workers/mailWorker.js
const amqp = require('amqplib');
const nodemailer = require('nodemailer');

class MailWorker {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.QUEUE = 'mail-service';
    this.EXCHANGE = 'events.topic';
    this.mailer = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async start() {
    try {
      this.connection = await amqp.connect({
        hostname: process.env.RABBITMQ_HOST || 'localhost',
        port: process.env.RABBITMQ_PORT || 5672,
      });

      this.channel = await this.connection.createChannel();
      await this.channel.prefetch(5); // Process 5 emails concurrently

      await this.channel.assertExchange(this.EXCHANGE, 'topic', {
        durable: true,
      });

      await this.channel.assertQueue(this.QUEUE, {
        durable: true,
        maxPriority: 10,
        deadLetterExchange: 'events.dlx',
      });

      // Bind to multiple routing keys
      const bindings = [
        'user.registered',
        'user.password-reset',
        'order.completed',
        'payment.completed',
        'payment.failed',
        'event.reminder',
      ];

      for (const routingKey of bindings) {
        await this.channel.bindQueue(this.QUEUE, this.EXCHANGE, routingKey);
      }

      console.log(`✅ Mail Worker listening on queue: ${this.QUEUE}`);

      await this.channel.consume(this.QUEUE, this.handleMessage.bind(this), {
        noAck: false,
      });

    } catch (error) {
      console.error('❌ Mail Worker failed to start:', error);
      setTimeout(() => this.start(), 5000);
    }
  }

  async handleMessage(msg) {
    if (!msg) return;

    const routingKey = msg.fields.routingKey;
    const content = JSON.parse(msg.content.toString());

    try {
      switch (routingKey) {
        case 'user.registered':
          await this.sendWelcomeEmail(content);
          break;

        case 'payment.completed':
          await this.sendPaymentReceipt(content);
          break;

        case 'payment.failed':
          await this.sendPaymentFailedEmail(content);
          break;

        case 'event.reminder':
          await this.sendEventReminder(content);
          break;
      }

      this.channel.ack(msg);
      console.log(`✅ Email sent for: ${routingKey}`);

    } catch (error) {
      console.error(`❌ Error sending email for ${routingKey}:`, error);

      const retryCount = msg.properties.headers?.['x-retry-count'] || 0;
      if (retryCount < 3) {
        setTimeout(() => this.channel.nack(msg, false, true), 5000);
      } else {
        this.channel.nack(msg, false, false);
      }
    }
  }

  async sendWelcomeEmail(data) {
    const { email, name } = data;

    await this.mailer.sendMail({
      from: 'noreply@example.com',
      to: email,
      subject: 'Welcome!',
      html: `<h1>Welcome ${name}!</h1>`,
    });
  }

  async sendPaymentReceipt(data) {
    const { email, amount, orderId } = data;

    await this.mailer.sendMail({
      from: 'payments@example.com',
      to: email,
      subject: `Payment Receipt - Order #${orderId}`,
      html: `<p>Your payment of $${amount} was successful.</p>`,
    });
  }

  async sendPaymentFailedEmail(data) {
    const { email, error } = data;

    await this.mailer.sendMail({
      from: 'payments@example.com',
      to: email,
      subject: 'Payment Failed',
      html: `<p>Your payment failed: ${error}</p>`,
    });
  }

  async sendEventReminder(data) {
    const { email, eventTitle, eventDate } = data;

    await this.mailer.sendMail({
      from: 'events@example.com',
      to: email,
      subject: `Reminder: ${eventTitle}`,
      html: `<p>Your event "${eventTitle}" is tomorrow at ${eventDate}.</p>`,
    });
  }
}

const worker = new MailWorker();
worker.start();

module.exports = worker;
```

---

## Message Flow Examples

### Example 1: Order → Payment → Email Flow

```
1. User places order
   └→ API publishes: order.created

2. Payment Worker receives order.created
   └→ Publishes: payment.created

3. Payment Worker processes payment
   └→ Publishes: payment.completed

4. Multiple consumers receive payment.completed:
   ├→ Mail Worker: Sends receipt email
   ├→ Notification Worker: Sends push notification
   └→ Analytics Worker: Tracks conversion

5. Payment Worker publishes: order.completed
   └→ Fulfillment Worker starts shipping process
```

### Example 2: User Registration Flow

```
1. User registers
   └→ API publishes: user.registered

2. Multiple consumers receive user.registered:
   ├→ Mail Worker: Sends welcome email
   ├→ Search Worker: Indexes user profile
   └→ Analytics Worker: Tracks new user
```

---

## Monitoring & Metrics

### Key Metrics to Track

```javascript
// Queue depth
const queueDepth = await channel.checkQueue('payment-service');
console.log('Messages waiting:', queueDepth.messageCount);

// Consumer count
console.log('Consumers:', queueDepth.consumerCount);

// Alert if queue depth > 1000
if (queueDepth.messageCount > 1000) {
  alertOps('Payment queue depth critical!');
}
```

### RabbitMQ Management UI

```bash
# Access at: http://localhost:15672
# Default credentials: guest/guest

# Shows:
- Queue depths
- Message rates
- Consumer counts
- Connection status
- Memory usage
```

---

## Scaling Strategy

### Horizontal Scaling

```yaml
# docker-compose.yml
services:
  payment-worker:
    build: ./payment-service
    environment:
      - RABBITMQ_HOST=rabbitmq
    deploy:
      replicas: 3  # 3 instances processing payments

  mail-worker:
    build: ./mail-service
    deploy:
      replicas: 5  # 5 instances sending emails
```

### RabbitMQ Cluster (High Availability)

```yaml
rabbitmq1:
  image: rabbitmq:3-management
  hostname: rabbitmq1
  environment:
    - RABBITMQ_ERLANG_COOKIE=secret_cookie

rabbitmq2:
  image: rabbitmq:3-management
  hostname: rabbitmq2
  environment:
    - RABBITMQ_ERLANG_COOKIE=secret_cookie
  depends_on:
    - rabbitmq1

rabbitmq3:
  image: rabbitmq:3-management
  hostname: rabbitmq3
  environment:
    - RABBITMQ_ERLANG_COOKIE=secret_cookie
  depends_on:
    - rabbitmq1
```

---

## Production Checklist

- [ ] RabbitMQ cluster setup (3+ nodes)
- [ ] Publisher confirms enabled
- [ ] Consumer acknowledgments implemented
- [ ] Dead letter queues configured
- [ ] Message TTL configured
- [ ] Queue limits set (max-length)
- [ ] TLS/SSL enabled
- [ ] Authentication configured
- [ ] Monitoring setup (Prometheus + Grafana)
- [ ] Alerts configured (queue depth, failures)
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker for external services
- [ ] Logging & tracing (correlation IDs)
- [ ] Backup & disaster recovery plan

---

## Migration Path from Bull to RabbitMQ

### Phase 1: Dual Write (Week 1-2)
```javascript
// Publish to both Bull and RabbitMQ
await bullQueue.add('payment', data);
await rabbitmq.publish('payment.created', data);

// Only process from Bull (existing workers)
// RabbitMQ just collecting data
```

### Phase 2: Parallel Processing (Week 3-4)
```javascript
// Both systems processing
// Compare results for consistency
// Fix any discrepancies
```

### Phase 3: Switch to RabbitMQ (Week 5)
```javascript
// Stop Bull workers
// Only use RabbitMQ
await rabbitmq.publish('payment.created', data);
```

### Phase 4: Remove Bull (Week 6)
```javascript
// Remove Bull code
// Only RabbitMQ remains
```

---

## Cost Estimate

### Development
- RabbitMQ (Docker): **$0**
- Learning/setup time: **1-2 weeks**

### Production (Year 1: 100K messages/day)
- **CloudAMQP (Lemur):** $99/month
- **OR AWS MQ:** $80-150/month
- **OR Self-hosted (EC2):** $50/month + ops time

### Production (Year 2+: 1M messages/day)
- **CloudAMQP (Tiger):** $399/month
- **OR AWS MQ (HA cluster):** $300-500/month
- **OR Self-hosted cluster:** $200/month + DevOps engineer

---

## When to Upgrade to Kafka

Consider Kafka when:
- ✅ Processing >1M events/day
- ✅ Need event replay (audit logs)
- ✅ Stream processing required
- ✅ 10+ microservices consuming events
- ✅ Real-time analytics needed

**Migration Effort:** 2-3 months
**Cost:** $300-1000/month

---

## Summary

### Why Start with RabbitMQ?

✅ **Built for Future Scale:** Handles 50K-200K msg/sec
✅ **Message Durability:** Payments never lost
✅ **Fan-out Pattern:** One event → Many services
✅ **Better Than Bull:** More reliable, scalable, feature-rich
✅ **Not Too Complex:** Easier than Kafka
✅ **Industry Standard:** Wide adoption, great tooling

### Growth Path

**Year 1:** RabbitMQ single node → 100K msg/day
**Year 2:** RabbitMQ cluster → 500K msg/day
**Year 3+:** Consider Kafka if >1M msg/day

---

## Next Steps

1. **Review** [examples/](./examples/) - Full RabbitMQ implementation
2. **Setup** Docker Compose with RabbitMQ
3. **Implement** Payment Worker (start here)
4. **Test** with production-like load
5. **Monitor** queue depths and performance
6. **Scale** by adding worker replicas

---

## References

- [RabbitMQ Best Practices](https://www.rabbitmq.com/best-practices.html)
- [RabbitMQ High Availability](https://www.rabbitmq.com/ha.html)
- [CloudAMQP Pricing](https://www.cloudamqp.com/plans.html)
- [MESSAGE_BROKER_COMPARISON.md](MESSAGE_BROKER_COMPARISON.md)
