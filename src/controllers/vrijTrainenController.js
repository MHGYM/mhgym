/**
 * Vrij Trainen controller
 *
 * POST   /api/vt/bookings           — boek een vrij-trainen slot
 * GET    /api/vt/bookings           — mijn boekingen
 * DELETE /api/vt/bookings/:id       — annuleer boeking (>2h van tevoren)
 * GET    /api/vt/bookings/admin     — admin: alle VT boekingen
 * DELETE /api/vt/bookings/:id/admin — admin: verwijder boeking
 */
const db = require('../config/database');

// Sportschool open 08:00 – 22:00
const GYM_OPEN  = 8;
const GYM_CLOSE = 22;

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const myBookings = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT * FROM vrij_trainen_bookings WHERE user_id = ? ORDER BY date DESC, start_time DESC LIMIT 50`,
    args: [req.user.id],
  });
  res.json({ bookings: result.rows });
};

const createBooking = async (req, res) => {
  const { date, start_time, end_time, notes } = req.body;
  if (!date || !start_time || !end_time) {
    return res.status(400).json({ error: 'date, start_time en end_time zijn verplicht.' });
  }

  // Valideer openingstijden
  const startMin = timeToMinutes(start_time);
  const endMin   = timeToMinutes(end_time);
  if (startMin < GYM_OPEN * 60)  return res.status(400).json({ error: 'Sportschool is pas open vanaf 08:00.' });
  if (endMin > GYM_CLOSE * 60)   return res.status(400).json({ error: 'Sportschool sluit om 22:00.' });
  if (endMin <= startMin)         return res.status(400).json({ error: 'Eindtijd moet na starttijd zijn.' });

  // Max 1 boeking per dag
  const existingDay = await db.execute({
    sql: `SELECT id FROM vrij_trainen_bookings WHERE user_id = ? AND date = ? AND status = 'confirmed'`,
    args: [req.user.id, date],
  });
  if (existingDay.rows[0]) {
    return res.status(409).json({ error: 'Je hebt al een vrij-trainen boeking voor deze dag.' });
  }

  // Datum mag niet in het verleden zijn
  const bookingDt = new Date(`${date}T${start_time}`);
  if (bookingDt < new Date()) return res.status(400).json({ error: 'Je kunt geen boeking in het verleden maken.' });

  const result = await db.execute({
    sql: `INSERT INTO vrij_trainen_bookings (user_id, date, start_time, end_time, notes) VALUES (?, ?, ?, ?, ?)`,
    args: [req.user.id, date, start_time, end_time, notes || null],
  });

  const booking = await db.execute({ sql: 'SELECT * FROM vrij_trainen_bookings WHERE id = ?', args: [result.lastInsertRowid] });
  res.status(201).json({ booking: booking.rows[0] });
};

const cancelBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: 'SELECT * FROM vrij_trainen_bookings WHERE id = ? AND user_id = ?',
    args: [req.params.id, req.user.id],
  });
  const booking = bookingRes.rows[0];
  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Al geannuleerd.' });

  const hoursUntil = (new Date(`${booking.date}T${booking.start_time}`) - new Date()) / 3600000;
  if (hoursUntil < 2) {
    return res.status(400).json({ error: 'Annuleren niet mogelijk binnen 2 uur voor de sessie.' });
  }

  await db.execute({
    sql: `UPDATE vrij_trainen_bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    args: [booking.id],
  });
  res.json({ message: 'Boeking geannuleerd.' });
};

const adminListBookings = async (req, res) => {
  const { from, to } = req.query;
  let sql  = `SELECT vb.*, u.first_name, u.last_name, u.email
              FROM vrij_trainen_bookings vb
              JOIN users u ON u.id = vb.user_id
              WHERE vb.status = 'confirmed'`;
  const args = [];
  if (from) { sql += ' AND vb.date >= ?'; args.push(from); }
  if (to)   { sql += ' AND vb.date <= ?'; args.push(to); }
  sql += ' ORDER BY vb.date DESC, vb.start_time DESC';
  const result = await db.execute({ sql, args });
  res.json({ bookings: result.rows });
};

const adminDeleteBooking = async (req, res) => {
  await db.execute({
    sql: `UPDATE vrij_trainen_bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Boeking verwijderd.' });
};

module.exports = { myBookings, createBooking, cancelBooking, adminListBookings, adminDeleteBooking };
