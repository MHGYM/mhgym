/**
 * POST /api/setup/create-admin
 *
 * One-time bootstrap endpoint. Creates the initial admin account only when
 * zero users exist in the database. Once any user exists this returns 403,
 * making it permanently disabled without any code changes.
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../config/database');

const router = express.Router();

router.all('/create-admin', async (req, res) => {
  // ── Guard: only works on an empty database ───────────────────────────────
  const existing = await db.execute('SELECT COUNT(*) AS n FROM users');
  if (Number(existing.rows[0].n) > 0) {
    return res.status(403).json({
      error: 'Setup al voltooid. Dit endpoint is uitgeschakeld zodra er gebruikers bestaan.',
    });
  }

  // ── Create the admin ──────────────────────────────────────────────────────
  const email      = 'admin@mhgym.nl';
  const password   = 'Welkom123!';
  const first_name = 'Mohammed';
  const last_name  = 'Admin';

  const hash   = await bcrypt.hash(password, 12);
  const result = await db.execute({
    sql: `INSERT INTO users (email, password, first_name, last_name, role)
          VALUES (?, ?, ?, ?, 'admin')`,
    args: [email, hash, first_name, last_name],
  });

  const userId = Number(result.lastInsertRowid);
  const token  = jwt.sign(
    { id: userId, role: 'admin' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: '7d' }
  );

  console.log(`[Setup] Admin aangemaakt: ${email} (id=${userId})`);

  res.status(201).json({
    message: `Admin aangemaakt. Verander het wachtwoord na je eerste login!`,
    user:    { id: userId, email, first_name, last_name, role: 'admin' },
    token,
  });
});

// GET|POST /api/setup/reset-admin-password
// Resets admin@mhgym.nl password to Welkom123! — open in browser, then delete this route.
router.all('/reset-admin-password', async (req, res) => {
  const email    = 'admin@mhgym.nl';
  const password = 'Welkom123!';

  const userRes = await db.execute({
    sql: 'SELECT id, role FROM users WHERE email = ?',
    args: [email],
  });

  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: `Gebruiker ${email} niet gevonden.` });
  }

  const user = userRes.rows[0];
  const hash = await bcrypt.hash(password, 12);

  await db.execute({
    sql: `UPDATE users SET password = ?, role = 'admin', updated_at = datetime('now') WHERE id = ?`,
    args: [hash, user.id],
  });

  console.log(`[Setup] Wachtwoord gereset voor ${email} (id=${user.id})`);

  res.json({
    message: `Wachtwoord van ${email} is gereset naar: ${password}`,
    email,
    password,
    role: 'admin',
  });
});

module.exports = router;
