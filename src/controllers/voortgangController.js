/**
 * Mijn Voortgang — aanwezigheid-tracking en per-lid voedingsschema
 *
 * Ledenkant:
 *  GET  /api/voortgang/overview          — samenvatting voor tab "Voortgang"
 *  GET  /api/voortgang/attendance        — volledige aanwezigheidshistorie
 *  GET  /api/voortgang/nutrition/today   — actief schema + status van vandaag
 *  GET  /api/voortgang/nutrition/week    — compliance afgelopen 7 dagen
 *  POST /api/voortgang/nutrition/log     — maaltijd afvinken/toelichten
 *
 * Coach/admin kant:
 *  GET    /api/voortgang/admin/templates/:memberId
 *  POST   /api/voortgang/admin/templates
 *  PUT    /api/voortgang/admin/templates/:id
 *  DELETE /api/voortgang/admin/templates/:id   (deactiveren, geen hard-delete)
 *  PUT    /api/voortgang/admin/bookings/:id/checkin        (groepsles)
 *  PUT    /api/voortgang/admin/pt-bookings/:id/complete    (PT-afspraak)
 */

const db = require('../config/database');
const { sendInactivityReminderEmail } = require('../services/emailService');

const DEFAULT_MEALS = [
  { key: 'ontbijt', label: 'Ontbijt', description: '' },
  { key: 'lunch',   label: 'Lunch',   description: '' },
  { key: 'diner',   label: 'Diner',   description: '' },
  { key: 'snacks',  label: 'Snacks',  description: '' },
];

function toDateStr(d) { return new Date(d).toISOString().split('T')[0]; }

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7; // 0 = maandag
  d.setDate(d.getDate() - dow);
  return toDateStr(d);
}

