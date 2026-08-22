const crypto = require('crypto');
const mollieClient = require('../config/mollie');
const db = require('../config/database');
const {
  sendMembershipConfirmation, sendOrderConfirmation, sendPtPackageConfirmationEmail,
  sendPtSubscriptionConfirmationEmail,
  sendPaymentFailedMemberEmail, sendPaymentFailedAdminEmail,
  sendChargebackMemberEmail, sendChargebackAdminEmail,
} = require('../services/emailService');
const { PT_PACKAGES, PT_PLANS, sendPush } = require('./ptController');

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

// ── Webhook signature helper ──────────────────────────────────────────────────

function verifyMollieSignature(req) {
  const secret = process.env.MOLLIE_WEBHOOK_SECRET;
  if (!secret) return true; // Skip verification if not configured
  const signature = req.headers['x-mollie-signature'];
  if (!signature) return false;
  const rawBody = req.rawBody;
  if (!rawBody) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}

// ── POST /api/payments/webhook  — Mollie callback ────────────────────────────

const webhook = async (req, res) => {
  // Verify Mollie webhook signature (skipped if MOLLIE_WEBHOOK_SECRET not set)
  if (!verifyMollieSignature(req)) {
    console.warn('[Webhook] Ongeldige Mollie handtekening — verzoek geweigerd');
    return res.status(400).send('Ongeldige handtekening.');
  }

  const molliePaymentId = req.body?.id;
  if (!molliePaymentId) return res.status(400).send('Geen payment ID.');

  let molliePayment;
  try {
    molliePayment = await mollieClient.payments.get(molliePaymentId);
  } catch {
    return res.status(404).send('Mollie betaling niet gevonden.');
  }

  // Update lokale status (or create placeholder for subscription payments without a local record)
  const localRes = await db.execute({
    sql: 'SELECT * FROM payments WHERE mollie_payment_id = ?',
    args: [molliePaymentId],
  });
  let localPayment = localRes.rows[0];

  // For recurring subscription payments created by Mollie, there may be no local record yet.
  // Create a minimal placeholder so we can process the webhook.
  if (!localPayment && molliePayment.metadata?.type === 'subscription_payment') {
    const meta = molliePayment.metadata || {};
    const userId = parseInt(meta.user_id || 0);
    const membershipId = parseInt(meta.membership_id || 0);
    if (userId) {
      await db.execute({
        sql: `INSERT INTO payments (user_id, mollie_payment_id, amount, description, type, membership_id, status)
              VALUES (?, ?, ?, ?, 'membership', ?, ?)`,
        args: [userId, molliePaymentId, molliePayment.amount?.value || '0.00',
               molliePayment.description || 'Maandelijkse contributie',
               membershipId || null, molliePayment.status],
      });
      const refreshed = await db.execute({ sql: 'SELECT * FROM payments WHERE mollie_payment_id = ?', args: [molliePaymentId] });
      localPayment = refreshed.rows[0];
    }
  }

  if (!localPayment) {
    // Unknown payment — return 200 to prevent Mollie from retrying endlessly
    console.warn(`[Webhook] Onbekende betaling ${molliePaymentId} genegeerd`);
    return res.status(200).send('OK');
  }

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

    // monthly_amount = door admin ingesteld maandbedrag voor de subscription (los van de eerste betaling)
    // custom_amount  = maatwerk abonnementsprijs (legacy-veld, ook voor subscription)
    const subscriptionAmount = meta.monthly_amount
      ? parseFloat(meta.monthly_amount).toFixed(2)
      : (meta.custom_amount
        ? parseFloat(meta.custom_amount).toFixed(2)
        : Number(m.price_monthly).toFixed(2));
    const subDescSuffix = (meta.monthly_amount || meta.custom_amount) ? ' (maatwerk)' : '';

    if (customerId) {
      try {
        const subscription = await mollieClient.customerSubscriptions.create({
          customerId,
          amount:      { currency: 'EUR', value: subscriptionAmount },
          interval:    '1 month',
          startDate:   meta.subscription_start_date || toDateStr(nextBillingDate),
          description: `MHGym ${m.name} (${m.category}) — maandelijks${subDescSuffix}`,
          webhookUrl:  process.env.MOLLIE_WEBHOOK_URL,
          metadata: {
            type:          'subscription_payment',
            user_id:       String(userId),
            membership_id: String(membershipId),
          },
        });
        subscriptionId = subscription.id;
        await db.execute({
          sql: `UPDATE users SET mollie_customer_id = ? WHERE id = ? AND mollie_customer_id IS NULL`,
          args: [customerId, userId],
        });
        console.log(`[Mollie] Subscription aangemaakt: ${subscriptionId} voor user ${userId} (€${subscriptionAmount}/mnd)`);
      } catch (subErr) {
        console.error('[Mollie] Subscription aanmaken mislukt:', subErr.message);
      }
    }

    // Controleer of er al een actief lidmaatschap bestaat (admin-flow: admin maakt lid aan vóór eerste betaling)
    const existingRes = await db.execute({
      sql: `SELECT id FROM user_memberships
            WHERE user_id = ? AND membership_id = ? AND status IN ('active','cancelling')
            ORDER BY created_at DESC LIMIT 1`,
      args: [userId, membershipId],
    });
    const existingMembership = existingRes.rows[0];

    if (existingMembership) {
      // Admin-flow: lidmaatschap bestaat al — alleen subscription ID bijwerken
      await db.execute({
        sql: `UPDATE user_memberships
              SET mollie_subscription_id = ?, updated_at = datetime('now')
              WHERE id = ?`,
        args: [subscriptionId, existingMembership.id],
      });
      console.log(`[Webhook] Subscription ${subscriptionId} gekoppeld aan bestaand lidmaatschap ${existingMembership.id}`);
    } else {
      // Self-signup-flow: deactiveer oud lidmaatschap en maak nieuwe rij aan
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
    }

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

  // ── PT pakket betaald ─────────────────────────────────────────────────────
  if (
    molliePayment.status === 'paid' &&
    localPayment.status !== 'paid' &&
    (meta.type === 'pt_package' || localPayment.type === 'pt_package')
  ) {
    const packageId = parseInt(meta.package_id || 0);
    const pkg       = PT_PACKAGES.find((p) => p.id === packageId);
    if (pkg) {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // 12 maanden geldig

      await db.execute({
        sql: `INSERT INTO pt_purchases (user_id, package_id, lessons_total, lessons_remaining, mollie_payment_id, amount, status, expires_at)
              VALUES (?, ?, ?, ?, ?, ?, 'paid', ?)`,
        args: [userId, pkg.id, pkg.lessons, pkg.lessons, molliePaymentId, molliePayment.amount?.value || pkg.total_price, expiresAt.toISOString().split('T')[0]],
      });

      const uRes = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
      if (uRes.rows[0]) {
        sendPtPackageConfirmationEmail({
          to: uRes.rows[0].email, firstName: uRes.rows[0].first_name,
          packageLabel: pkg.label, lessons: pkg.lessons, expiresAt: expiresAt.toISOString().split('T')[0],
        }).catch((e) => console.error('[Email] PT pakket:', e.message));
        sendPush(userId, `PT pakket gekocht! 🥊`, `Je ${pkg.label} zijn klaar voor gebruik. Boek je eerste sessie!`);
      }
      console.log(`[PT] Pakket ${pkg.label} geactiveerd voor user ${userId}`);
    }
  }

  // ── PT abonnement eerste betaling ────────────────────────────────────────
  if (
    molliePayment.status === 'paid' &&
    localPayment.status !== 'paid' &&
    (meta.type === 'pt_subscription_first' || localPayment.type === 'pt_subscription')
  ) {
    const planId = parseInt(meta.plan_id || 0);
    const plan   = PT_PLANS.find((p) => p.id === planId);
    if (plan) {
      const startDate = new Date();

      // Nieuwe Basic/Standard/Premium-abonnementen (plan.tier) zijn maandelijks opzegbaar —
      // geen minimale looptijd. De oude, niet meer verkochte 1×/2×/3×-plannen (zonder tier)
      // behouden hun bestaande 6-maanden contract, puur voor eventuele nog actieve gevallen.
      const isNewTierPlan = !!plan.tier;
      let contractEnd = null;
      let minimumMonths = 1;
      if (!isNewTierPlan) {
        contractEnd = new Date(startDate);
        contractEnd.setMonth(contractEnd.getMonth() + 6);
        minimumMonths = 6;
      }

      const nextBillingDate = new Date(startDate);
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

      const customerId = molliePayment.customerId || (await db.execute({ sql: 'SELECT mollie_customer_id FROM users WHERE id = ?', args: [userId] })).rows[0]?.mollie_customer_id;
      let subscriptionId = null;

      if (customerId) {
        try {
          const sub = await mollieClient.customerSubscriptions.create({
            customerId,
            amount: { currency: 'EUR', value: Number(plan.price_monthly).toFixed(2) },
            interval: '1 month',
            startDate: nextBillingDate.toISOString().split('T')[0],
            description: `MHGym PT ${plan.label} — maandelijks`,
            webhookUrl: process.env.MOLLIE_WEBHOOK_URL,
            metadata: { type: 'pt_subscription_payment', user_id: String(userId), plan_id: String(plan.id) },
          });
          subscriptionId = sub.id;
        } catch (e) { console.error('[Mollie] PT subscription aanmaken mislukt:', e.message); }
      }

      await db.execute({
        sql: `INSERT INTO pt_subscriptions (user_id, freq_per_week, price_per_lesson, price_monthly, status, mollie_subscription_id, start_date, contract_end, minimum_months, agreed_to_terms, tier)
              VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 1, ?)`,
        args: [
          userId, plan.freq_per_week, plan.price_per_lesson, plan.price_monthly, subscriptionId,
          startDate.toISOString().split('T')[0],
          contractEnd ? contractEnd.toISOString().split('T')[0] : null,
          minimumMonths,
          plan.tier || null,
        ],
      });

      const tierLabel = plan.tier ? `${plan.tier} — ${plan.label}` : plan.label;
      sendPush(userId, 'PT Abonnement actief! 💪', `Je ${tierLabel} PT-abonnement is geactiveerd. Boek je eerste sessie!`);

      const userForMail = await db.execute({ sql: 'SELECT email, first_name FROM users WHERE id = ?', args: [userId] });
      if (userForMail.rows[0]) {
        sendPtSubscriptionConfirmationEmail({
          to: userForMail.rows[0].email,
          firstName: userForMail.rows[0].first_name,
          tier: plan.tier || null,
          freqPerWeek: plan.freq_per_week,
          priceMonthly: plan.price_monthly,
          startDate: startDate.toISOString().split('T')[0],
        }).catch((e) => console.error('[Email] PT subscription confirmation:', e.message));
      }
      console.log(`[PT] Abonnement ${tierLabel} geactiveerd voor user ${userId}`);
    }
  }

  // ── Mislukte betaling → pauzeer lidmaatschap + notificeer ────────────────
  if (molliePayment.status === 'failed' && localPayment.status !== 'failed') {
    const userId     = parseInt(molliePayment.metadata?.user_id || localPayment.user_id);
    const amount     = molliePayment.amount?.value || localPayment.amount || '0.00';

    const uRes = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
    const user = uRes.rows[0];

    if (user) {
      // Pauzeer lidmaatschap
      await db.execute({
        sql: `UPDATE users SET membership_paused = 1, membership_paused_reason = 'Automatisch gepauzeerd wegens mislukte Mollie betaling', updated_at = datetime('now') WHERE id = ?`,
        args: [userId],
      });

      // Haal actief lidmaatschap op voor naam
      const memRes = await db.execute({
        sql: `SELECT m.name FROM user_memberships um LEFT JOIN memberships m ON m.id = um.membership_id WHERE um.user_id = ? AND um.status IN ('active','cancelling') LIMIT 1`,
        args: [userId],
      });
      const membershipName = memRes.rows[0]?.name || 'MHGym lidmaatschap';

      // Registreer in payment_failures tabel
      await db.execute({
        sql: `INSERT INTO payment_failures (user_id, amount, description, mollie_payment_id, status, failure_count)
              VALUES (?, ?, ?, ?, 'open', 1)
              ON CONFLICT DO NOTHING`,
        args: [userId, amount, molliePayment.description || membershipName, molliePaymentId],
      }).catch(() => {
        // payment_failures ON CONFLICT not supported in all SQLite versions — fallback insert
        return db.execute({
          sql: `INSERT OR IGNORE INTO payment_failures (user_id, amount, description, mollie_payment_id, status, failure_count)
                VALUES (?, ?, ?, ?, 'open', 1)`,
          args: [userId, amount, molliePayment.description || membershipName, molliePaymentId],
        });
      });

      // Stuur e-mails
      sendPaymentFailedMemberEmail({
        to: user.email, firstName: user.first_name, amount, membershipName,
      }).catch(e => console.error('[Email] payment failed member:', e.message));

      sendPaymentFailedAdminEmail({
        memberName: `${user.first_name} ${user.last_name}`,
        memberEmail: user.email, amount, membershipName, userId,
      }).catch(e => console.error('[Email] payment failed admin:', e.message));

      // Push notificatie
      sendPush(userId, '⚠️ Betaling mislukt', `Je incasso van €${amount} is mislukt. Je lidmaatschap is gepauzeerd.`).catch(() => {});

      console.log(`[Webhook] Betaling mislukt voor user ${userId} — lidmaatschap gepauzeerd`);
    }
  }

  // ── Chargeback → pauzeer lidmaatschap + notificeer admin ─────────────────
  if (molliePayment.status === 'charged_back' && localPayment.status !== 'charged_back') {
    const userId = parseInt(molliePayment.metadata?.user_id || localPayment.user_id);
    const amount = molliePayment.amount?.value || localPayment.amount || '0.00';

    const uRes = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [userId] });
    const user = uRes.rows[0];

    if (user) {
      // Pauzeer lidmaatschap
      await db.execute({
        sql: `UPDATE users SET membership_paused = 1, membership_paused_reason = 'Terugboeking (chargeback) ontvangen', updated_at = datetime('now') WHERE id = ?`,
        args: [userId],
      });

      // Registreer in payment_failures
      await db.execute({
        sql: `INSERT OR IGNORE INTO payment_failures (user_id, amount, description, mollie_payment_id, status, failure_count)
              VALUES (?, ?, ?, ?, 'open', 1)`,
        args: [userId, amount, `Terugboeking: ${molliePayment.description || 'MHGym'}`, molliePaymentId],
      });

      // Notificeer
      sendChargebackMemberEmail({
        to: user.email, firstName: user.first_name, amount,
      }).catch(e => console.error('[Email] chargeback member:', e.message));

      sendChargebackAdminEmail({
        memberName: `${user.first_name} ${user.last_name}`,
        memberEmail: user.email, amount,
      }).catch(e => console.error('[Email] chargeback admin:', e.message));

      sendPush(userId, '🔴 Terugboeking geregistreerd', `Een terugboeking van €${amount} is ontvangen. Je lidmaatschap is gepauzeerd.`).catch(() => {});

      console.log(`[Webhook] Chargeback voor user ${userId} — lidmaatschap gepauzeerd`);
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
