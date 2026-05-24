const db = require('../config/database');
const mollieClient = require('../config/mollie');

// GET /api/memberships  — publiek overzicht van tiers
const listMemberships = async (req, res) => {
  const result = await db.execute('SELECT * FROM memberships ORDER BY category, duration_months DESC');
  const memberships = result.rows.map((m) => ({ ...m, features: JSON.parse(m.features || '[]') }));
  res.json({ memberships });
};

// GET /api/memberships/mine  — actief lidmaatschap van ingelogde user
const myMembership = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT um.*, m.name AS membership_name, m.category, m.price_monthly,
                 m.max_bookings_per_month, m.description, m.features,
                 m.minimum_months, m.notice_period_months
          FROM user_memberships um
          JOIN memberships m ON m.id = um.membership_id
          WHERE um.user_id = ?
            AND (um.status = 'active' OR um.status = 'cancelling')
            AND (um.cancels_at IS NULL OR um.cancels_at >= date('now'))
          ORDER BY um.created_at DESC LIMIT 1`,
    args: [req.user.id],
  });

  if (!result.rows[0]) return res.json({ membership: null });

  const membership = result.rows[0];

  const firstOfMonth = new Date();
  firstOfMonth.setDate(1); firstOfMonth.setHours(0, 0, 0, 0);

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

// PUT /api/memberships/mine/cancel  — opzeggen (alleen na contractperiode)
const cancelMembership = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT um.*, m.minimum_months, m.notice_period_months
          FROM user_memberships um
          JOIN memberships m ON m.id = um.membership_id
          WHERE um.user_id = ? AND (um.status = 'active' OR um.status = 'cancelling')
          ORDER BY um.created_at DESC LIMIT 1`,
    args: [req.user.id],
  });
  const membership = result.rows[0];
  if (!membership) return res.status(404).json({ error: 'Geen actief lidmaatschap gevonden.' });

  if (membership.status === 'cancelling') {
    return res.status(400).json({ error: 'Je hebt dit lidmaatschap al opgezegd.' });
  }

  // Controleer minimale contractperiode
  const today       = new Date();
  const contractEnd = membership.contract_end ? new Date(membership.contract_end) : null;

  if (contractEnd && today < contractEnd) {
    const fmt = contractEnd.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const msLeft   = contractEnd - today;
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    return res.status(400).json({
      error: `Je kunt pas opzeggen vanaf ${fmt} (nog ${daysLeft} dagen). De minimale contractduur is ${membership.minimum_months} maanden.`,
      contract_end: membership.contract_end,
      days_remaining: daysLeft,
    });
  }

  // Bereken einddatum = vandaag + opzegtermijn
  const noticePeriod = membership.notice_period_months || 1;
  const endsOn = new Date(today);
  endsOn.setMonth(endsOn.getMonth() + noticePeriod);
  const endsOnStr = endsOn.toISOString().split('T')[0];

  // Annuleer Mollie subscription
  const userRes = await db.execute({ sql: 'SELECT mollie_customer_id FROM users WHERE id = ?', args: [req.user.id] });
  const customerId = userRes.rows[0]?.mollie_customer_id;

  if (customerId && membership.mollie_subscription_id) {
    try {
      await mollieClient.subscriptions.cancel({
        customerId,
        id: membership.mollie_subscription_id,
      });
      console.log(`[Mollie] Subscription ${membership.mollie_subscription_id} geannuleerd`);
    } catch (err) {
      console.error('[Mollie] Subscription annuleren mislukt:', err.message);
      // Ga door met lokale annulering zelfs als Mollie faalt
    }
  }

  // Zet status op 'cancelling' + opzegdatum
  await db.execute({
    sql: `UPDATE user_memberships
          SET status = 'cancelling', cancels_at = ?, end_date = ?, updated_at = datetime('now')
          WHERE id = ?`,
    args: [endsOnStr, endsOnStr, membership.id],
  });

  const fmt = endsOn.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  res.json({
    message: `Lidmaatschap opgezegd. Je hebt nog toegang tot en met ${fmt}.`,
    ends_on: endsOnStr,
  });
};

module.exports = { listMemberships, myMembership, allUserMemberships, cancelMembership };
