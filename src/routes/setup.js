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

// GET|POST /api/setup/force-create-admin
// Always creates or overwrites admin@mhgym.nl — no guards, no checks.
// Open once in browser to guarantee the admin exists with the right password.
router.all('/force-create-admin', async (req, res) => {
  const email      = 'admin@mhgym.nl';
  const password   = 'Welkom123!';
  const first_name = 'Mohammed';
  const last_name  = 'Admin';
  const hash = await bcrypt.hash(password, 12);

  // Delete any existing record for this email, then insert fresh
  await db.execute({ sql: 'DELETE FROM users WHERE email = ?', args: [email] });

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

  console.log(`[Setup] Admin geforceerd aangemaakt: ${email} (id=${userId})`);

  res.status(201).json({
    message: `Admin aangemaakt. Login met ${email} / ${password}`,
    email,
    password,
    role: 'admin',
    token,
  });
});

// ── Class schedule seed ──────────────────────────────────────────────────────
// GET /api/setup/seed-schedule
// Inserts the MHGym weekly class schedule for the next 12 weeks.
// Safe to call multiple times — deletes existing seeded classes first.

const SCHEDULE = [
  // Maandag (dayOffset 0)
  { dayOffset: 0, time: '16:00', duration: 60,  name: 'Kickboksen Kids',       instructor: 'Mohammed', capacity: 15 },
  { dayOffset: 0, time: '19:00', duration: 60,  name: 'Kickboksen Recreanten', instructor: 'Mohammed', capacity: 20 },
  { dayOffset: 0, time: '20:15', duration: 60,  name: 'Boksen Ladies-Only',    instructor: 'Ecrin',    capacity: 12 },
  // Dinsdag (dayOffset 1)
  { dayOffset: 1, time: '17:00', duration: 60,  name: 'Jeugd',                 instructor: 'Mohammed', capacity: 15 },
  { dayOffset: 1, time: '19:00', duration: 60,  name: 'Boksen Recreanten',     instructor: 'Mohammed', capacity: 20 },
  // Woensdag (dayOffset 2)
  { dayOffset: 2, time: '20:00', duration: 60,  name: 'Kickboksen Ladies-Only',instructor: 'Ecrin',    capacity: 12 },
  // Donderdag (dayOffset 3)
  { dayOffset: 3, time: '19:00', duration: 60,  name: 'Boksen Recreanten',     instructor: 'Mohammed', capacity: 20 },
  // Vrijdag (dayOffset 4)
  { dayOffset: 4, time: '16:00', duration: 60,  name: 'Boksen Kids',           instructor: 'Joep',     capacity: 15 },
  { dayOffset: 4, time: '17:00', duration: 60,  name: 'Kickboksen Jeugd',      instructor: 'Joep',     capacity: 15 },
];

router.all('/seed-schedule', async (req, res) => {
  // Find next Monday (or use today if it's Monday)
  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysToMonday = dow === 0 ? 1 : dow === 1 ? 0 : (8 - dow);
  const monday = new Date(now);
  monday.setDate(now.getDate() + daysToMonday);
  monday.setHours(0, 0, 0, 0);

  // Remove previously seeded classes (location = 'Seeded')
  await db.execute(`DELETE FROM classes WHERE location = 'Seeded'`);

  let inserted = 0;
  for (let week = 0; week < 12; week++) {
    for (const cls of SCHEDULE) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + cls.dayOffset + week * 7);

      const [h, m] = cls.time.split(':').map(Number);
      date.setHours(h, m, 0, 0);

      // Store as local datetime string (no Z suffix) so the browser
      // interprets it in local time, not UTC.
      const pad = (n) => String(n).padStart(2, '0');
      const dateTimeStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(h)}:${pad(m)}:00`;

      await db.execute({
        sql: `INSERT INTO classes (name, instructor, date_time, duration_minutes, max_capacity, location)
              VALUES (?, ?, ?, ?, ?, 'Seeded')`,
        args: [cls.name, cls.instructor, dateTimeStr, cls.duration, cls.capacity],
      });
      inserted++;
    }
  }

  console.log(`[Setup] ${inserted} klassen aangemaakt voor 12 weken.`);
  res.json({
    message: `✅ ${inserted} klassen aangemaakt (${SCHEDULE.length} per week × 12 weken).`,
    schedule: SCHEDULE.map(c => `${['ma','di','wo','do','vr'][c.dayOffset]} ${c.time} — ${c.name} (${c.instructor})`),
  });
});

module.exports = router;
