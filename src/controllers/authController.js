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
    sql: 'SELECT id, email, first_name, last_name, phone, role, birth_date, address, postal_code, city FROM users WHERE id = ?',
    args: [result.lastInsertRowid],
  });
  const user = userRes.rows[0];

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

  const { password: _pw, mollie_customer_id: _mc, ...safeUser } = user;
  res.json({ user: safeUser, token: generateToken(user) });
};

// GET /api/auth/me
const me = async (req, res) => {
  // Haal volledige gebruiker op (inclusief nieuwe profiel-velden)
  const userRes = await db.execute({
    sql: 'SELECT id, email, first_name, last_name, phone, role, birth_date, address, postal_code, city, created_at FROM users WHERE id = ?',
    args: [req.user.id],
  });
  const fullUser = userRes.rows[0] || req.user;

  // Actief of nog-opzegbaar lidmaatschap
  const membershipRes = await db.execute({
    sql: `SELECT um.*,
                 m.name AS membership_name, m.category, m.price_monthly,
                 m.max_bookings_per_month, m.minimum_months, m.notice_period_months
          FROM user_memberships um
          JOIN memberships m ON m.id = um.membership_id
          WHERE um.user_id = ?
            AND (um.status = 'active' OR um.status = 'cancelling')
            AND (um.cancels_at IS NULL OR um.cancels_at >= date('now'))
          ORDER BY um.created_at DESC LIMIT 1`,
    args: [req.user.id],
  });
  const membership = membershipRes.rows[0] || null;

  // Voeg lessen-gebruik toe
  let membershipWithUsage = null;
  if (membership) {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);
    const usedRes = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM bookings WHERE user_id = ? AND status = 'confirmed' AND booked_at >= ?`,
      args: [req.user.id, firstOfMonth.toISOString()],
    });
    membershipWithUsage = { ...membership, bookings_used_this_month: Number(usedRes.rows[0].cnt) };
  }

  res.json({ user: fullUser, membership: membershipWithUsage });
};

// PUT /api/auth/profile  — inclusief nieuwe velden
const updateProfile = async (req, res) => {
  const { first_name, last_name, phone, birth_date, address, postal_code, city } = req.body;

  await db.execute({
    sql: `UPDATE users SET
            first_name  = COALESCE(?, first_name),
            last_name   = COALESCE(?, last_name),
            phone       = COALESCE(?, phone),
            birth_date  = COALESCE(?, birth_date),
            address     = COALESCE(?, address),
            postal_code = COALESCE(?, postal_code),
            city        = COALESCE(?, city),
            updated_at  = datetime('now')
          WHERE id = ?`,
    args: [
      first_name  || null, last_name   || null,
      phone       || null, birth_date  || null,
      address     || null, postal_code || null,
      city        || null, req.user.id,
    ],
  });

  const updatedRes = await db.execute({
    sql: 'SELECT id, email, first_name, last_name, phone, role, birth_date, address, postal_code, city FROM users WHERE id = ?',
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
