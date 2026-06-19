const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const db     = require('../config/database');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../services/emailService');

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

  // Actieve rittenkaart (meest recent niet-verlopen met saldo)
  const kaartRes = await db.execute({
    sql: `SELECT rk.*, t.naam AS type_naam
          FROM rittenkaarten rk
          JOIN rittenkaart_types t ON t.id = rk.type_id
          WHERE rk.user_id = ? AND rk.status = 'active' AND rk.ritten_resterend > 0
            AND (rk.vervaldatum IS NULL OR rk.vervaldatum >= date('now'))
          ORDER BY rk.created_at ASC LIMIT 1`,
    args: [req.user.id],
  });
  const rittenkaart = kaartRes.rows[0] || null;

  res.json({ user: fullUser, membership: membershipWithUsage, rittenkaart });
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

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'E-mailadres is verplicht.' });

  // Always respond with success to avoid leaking which emails exist
  const userRes = await db.execute({ sql: 'SELECT id, first_name, email FROM users WHERE email = ?', args: [email.toLowerCase().trim()] });
  const user = userRes.rows[0];

  if (user) {
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

    // Invalidate any existing tokens for this user
    await db.execute({ sql: 'DELETE FROM password_reset_tokens WHERE user_id = ?', args: [user.id] });

    await db.execute({
      sql: 'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      args: [user.id, token, expiresAt],
    });

    const baseUrl  = process.env.FRONTEND_URL || 'https://app.mhgym.nl';
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    sendPasswordResetEmail({ to: user.email, firstName: user.first_name, resetUrl }).catch(() => {});
  }

  res.json({ message: 'Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een e-mail.' });
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token en wachtwoord zijn verplicht.' });
  if (password.length < 8)  return res.status(400).json({ error: 'Wachtwoord minimaal 8 tekens.' });

  const tokenRes = await db.execute({
    sql: `SELECT * FROM password_reset_tokens
          WHERE token = ? AND used = 0 AND expires_at > datetime('now')`,
    args: [token],
  });
  const resetToken = tokenRes.rows[0];
  if (!resetToken) return res.status(400).json({ error: 'Ongeldige of verlopen link. Vraag een nieuwe aan.' });

  const hash = await bcrypt.hash(password, 12);
  await db.execute({
    sql: `UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [hash, resetToken.user_id],
  });

  // Mark token as used
  await db.execute({ sql: 'UPDATE password_reset_tokens SET used = 1 WHERE id = ?', args: [resetToken.id] });

  res.json({ message: 'Wachtwoord succesvol gewijzigd. Je kunt nu inloggen.' });
};

module.exports = { register, login, me, updateProfile, changePassword, forgotPassword, resetPassword };
