const express = require('express');
const router = express.Router();
const {
  createPayment,
  createRefund,
  getPaymentStatus,
  getPaymentsByUser,
} = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

// All payment routes require authentication
router.post('/', authenticate, createPayment);
router.post('/refund', authenticate, createRefund);
router.get('/:paymentId', authenticate, getPaymentStatus);
router.get('/user/:userId', authenticate, getPaymentsByUser);

module.exports = router;
