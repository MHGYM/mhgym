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

router.post('/create-admin', async (req, res) => {
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

module.exports = router;
