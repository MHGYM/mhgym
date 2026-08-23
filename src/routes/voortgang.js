const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/voortgangController');
const mrCtrl = require('../controllers/measurementReportController');
const badgeCtrl = require('../controllers/badgeController');

// ── Leden ────────────────────────────────────────────────────────────────────
router.get('/overview',        authenticate, ctrl.getOverview);
router.get('/attendance',      authenticate, ctrl.getAttendanceHistory);
router.get('/nutrition/today', authenticate, ctrl.getNutritionToday);
router.get('/nutrition/week',  authenticate, ctrl.getNutritionWeek);
router.post('/nutrition/log',  authenticate, ctrl.logNutritionMeal);

// Meetresultaten — alle eigen rapporten (zie measurementReportController.js
// voor de beveiligingsopzet: elke request wordt herbevestigd tegen req.user.id).
router.get('/measurement-reports/mine',                authenticate, mrCtrl.myReports);
router.get('/measurement-reports/mine/:reportId/image', authenticate, mrCtrl.myReportImage);

// Badges — eigen behaalde badges (evalueert en kent tegelijk nieuw-verdiende toe).
router.get('/badges/mine', authenticate, badgeCtrl.myBadges);

// ── Coach / admin ────────────────────────────────────────────────────────────
router.get('/admin/templates/:memberId', authenticate, requireAdmin, ctrl.listMemberTemplates);
router.post('/admin/templates',          authenticate, requireAdmin, ctrl.createTemplate);
router.put('/admin/templates/:id',       authenticate, requireAdmin, ctrl.updateTemplate);
router.delete('/admin/templates/:id',    authenticate, requireAdmin, ctrl.deactivateTemplate);

router.put('/admin/bookings/:id/checkin',        authenticate, requireAdmin, ctrl.checkinClassBooking);
router.put('/admin/pt-bookings/:id/complete',    authenticate, requireAdmin, ctrl.completePtBooking);

// Doelen (voor de "Doel Bereikt"-badge) — admin stelt in, per lid opvraagbaar.
router.post('/admin/goals',            authenticate, requireAdmin, badgeCtrl.setGoal);
router.get('/admin/goals/:memberId',   authenticate, requireAdmin, badgeCtrl.listGoals);
router.get('/admin/badges/:memberId',  authenticate, requireAdmin, badgeCtrl.memberBadges);

module.exports = router;
