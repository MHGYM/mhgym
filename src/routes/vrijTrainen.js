const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/vrijTrainenController');

router.get('/bookings',        authenticate, ctrl.myBookings);
router.post('/bookings',       authenticate, ctrl.createBooking);
router.delete('/bookings/:id', authenticate, ctrl.cancelBooking);

router.get('/bookings/admin',         authenticate, requireAdmin, ctrl.adminListBookings);
router.delete('/bookings/:id/admin',  authenticate, requireAdmin, ctrl.adminDeleteBooking);

module.exports = router;
