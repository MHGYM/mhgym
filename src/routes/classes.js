const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/classController');

// Publiek
router.get('/',    ctrl.listClasses);
router.get('/:id', ctrl.getClass);

// Admin
router.post('/',
  authenticate, requireAdmin,
  [
    body('name').notEmpty(),
    body('instructor').notEmpty(),
    body('category').isIn(['yoga', 'spinning', 'crossfit', 'boxing', 'pilates', 'zumba', 'bootcamp']),
    body('date_time').isISO8601(),
  ],
  validate,
  ctrl.createClass
);

router.put('/:id',    authenticate, requireAdmin, ctrl.updateClass);
router.delete('/:id', authenticate, requireAdmin, ctrl.cancelClass);

module.exports = router;
