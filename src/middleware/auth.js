const jwt = require('jsonwebtoken');
const db = require('../config/database');

/**
 * Verifies JWT and attaches user to req.user
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Geen toegang. Token ontbreekt.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await db.execute({
      sql: 'SELECT id, email, first_name, last_name, role FROM users WHERE id = ?',
      args: [decoded.id],
    });
    const user = userRes.rows[0];
    if (!user) return res.status(401).json({ error: 'Gebruiker niet gevonden.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Ongeldige of verlopen token.' });
  }
};

/**
 * Only allows admins through
 */
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Geen admin rechten.' });
  }
  next();
};

/**
 * Blocks access when user has no active training subscription.
 * Admins always pass through.
 */
const requireTrainingAccess = async (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  const result = await db.execute({
    sql: `SELECT id FROM training_subscriptions
          WHERE user_id = ? AND status = 'active'
            AND (end_date IS NULL OR date(end_date) >= date('now'))
          LIMIT 1`,
    args: [req.user.id],
  });
  if (!result.rows[0]) {
    return res.status(403).json({ error: 'Geen actief trainingsabonnement.' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireTrainingAccess };
