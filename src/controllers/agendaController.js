/**
 * Agenda controller — haalt alle agenda-items op voor de weekweergave
 *
 * GET /api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Geeft groepslessen, PT boekingen, VT slots + boekingen terug
 *   Admin: ziet alles van alle leden, alle VT slots met bookings
 *   Lid:   ziet groepslessen + eigen boekingen + beschikbare VT slots met eigen status
 */
const db = require('../config/database');

const getAgenda = async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from en to zijn verplicht (YYYY-MM-DD).' });

  const isAdmin = req.user.role === 'admin';
  const userId  = req.user.id;

  // ── Groepslessen ────────────────────────────────────────────────────────────
  const classRes = await db.execute({
    sql: `SELECT c.*,
                 (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'confirmed') AS confirmed_bookings,
                 (SELECT 1 FROM bookings b WHERE b.class_id = c.id AND b.user_id = ? AND b.status = 'confirmed') AS i_booked
          FROM classes c
          WHERE c.date_time >= ? AND c.date_time < ?
            AND c.status = 'scheduled'
          ORDER BY c.date_time`,
    args: [userId, from + 'T00:00:00', to + 'T23:59:59'],
  });

  // ── PT boekingen ────────────────────────────────────────────────────────────
  const ptSql = isAdmin
    ? `SELECT pb.*, ps.date_time, ps.duration_minutes, ps.trainer,
              u.first_name, u.last_name, u.email
       FROM pt_bookings pb
       JOIN pt_slots ps ON ps.id = pb.slot_id
       JOIN users u ON u.id = pb.user_id
       WHERE pb.status NOT IN ('cancelled','declined')
         AND ps.date_time >= ? AND ps.date_time < ?
       ORDER BY ps.date_time`
    : `SELECT pb.*, ps.date_time, ps.duration_minutes, ps.trainer
       FROM pt_bookings pb
       JOIN pt_slots ps ON ps.id = pb.slot_id
       WHERE pb.user_id = ?
         AND pb.status NOT IN ('cancelled','declined')
         AND ps.date_time >= ? AND ps.date_time < ?
       ORDER BY ps.date_time`;

  const ptArgs = isAdmin
    ? [from + 'T00:00:00', to + 'T23:59:59']
    : [userId, from + 'T00:00:00', to + 'T23:59:59'];

  const ptRes = await db.execute({ sql: ptSql, args: ptArgs });

  // ── PT beschikbare slots (admin aangemaakt, nog niet geboekt) ───────────────
  const ptAvailableSql = isAdmin
    ? `SELECT ps.*, 'available' AS booking_status,
              NULL AS user_first_name, NULL AS user_last_name
       FROM pt_slots ps
       WHERE ps.status = 'available'
         AND NOT EXISTS (SELECT 1 FROM pt_bookings pb WHERE pb.slot_id = ps.id AND pb.status NOT IN ('cancelled','declined'))
         AND ps.date_time >= ? AND ps.date_time < ?
       ORDER BY ps.date_time`
    : null; // leden zien geen beschikbare PT slots (ze boeken via PT pagina)

  let ptAvailableRows = [];
  if (isAdmin) {
    const r = await db.execute({ sql: ptAvailableSql, args: [from + 'T00:00:00', to + 'T23:59:59'] });
    ptAvailableRows = r.rows;
  }

  // ── VT slots ────────────────────────────────────────────────────────────────
  let vtSlots = [];

  if (isAdmin) {
    // Admin ziet alle slots met al hun boekingen
    const slotRes = await db.execute({
      sql: `SELECT s.*,
                   (SELECT COUNT(*) FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.status IN ('requested','confirmed')) AS booking_count,
                   (SELECT COUNT(*) FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.status = 'requested') AS pending_count,
                   (SELECT COUNT(*) FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.status = 'confirmed') AS confirmed_count
            FROM vt_slots s
            WHERE s.date >= ? AND s.date <= ?
            ORDER BY s.date, s.start_time`,
      args: [from, to],
    });

    if (slotRes.rows.length > 0) {
      const slotIds = slotRes.rows.map(s => s.id);
      const bookings = await db.execute({
        sql: `SELECT vb.*, u.first_name, u.last_name
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

      vtSlots = slotRes.rows.map(s => ({
        ...s,
        bookings: bySlot[s.id] || [],
        type: 'vt_slot',
      }));
    } else {
      vtSlots = [];
    }
  } else {
    // Lid: beschikbare slots + eigen booking-status per slot
    const slotRes = await db.execute({
      sql: `SELECT s.*,
                   (SELECT COUNT(*) FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.status IN ('requested','confirmed')) AS booking_count,
                   (SELECT status FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.user_id = ? AND b.status NOT IN ('cancelled','declined')) AS my_status,
                   (SELECT id FROM vrij_trainen_bookings b WHERE b.slot_id = s.id AND b.user_id = ? AND b.status NOT IN ('cancelled','declined')) AS my_booking_id
            FROM vt_slots s
            WHERE s.status = 'available'
              AND s.date >= ? AND s.date <= ?
            ORDER BY s.date, s.start_time`,
      args: [userId, userId, from, to],
    });
    vtSlots = slotRes.rows.map(s => ({ ...s, type: 'vt_slot' }));
  }

  // ── Weekgebruik VT (voor leden) ─────────────────────────────────────────────
  let vtWeekUsage = 0;
  if (!isAdmin) {
    const now      = new Date();
    const dow      = now.getDay() || 7;
    const monday   = new Date(now);
    monday.setDate(now.getDate() - dow + 1);
    const sunday   = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const toLocal  = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const weekRes  = await db.execute({
      sql: `SELECT COUNT(*) as n FROM vrij_trainen_bookings
            WHERE user_id = ? AND status IN ('requested','confirmed')
              AND date >= ? AND date <= ?`,
      args: [userId, toLocal(monday), toLocal(sunday)],
    });
    vtWeekUsage = Number(weekRes.rows[0].n);
  }

  res.json({
    classes:          classRes.rows,
    pt_bookings:      ptRes.rows,
    pt_available:     ptAvailableRows,
    vt_slots:         vtSlots,
    vt_week_usage:    vtWeekUsage,
    vt_week_limit:    3,
  });
};

module.exports = { getAgenda };
