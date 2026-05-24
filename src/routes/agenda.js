const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const { getAgenda } = require('../controllers/agendaController');

router.get('/', authenticate, getAgenda);

module.exports = router;
