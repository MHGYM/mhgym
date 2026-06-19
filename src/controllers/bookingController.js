const db = require('../config/database');

// GET /api/bookings  — eigen boekingen van ingelogde user
const myBookings = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT b.*, c.name AS class_name, c.instructor, c.date_time,
                 c.duration_minutes, c.category, c.location
          FROM bookings b
          JOIN classes c ON c.id = b.class_id
          WHERE b.user_id = ?
          ORDER BY c.date_time DESC`,
    args: [req.user.id],
  });
  res.json({ bookings: result.rows });
};

// POST /api/bookings  — reserveer een les
const createBooking = async (req, res) => {
  const { class_id } = req.body;

  // Controleer of de les bestaat en beschikbaar is
  const clsRes = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [class_id] });
  const cls = clsRes.rows[0];
  if (!cls) return res.status(404).json({ error: 'Les niet gevonden.' });
  if (cls.status !== 'scheduled') return res.status(400).json({ error: 'Deze les is niet beschikbaar.' });
  if (cls.current_bookings >= cls.max_capacity) return res.status(400).json({ error: 'Les is vol.' });

  // Controleer actief lidmaatschap
  const membershipRes = await db.execute({
    sql: `SELECT um.*, m.max_bookings_per_month
          FROM user_memberships um
          JOIN memberships m ON m.id = um.membership_id
          WHERE um.user_id = ? AND (um.status = 'active' OR um.status = 'cancelling')
            AND (um.cancels_at IS NULL OR um.cancels_at >= date('now'))
          ORDER BY um.created_at DESC LIMIT 1`,
    args: [req.user.id],
  });
  const membership = membershipRes.rows[0];

  let hasRittenkaart = false;
  if (!membership) {
    const kaartRes = await db.execute({
      sql: `SELECT id FROM rittenkaarten
            WHERE user_id = ? AND status = 'active' AND ritten_resterend > 0
              AND (vervaldatum IS NULL OR vervaldatum >= date('now'))
            LIMIT 1`,
      args: [req.user.id],
    });
    if (!kaartRes.rows[0]) {
      return res.status(403).json({ error: 'Geen actief lidmaatschap of rittenkaart. Sluit eerst een abonnement af of koop een rittenkaart.' });
    }
    hasRittenkaart = true;
  }

  // Controleer maandlimiet (−1 = onbeperkt voor VIP; niet van toepassing op rittenkaart)
  if (!hasRittenkaart && membership.max_bookings_per_month !== -1) {
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const usedRes = await db.execute({
      sql: `SELECT COUNT(*) AS cnt FROM bookings
            WHERE user_id = ? AND status = 'confirmed' AND booked_at >= ?`,
      args: [req.user.id, firstOfMonth.toISOString()],
    });
    const used = Number(usedRes.rows[0].cnt);

    if (used >= membership.max_bookings_per_month) {
      return res.status(403).json({
        error: `Je hebt je limiet van ${membership.max_bookings_per_month} lessen deze maand bereikt.`,
      });
    }
  }

  // Voorkomen van dubbele boeking
  const dupRes = await db.execute({
    sql: `SELECT id FROM bookings WHERE user_id = ? AND class_id = ? AND status = 'confirmed'`,
    args: [req.user.id, class_id],
  });
  if (dupRes.rows[0]) return res.status(409).json({ error: 'Je hebt deze les al geboekt.' });

  // Boek de les (batch = transactie)
  const batchResult = await db.batch([
    { sql: 'INSERT INTO bookings (user_id, class_id) VALUES (?, ?)', args: [req.user.id, class_id] },
    { sql: 'UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = ?', args: [class_id] },
  ], 'write');

  const bookingId = batchResult[0].lastInsertRowid;
  const bookingRes = await db.execute({
    sql: `SELECT b.*, c.name AS class_name, c.instructor, c.date_time, c.location
          FROM bookings b JOIN classes c ON c.id = b.class_id WHERE b.id = ?`,
    args: [bookingId],
  });

  res.status(201).json({ booking: bookingRes.rows[0] });
};

// DELETE /api/bookings/:id  — annuleer boeking
const cancelBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: 'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
    args: [req.params.id, req.user.id],
  });
  const booking = bookingRes.rows[0];

  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Boeking is al geannuleerd.' });

  // Annuleringstermijn: minimaal 2 uur van tevoren
  const clsRes = await db.execute({ sql: 'SELECT date_time FROM classes WHERE id = ?', args: [booking.class_id] });
  const classTime = new Date(clsRes.rows[0].date_time);
  const hoursUntilClass = (classTime - new Date()) / (1000 * 60 * 60);

  if (hoursUntilClass < 2) {
    return res.status(400).json({ error: 'Annulering is niet meer mogelijk binnen 2 uur voor de les.' });
  }

  await db.batch([
    {
      sql: `UPDATE bookings SET status = 'cancelled', cancelled_at = datetime('now') WHERE id = ?`,
      args: [booking.id],
    },
    {
      sql: 'UPDATE classes SET current_bookings = MAX(0, current_bookings - 1) WHERE id = ?',
      args: [booking.class_id],
    },
  ], 'write');

  res.json({ message: 'Boeking geannuleerd.' });
};

// GET /api/bookings/admin  (admin) — alle boekingen
const allBookings = async (req, res) => {
  const { class_id, user_id } = req.query;
  let sql = `SELECT b.*, u.first_name, u.last_name, u.email,
             c.name AS class_name, c.date_time
             FROM bookings b
             JOIN users u ON u.id = b.user_id
             JOIN classes c ON c.id = b.class_id WHERE 1=1`;
  const args = [];
  if (class_id) { sql += ' AND b.class_id = ?'; args.push(class_id); }
  if (user_id)  { sql += ' AND b.user_id = ?';  args.push(user_id);  }
  sql += ' ORDER BY b.booked_at DESC';

  const result = await db.execute({ sql, args });
  res.json({ bookings: result.rows });
};

module.exports = { myBookings, createBooking, cancelBooking, allBookings };
