const router = require('express').Router();
const { body } = require('express-validator');
const { validate } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/authController');

router.post('/register',
  [
    body('email').isEmail().withMessage('Geldig e-mailadres vereist.'),
    body('password').isLength({ min: 8 }).withMessage('Wachtwoord minimaal 8 tekens.'),
    body('first_name').notEmpty().withMessage('Voornaam is verplicht.'),
    body('last_name').notEmpty().withMessage('Achternaam is verplicht.'),
  ],
  validate,
  ctrl.register
);

router.post('/login',
  [
    body('email').isEmail(),
    body('password').notEmpty(),
  ],
  validate,
  ctrl.login
);

router.get('/me',  authenticate, ctrl.me);

router.post('/forgot-password', [body('email').isEmail()], validate, ctrl.forgotPassword);
router.post('/reset-password',  ctrl.resetPassword);

router.put('/profile',
  authenticate,
  [
    body('first_name').notEmpty(),
    body('last_name').notEmpty(),
  ],
  validate,
  ctrl.updateProfile
);

router.put('/password',
  authenticate,
  [
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 8 }),
  ],
  validate,
  ctrl.changePassword
);

module.exports = router;
