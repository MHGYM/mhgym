const db = require('../config/database');

// GET /api/classes  — publiek, optioneel filter ?category=yoga&from=2025-06-01
const listClasses = async (req, res) => {
  const { category, from, to } = req.query;

  let sql = `SELECT c.*, (c.max_capacity - c.current_bookings) AS spots_left
             FROM classes c WHERE c.status = 'scheduled'`;
  const args = [];

  if (category) { sql += ' AND c.category = ?'; args.push(category); }
  if (from)     { sql += ' AND c.date_time >= ?'; args.push(from); }
  if (to)       { sql += ' AND c.date_time <= ?'; args.push(to); }
  sql += ' ORDER BY c.date_time ASC';

  const result = await db.execute({ sql, args });
  res.json({ classes: result.rows });
};

// GET /api/classes/:id
const getClass = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT c.*, (c.max_capacity - c.current_bookings) AS spots_left
          FROM classes c WHERE c.id = ?`,
    args: [req.params.id],
  });

  if (!result.rows[0]) return res.status(404).json({ error: 'Les niet gevonden.' });
  res.json({ class: result.rows[0] });
};

// POST /api/classes  (admin)
const createClass = async (req, res) => {
  const { name, description, instructor, category, date_time, duration_minutes, max_capacity, location } = req.body;

  const result = await db.execute({
    sql: `INSERT INTO classes (name, description, instructor, category, date_time, duration_minutes, max_capacity, location)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [name, description || null, instructor, category, date_time, duration_minutes || 60, max_capacity || 20, location || 'Studio 1'],
  });

  const cls = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [result.lastInsertRowid] });
  res.status(201).json({ class: cls.rows[0] });
};

// PUT /api/classes/:id  (admin)
const updateClass = async (req, res) => {
  const existing = await db.execute({ sql: 'SELECT id FROM classes WHERE id = ?', args: [req.params.id] });
  if (!existing.rows[0]) return res.status(404).json({ error: 'Les niet gevonden.' });

  const { name, description, instructor, category, date_time, duration_minutes, max_capacity, location, status } = req.body;

  await db.execute({
    sql: `UPDATE classes SET
            name = COALESCE(?, name),
            description = COALESCE(?, description),
            instructor = COALESCE(?, instructor),
            category = COALESCE(?, category),
            date_time = COALESCE(?, date_time),
            duration_minutes = COALESCE(?, duration_minutes),
            max_capacity = COALESCE(?, max_capacity),
            location = COALESCE(?, location),
            status = COALESCE(?, status),
            updated_at = datetime('now')
          WHERE id = ?`,
    args: [name ?? null, description ?? null, instructor ?? null, category ?? null, date_time ?? null,
           duration_minutes ?? null, max_capacity ?? null, location ?? null, status ?? null, req.params.id],
  });

  const updated = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [req.params.id] });
  res.json({ class: updated.rows[0] });
};

// DELETE /api/classes/:id  (admin) — sets status to cancelled
const cancelClass = async (req, res) => {
  const existing = await db.execute({ sql: 'SELECT id FROM classes WHERE id = ?', args: [req.params.id] });
  if (!existing.rows[0]) return res.status(404).json({ error: 'Les niet gevonden.' });

  await db.execute({
    sql: `UPDATE classes SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Les geannuleerd.' });
};

module.exports = { listClasses, getClass, createClass, updateClass, cancelClass };
