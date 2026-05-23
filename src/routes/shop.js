const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/shopController');

// ── Publieke product routes ──────────────────────────────────────────────────
router.get('/products',     ctrl.listProducts);
router.get('/products/:id', ctrl.getProduct);

// ── Ingelogde gebruiker ──────────────────────────────────────────────────────
router.get('/orders', authenticate, ctrl.myOrders);

router.post('/checkout',
  authenticate,
  [body('items').isArray({ min: 1 })],
  validate,
  ctrl.startShopCheckout
);

// ── Admin ────────────────────────────────────────────────────────────────────
router.get('/admin/products',    authenticate, requireAdmin, ctrl.adminListProducts);
router.post('/admin/products',   authenticate, requireAdmin, ctrl.adminCreateProduct);
router.put('/admin/products/:id', authenticate, requireAdmin, ctrl.adminUpdateProduct);
router.delete('/admin/products/:id', authenticate, requireAdmin, ctrl.adminDeleteProduct);
router.get('/admin/orders',      authenticate, requireAdmin, ctrl.adminListOrders);

module.exports = router;
