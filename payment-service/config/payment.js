require('dotenv').config();

const paymentConfig = {
  provider: process.env.PAYMENT_PROVIDER || 'mock',
  currency: process.env.PAYMENT_CURRENCY || 'USD',

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },

  mock: {
    simulateDelay: parseInt(process.env.MOCK_PAYMENT_DELAY || '2000', 10),
    failureRate: parseFloat(process.env.MOCK_FAILURE_RATE || '0.1'),
  }
};

module.exports = paymentConfig;
