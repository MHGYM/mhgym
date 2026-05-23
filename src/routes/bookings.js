const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/bookingController');

router.get('/',        authenticate, ctrl.myBookings);
router.post('/',
  authenticate,
  [body('class_id').isInt({ min: 1 })],
  validate,
  ctrl.createBooking
);
router.delete('/:id',  authenticate, ctrl.cancelBooking);

// Admin
router.get('/admin',   authenticate, requireAdmin, ctrl.allBookings);

module.exports = router;
