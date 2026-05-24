/**
 * Agenda controller — haalt alle agenda-items op voor de weekweergave
 *
 * GET /api/agenda?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Geeft groepslessen, PT boekingen, vrij-trainen boekingen terug
 *   Admin: ziet alles van alle leden
 *   Lid:   ziet groepslessen + eigen boekingen + VT beschikbaarheid
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

  // ── Vrij trainen boekingen ──────────────────────────────────────────────────
  const vtSql = isAdmin
    ? `SELECT vb.*, u.first_name, u.last_name, u.email
       FROM vrij_trainen_bookings vb
       JOIN users u ON u.id = vb.user_id
       WHERE vb.date >= ? AND vb.date <= ?
         AND vb.status = 'confirmed'
       ORDER BY vb.date, vb.start_time`
    : `SELECT vb.*
       FROM vrij_trainen_bookings vb
       WHERE vb.user_id = ?
         AND vb.date >= ? AND vb.date <= ?
         AND vb.status = 'confirmed'
       ORDER BY vb.date, vb.start_time`;

  const vtArgs = isAdmin
    ? [from, to]
    : [userId, from, to];

  const vtRes = await db.execute({ sql: vtSql, args: vtArgs });

  res.json({
    classes:          classRes.rows,
    pt_bookings:      ptRes.rows,
    vt_bookings:      vtRes.rows,
  });
};

module.exports = { getAgenda };
