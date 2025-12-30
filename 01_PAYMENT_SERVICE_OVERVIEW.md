# Payment Service Integration Guide

This guide explains how to integrate the payment service with your registration flow.

## Architecture Overview

The payment service follows the same microservices pattern as the mail-queue and worker services:

```
User Registration Flow:
1. User registers (API endpoint)
2. Save user to database
3. Queue jobs in parallel:
   - mailQueue.add('registration', {...})
   - paymentQueue.add('process-payment', {...})
4. Background workers process jobs
5. User receives email + payment is processed
```

## API Endpoints

### 1. Create Payment

**Endpoint:** `POST /api/payments`

**Request Body:**
```json
{
  "userId": "user123",
  "amount": 29.99,
  "currency": "USD",
  "description": "Registration fee",
  "metadata": {
    "plan": "premium",
    "period": "monthly"
  }
}
```

**Response (202 Accepted):**
```json
{
  "message": "Payment is being processed",
  "jobId": "12345",
  "userId": "user123",
  "amount": 29.99,
  "currency": "USD"
}
```

### 2. Check Payment Status

**Endpoint:** `GET /api/payments/status/:jobId`

**Response:**
```json
{
  "jobId": "12345",
  "state": "completed",
  "data": {
    "userId": "user123",
    "amount": 29.99
  },
  "result": {
    "success": true,
    "transactionId": "mock_txn_1234567890_abc123",
    "amount": 29.99,
    "currency": "USD",
    "status": "completed"
  },
  "createdAt": 1234567890,
  "finishedOn": 1234567900
}
```

### 3. Create Refund

**Endpoint:** `POST /api/payments/refund`

**Request Body:**
```json
{
  "transactionId": "mock_txn_1234567890_abc123",
  "amount": 29.99,
  "reason": "Customer request"
}
```

## Integration Examples

### Example 1: Simple Registration with Payment

```javascript
// In your user registration controller
const { mailQueue, paymentQueue } = require('../queues');

const registerUser = async (req, res) => {
  const { email, name, password, paymentAmount } = req.body;

  // 1. Save user to database
  const user = await User.create({ email, name, password });

  // 2. Queue background jobs in parallel
  await Promise.all([
    // Send welcome email
    mailQueue.add('registration', {
      email: user.email,
      name: user.name,
      registrationDate: new Date()
    }, {
      priority: 5
    }),

    // Process payment
    paymentQueue.add('process-payment', {
      userId: user.id,
      amount: paymentAmount,
      currency: 'USD',
      description: 'Registration fee'
    }, {
      priority: 1,
      attempts: 3
    })
  ]);

  res.status(201).json({
    message: 'Registration successful',
    userId: user.id
  });
};
```

### Example 2: Payment Before Registration

```javascript
// Step 1: Process payment first
const initiateRegistration = async (req, res) => {
  const { email, name, password } = req.body;

  // Queue payment
  const paymentJob = await paymentQueue.add('process-payment', {
    userId: email, // temporary ID
    amount: 29.99,
    currency: 'USD',
    description: 'Registration fee',
    metadata: { email, name }
  }, {
    priority: 1,
    attempts: 3
  });

  res.status(202).json({
    message: 'Payment is being processed',
    paymentJobId: paymentJob.id
  });
};

// Step 2: Complete registration after payment succeeds
// (You would need to implement a webhook or polling mechanism)
const completeRegistration = async (paymentResult) => {
  const { email, name } = paymentResult.metadata;

  // Create user after payment succeeds
  const user = await User.create({
    email,
    name,
    transactionId: paymentResult.transactionId
  });

  // Send welcome email
  await mailQueue.add('registration', {
    email: user.email,
    name: user.name,
    registrationDate: new Date()
  });
};
```

### Example 3: Manual Payment Endpoint (Current Implementation)

```javascript
// Separate registration and payment flows

// 1. Register user first
const registerUser = async (req, res) => {
  const { email, name, password } = req.body;

  const user = await User.create({ email, name, password });

  await mailQueue.add('registration', {
    email: user.email,
    name: user.name,
    registrationDate: new Date()
  });

  res.status(201).json({
    message: 'Registration successful',
    userId: user.id
  });
};

// 2. User makes payment separately
// POST /api/payments
// { "userId": "123", "amount": 29.99 }
```

## Testing the Payment Service

### 1. Start all services

```bash
docker-compose up -d
```

### 2. Test payment endpoint

