const db = require('../config/database');

// GET /api/memberships  — publiek overzicht van tiers
const listMemberships = async (req, res) => {
  const result = await db.execute('SELECT * FROM memberships ORDER BY price_monthly ASC');
  const memberships = result.rows.map((m) => ({ ...m, features: JSON.parse(m.features || '[]') }));
  res.json({ memberships });
};

// GET /api/memberships/mine  — actief lidmaatschap van ingelogde user
const myMembership = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT um.*, m.name, m.price_monthly, m.max_bookings_per_month, m.description, m.features
          FROM user_memberships um
          JOIN memberships m ON m.id = um.membership_id
          WHERE um.user_id = ? AND um.status = 'active'
          ORDER BY um.created_at DESC LIMIT 1`,
    args: [req.user.id],
  });

  if (!result.rows[0]) return res.json({ membership: null });

  const membership = result.rows[0];

  // Tel gebruikte lessen deze maand
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  firstOfMonth.setHours(0, 0, 0, 0);

  const usedRes = await db.execute({
    sql: `SELECT COUNT(*) AS cnt FROM bookings
          WHERE user_id = ? AND status = 'confirmed' AND booked_at >= ?`,
    args: [req.user.id, firstOfMonth.toISOString()],
  });

  res.json({
    membership: {
      ...membership,
      features: JSON.parse(membership.features || '[]'),
      bookings_used_this_month: Number(usedRes.rows[0].cnt),
    },
  });
};

// GET /api/memberships/admin/users  (admin)
const allUserMemberships = async (req, res) => {
  const result = await db.execute(
    `SELECT um.*, u.first_name, u.last_name, u.email, m.name AS membership_name, m.price_monthly
     FROM user_memberships um
     JOIN users u ON u.id = um.user_id
     JOIN memberships m ON m.id = um.membership_id
     ORDER BY um.created_at DESC`
  );
  res.json({ memberships: result.rows });
};

// PUT /api/memberships/mine/cancel  — opzeggen
const cancelMembership = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT * FROM user_memberships WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    args: [req.user.id],
  });
  const membership = result.rows[0];

  if (!membership) return res.status(404).json({ error: 'Geen actief lidmaatschap gevonden.' });

  const today = new Date();
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

  await db.execute({
    sql: `UPDATE user_memberships SET status = 'cancelled', end_date = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [endOfMonth, membership.id],
  });

  res.json({ message: `Lidmaatschap opgezegd. Actief tot ${endOfMonth}.` });
};

module.exports = { listMemberships, myMembership, allUserMemberships, cancelMembership };
