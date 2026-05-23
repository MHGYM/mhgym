const mollieClient = require('../config/mollie');
const db = require('../config/database');

// POST /api/payments/checkout  — start Mollie betaling voor lidmaatschap
const startCheckout = async (req, res) => {
  const { membership_id } = req.body;

  const membershipRes = await db.execute({ sql: 'SELECT * FROM memberships WHERE id = ?', args: [membership_id] });
  const membership = membershipRes.rows[0];
  if (!membership) return res.status(404).json({ error: 'Lidmaatschap niet gevonden.' });

  const amount = Number(membership.price_monthly).toFixed(2);
  const webhookUrl = process.env.MOLLIE_WEBHOOK_URL;
  const redirectUrl = `${process.env.APP_BASE_URL}/betaling-geslaagd?membership=${membership_id}`;

  const payment = await mollieClient.payments.create({
    amount: { currency: 'EUR', value: amount },
    description: `MHGym ${membership.name} abonnement — ${req.user.first_name} ${req.user.last_name}`,
    redirectUrl,
    webhookUrl,
    metadata: { user_id: req.user.id, membership_id },
  });

  await db.execute({
    sql: `INSERT INTO payments (user_id, mollie_payment_id, amount, description, type, membership_id, checkout_url)
          VALUES (?, ?, ?, ?, 'membership', ?, ?)`,
    args: [req.user.id, payment.id, membership.price_monthly, payment.description, membership_id, payment.getCheckoutUrl()],
  });

  res.json({ checkout_url: payment.getCheckoutUrl(), payment_id: payment.id });
};

// POST /api/payments/webhook  — Mollie webhook (geen auth)
const webhook = async (req, res) => {
  const molliePaymentId = req.body?.id;
  if (!molliePaymentId) return res.status(400).send('Geen payment ID.');

  const molliePayment = await mollieClient.payments.get(molliePaymentId);

  const localRes = await db.execute({
    sql: 'SELECT * FROM payments WHERE mollie_payment_id = ?',
    args: [molliePaymentId],
  });
  const localPayment = localRes.rows[0];
  if (!localPayment) return res.status(404).send('Betaling niet gevonden.');

  // Werk status bij
  await db.execute({
    sql: `UPDATE payments SET status = ?, updated_at = datetime('now') WHERE mollie_payment_id = ?`,
    args: [molliePayment.status, molliePaymentId],
  });

  // Bij succesvolle betaling: activeer lidmaatschap
  if (molliePayment.status === 'paid' && localPayment.status !== 'paid') {
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    await db.batch([
      {
        sql: `UPDATE user_memberships SET status = 'expired', updated_at = datetime('now')
              WHERE user_id = ? AND status = 'active'`,
        args: [localPayment.user_id],
      },
      {
        sql: `INSERT INTO user_memberships (user_id, membership_id, start_date, end_date, status)
              VALUES (?, ?, ?, ?, 'active')`,
        args: [localPayment.user_id, localPayment.membership_id, startDate, endDate],
      },
    ], 'write');
  }

  res.status(200).send('OK');
};

// GET /api/payments  — eigen betalingshistorie
const myPayments = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT p.*, m.name AS membership_name
          FROM payments p
          LEFT JOIN memberships m ON m.id = p.membership_id
          WHERE p.user_id = ?
          ORDER BY p.created_at DESC`,
    args: [req.user.id],
  });
  res.json({ payments: result.rows });
};

// GET /api/payments/admin  (admin)
const allPayments = async (req, res) => {
  const result = await db.execute(
    `SELECT p.*, u.first_name, u.last_name, u.email, m.name AS membership_name
     FROM payments p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN memberships m ON m.id = p.membership_id
     ORDER BY p.created_at DESC`
  );
  res.json({ payments: result.rows });
};

module.exports = { startCheckout, webhook, myPayments, allPayments };
