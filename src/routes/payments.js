const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/paymentController');

// Webhook van Mollie — geen auth (Mollie belt dit aan)
router.post('/webhook', ctrl.webhook);

// Eigen betalingshistorie
router.get('/', authenticate, ctrl.myPayments);

// Start checkout
router.post('/checkout',
  authenticate,
  [body('membership_id').isInt({ min: 1 })],
  validate,
  ctrl.startCheckout
);

// Admin
router.get('/admin', authenticate, requireAdmin, ctrl.allPayments);

module.exports = router;
