const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/vrijTrainenController');

// ── Member endpoints ──────────────────────────────────────────────────────
router.get('/slots',            authenticate, ctrl.getSlots);
router.post('/slots/:id/book',  authenticate, ctrl.requestSlot);
router.get('/bookings',         authenticate, ctrl.myBookings);
router.delete('/bookings/:id',  authenticate, ctrl.cancelRequest);

// ── Admin endpoints ───────────────────────────────────────────────────────
router.get('/admin/slots',                   authenticate, requireAdmin, ctrl.adminListSlots);
router.post('/admin/slots',                  authenticate, requireAdmin, ctrl.createSlot);
router.delete('/admin/slots/:id',            authenticate, requireAdmin, ctrl.deleteSlot);
router.put('/admin/bookings/:id/confirm',    authenticate, requireAdmin, ctrl.confirmBooking);
router.put('/admin/bookings/:id/decline',    authenticate, requireAdmin, ctrl.declineBooking);
router.post('/admin/slots/:id/book-member',  authenticate, requireAdmin, ctrl.directBookMember);
router.delete('/admin/bookings/:id',         authenticate, requireAdmin, ctrl.adminDeleteBooking);

module.exports = router;
