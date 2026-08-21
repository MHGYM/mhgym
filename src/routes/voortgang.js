const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/voortgangController');

// ── Leden ────────────────────────────────────────────────────────────────────
router.get('/overview',        authenticate, ctrl.getOverview);
router.get('/attendance',      authenticate, ctrl.getAttendanceHistory);
router.get('/nutrition/today', authenticate, ctrl.getNutritionToday);
router.get('/nutrition/week',  authenticate, ctrl.getNutritionWeek);
router.post('/nutrition/log',  authenticate, ctrl.logNutritionMeal);

// ── Coach / admin ────────────────────────────────────────────────────────────
router.get('/admin/templates/:memberId', authenticate, requireAdmin, ctrl.listMemberTemplates);
router.post('/admin/templates',          authenticate, requireAdmin, ctrl.createTemplate);
router.put('/admin/templates/:id',       authenticate, requireAdmin, ctrl.updateTemplate);
router.delete('/admin/templates/:id',    authenticate, requireAdmin, ctrl.deactivateTemplate);

router.put('/admin/bookings/:id/checkin',        authenticate, requireAdmin, ctrl.checkinClassBooking);
router.put('/admin/pt-bookings/:id/complete',    authenticate, requireAdmin, ctrl.completePtBooking);

module.exports = router;
