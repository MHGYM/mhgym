const express = require('express');
const router  = express.Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/messagesController');

// Alle routes vereisen authenticatie (eigen berichten)
router.use(authenticate);

router.get('/',  ctrl.getMemberMessages);
router.post('/', ctrl.sendMemberMessage);

module.exports = router;
