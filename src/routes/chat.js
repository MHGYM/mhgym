const express = require('express');
const router  = express.Router();
const { chat } = require('../controllers/chatController');

// No auth — Maya is publicly accessible for lead generation
router.post('/maya', chat);

module.exports = router;
