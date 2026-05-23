const router = require('express').Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/membershipController');

router.get('/',                 ctrl.listMemberships);
router.get('/mine',             authenticate, ctrl.myMembership);
router.put('/mine/cancel',      authenticate, ctrl.cancelMembership);

// Admin
router.get('/admin/users',      authenticate, requireAdmin, ctrl.allUserMemberships);

module.exports = router;
