const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { sendWelcomeEmail } = require('../services/emailService');

const generateToken = (user) =>
  jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /api/auth/register
const register = async (req, res) => {
  const { email, password, first_name, last_name, phone } = req.body;

  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'E-mailadres is al in gebruik.' });
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await db.execute({
    sql: 'INSERT INTO users (email, password, first_name, last_name, phone) VALUES (?, ?, ?, ?, ?)',
    args: [email, hash, first_name, last_name, phone || null],
  });

  const userRes = await db.execute({
    sql: 'SELECT id, email, first_name, last_name, role FROM users WHERE id = ?',
    args: [result.lastInsertRowid],
  });
  const user = userRes.rows[0];

  // Stuur welkomstmail (non-blocking)
  sendWelcomeEmail({ to: user.email, firstName: user.first_name }).catch(() => {});

  res.status(201).json({ user, token: generateToken(user) });
};

// POST /api/auth/login
const login = async (req, res) => {
  const { email, password } = req.body;

  const userRes = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
  const user = userRes.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Onjuiste e-mail of wachtwoord.' });
  }

  const { password: _pw, ...safeUser } = user;
  res.json({ user: safeUser, token: generateToken(user) });
};

// GET /api/auth/me
const me = async (req, res) => {
  const membershipRes = await db.execute({
    sql: `SELECT um.*, m.name AS membership_name, m.category, m.price_monthly, m.max_bookings_per_month
          FROM user_memberships um
          JOIN memberships m ON m.id = um.membership_id
          WHERE um.user_id = ? AND um.status = 'active'
          ORDER BY um.created_at DESC LIMIT 1`,
    args: [req.user.id],
  });

  res.json({ user: req.user, membership: membershipRes.rows[0] || null });
};

// PUT /api/auth/profile
const updateProfile = async (req, res) => {
  const { first_name, last_name, phone } = req.body;

  await db.execute({
    sql: `UPDATE users SET first_name = ?, last_name = ?, phone = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [first_name, last_name, phone || null, req.user.id],
  });

  const updatedRes = await db.execute({
    sql: 'SELECT id, email, first_name, last_name, phone, role FROM users WHERE id = ?',
    args: [req.user.id],
  });

  res.json({ user: updatedRes.rows[0] });
};

// PUT /api/auth/password
const changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;

  const userRes = await db.execute({ sql: 'SELECT password FROM users WHERE id = ?', args: [req.user.id] });
  const user = userRes.rows[0];

  if (!(await bcrypt.compare(current_password, user.password))) {
    return res.status(401).json({ error: 'Huidig wachtwoord is onjuist.' });
  }

  const hash = await bcrypt.hash(new_password, 12);
  await db.execute({
    sql: `UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [hash, req.user.id],
  });

  res.json({ message: 'Wachtwoord succesvol gewijzigd.' });
};

module.exports = { register, login, me, updateProfile, changePassword };
