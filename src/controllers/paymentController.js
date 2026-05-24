const mollieClient = require('../config/mollie');
const db = require('../config/database');
const { sendMembershipConfirmation, sendOrderConfirmation } = require('../services/emailService');

// ── Hulpfuncties ─────────────────────────────────────────────────────────────

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function toDateStr(d) {
  return new Date(d).toISOString().split('T')[0]; // YYYY-MM-DD
}

// ── POST /api/payments/checkout  — start Mollie eerste betaling (recurring) ─

const startCheckout = async (req, res) => {
  const { membership_id, agreed_to_terms } = req.body;

  if (!agreed_to_terms) {
    return res.status(400).json({ error: 'Je moet akkoord gaan met de contractvoorwaarden.' });
  }

  // Haal membership op
  const membershipRes = await db.execute({ sql: 'SELECT * FROM memberships WHERE id = ?', args: [membership_id] });
  const membership = membershipRes.rows[0];
  if (!membership) return res.status(404).json({ error: 'Lidmaatschap niet gevonden.' });

  // Controleer of user al een actief abonnement heeft
  const activeRes = await db.execute({
    sql: `SELECT id FROM user_memberships
          WHERE user_id = ? AND (status = 'active' OR status = 'cancelling')
          AND (cancels_at IS NULL OR cancels_at >= date('now'))`,
    args: [req.user.id],
  });
  if (activeRes.rows[0]) {
    return res.status(400).json({ error: 'Je hebt al een actief lidmaatschap.' });
  }

  // Haal volledige user op (inclusief profiel-velden)
  const userRes = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [req.user.id],
  });
  const user = userRes.rows[0];

  // Maak of hergebruik Mollie klant
  let mollieCustomerId = user.mollie_customer_id;

  if (!mollieCustomerId) {
    try {
      const customer = await mollieClient.customers.create({
        name:   `${user.first_name} ${user.last_name}`,
        email:  user.email,
        locale: 'nl_NL',
      });
      mollieCustomerId = customer.id;
      await db.execute({
        sql: `UPDATE users SET mollie_customer_id = ? WHERE id = ?`,
        args: [mollieCustomerId, user.id],
      });
    } catch (err) {
      console.error('[Mollie] Customer create fout:', err.message);
      return res.status(502).json({ error: `Mollie fout: ${err.message}` });
    }
  }

  // Eerste betaling (incasso machtiging + eerste maand)
  const monthlyPrice  = Number(membership.price_monthly).toFixed(2);
  const redirectUrl   = `${process.env.FRONTEND_URL || process.env.APP_BASE_URL}/memberships?betaling=geslaagd`;
  const webhookUrl    = process.env.MOLLIE_WEBHOOK_URL;
  const description   = `MHGym ${membership.name} (${membership.category}) — eerste betaling`;

  let payment;
  try {
    payment = await mollieClient.payments.create({
      amount:       { currency: 'EUR', value: monthlyPrice },
      customerId:   mollieCustomerId,
      sequenceType: 'first',
      description,
      redirectUrl,
      webhookUrl,
      locale:       'nl_NL',
      metadata: {
        type:          'membership_first',
        user_id:       String(user.id),
        membership_id: String(membership_id),
        agreed_to_terms: '1',
      },
    });
  } catch (mollieErr) {
    const msg = mollieErr?.message || 'Betaling aanmaken mislukt.';
    console.error('[Mollie] Payment create fout:', msg);
    return res.status(502).json({ error: `Mollie fout: ${msg}` });
  }

  // Sla betaling op
  await db.execute({
    sql: `INSERT INTO payments (user_id, mollie_payment_id, amount, description, type, membership_id, checkout_url)
          VALUES (?, ?, ?, ?, 'membership', ?, ?)`,
    args: [user.id, payment.id, monthlyPrice, description, membership_id, payment.getCheckoutUrl()],
  });

  res.json({ checkout_url: payment.getCheckoutUrl(), payment_id: payment.id });
};

// ── POST /api/payments/webhook  — Mollie callback ────────────────────────────

