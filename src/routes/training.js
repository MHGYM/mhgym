const router  = require('express').Router();
const { authenticate, requireAdmin, requireTrainingAccess } = require('../middleware/auth');
const tc = require('../controllers/trainingController');

// ── Config ────────────────────────────────────────────────────────────────────
router.get('/config', authenticate, tc.getConfig);

// ── Toegang (iedereen ingelogd) ───────────────────────────────────────────────
router.get('/access', authenticate, tc.getMyAccess);

// ── Admin — gebruikerslijst ───────────────────────────────────────────────────
router.get('/admin/users', authenticate, requireAdmin, tc.listUsers);

// ── Admin — abonnementen ──────────────────────────────────────────────────────
router.get   ('/admin/subscriptions',     authenticate, requireAdmin, tc.listSubscriptions);
router.post  ('/admin/subscriptions',     authenticate, requireAdmin, tc.createSubscription);
router.put   ('/admin/subscriptions/:id', authenticate, requireAdmin, tc.updateSubscription);
router.delete('/admin/subscriptions/:id', authenticate, requireAdmin, tc.cancelSubscription);

// ── Admin — oefeningen ────────────────────────────────────────────────────────
router.post  ('/admin/exercises',     authenticate, requireAdmin, tc.createExercise);
router.put   ('/admin/exercises/:id', authenticate, requireAdmin, tc.updateExercise);
router.delete('/admin/exercises/:id', authenticate, requireAdmin, tc.deleteExercise);

// ── Admin — programma's ───────────────────────────────────────────────────────
router.post  ('/admin/programs',     authenticate, requireAdmin, tc.createProgram);
router.put   ('/admin/programs/:id', authenticate, requireAdmin, tc.updateProgram);
router.delete('/admin/programs/:id', authenticate, requireAdmin, tc.deleteProgram);

// dagen + oefeningen in dag
router.post  ('/admin/programs/:id/days',           authenticate, requireAdmin, tc.createDay);
router.put   ('/admin/days/:dayId',                 authenticate, requireAdmin, tc.updateDay);
router.delete('/admin/days/:dayId',                 authenticate, requireAdmin, tc.deleteDay);
router.post  ('/admin/days/:dayId/exercises',       authenticate, requireAdmin, tc.addExerciseToDay);
router.put   ('/admin/program-exercises/:peId',     authenticate, requireAdmin, tc.updateProgramExercise);
router.delete('/admin/program-exercises/:peId',     authenticate, requireAdmin, tc.removeProgramExercise);

// programma toewijzen aan lid
router.post('/admin/assign-program',   authenticate, requireAdmin, tc.adminAssignProgram);
router.post('/admin/assign-nutrition', authenticate, requireAdmin, tc.assignNutritionPlan);

// ── Admin — voeding ───────────────────────────────────────────────────────────
router.post  ('/admin/nutrition',              authenticate, requireAdmin, tc.createNutritionPlan);
router.put   ('/admin/nutrition/:id',          authenticate, requireAdmin, tc.updateNutritionPlan);
router.delete('/admin/nutrition/:id',          authenticate, requireAdmin, tc.deleteNutritionPlan);
router.post  ('/admin/nutrition/:id/days',     authenticate, requireAdmin, tc.addNutritionDay);
router.put   ('/admin/nutrition-days/:dayId',  authenticate, requireAdmin, tc.updateNutritionDay);
router.delete('/admin/nutrition-days/:dayId',  authenticate, requireAdmin, tc.deleteNutritionDay);

// ── Content (ingelogd + trainingstoegang) ────────────────────────────────────
router.get('/exercises',      authenticate, requireTrainingAccess, tc.listExercises);
router.get('/exercises/:id',  authenticate, requireTrainingAccess, tc.getExercise);
router.get('/programs',       authenticate, requireTrainingAccess, tc.listPrograms);
router.get('/programs/:id',   authenticate, requireTrainingAccess, tc.getProgram);
router.get('/nutrition',      authenticate, requireTrainingAccess, tc.listNutritionPlans);
router.get('/nutrition/:id',  authenticate, requireTrainingAccess, tc.getNutritionPlan);

// ── Mijn programma & logs ────────────────────────────────────────────────────
router.get ('/my/program',          authenticate, requireTrainingAccess, tc.getMyProgram);
router.post('/my/program',          authenticate, requireTrainingAccess, tc.selectProgram);
router.get ('/my/logs',             authenticate, requireTrainingAccess, tc.getMyLogs);
router.post('/my/logs',             authenticate, requireTrainingAccess, tc.logWorkout);
router.get ('/my/logs/:id',         authenticate, requireTrainingAccess, tc.getWorkoutDetail);
router.get ('/my/records',          authenticate, requireTrainingAccess, tc.getMyRecords);
router.get ('/my/measurements',     authenticate, requireTrainingAccess, tc.getMeasurements);
router.post('/my/measurements',     authenticate, requireTrainingAccess, tc.addMeasurement);
router.delete('/my/measurements/:id', authenticate, requireTrainingAccess, tc.deleteMeasurement);
router.get ('/my/nutrition',        authenticate, requireTrainingAccess, tc.getMyNutrition);

// Admin: exercises & programs leesbaar voor admin zonder trainingstoegang
router.get('/admin/exercises',  authenticate, requireAdmin, tc.listExercises);
router.get('/admin/programs',   authenticate, requireAdmin, tc.listPrograms);
router.get('/admin/programs/:id', authenticate, requireAdmin, tc.getProgram);
router.get('/admin/nutrition',  authenticate, requireAdmin, tc.listNutritionPlans);
router.get('/admin/nutrition/:id', authenticate, requireAdmin, tc.getNutritionPlan);

module.exports = router;