```bash
curl -X POST http://localhost:3000/api/payments \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "amount": 29.99,
    "currency": "USD",
    "description": "Test payment"
  }'
```

**Response:**
```json
{
  "message": "Payment is being processed",
  "jobId": "1",
  "userId": "user123",
  "amount": 29.99,
  "currency": "USD"
}
```

### 3. Check payment status

```bash
curl http://localhost:3000/api/payments/status/1
```

### 4. Monitor payment service logs

```bash
docker-compose logs -f payment-service
```

You should see output like:
```
✓ Payment queue worker started
✓ Listening for jobs: process-payment, process-refund
Processing process-payment job: 1
Processing payment for user user123: 29.99 USD
✓ Payment successful: mock_txn_1735574400_abc123
✓ Job 1 completed successfully
```

## Mock Payment Provider

The mock payment provider simulates real payment processing:

- **Delay:** 2 seconds (configurable via `MOCK_PAYMENT_DELAY`)
- **Failure Rate:** 10% (configurable via `MOCK_FAILURE_RATE`)
- **Transaction IDs:** Format `mock_txn_{timestamp}_{random}`

### Configuration

Edit [docker-compose.yml](docker-compose.yml:102-121):

```yaml
payment-service:
  environment:
    - PAYMENT_PROVIDER=mock
    - MOCK_PAYMENT_DELAY=2000    # 2 second delay
    - MOCK_FAILURE_RATE=0.1      # 10% failure rate
```

## Switching to Real Payment Provider (Stripe)

### 1. Install Stripe SDK

```bash
cd payment-service
npm install stripe
```

### 2. Update payment processor

Edit [payment-service/processors/paymentProcessor.js](payment-service/processors/paymentProcessor.js):

```javascript
const stripe = require('stripe')(paymentConfig.stripe.secretKey);

const stripePaymentProvider = async (amount, currency, metadata) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: currency.toLowerCase(),
    metadata,
    automatic_payment_methods: {
      enabled: true,
    },
  });

  return {
    success: true,
    transactionId: paymentIntent.id,
    amount,
    currency,
    status: paymentIntent.status,
    timestamp: new Date().toISOString(),
    metadata,
  };
};
```

### 3. Update environment variables

```bash
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## Job Priority and Retry Configuration

Payment jobs use higher priority than email jobs:

```javascript
paymentQueue.add('process-payment', data, {
  priority: 1,        // Higher priority (1 = highest)
  attempts: 3,        // Retry 3 times on failure
  backoff: {
    type: 'exponential',
    delay: 2000       // Start with 2s delay, then 4s, 8s
  }
});
```

Compare with mail jobs:

```javascript
mailQueue.add('registration', data, {
  priority: 5,        // Normal priority
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000
  }
});
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         API Service                          │
│  POST /api/payments → paymentQueue.add('process-payment')   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │    Redis    │
                  │   (Queue)   │
                  └──────┬──────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Payment Service     │
              │  - Process payments  │
              │  - Handle refunds    │
              │  - Retry on failure  │
              └──────────────────────┘
                         │
                         ▼
                  ┌─────────────┐
                  │   Stripe/   │
                  │Mock Provider│
                  └─────────────┘
```

## Files Created

- [api/queues/index.js](api/queues/index.js) - Added `paymentQueue`
- [api/controllers/paymentController.js](api/controllers/paymentController.js) - Payment endpoints
- [api/routes/paymentRoutes.js](api/routes/paymentRoutes.js) - Payment routes
- [api/server.js](api/server.js) - Registered payment routes
- [payment-service/index.js](payment-service/index.js) - Main worker
- [payment-service/processors/paymentProcessor.js](payment-service/processors/paymentProcessor.js) - Payment logic
- [payment-service/config/payment.js](payment-service/config/payment.js) - Configuration
- [payment-service/package.json](payment-service/package.json) - Dependencies
- [payment-service/Dockerfile](payment-service/Dockerfile) - Docker config
- [docker-compose.yml](docker-compose.yml) - Added payment service

## Next Steps

1. **Implement user registration endpoint** - Create a proper user registration flow
2. **Add payment webhooks** - Handle payment status updates from Stripe
3. **Add payment history** - Store payment records in PostgreSQL
4. **Add payment notifications** - Send payment confirmation emails
5. **Add refund workflow** - Implement refund request approval process
6. **Add payment analytics** - Track payment metrics in Elasticsearch
