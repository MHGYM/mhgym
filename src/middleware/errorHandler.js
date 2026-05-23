const { validationResult } = require('express-validator');

/**
 * Validates express-validator results and returns 422 on failure
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
};

/**
 * Global error handler — attach last in app.js
 */
const errorHandler = (err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.message || 'Er is een interne fout opgetreden.',
  });
};

module.exports = { validate, errorHandler };