// ── Streak-berekening: langste + huidige reeks weken met minstens 1 bezoek ──
function computeStreaks(distinctDates) {
  if (distinctDates.length === 0) return { current_streak_weeks: 0, longest_streak_weeks: 0 };

  const weekKeys = [...new Set(distinctDates.map(mondayOf))].sort();
  const weekMs = 7 * 86400000;

  let longest = 1, run = 1;
  for (let i = 1; i < weekKeys.length; i++) {
    const gap = (new Date(weekKeys[i]) - new Date(weekKeys[i - 1])) / weekMs;
    run = gap === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  // Huidige streak: alleen "actief" als de laatste week met bezoek deze of vorige week is
  const thisMonday = mondayOf(toDateStr(new Date()));
  const lastWeek = weekKeys[weekKeys.length - 1];
  const gapToNow = (new Date(thisMonday) - new Date(lastWeek)) / weekMs;

  let current = 0;
  if (gapToNow <= 1) {
    current = 1;
    for (let i = weekKeys.length - 1; i > 0; i--) {
      const gap = (new Date(weekKeys[i]) - new Date(weekKeys[i - 1])) / weekMs;
      if (gap === 1) current++; else break;
    }
  }

  return { current_streak_weeks: current, longest_streak_weeks: longest };
}

// ── Geldigheid PT-pakket / rittenkaart / fonds ───────────────────────────────
async function getGeldigheid(memberId) {
  const [rittenkaartRes, fondsRes, ptRes] = await Promise.all([
    db.execute({
      sql: `SELECT rk.*, t.naam AS type_naam
            FROM rittenkaarten rk
            JOIN rittenkaart_types t ON t.id = rk.type_id
            WHERE rk.user_id = ? AND rk.status = 'active' AND rk.ritten_resterend > 0
              AND (rk.vervaldatum IS NULL OR rk.vervaldatum >= date('now'))
            ORDER BY rk.created_at ASC LIMIT 1`,
      args: [memberId],
    }),
    db.execute({
      sql: `SELECT * FROM fonds_members WHERE user_id = ? AND status = 'active' AND end_date >= date('now') ORDER BY end_date ASC LIMIT 1`,
      args: [memberId],
    }),
    db.execute({
      sql: `SELECT * FROM pt_purchases WHERE user_id = ? AND status = 'paid' AND lessons_remaining > 0
              AND (expires_at IS NULL OR expires_at >= date('now'))
            ORDER BY (expires_at IS NULL), expires_at ASC, created_at ASC LIMIT 1`,
      args: [memberId],
    }),
  ]);

  const daysUntil = (dateStr) => dateStr ? Math.ceil((new Date(dateStr) - new Date(toDateStr(new Date()))) / 86400000) : null;

  const rittenkaart = rittenkaartRes.rows[0]
    ? {
        type_naam: rittenkaartRes.rows[0].type_naam,
        ritten_resterend: rittenkaartRes.rows[0].ritten_resterend,
        ritten_totaal: rittenkaartRes.rows[0].ritten_totaal,
        vervaldatum: rittenkaartRes.rows[0].vervaldatum,
        dagen_resterend: daysUntil(rittenkaartRes.rows[0].vervaldatum),
      }
    : null;

  const fonds = fondsRes.rows[0]
    ? {
        fonds_naam: fondsRes.rows[0].fonds_name || fondsRes.rows[0].fonds_type,
        end_date: fondsRes.rows[0].end_date,
        dagen_resterend: daysUntil(fondsRes.rows[0].end_date),
      }
    : null;

  const pt_package = ptRes.rows[0]
    ? {
        lessons_remaining: ptRes.rows[0].lessons_remaining,
        lessons_total: ptRes.rows[0].lessons_total,
        expires_at: ptRes.rows[0].expires_at,
        dagen_resterend: daysUntil(ptRes.rows[0].expires_at),
      }
    : null;

  return { rittenkaart, fonds, pt_package };
}

// ── Voeding week-compliance ───────────────────────────────────────────────────
async function getNutritionWeekStats(memberId) {
  const templateRes = await db.execute({
    sql: `SELECT * FROM nutrition_templates WHERE member_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1`,
    args: [memberId],
  });
  const template = templateRes.rows[0] || null;
  if (!template) return { template: null, compliance_pct: null };

  const meals = JSON.parse(template.meals || '[]');
  const since = toDateStr(new Date(Date.now() - 6 * 86400000));

  const logsRes = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM nutrition_logs WHERE template_id = ? AND member_id = ? AND date >= ? AND completed = 1`,
    args: [template.id, memberId, since],
  });
  const completed = Number(logsRes.rows[0].n);
  const expected  = meals.length * 7;

  return {
    template: { id: template.id, title: template.title },
    completed, expected,
    compliance_pct: expected > 0 ? Math.round((completed / expected) * 100) : null,
  };
}

// ── GET /api/voortgang/overview ───────────────────────────────────────────────
const getOverview = async (req, res) => {
  const memberId = req.user.id;

  const datesRes = await db.execute({
    sql: `SELECT DISTINCT date FROM attendance WHERE member_id = ? ORDER BY date`,
    args: [memberId],
  });
  const distinctDates = datesRes.rows.map(r => r.date);

  const today = toDateStr(new Date());
  const monday = mondayOf(today);
  const firstOfMonth = `${today.slice(0, 7)}-01`;

  const visitsThisWeek  = distinctDates.filter(d => d >= monday).length;
  const visitsThisMonth = distinctDates.filter(d => d >= firstOfMonth).length;

  const lastVisit = distinctDates.length ? distinctDates[distinctDates.length - 1] : null;
  const daysSinceLastVisit = lastVisit
    ? Math.floor((new Date(today) - new Date(lastVisit)) / 86400000)
    : null;

  const streaks = computeStreaks(distinctDates);
  const geldigheid = await getGeldigheid(memberId);
  const nutritionWeek = await getNutritionWeekStats(memberId);

  const isInactive = daysSinceLastVisit !== null && daysSinceLastVisit > 7;

  // Stuur (gededuplificeerd) een "we missen je" mail — max 1x per 3 dagen per lid
  if (isInactive) {
    try {
      const recentReminder = await db.execute({
        sql: `SELECT id FROM attendance_reminders WHERE member_id = ? AND sent_at >= datetime('now','-3 days') LIMIT 1`,
        args: [memberId],
      });
      if (!recentReminder.rows[0]) {
        const userRes = await db.execute({ sql: 'SELECT email, first_name FROM users WHERE id = ?', args: [memberId] });
        const u = userRes.rows[0];
        if (u) {
          sendInactivityReminderEmail({ to: u.email, firstName: u.first_name, daysSince: daysSinceLastVisit }).catch(() => {});
          await db.execute({ sql: 'INSERT INTO attendance_reminders (member_id) VALUES (?)', args: [memberId] });
        }
      }
    } catch (_) { /* e-mail is best-effort, mag nooit de overview blokkeren */ }
  }

  res.json({
    visits_this_week: visitsThisWeek,
    visits_this_month: visitsThisMonth,
    days_since_last_visit: daysSinceLastVisit,
    is_inactive: isInactive,
    ...streaks,
    geldigheid,
    nutrition_week: nutritionWeek,
  });
};

// ── GET /api/voortgang/attendance ─────────────────────────────────────────────
const getAttendanceHistory = async (req, res) => {
  const memberId = req.user.id;
  const historyRes = await db.execute({
    sql: `SELECT a.*, c.name AS class_name, c.instructor
          FROM attendance a
          LEFT JOIN classes c ON c.id = a.class_id
          WHERE a.member_id = ?
          ORDER BY a.date DESC, a.created_at DESC
          LIMIT 100`,
    args: [memberId],
  });
  res.json({ history: historyRes.rows });
};

// ── GET /api/voortgang/nutrition/today ────────────────────────────────────────
const getNutritionToday = async (req, res) => {
  const memberId = req.user.id;
  const templateRes = await db.execute({
    sql: `SELECT * FROM nutrition_templates WHERE member_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1`,
    args: [memberId],
  });
  const template = templateRes.rows[0];
  if (!template) return res.json({ template: null, meals: [], logs: {} });

  const meals = JSON.parse(template.meals || '[]');
  const today = toDateStr(new Date());

  const logsRes = await db.execute({
    sql: `SELECT meal_ref, completed, note FROM nutrition_logs WHERE template_id = ? AND member_id = ? AND date = ?`,
    args: [template.id, memberId, today],
  });
  const logs = {};
  for (const row of logsRes.rows) logs[row.meal_ref] = { completed: !!row.completed, note: row.note };

  res.json({
    template: { id: template.id, title: template.title },
    date: today,
    meals,
    logs,
  });
};

// ── GET /api/voortgang/nutrition/week ─────────────────────────────────────────
const getNutritionWeek = async (req, res) => {
  const stats = await getNutritionWeekStats(req.user.id);
  if (!stats.template) return res.json({ template: null, days: [] });

  const since = toDateStr(new Date(Date.now() - 6 * 86400000));
  const logsRes = await db.execute({
    sql: `SELECT date, COUNT(*) AS logged, SUM(completed) AS completed
          FROM nutrition_logs
          WHERE template_id = ? AND member_id = ? AND date >= ?
          GROUP BY date`,
    args: [stats.template.id, req.user.id, since],
  });
  const byDate = {};
  for (const r of logsRes.rows) byDate[r.date] = { logged: Number(r.logged), completed: Number(r.completed) };

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = toDateStr(new Date(Date.now() - i * 86400000));
    days.push({ date: d, ...(byDate[d] || { logged: 0, completed: 0 }) });
  }

  res.json({ template: stats.template, compliance_pct: stats.compliance_pct, days });
};

// ── POST /api/voortgang/nutrition/log ─────────────────────────────────────────
const logNutritionMeal = async (req, res) => {
  const memberId = req.user.id;
  const { date, meal_ref, completed, note } = req.body;
  if (!date || !meal_ref) return res.status(400).json({ error: 'date en meal_ref zijn verplicht.' });

  const templateRes = await db.execute({
    sql: `SELECT id FROM nutrition_templates WHERE member_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1`,
    args: [memberId],
  });
  const template = templateRes.rows[0];
  if (!template) return res.status(404).json({ error: 'Geen actief voedingsschema gevonden.' });

  await db.execute({
    sql: `INSERT INTO nutrition_logs (member_id, template_id, date, meal_ref, completed, note)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(member_id, template_id, date, meal_ref)
          DO UPDATE SET completed = excluded.completed, note = excluded.note, updated_at = datetime('now')`,
    args: [memberId, template.id, date, meal_ref, completed ? 1 : 0, note || null],
  });

  res.json({ message: 'Opgeslagen.' });
};

// ══════════════════════════════════════════════════════════════════════════
// Coach / admin
// ══════════════════════════════════════════════════════════════════════════

// ── GET /api/voortgang/admin/templates/:memberId ──────────────────────────────
const listMemberTemplates = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT * FROM nutrition_templates WHERE member_id = ? ORDER BY created_at DESC`,
    args: [req.params.memberId],
  });
  res.json({ templates: result.rows.map(t => ({ ...t, meals: JSON.parse(t.meals || '[]') })) });
};

