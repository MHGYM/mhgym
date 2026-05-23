const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

// Alle admin routes vereisen authenticatie + admin rol
router.use(authenticate, requireAdmin);

// ── Statistieken ─────────────────────────────────────────────────────────────
router.get('/stats', ctrl.getStats);

// ── Leden ────────────────────────────────────────────────────────────────────
router.get('/members',           ctrl.listMembers);
router.get('/members/:id',       ctrl.getMember);
router.put('/members/:id/role',  ctrl.setMemberRole);
router.delete('/members/:id',    ctrl.deleteMember);

// ── Lessen ────────────────────────────────────────────────────────────────────
router.get('/classes',        ctrl.adminListClasses);
router.post('/classes',       ctrl.adminCreateClass);
router.put('/classes/:id',    ctrl.adminUpdateClass);
router.delete('/classes/:id', ctrl.adminCancelClass);

// ── Boekingen ─────────────────────────────────────────────────────────────────
router.get('/bookings', ctrl.adminListBookings);

// ── Betalingen ─────────────────────────────────────────────────────────────────
router.get('/payments', ctrl.adminListPayments);

module.exports = router;
