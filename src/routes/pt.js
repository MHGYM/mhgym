const express  = require('express');
const router   = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  getPackages, getPlans,
  getSlots, createSlot, updateSlot, deleteSlot,
  myBookings, createBooking, cancelBooking,
  allBookings, confirmBooking, declineBooking, toggleExtraPerson,
  myBalance, allBalances,
  startPackageCheckout, startSubscriptionCheckout, cancelPtSubscription,
  subscribePush, getVapidKey, sendReminders,
} = require('../controllers/ptController');

// Publiek
router.get('/packages', getPackages);
router.get('/plans',    getPlans);
router.get('/vapid-key', getVapidKey);

// Slots — publiek ophalen, admin aanmaken/wijzigen
router.get('/slots',         authenticate, getSlots);
router.post('/slots',        authenticate, requireAdmin, createSlot);
router.put('/slots/:id',     authenticate, requireAdmin, updateSlot);
router.delete('/slots/:id',  authenticate, requireAdmin, deleteSlot);

// Boekingen (leden)
router.get('/bookings/mine',          authenticate, myBookings);
router.post('/bookings',              authenticate, createBooking);
router.put('/bookings/:id/cancel',    authenticate, cancelBooking);

// Boekingen (admin)
router.get('/bookings/admin',         authenticate, requireAdmin, allBookings);
router.put('/bookings/:id/confirm',   authenticate, requireAdmin, confirmBooking);
router.put('/bookings/:id/decline',   authenticate, requireAdmin, declineBooking);
router.put('/bookings/:id/extra',     authenticate, requireAdmin, toggleExtraPerson);

// Balance
router.get('/balance',        authenticate, myBalance);
router.get('/balance/admin',  authenticate, requireAdmin, allBalances);

// Checkout
router.post('/checkout/package',      authenticate, startPackageCheckout);
router.post('/checkout/subscription', authenticate, startSubscriptionCheckout);
router.put('/subscription/cancel',    authenticate, cancelPtSubscription);

// Reminders (trigger via cron of handmatig)
router.post('/reminders', authenticate, requireAdmin, sendReminders);

// Push notificaties
router.post('/push/subscribe', authenticate, subscribePush);

module.exports = router;
