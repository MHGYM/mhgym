const db = require('../config/database');

// ── Leden ──────────────────────────────────────────────────────────────────

// GET /api/admin/members
const listMembers = async (req, res) => {
  const result = await db.execute(`
    SELECT
      u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.created_at,
      um.status AS membership_status,
      um.start_date, um.end_date,
      m.name AS membership_name, m.category AS membership_category,
      m.price_monthly,
      (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id AND b.status = 'confirmed') AS total_bookings
    FROM users u
    LEFT JOIN user_memberships um ON um.user_id = u.id AND um.status = 'active'
    LEFT JOIN memberships m ON m.id = um.membership_id
    ORDER BY u.created_at DESC
  `);
  res.json({ members: result.rows });
};

// GET /api/admin/members/:id
const getMember = async (req, res) => {
  const userRes = await db.execute({
    sql: `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.role, u.created_at
          FROM users u WHERE u.id = ?`,
    args: [req.params.id],
  });
  if (!userRes.rows[0]) return res.status(404).json({ error: 'Lid niet gevonden.' });

  const membershipRes = await db.execute({
    sql: `SELECT um.*, m.name AS membership_name, m.category, m.price_monthly
          FROM user_memberships um
          JOIN memberships m ON m.id = um.membership_id
          WHERE um.user_id = ?
          ORDER BY um.created_at DESC`,
    args: [req.params.id],
  });

  const bookingRes = await db.execute({
    sql: `SELECT b.*, c.name AS class_name, c.date_time, c.category
          FROM bookings b JOIN classes c ON c.id = b.class_id
          WHERE b.user_id = ?
          ORDER BY c.date_time DESC
          LIMIT 20`,
    args: [req.params.id],
  });

  const paymentRes = await db.execute({
    sql: `SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    args: [req.params.id],
  });

  res.json({
    member: userRes.rows[0],
    memberships: membershipRes.rows,
    bookings: bookingRes.rows,
    payments: paymentRes.rows,
  });
};

// PUT /api/admin/members/:id/role  — maak lid admin of terug
const setMemberRole = async (req, res) => {
  const { role } = req.body;
  if (!['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Ongeldige rol.' });

  await db.execute({
    sql: `UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [role, req.params.id],
  });
  res.json({ message: `Rol bijgewerkt naar ${role}.` });
};

// DELETE /api/admin/members/:id  — verwijder lid (cascade)
const deleteMember = async (req, res) => {
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [req.params.id] });
  if (!existing.rows[0]) return res.status(404).json({ error: 'Lid niet gevonden.' });
  if (existing.rows[0].id === req.user.id) return res.status(400).json({ error: 'Je kunt jezelf niet verwijderen.' });

  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] });
  res.json({ message: 'Lid verwijderd.' });
};

// ── Lessen (admin beheer) ──────────────────────────────────────────────────

// GET /api/admin/classes
const adminListClasses = async (req, res) => {
  const result = await db.execute(`
    SELECT c.*, (c.max_capacity - c.current_bookings) AS spots_left,
           (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'confirmed') AS confirmed_bookings
    FROM classes c
    ORDER BY c.date_time DESC
    LIMIT 200
  `);
  res.json({ classes: result.rows });
};

