const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/cashController');

router.use(authenticate, requireAdmin);

// ── Cash betalingen ──────────────────────────────────────────────────────────
router.get('/payments',                      ctrl.getCashPayments);
router.post('/payments',                     ctrl.logCashPayment);
router.put('/memberships/:id/quarterly-paid', ctrl.markQuarterlyPaid);
router.get('/members',                       ctrl.getCashMembers);

// ── Fonds ────────────────────────────────────────────────────────────────────
router.get('/fonds',                         ctrl.listFondsMembers);
router.post('/fonds',                        ctrl.createFondsMembership);
router.put('/fonds/:id',                     ctrl.updateFondsMembership);
router.post('/fonds/process-reminders',      ctrl.processFondsReminders);
router.post('/quarterly/process-reminders',  ctrl.processQuarterlyReminders);
router.post('/quarterly/process-overdue',    ctrl.processCashOverdueReminders);

// ── Inkomen dashboard ────────────────────────────────────────────────────────
router.get('/income',                        ctrl.getIncomeBreakdown);
router.get('/pt-overview',                   ctrl.getCashPtOverview);

module.exports = router;
