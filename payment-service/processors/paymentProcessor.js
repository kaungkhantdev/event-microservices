const paymentConfig = require('../config/payment');
const Payment = require('../models/Payment');

const mockPaymentProvider = async (amount, currency, metadata) => {
  const delay = paymentConfig.mock.simulateDelay;

  await new Promise(resolve => setTimeout(resolve, delay));

  const shouldFail = Math.random() < paymentConfig.mock.failureRate;

  if (shouldFail) {
    throw new Error('Mock payment declined - insufficient funds');
  }

  const transactionId = `mock_txn_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  return {
    success: true,
    transactionId,
    amount,
    currency,
    status: 'completed',
    timestamp: new Date().toISOString(),
    metadata,
  };
};

const stripePaymentProvider = async (amount, currency, metadata) => {
  throw new Error('Stripe integration not implemented. Set PAYMENT_PROVIDER=mock or implement Stripe SDK.');
};

const processPayment = async (job) => {
  const { paymentId } = job.data;

  console.log(`Processing payment job ${job.id} for payment ${paymentId}`);

  // Fetch payment from database (source of truth)
  const payment = await Payment.findByPk(paymentId);

  if (!payment) {
    throw new Error(`Payment ${paymentId} not found in database`);
  }

  // Check if already processed (idempotency)
  if (payment.status === 'completed') {
    console.log(`✓ Payment ${paymentId} already completed, skipping`);
    return {
      success: true,
      paymentId: payment.id,
      transactionId: payment.transactionId,
      status: 'completed',
      message: 'Already processed'
    };
  }

  if (payment.status === 'processing') {
    console.log(`⚠ Payment ${paymentId} is already being processed`);
    return {
      success: false,
      paymentId: payment.id,
      status: 'processing',
      message: 'Already processing'
    };
  }

  try {
    // Update status to processing
    await payment.update({
      status: 'processing',
      processedAt: new Date()
    });

    console.log(`Processing payment for user ${payment.userId}: ${payment.amount} ${payment.currency}`);

    // Process payment with provider
    let result;
    if (paymentConfig.provider === 'stripe') {
      result = await stripePaymentProvider(
        parseFloat(payment.amount),
        payment.currency,
        payment.metadata
      );
    } else {
      result = await mockPaymentProvider(
        parseFloat(payment.amount),
        payment.currency,
        payment.metadata
      );
    }

    console.log(`✓ Payment successful: ${result.transactionId}`);

    // Update payment in database
    await payment.update({
      status: 'completed',
      transactionId: result.transactionId,
      completedAt: new Date(),
      errorMessage: null
    });

    return {
      success: true,
      paymentId: payment.id,
      userId: payment.userId,
      transactionId: result.transactionId,
      amount: payment.amount,
      currency: payment.currency,
      status: 'completed',
      processedAt: result.timestamp,
    };
  } catch (error) {
    console.error(`✗ Payment failed for payment ${paymentId}:`, error.message);

    // Update payment status to failed
    await payment.update({
      status: 'failed',
      errorMessage: error.message,
      processedAt: new Date()
    });

    throw error;
  }
};

const processRefund = async (job) => {
  const { paymentId, transactionId, amount, reason } = job.data;

  console.log(`Processing refund for payment ${paymentId}, transaction ${transactionId}: ${amount}`);

  // Fetch original payment
  const payment = await Payment.findByPk(paymentId);

  if (!payment) {
    throw new Error(`Payment ${paymentId} not found`);
  }

  if (payment.status !== 'refunded') {
    throw new Error(`Payment ${paymentId} is not marked for refund, current status: ${payment.status}`);
  }

  try {
    // Simulate refund processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    const refundId = `refund_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    console.log(`✓ Refund successful: ${refundId}`);

    // Update payment metadata with refund info
    await payment.update({
      metadata: {
        ...payment.metadata,
        refund: {
          refundId,
          amount,
          reason,
          processedAt: new Date().toISOString()
        }
      }
    });

    return {
      success: true,
      refundId,
      paymentId: payment.id,
      transactionId,
      amount,
      reason,
      processedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`✗ Refund failed for payment ${paymentId}:`, error.message);
    throw error;
  }
};

module.exports = {
  processPayment,
  processRefund,
};
