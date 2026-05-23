const mollieClient = require('../config/mollie');
const db = require('../config/database');
const { sendMembershipConfirmation, sendOrderConfirmation } = require('../services/emailService');

// POST /api/payments/checkout  — start Mollie betaling voor lidmaatschap
const startCheckout = async (req, res) => {
  const { membership_id } = req.body;

  const membershipRes = await db.execute({ sql: 'SELECT * FROM memberships WHERE id = ?', args: [membership_id] });
  const membership = membershipRes.rows[0];
  if (!membership) return res.status(404).json({ error: 'Lidmaatschap niet gevonden.' });

  // Totaalbedrag = prijs × aantal maanden (eenmalige betaling voor hele periode)
  const durationMonths = membership.duration_months || 1;
  const totalAmount = (Number(membership.price_monthly) * durationMonths).toFixed(2);

  const webhookUrl  = process.env.MOLLIE_WEBHOOK_URL;
  const redirectUrl = `${process.env.FRONTEND_URL || process.env.APP_BASE_URL}/memberships?betaling=geslaagd`;

  let payment;
  try {
    payment = await mollieClient.payments.create({
      amount:      { currency: 'EUR', value: totalAmount },
      description: `MHGym ${membership.name} (${membership.category})`,
      redirectUrl,
      webhookUrl,
      locale:      'nl_NL',
      metadata: {
        type:          'membership',
        user_id:       String(req.user.id),
        membership_id: String(membership_id),
      },
    });
  } catch (mollieErr) {
    const msg = mollieErr?.message || 'Betaling aanmaken mislukt.';
    console.error('[Mollie checkout] fout:', msg);
    // Geef een begrijpelijke fout terug aan de frontend
    if (msg.toLowerCase().includes('no suitable payment methods')) {
      return res.status(502).json({
        error: 'Geen betaalmethodes beschikbaar. Activeer iDEAL of creditcard in je Mollie dashboard.',
      });
    }
    return res.status(502).json({ error: `Mollie fout: ${msg}` });
  }

  await db.execute({
    sql: `INSERT INTO payments (user_id, mollie_payment_id, amount, description, type, membership_id, checkout_url)
          VALUES (?, ?, ?, ?, 'membership', ?, ?)`,
    args: [req.user.id, payment.id, totalAmount, payment.description, membership_id, payment.getCheckoutUrl()],
  });

  res.json({ checkout_url: payment.getCheckoutUrl(), payment_id: payment.id });
};

// POST /api/payments/webhook  — Mollie webhook (geen auth)
const webhook = async (req, res) => {
  const molliePaymentId = req.body?.id;
  if (!molliePaymentId) return res.status(400).send('Geen payment ID.');

  let molliePayment;
  try {
    molliePayment = await mollieClient.payments.get(molliePaymentId);
  } catch {
    return res.status(404).send('Mollie betaling niet gevonden.');
  }

  const localRes = await db.execute({
    sql: 'SELECT * FROM payments WHERE mollie_payment_id = ?',
    args: [molliePaymentId],
  });
  const localPayment = localRes.rows[0];
  if (!localPayment) return res.status(404).send('Lokale betaling niet gevonden.');

  // Werk status bij in payments tabel
  await db.execute({
    sql: `UPDATE payments SET status = ?, updated_at = datetime('now') WHERE mollie_payment_id = ?`,
    args: [molliePayment.status, molliePaymentId],
  });

  const meta = molliePayment.metadata || {};

  // ── Succesvolle LIDMAATSCHAP betaling ─────────────────────────────────────
  if (molliePayment.status === 'paid' && localPayment.status !== 'paid' && (meta.type === 'membership' || localPayment.type === 'membership')) {
    const membershipId = meta.membership_id || localPayment.membership_id;
    const userId       = meta.user_id       || localPayment.user_id;

    // Haal lidmaatschap op voor duur + prijs
    const mRes = await db.execute({ sql: 'SELECT * FROM memberships WHERE id = ?', args: [membershipId] });
    const membership = mRes.rows[0];

    const durationMonths = membership?.duration_months || 1;
    const startDate = new Date();
    const endDate   = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    const startStr = startDate.toISOString().split('T')[0];
    const endStr   = endDate.toISOString().split('T')[0];

    // Zet huidig actief lidmaatschap op expired + maak nieuw aan
    await db.batch([
      {
        sql: `UPDATE user_memberships SET status = 'expired', updated_at = datetime('now')
              WHERE user_id = ? AND status = 'active'`,
        args: [userId],
      },
      {
        sql: `INSERT INTO user_memberships (user_id, membership_id, start_date, end_date, status)
              VALUES (?, ?, ?, ?, 'active')`,
        args: [userId, membershipId, startStr, endStr],
      },
    ], 'write');

    // Stuur bevestigingsmail
    try {
      const userRes = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
      const user = userRes.rows[0];
      if (user && membership) {
        await sendMembershipConfirmation({
          to:             user.email,
          firstName:      user.first_name,
          membershipName: membership.name,
          priceMonthly:   membership.price_monthly,
          startDate:      startStr,
          endDate:        endStr,
        });
      }
    } catch (emailErr) {
      console.error('[Webhook] E-mail fout:', emailErr.message);
    }
  }

  // ── Succesvolle WINKEL bestelling ──────────────────────────────────────────
  if (molliePayment.status === 'paid' && localPayment.status !== 'paid' && (meta.type === 'shop' || localPayment.type === 'shop')) {
    const orderId = meta.order_id || null;
    const userId  = meta.user_id  || localPayment.user_id;

    if (orderId) {
      // Update order status
      await db.execute({
        sql: `UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?`,
        args: [orderId],
      });

      // Verlaag voorraad
      const itemsRes = await db.execute({
        sql: 'SELECT * FROM order_items WHERE order_id = ?',
        args: [orderId],
      });
      for (const item of itemsRes.rows) {
        await db.execute({
          sql: `UPDATE products SET stock = MAX(0, stock - ?), updated_at = datetime('now') WHERE id = ? AND stock != -1`,
          args: [item.quantity, item.product_id],
        });
      }

      // Stuur bestelbevestiging
      try {
        const userRes = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
        const user = userRes.rows[0];
        const items = itemsRes.rows.map((i) => ({ name: i.product_name || `Product #${i.product_id}`, quantity: i.quantity, unit_price: i.unit_price }));
        if (user) {
          await sendOrderConfirmation({
            to:          user.email,
            firstName:   user.first_name,
            orderId,
            items,
            totalAmount: localPayment.amount,
          });
        }
      } catch (emailErr) {
        console.error('[Webhook] E-mail fout:', emailErr.message);
      }
    }
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