// POST /api/admin/classes
const adminCreateClass = async (req, res) => {
  const { name, description, instructor, category, date_time, duration_minutes, max_capacity, location } = req.body;
  if (!name || !instructor || !category || !date_time) {
    return res.status(400).json({ error: 'Naam, instructeur, categorie en datum zijn verplicht.' });
  }

  const result = await db.execute({
    sql: `INSERT INTO classes (name, description, instructor, category, date_time, duration_minutes, max_capacity, location)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [name, description || null, instructor, category, date_time, duration_minutes || 60, max_capacity || 20, location || 'Zaal A'],
  });
  const cls = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [result.lastInsertRowid] });
  res.status(201).json({ class: cls.rows[0] });
};

// PUT /api/admin/classes/:id
const adminUpdateClass = async (req, res) => {
  const { name, description, instructor, category, date_time, duration_minutes, max_capacity, location, status } = req.body;

  const existing = await db.execute({ sql: 'SELECT id FROM classes WHERE id = ?', args: [req.params.id] });
  if (!existing.rows[0]) return res.status(404).json({ error: 'Les niet gevonden.' });

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

// DELETE /api/admin/classes/:id  — zet status op cancelled
const adminCancelClass = async (req, res) => {
  await db.execute({
    sql: `UPDATE classes SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Les geannuleerd.' });
};

// ── Boekingen ──────────────────────────────────────────────────────────────

// GET /api/admin/bookings
const adminListBookings = async (req, res) => {
  const result = await db.execute(`
    SELECT b.*, u.first_name, u.last_name, u.email,
           c.name AS class_name, c.date_time, c.category, c.instructor
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN classes c ON c.id = b.class_id
    ORDER BY b.booked_at DESC
    LIMIT 500
  `);
  res.json({ bookings: result.rows });
};

// ── Betalingen & Statistieken ──────────────────────────────────────────────

// GET /api/admin/payments
const adminListPayments = async (req, res) => {
  const result = await db.execute(`
    SELECT p.*, u.first_name, u.last_name, u.email,
           m.name AS membership_name, m.category AS membership_category
    FROM payments p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN memberships m ON m.id = p.membership_id
    ORDER BY p.created_at DESC
  `);
  res.json({ payments: result.rows });
};

// GET /api/admin/stats  — dashboard statistieken
const getStats = async (req, res) => {
  const [
    memberCount,
    activeMembers,
    totalRevenue,
    monthRevenue,
    classCount,
    bookingCount,
    orderCount,
    productCount,
  ] = await Promise.all([
    db.execute(`SELECT COUNT(*) as n FROM users WHERE role = 'member'`),
    db.execute(`SELECT COUNT(*) as n FROM user_memberships WHERE status = 'active'`),
    db.execute(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'`),
    db.execute(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid' AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`),
    db.execute(`SELECT COUNT(*) as n FROM classes WHERE status = 'scheduled' AND date_time >= datetime('now')`),
    db.execute(`SELECT COUNT(*) as n FROM bookings WHERE status = 'confirmed'`),
    db.execute(`SELECT COUNT(*) as n FROM orders WHERE status = 'paid'`),
    db.execute(`SELECT COUNT(*) as n FROM products WHERE active = 1`),
  ]);

  // Omzet per maand (laatste 6 maanden)
  const revenueByMonth = await db.execute(`
    SELECT strftime('%Y-%m', created_at) as month,
           SUM(amount) as revenue,
           COUNT(*) as count
    FROM payments
    WHERE status = 'paid'
      AND created_at >= datetime('now', '-6 months')
    GROUP BY month
    ORDER BY month DESC
  `);

  // Actieve abonnementen per type
  const membershipBreakdown = await db.execute(`
    SELECT m.name, m.category, COUNT(*) as count
    FROM user_memberships um
    JOIN memberships m ON m.id = um.membership_id
    WHERE um.status = 'active'
    GROUP BY m.id
    ORDER BY count DESC
  `);

  // Populairste lessen
  const topClasses = await db.execute(`
    SELECT c.name, c.category, c.instructor, COUNT(b.id) as bookings
    FROM classes c
    LEFT JOIN bookings b ON b.class_id = c.id AND b.status = 'confirmed'
    WHERE c.date_time >= datetime('now', '-30 days')
    GROUP BY c.name, c.category, c.instructor
    ORDER BY bookings DESC
    LIMIT 5
  `);

  res.json({
    stats: {
      member_count:    memberCount.rows[0].n,
      active_members:  activeMembers.rows[0].n,
      total_revenue:   totalRevenue.rows[0].total,
      month_revenue:   monthRevenue.rows[0].total,
      class_count:     classCount.rows[0].n,
      booking_count:   bookingCount.rows[0].n,
      order_count:     orderCount.rows[0].n,
      product_count:   productCount.rows[0].n,
    },
    revenue_by_month:     revenueByMonth.rows,
    membership_breakdown: membershipBreakdown.rows,
    top_classes:          topClasses.rows,
  });
};

module.exports = {
  listMembers, getMember, setMemberRole, deleteMember,
  adminListClasses, adminCreateClass, adminUpdateClass, adminCancelClass,
  adminListBookings,
  adminListPayments,
  getStats,
};