// ── POST /api/voortgang/admin/templates ───────────────────────────────────────
const createTemplate = async (req, res) => {
  const { member_id, title, meals } = req.body;
  if (!member_id || !title) return res.status(400).json({ error: 'member_id en title zijn verplicht.' });

  const finalMeals = Array.isArray(meals) && meals.length ? meals : DEFAULT_MEALS;

  await db.execute({
    sql: `UPDATE nutrition_templates SET active = 0, updated_at = datetime('now') WHERE member_id = ? AND active = 1`,
    args: [member_id],
  });

  const result = await db.execute({
    sql: `INSERT INTO nutrition_templates (member_id, coach_id, title, meals, active) VALUES (?, ?, ?, ?, 1)`,
    args: [member_id, req.user.id, title.trim(), JSON.stringify(finalMeals)],
  });

  const created = await db.execute({ sql: 'SELECT * FROM nutrition_templates WHERE id = ?', args: [result.lastInsertRowid] });
  res.status(201).json({ template: { ...created.rows[0], meals: finalMeals } });
};

// ── PUT /api/voortgang/admin/templates/:id ────────────────────────────────────
const updateTemplate = async (req, res) => {
  const { title, meals, active } = req.body;

  const existingRes = await db.execute({ sql: 'SELECT * FROM nutrition_templates WHERE id = ?', args: [req.params.id] });
  const existing = existingRes.rows[0];
  if (!existing) return res.status(404).json({ error: 'Schema niet gevonden.' });

  if (active) {
    await db.execute({
      sql: `UPDATE nutrition_templates SET active = 0, updated_at = datetime('now') WHERE member_id = ? AND active = 1 AND id != ?`,
      args: [existing.member_id, req.params.id],
    });
  }

  await db.execute({
    sql: `UPDATE nutrition_templates SET
            title = COALESCE(?, title),
            meals = COALESCE(?, meals),
            active = COALESCE(?, active),
            updated_at = datetime('now')
          WHERE id = ?`,
    args: [title || null, meals ? JSON.stringify(meals) : null, active === undefined ? null : (active ? 1 : 0), req.params.id],
  });

  const updated = await db.execute({ sql: 'SELECT * FROM nutrition_templates WHERE id = ?', args: [req.params.id] });
  res.json({ template: { ...updated.rows[0], meals: JSON.parse(updated.rows[0].meals || '[]') } });
};

