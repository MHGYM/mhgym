const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

router.use(authenticate, requireAdmin);

// ── Statistieken ────────────────────────────────────────────────────────────
router.get('/stats', ctrl.getStats);

// ── Leden ───────────────────────────────────────────────────────────────────
router.get('/members',                    ctrl.listMembers);
router.get('/members/:id',                ctrl.getMember);
router.put('/members/:id/role',           ctrl.setMemberRole);
router.put('/members/:id/notes',          ctrl.updateMemberNotes);
router.put('/members/:id/pause',          ctrl.pauseMembership);
router.post('/members/:id/membership',    ctrl.assignMembership);
router.put('/members/:id/memberships/:mid/paid', ctrl.markCashPaid);
router.post('/members/:id/pt-lessons',    ctrl.addPtLessons);
router.delete('/members/:id',             ctrl.deleteMember);

// ── Lessen ───────────────────────────────────────────────────────────────────
router.get('/classes',        ctrl.adminListClasses);
router.post('/classes',       ctrl.adminCreateClass);
router.put('/classes/:id',    ctrl.adminUpdateClass);
router.delete('/classes/:id', ctrl.adminCancelClass);

// ── Boekingen ─────────────────────────────────────────────────────────────────
router.get('/bookings', ctrl.adminListBookings);

// ── Betalingen ─────────────────────────────────────────────────────────────────
router.get('/payments', ctrl.adminListPayments);

// ── Betalingsfouten ────────────────────────────────────────────────────────────
router.get('/payment-failures',                      ctrl.getPaymentFailures);
router.get('/payment-failures/:id',                  ctrl.getPaymentDetail);
router.post('/payment-failures/:id/remind',          ctrl.sendPaymentReminder);
router.post('/payment-failures/:id/paylink',         ctrl.sendPayLink);
router.post('/payment-failures/auto-remind',         ctrl.processAutoReminders);
router.put('/payment-failures/:id/paid',             ctrl.markPaymentPaid);
router.put('/payment-failures/:id/pause',            ctrl.pauseMembershipFromFailure);

module.exports = router;
