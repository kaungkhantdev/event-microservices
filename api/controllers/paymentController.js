const { publishToPayment } = require('../queues');
const Payment = require('../models/Payment');
const { Op } = require('sequelize');

const createPayment = async (req, res) => {
  try {
    const { userId, amount, currency, description, metadata, idempotencyKey } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: userId and amount are required'
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be greater than 0'
      });
    }

    // Check for duplicate request using idempotency key
    if (idempotencyKey) {
      const existingPayment = await Payment.findOne({
        where: { idempotencyKey }
      });

      if (existingPayment) {
        return res.status(200).json({
          message: 'Payment already processed (idempotent)',
          paymentId: existingPayment.id,
          status: existingPayment.status,
          transactionId: existingPayment.transactionId,
          amount: existingPayment.amount,
          currency: existingPayment.currency
        });
      }
    }

    // STEP 1: Write to PostgreSQL FIRST (durable storage)
    const payment = await Payment.create({
      userId,
      amount,
      currency: currency || 'USD',
      description: description || 'Payment',
      metadata: metadata || {},
      idempotencyKey,
      status: 'pending',
      provider: process.env.PAYMENT_PROVIDER || 'mock'
    });

    // STEP 2: Publish to RabbitMQ for async processing
    try {
      await publishToPayment('payment.created', {
        paymentId: payment.id,
        userId,
        amount: payment.amount,
        currency: payment.currency
      }, { priority: 10 });

      res.status(202).json({
        message: 'Payment is being processed',
        paymentId: payment.id,
        status: payment.status,
        userId,
        amount: payment.amount,
        currency: payment.currency,
        createdAt: payment.createdAt
      });
    } catch (publishError) {
      // If RabbitMQ fails, we still have the payment in DB
      // Recovery cron job will pick it up
      console.error('Failed to publish payment, will be retried by recovery job:', publishError);

      res.status(202).json({
        message: 'Payment recorded, processing will begin shortly',
        paymentId: payment.id,
        status: payment.status,
        userId,
        amount: payment.amount,
        currency: payment.currency,
        warning: 'Payment will be processed by recovery system'
      });
    }
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({
      error: 'Failed to create payment',
      message: error.message
    });
  }
};

const createRefund = async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;

    if (!paymentId || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: paymentId and amount are required'
      });
    }

    // Find original payment
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        error: 'Can only refund completed payments',
        currentStatus: payment.status
      });
    }

    if (parseFloat(amount) > parseFloat(payment.amount)) {
      return res.status(400).json({
        error: 'Refund amount cannot exceed payment amount',
        paymentAmount: payment.amount,
        requestedAmount: amount
      });
    }

    // Update payment status
    await payment.update({ status: 'refunded' });

    // Publish refund event
    await publishToPayment('payment.refund', {
      paymentId: payment.id,
      transactionId: payment.transactionId,
      amount,
      reason: reason || 'Customer request'
    }, { priority: 9 });

    res.status(202).json({
      message: 'Refund is being processed',
      paymentId: payment.id,
      transactionId: payment.transactionId,
      amount
    });
  } catch (error) {
    console.error('Error creating refund:', error);
    res.status(500).json({
      error: 'Failed to queue refund',
      message: error.message
    });
  }
};

const getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Get payment from database (source of truth)
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      return res.status(404).json({
        error: 'Payment not found'
      });
    }

    res.json({
      paymentId: payment.id,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      description: payment.description,
      transactionId: payment.transactionId,
      provider: payment.provider,
      errorMessage: payment.errorMessage,
      metadata: payment.metadata,
      createdAt: payment.createdAt,
      processedAt: payment.processedAt,
      completedAt: payment.completedAt
    });
  } catch (error) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      error: 'Failed to get payment status',
      message: error.message
    });
  }
};

const getPaymentsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, limit = 50, offset = 0 } = req.query;

    const where = { userId };
    if (status) {
      where.status = status;
    }

    const payments = await Payment.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });

    res.json({
      total: payments.count,
      limit: parseInt(limit),
      offset: parseInt(offset),
      payments: payments.rows
    });
  } catch (error) {
    console.error('Error getting payments:', error);
    res.status(500).json({
      error: 'Failed to get payments',
      message: error.message
    });
  }
};

module.exports = {
  createPayment,
  createRefund,
  getPaymentStatus,
  getPaymentsByUser,
};
