const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/rittenkaartController');

router.use(authenticate);

router.get('/mine', ctrl.myRittenkaarten);

module.exports = router;