// ── DELETE /api/voortgang/admin/templates/:id  (deactiveren) ─────────────────
const deactivateTemplate = async (req, res) => {
  await db.execute({
    sql: `UPDATE nutrition_templates SET active = 0, updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Schema gedeactiveerd.' });
};

// ── PUT /api/voortgang/admin/bookings/:id/checkin  (groepsles) ────────────────
const checkinClassBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: `SELECT b.*, c.date_time FROM bookings b JOIN classes c ON c.id = b.class_id WHERE b.id = ?`,
    args: [req.params.id],
  });
  const booking = bookingRes.rows[0];
  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });
  if (booking.status === 'attended') return res.json({ message: 'Al ingecheckt.' });
  if (booking.status !== 'confirmed') return res.status(400).json({ error: 'Alleen bevestigde boekingen kunnen worden ingecheckt.' });

  await db.batch([
    { sql: `UPDATE bookings SET status = 'attended' WHERE id = ?`, args: [booking.id] },
    { sql: `INSERT INTO attendance (member_id, date, class_id, source) VALUES (?, ?, ?, 'class')`,
      args: [booking.user_id, toDateStr(booking.date_time), booking.class_id] },
  ], 'write');

  res.json({ message: 'Ingecheckt.' });
};

// ── PUT /api/voortgang/admin/pt-bookings/:id/complete  (PT-afspraak) ──────────
const completePtBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: `SELECT b.*, s.date_time FROM pt_bookings b JOIN pt_slots s ON s.id = b.slot_id WHERE b.id = ?`,
    args: [req.params.id],
  });
  const booking = bookingRes.rows[0];
  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });
  if (booking.status === 'completed') return res.json({ message: 'Al voltooid.' });
  if (booking.status !== 'confirmed') return res.status(400).json({ error: 'Alleen bevestigde afspraken kunnen worden voltooid.' });

  await db.batch([
    { sql: `UPDATE pt_bookings SET status = 'completed', updated_at = datetime('now') WHERE id = ?`, args: [booking.id] },
    { sql: `INSERT INTO attendance (member_id, date, class_id, source) VALUES (?, ?, NULL, 'pt')`,
      args: [booking.user_id, toDateStr(booking.date_time)] },
  ], 'write');

  res.json({ message: 'Voltooid.' });
};

module.exports = {
  getOverview, getAttendanceHistory,
  getNutritionToday, getNutritionWeek, logNutritionMeal,
  listMemberTemplates, createTemplate, updateTemplate, deactivateTemplate,
  checkinClassBooking, completePtBooking,
  DEFAULT_MEALS,
};
