/**
 * Vrij Trainen controller — slot-based systeem
 *
 * Admin maakt beschikbare slots aan.
 * Leden sturen een aanvraag (request) voor een slot.
 * Admin bevestigt of weigert de aanvraag.
 * Admin kan ook direct een lid boeken.
 */
const db = require('../config/database');
const { sendPush } = require('./ptController');
const { sendEmail } = require('../services/emailService');

// ── Admin: VT Slot Management ───────────────────────────────────────────────

const createSlot = async (req, res) => {
  const { date, start_time, end_time, max_bookings, notes } = req.body;
  if (!date || !start_time || !end_time) {
    return res.status(400).json({ error: 'date, start_time en end_time zijn verplicht.' });
  }

  const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const startMins = toMins(start_time);
  const endMins   = toMins(end_time);

  if (startMins >= endMins) {
    return res.status(400).json({ error: 'Eindtijd moet na begintijd liggen.' });
  }

  const maxB = max_bookings || 10;
  const notesVal = notes || null;

  // If block > 1 hour, auto-expand into individual 1-hour sub-slots
  if (endMins - startMins > 60) {
    const created = [];
    for (let m = startMins; m < endMins; m += 60) {
      const slotEnd = Math.min(m + 60, endMins);
      const r = await db.execute({
        sql: `INSERT INTO vt_slots (date, start_time, end_time, max_bookings, notes) VALUES (?, ?, ?, ?, ?)`,
        args: [date, toTime(m), toTime(slotEnd), maxB, notesVal],
      });
      created.push({ id: Number(r.lastInsertRowid), date, start_time: toTime(m), end_time: toTime(slotEnd), max_bookings: maxB, status: 'available' });
    }
    return res.status(201).json({ slots: created, count: created.length });
  }

  // Single 1-hour (or less) slot
  const result = await db.execute({
    sql: `INSERT INTO vt_slots (date, start_time, end_time, max_bookings, notes) VALUES (?, ?, ?, ?, ?)`,
    args: [date, start_time, end_time, maxB, notesVal],
  });
  const slot = await db.execute({ sql: 'SELECT * FROM vt_slots WHERE id = ?', args: [result.lastInsertRowid] });
  return res.status(201).json({ slot: slot.rows[0], slots: [slot.rows[0]], count: 1 });
};

const deleteSlot = async (req, res) => {
  // Cancel all pending bookings for this slot
  await db.execute({
    sql: `UPDATE vrij_trainen_bookings SET status = 'cancelled', updated_at = datetime('now') WHERE slot_id = ? AND status IN ('requested','confirmed')`,
    args: [req.params.id],
  });
  await db.execute({ sql: 'DELETE FROM vt_slots WHERE id = ?', args: [req.params.id] });
  res.json({ message: 'Slot verwijderd.' });
};

const adminListSlots = async (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT s.*,
           (SELECT COUNT(*) FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.status IN ('requested','confirmed')) AS booking_count,
           (SELECT COUNT(*) FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed') AS confirmed_count,
           (SELECT COUNT(*) FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.status = 'requested') AS pending_count
    FROM vt_slots s
    WHERE 1=1
  `;
  const args = [];
  if (from) { sql += ' AND s.date >= ?'; args.push(from); }
  if (to)   { sql += ' AND s.date <= ?'; args.push(to); }
  sql += ' ORDER BY s.date, s.start_time';

  const slots = await db.execute({ sql, args });

  // Load bookings for each slot
  if (slots.rows.length > 0) {
    const slotIds = slots.rows.map(s => s.id);
    const bookings = await db.execute({
      sql: `SELECT vb.*, u.first_name, u.last_name, u.email
            FROM vrij_trainen_bookings vb
            JOIN users u ON u.id = vb.user_id
            WHERE vb.slot_id IN (${slotIds.map(() => '?').join(',')})
              AND vb.status IN ('requested','confirmed')
            ORDER BY vb.status DESC, vb.created_at`,
      args: slotIds,
    });

    const bySlot = {};
    bookings.rows.forEach(b => {
      if (!bySlot[b.slot_id]) bySlot[b.slot_id] = [];
      bySlot[b.slot_id].push(b);
    });

    return res.json({ slots: slots.rows.map(s => ({ ...s, bookings: bySlot[s.id] || [] })) });
  }

  res.json({ slots: [] });
};

const confirmBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: `SELECT vb.*, u.email, u.first_name, s.date, s.start_time, s.end_time
          FROM vrij_trainen_bookings vb
          JOIN users u ON u.id = vb.user_id
          JOIN vt_slots s ON s.id = vb.slot_id
          WHERE vb.id = ?`,
    args: [req.params.id],
  });
  const b = bookingRes.rows[0];
  if (!b) return res.status(404).json({ error: 'Boeking niet gevonden.' });

  await db.execute({
    sql: `UPDATE vrij_trainen_bookings SET status = 'confirmed', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });

  // Notify member
  await sendPush(b.user_id, '✅ Vrij Trainen bevestigd!', `Je sessie op ${b.date} ${b.start_time}–${b.end_time} is bevestigd.`).catch(() => {});
  await sendEmail({
    to: b.email,
    subject: 'Vrij Trainen bevestigd — MHGym',
    html: `<p>Hoi ${b.first_name},</p><p>Je Vrij Trainen sessie op <strong>${b.date}</strong> van ${b.start_time} tot ${b.end_time} is bevestigd!</p><p>Tot snel,<br/>Team MHGym</p>`,
  }).catch(() => {});

  res.json({ message: 'Boeking bevestigd.' });
};

const declineBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: `SELECT vb.*, u.email, u.first_name FROM vrij_trainen_bookings vb JOIN users u ON u.id = vb.user_id WHERE vb.id = ?`,
    args: [req.params.id],
  });
  const b = bookingRes.rows[0];
  if (!b) return res.status(404).json({ error: 'Boeking niet gevonden.' });

  await db.execute({
    sql: `UPDATE vrij_trainen_bookings SET status = 'declined', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });

  await sendPush(b.user_id, '❌ VT aanvraag afgewezen', 'Je Vrij Trainen aanvraag is helaas niet bevestigd. Kies een ander slot.').catch(() => {});

  res.json({ message: 'Boeking geweigerd.' });
};

const directBookMember = async (req, res) => {
  const { user_id, notes } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is verplicht.' });

  const slotRes = await db.execute({ sql: 'SELECT * FROM vt_slots WHERE id = ?', args: [req.params.id] });
  const slot = slotRes.rows[0];
  if (!slot) return res.status(404).json({ error: 'Slot niet gevonden.' });

  // Check if already booked
  const existing = await db.execute({
    sql: `SELECT id FROM vrij_trainen_bookings WHERE slot_id = ? AND user_id = ? AND status IN ('requested','confirmed')`,
    args: [req.params.id, user_id],
  });
  if (existing.rows[0]) return res.status(409).json({ error: 'Dit lid heeft al een boeking voor dit slot.' });

  // Check capacity
  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as n FROM vrij_trainen_bookings WHERE slot_id = ? AND status IN ('requested','confirmed')`,
    args: [req.params.id],
  });
  if (Number(countRes.rows[0].n) >= slot.max_bookings) {
    return res.status(409).json({ error: 'Slot is vol.' });
  }

  await db.execute({
    sql: `INSERT INTO vrij_trainen_bookings (user_id, slot_id, date, start_time, end_time, notes, status) VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
    args: [user_id, req.params.id, slot.date, slot.start_time, slot.end_time, notes || null],
  });

  await sendPush(user_id, '✅ Vrij Trainen ingepland!', `Je bent ingepland op ${slot.date} ${slot.start_time}–${slot.end_time}.`).catch(() => {});

  res.status(201).json({ message: 'Lid direct geboekt.' });
};

const adminDeleteBooking = async (req, res) => {
  await db.execute({
    sql: `UPDATE vrij_trainen_bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Boeking verwijderd.' });
};

// ── Member: VT Slot Booking ────────────────────────────────────────────────

/**
 * Haal beschikbare VT slots op voor de huidige gebruiker.
 * Per slot wordt de status van de huidige gebruiker meegestuurd.
 */
const getSlots = async (req, res) => {
  const { from, to } = req.query;
  const userId = req.user.id;

  let sql = `
    SELECT s.*,
           (SELECT COUNT(*) FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.status IN ('requested','confirmed')) AS booking_count,
           (SELECT status  FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.user_id = ? AND b.status NOT IN ('cancelled','declined')) AS my_status,
           (SELECT id      FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.user_id = ? AND b.status NOT IN ('cancelled','declined')) AS my_booking_id
    FROM vt_slots s
    WHERE s.status = 'available'
  `;
  const args = [userId, userId];

  if (from) { sql += ' AND s.date >= ?'; args.push(from); }
  if (to)   { sql += ' AND s.date <= ?'; args.push(to); }
  sql += ' ORDER BY s.date, s.start_time';

  const result = await db.execute({ sql, args });
  res.json({ slots: result.rows });
};

/**
 * Lid vraagt een VT slot aan (status: 'requested').
 */
const requestSlot = async (req, res) => {
  const { notes } = req.body;
  const userId = req.user.id;

  const slotRes = await db.execute({ sql: 'SELECT * FROM vt_slots WHERE id = ?', args: [req.params.id] });
  const slot = slotRes.rows[0];
  if (!slot) return res.status(404).json({ error: 'Slot niet gevonden.' });
  if (slot.status !== 'available') return res.status(400).json({ error: 'Dit slot is niet beschikbaar.' });

  // In het verleden?
  if (new Date(`${slot.date}T${slot.start_time}`) < new Date()) {
    return res.status(400).json({ error: 'Dit slot is al voorbij.' });
  }

  // ── Max 1 uur per sessie ────────────────────────────────────────────────────
  const [sh, sm] = slot.start_time.split(':').map(Number);
  const [eh, em] = slot.end_time.split(':').map(Number);
  const durationMin = (eh * 60 + em) - (sh * 60 + sm);
  if (durationMin > 60) {
    return res.status(400).json({ error: 'Je kunt maximaal 1 uur per sessie boeken.' });
  }

  // ── Max 3 sessies per week ──────────────────────────────────────────────────
  const slotDate   = new Date(slot.date + 'T12:00:00'); // noon vermijdt timezone-shift
  const dow        = slotDate.getDay() || 7;
  const weekMon    = new Date(slotDate);
  weekMon.setDate(slotDate.getDate() - dow + 1);
  const weekSun    = new Date(weekMon);
  weekSun.setDate(weekMon.getDate() + 6);
  const toLocal    = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const weekCount  = await db.execute({
    sql: `SELECT COUNT(*) as n FROM vrij_trainen_bookings
          WHERE user_id = ? AND status IN ('requested','confirmed')
            AND date >= ? AND date <= ?`,
    args: [userId, toLocal(weekMon), toLocal(weekSun)],
  });
  if (Number(weekCount.rows[0].n) >= 3) {
    return res.status(400).json({ error: 'Je hebt je weeklimiet van 3x vrij trainen bereikt.' });
  }

  // Al een aanvraag/boeking?
  const existing = await db.execute({
    sql: `SELECT id FROM vrij_trainen_bookings WHERE slot_id = ? AND user_id = ? AND status NOT IN ('cancelled','declined')`,
    args: [req.params.id, userId],
  });
  if (existing.rows[0]) return res.status(409).json({ error: 'Je hebt al een aanvraag of boeking voor dit slot.' });

  // Vol?
  const countRes = await db.execute({
    sql: `SELECT COUNT(*) as n FROM vrij_trainen_bookings WHERE slot_id = ? AND status IN ('requested','confirmed')`,
    args: [req.params.id],
  });
  if (Number(countRes.rows[0].n) >= slot.max_bookings) {
    return res.status(409).json({ error: 'Dit slot is vol.' });
  }

  await db.execute({
    sql: `INSERT INTO vrij_trainen_bookings (user_id, slot_id, date, start_time, end_time, notes, status) VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
    args: [userId, req.params.id, slot.date, slot.start_time, slot.end_time, notes || null],
  });

  // Bevestiging direct naar het lid
  await sendPush(userId, '✅ Vrij Trainen geboekt!', `Je sessie op ${slot.date} ${slot.start_time}–${slot.end_time} is bevestigd.`).catch(() => {});

  res.status(201).json({ message: 'Je bent direct geboekt! Tot snel bij MHGym.' });
};

/**
 * Lid annuleert zijn aanvraag of bevestigde boeking.
 */
const cancelRequest = async (req, res) => {
  const bookingRes = await db.execute({
    sql: 'SELECT * FROM vrij_trainen_bookings WHERE id = ? AND user_id = ?',
    args: [req.params.id, req.user.id],
  });
  const booking = bookingRes.rows[0];
  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });
  if (!['requested', 'confirmed'].includes(booking.status)) {
    return res.status(400).json({ error: 'Deze boeking kan niet meer worden geannuleerd.' });
  }

  // 2-uurs regel voor bevestigde boekingen
  if (booking.status === 'confirmed') {
    const hoursUntil = (new Date(`${booking.date}T${booking.start_time}`) - new Date()) / 3600000;
    if (hoursUntil < 2) {
      return res.status(400).json({ error: 'Annuleren niet meer mogelijk binnen 2 uur voor de sessie.' });
    }
  }

  await db.execute({
    sql: `UPDATE vrij_trainen_bookings SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    args: [booking.id],
  });
  res.json({ message: 'Aanvraag/boeking geannuleerd.' });
};

/**
 * Mijn lopende VT boekingen (aangevraagd + bevestigd)
 */
const myBookings = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT vb.*, s.notes AS slot_notes, s.max_bookings
          FROM vrij_trainen_bookings vb
          LEFT JOIN vt_slots s ON s.id = vb.slot_id
          WHERE vb.user_id = ? AND vb.status IN ('requested','confirmed')
          ORDER BY vb.date DESC, vb.start_time DESC LIMIT 50`,
    args: [req.user.id],
  });
  res.json({ bookings: result.rows });
};

module.exports = {
  // Admin
  createSlot, deleteSlot, adminListSlots, confirmBooking, declineBooking, directBookMember, adminDeleteBooking,
  // Member
  getSlots, requestSlot, cancelRequest, myBookings,
};