const webhook = async (req, res) => {
  const molliePaymentId = req.body?.id;
  if (!molliePaymentId) return res.status(400).send('Geen payment ID.');

  let molliePayment;
  try {
    molliePayment = await mollieClient.payments.get(molliePaymentId);
  } catch {
    return res.status(404).send('Mollie betaling niet gevonden.');
  }

  // Update lokale status
  const localRes = await db.execute({
    sql: 'SELECT * FROM payments WHERE mollie_payment_id = ?',
    args: [molliePaymentId],
  });
  const localPayment = localRes.rows[0];
  if (!localPayment) return res.status(404).send('Lokale betaling niet gevonden.');

  await db.execute({
    sql: `UPDATE payments SET status = ?, updated_at = datetime('now') WHERE mollie_payment_id = ?`,
    args: [molliePayment.status, molliePaymentId],
  });

  const meta   = molliePayment.metadata || {};
  const userId = parseInt(meta.user_id || localPayment.user_id);

  // ── Eerste lidmaatschapsbetaling betaald → activeer + maak abonnement aan ──
  if (
    molliePayment.status === 'paid' &&
    localPayment.status !== 'paid' &&
    (meta.type === 'membership_first' || localPayment.type === 'membership')
  ) {
    const membershipId = parseInt(meta.membership_id || localPayment.membership_id);

    const mRes  = await db.execute({ sql: 'SELECT * FROM memberships WHERE id = ?', args: [membershipId] });
    const m     = mRes.rows[0];
    const uRes  = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
    const user  = uRes.rows[0];

    if (!m || !user) { return res.status(200).send('OK'); }

    const startDate   = new Date();
    const contractEnd = addMonths(startDate, m.minimum_months || 1);

    // Tweede maand billing start next month
    const nextBillingDate = addMonths(startDate, 1);

    // Maak Mollie recurring subscription aan
    let subscriptionId = null;
    const customerId   = molliePayment.customerId || user.mollie_customer_id;

    if (customerId) {
      try {
        const subscription = await mollieClient.subscriptions.create({
          customerId,
          amount:      { currency: 'EUR', value: Number(m.price_monthly).toFixed(2) },
          interval:    '1 month',
          startDate:   toDateStr(nextBillingDate),
          description: `MHGym ${m.name} (${m.category}) — maandelijks`,
          webhookUrl:  process.env.MOLLIE_WEBHOOK_URL,
          metadata: {
            type:          'subscription_payment',
            user_id:       String(userId),
            membership_id: String(membershipId),
          },
        });
        subscriptionId = subscription.id;
        // Sla customer_id op als nog niet gedaan
        await db.execute({
          sql: `UPDATE users SET mollie_customer_id = ? WHERE id = ? AND mollie_customer_id IS NULL`,
          args: [customerId, userId],
        });
        console.log(`[Mollie] Subscription aangemaakt: ${subscriptionId} voor user ${userId}`);
      } catch (subErr) {
        console.error('[Mollie] Subscription aanmaken mislukt:', subErr.message);
        // Ga door met lidmaatschapsactivering ook als subscription mislukt
      }
    }

    // Deactiveer huidig lidmaatschap + activeer nieuw
    await db.batch([
      {
        sql: `UPDATE user_memberships SET status = 'expired', updated_at = datetime('now')
              WHERE user_id = ? AND (status = 'active' OR status = 'cancelling')`,
        args: [userId],
      },
      {
        sql: `INSERT INTO user_memberships
                (user_id, membership_id, status, start_date, contract_start, contract_end,
                 minimum_months, notice_period_months, mollie_subscription_id, agreed_to_terms)
              VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, 1)`,
        args: [
          userId, membershipId,
          toDateStr(startDate), toDateStr(startDate), toDateStr(contractEnd),
          m.minimum_months || 1, m.notice_period_months || 1,
          subscriptionId,
        ],
      },
    ], 'write');

    // Stuur bevestigingsmail
    sendMembershipConfirmation({
      to:             user.email,
      firstName:      user.first_name,
      membershipName: `${m.category} — ${m.name}`,
      priceMonthly:   m.price_monthly,
      startDate:      toDateStr(startDate),
      contractEnd:    toDateStr(contractEnd),
      minimumMonths:  m.minimum_months || 1,
    }).catch((e) => console.error('[Email] Fout:', e.message));
  }

  // ── Recurring subscription betaling betaald ────────────────────────────────
  if (
    molliePayment.status === 'paid' &&
    localPayment.status !== 'paid' &&
    meta.type === 'subscription_payment'
  ) {
    const membershipId = parseInt(meta.membership_id || localPayment.membership_id);
    // Registreer betaling in betalingsoverzicht (alleen als nog niet aangemaakt)
    const exists = await db.execute({
      sql: 'SELECT id FROM payments WHERE mollie_payment_id = ?',
      args: [molliePaymentId],
    });
    if (!exists.rows[0]) {
      await db.execute({
        sql: `INSERT INTO payments (user_id, mollie_payment_id, amount, description, type, membership_id, status)
              VALUES (?, ?, ?, ?, 'membership', ?, 'paid')`,
        args: [userId, molliePaymentId, molliePayment.amount?.value || 0,
               molliePayment.description || 'Maandelijkse contributie', membershipId],
      });
    }
    console.log(`[Mollie] Recurring betaling ontvangen voor user ${userId}`);
  }

  // ── Winkelbestelling betaald ───────────────────────────────────────────────
  if (
    molliePayment.status === 'paid' &&
    localPayment.status !== 'paid' &&
    (meta.type === 'shop' || localPayment.type === 'shop')
  ) {
    const orderId = meta.order_id ? parseInt(meta.order_id) : null;

    if (orderId) {
      await db.execute({
        sql: `UPDATE orders SET status = 'paid', updated_at = datetime('now') WHERE id = ?`,
        args: [orderId],
      });

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

      const uRes = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
      if (uRes.rows[0]) {
        const items = itemsRes.rows.map((i) => ({
          name: i.product_name || `Product #${i.product_id}`,
          quantity: i.quantity,
          unit_price: i.unit_price,
        }));
        sendOrderConfirmation({
          to:          uRes.rows[0].email,
          firstName:   uRes.rows[0].first_name,
          orderId,
          items,
          totalAmount: localPayment.amount,
        }).catch((e) => console.error('[Email] Fout:', e.message));
      }
    }
  }

  res.status(200).send('OK');
};

// ── GET /api/payments  — eigen betalingen ────────────────────────────────────

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

// ── GET /api/payments/admin  (admin) ─────────────────────────────────────────

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
