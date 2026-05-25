/**
 * Personal Training controller
 *
 * Endpoints:
 *  GET  /api/pt/packages            — pakketprijzen (publiek)
 *  GET  /api/pt/plans               — abonnementsprijzen (publiek)
 *  GET  /api/pt/slots               — beschikbare slots (?from&to)
 *  POST /api/pt/slots               — admin: slot aanmaken
 *  PUT  /api/pt/slots/:id           — admin: slot bijwerken
 *  DELETE /api/pt/slots/:id         — admin: slot verwijderen
 *  GET  /api/pt/bookings/mine       — eigen PT-boekingen
 *  POST /api/pt/bookings            — les boeken (pending)
 *  PUT  /api/pt/bookings/:id/cancel — les annuleren (>24h)
 *  GET  /api/pt/bookings/admin      — admin: alle PT-boekingen
 *  PUT  /api/pt/bookings/:id/confirm — admin: bevestigen
 *  PUT  /api/pt/bookings/:id/decline — admin: afwijzen
 *  PUT  /api/pt/bookings/:id/extra  — admin: extra persoon toevoegen
 *  GET  /api/pt/balance             — eigen lesson balance
 *  GET  /api/pt/balance/admin       — admin: alle balances
 *  POST /api/pt/checkout/package    — start Mollie pakket-betaling
 *  POST /api/pt/checkout/subscription — start Mollie PT-abonnement
 *  PUT  /api/pt/subscription/cancel — opzeggen PT-abonnement
 *  POST /api/push/subscribe         — push-subscription opslaan
 *  GET  /api/push/vapid-key         — VAPID public key ophalen
 */

const db           = require('../config/database');
const mollieClient = require('../config/mollie');
const webpush      = require('web-push');
const { sendPtConfirmationEmail, sendPtPackageConfirmationEmail, sendPtLowBalanceEmail } = require('../services/emailService');

// ── VAPID instellen ──────────────────────────────────────────────────────────
const VAPID_CONFIGURED = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

if (VAPID_CONFIGURED) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@mhgym.nl',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
} else {
  console.warn('[Push] VAPID keys niet geconfigureerd — push notificaties uitgeschakeld.');
}

// ── Vaste pakket- en abonnementsdefinities ───────────────────────────────────
const PT_PACKAGES = [
  { id: 1, lessons: 1,  price_per_lesson: 70, total_price: 70,   label: '1 les'     },
  { id: 2, lessons: 10, price_per_lesson: 60, total_price: 600,  label: '10 lessen' },
  { id: 3, lessons: 20, price_per_lesson: 58, total_price: 1160, label: '20 lessen' },
  { id: 4, lessons: 30, price_per_lesson: 56, total_price: 1680, label: '30 lessen' },
  { id: 5, lessons: 40, price_per_lesson: 54, total_price: 2160, label: '40 lessen' },
  { id: 6, lessons: 50, price_per_lesson: 52, total_price: 2600, label: '50 lessen' },
];

const PT_PLANS = [
  { id: 1, freq_per_week: 1, label: '1× per week', price_per_lesson: 60, price_monthly: 240 },
  { id: 2, freq_per_week: 2, label: '2× per week', price_per_lesson: 55, price_monthly: 440 },
  { id: 3, freq_per_week: 3, label: '3× per week', price_per_lesson: 50, price_monthly: 600 },
];

// ── Hulpfuncties ─────────────────────────────────────────────────────────────
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function toDateStr(d) { return new Date(d).toISOString().split('T')[0]; }

async function sendPush(userId, title, body) {
  // Skip silently when VAPID is not configured — push is optional
  if (!VAPID_CONFIGURED) return;
  try {
    const subs = await db.execute({ sql: 'SELECT * FROM push_subscriptions WHERE user_id = ?', args: [userId] });
    for (const sub of subs.rows) {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body }),
      ).catch((e) => console.warn('[Push] Verzenden mislukt:', e.message));
    }
  } catch (e) {
    console.warn('[Push] Fout:', e.message);
  }
}

// ── Prijzen (publiek) ─────────────────────────────────────────────────────────

const getPackages = (_, res) => res.json({ packages: PT_PACKAGES });
const getPlans    = (_, res) => res.json({ plans: PT_PLANS });

// ── Slots ────────────────────────────────────────────────────────────────────

const getSlots = async (req, res) => {
  const { from, to, all } = req.query;
  let sql  = `SELECT s.*, b.id AS booking_id, b.user_id AS booked_by,
                     u.first_name, u.last_name, b.status AS booking_status, b.extra_person
              FROM pt_slots s
              LEFT JOIN pt_bookings b ON b.slot_id = s.id AND b.status NOT IN ('cancelled','declined')
              LEFT JOIN users u ON u.id = b.user_id
              WHERE 1=1`;
  const args = [];
  if (!all) { sql += ` AND s.status != 'cancelled'`; }
  if (from) { sql += ' AND s.date_time >= ?'; args.push(from); }
  if (to)   { sql += ' AND s.date_time <= ?'; args.push(to); }
  sql += ' ORDER BY s.date_time ASC';
  const result = await db.execute({ sql, args });
  res.json({ slots: result.rows });
};

const createSlot = async (req, res) => {
  const { date_time, duration_minutes = 60, trainer = 'Mohammed', notes = '' } = req.body;
  if (!date_time) return res.status(400).json({ error: 'date_time is verplicht.' });
  const result = await db.execute({
    sql: `INSERT INTO pt_slots (date_time, duration_minutes, trainer, notes) VALUES (?, ?, ?, ?)`,
    args: [date_time, duration_minutes, trainer, notes],
  });
  const slot = await db.execute({ sql: 'SELECT * FROM pt_slots WHERE id = ?', args: [result.lastInsertRowid] });
  res.status(201).json({ slot: slot.rows[0] });
};

const updateSlot = async (req, res) => {
  const { date_time, duration_minutes, trainer, notes, status } = req.body;
  await db.execute({
    sql: `UPDATE pt_slots SET
            date_time        = COALESCE(?, date_time),
            duration_minutes = COALESCE(?, duration_minutes),
            trainer          = COALESCE(?, trainer),
            notes            = COALESCE(?, notes),
            status           = COALESCE(?, status),
            updated_at       = datetime('now')
          WHERE id = ?`,
    args: [date_time ?? null, duration_minutes ?? null, trainer ?? null, notes ?? null, status ?? null, req.params.id],
  });
  const slot = await db.execute({ sql: 'SELECT * FROM pt_slots WHERE id = ?', args: [req.params.id] });
  res.json({ slot: slot.rows[0] });
};

const deleteSlot = async (req, res) => {
  await db.execute({
    sql: `UPDATE pt_slots SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Slot geannuleerd.' });
};

// ── Boekingen (leden) ────────────────────────────────────────────────────────

const myBookings = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT b.*, s.date_time, s.duration_minutes, s.trainer, s.location
          FROM pt_bookings b
          JOIN pt_slots s ON s.id = b.slot_id
          WHERE b.user_id = ?
          ORDER BY s.date_time DESC`,
    args: [req.user.id],
  });
  res.json({ bookings: result.rows });
};

const createBooking = async (req, res) => {
  const { slot_id, purchase_id, subscription_id, extra_person = false } = req.body;

  // Slot ophalen
  const slotRes = await db.execute({ sql: 'SELECT * FROM pt_slots WHERE id = ?', args: [slot_id] });
  const slot = slotRes.rows[0];
  if (!slot)                       return res.status(404).json({ error: 'Slot niet gevonden.' });
  if (slot.status !== 'available') return res.status(400).json({ error: 'Dit slot is niet meer beschikbaar.' });

  // Checken of user al een boeking heeft voor dit slot
  const dupRes = await db.execute({
    sql: `SELECT id FROM pt_bookings WHERE user_id = ? AND slot_id = ? AND status NOT IN ('cancelled','declined')`,
    args: [req.user.id, slot_id],
  });
  if (dupRes.rows[0]) return res.status(409).json({ error: 'Je hebt dit slot al geboekt.' });

  // Valideer purchase OF subscription
  if (!purchase_id && !subscription_id) {
    return res.status(400).json({ error: 'Selecteer een pakket of abonnement om te boeken.' });
  }

  if (purchase_id) {
    const purRes = await db.execute({
      sql: `SELECT * FROM pt_purchases WHERE id = ? AND user_id = ? AND status = 'paid' AND lessons_remaining > 0`,
      args: [purchase_id, req.user.id],
    });
    if (!purRes.rows[0]) return res.status(400).json({ error: 'Geen geldig pakket met voldoende lessen gevonden.' });
  }

  if (subscription_id) {
    const subRes = await db.execute({
      sql: `SELECT * FROM pt_subscriptions WHERE id = ? AND user_id = ? AND status = 'active'`,
      args: [subscription_id, req.user.id],
    });
    if (!subRes.rows[0]) return res.status(400).json({ error: 'Geen actief PT-abonnement gevonden.' });
  }

  // Boeking aanmaken + slot op 'booked' zetten
  const result = await db.batch([
    {
      sql: `INSERT INTO pt_bookings (user_id, slot_id, purchase_id, subscription_id, extra_person)
            VALUES (?, ?, ?, ?, ?)`,
      args: [req.user.id, slot_id, purchase_id || null, subscription_id || null, extra_person ? 1 : 0],
    },
    {
      sql: `UPDATE pt_slots SET status = 'booked', updated_at = datetime('now') WHERE id = ?`,
      args: [slot_id],
    },
  ], 'write');

  const booking = await db.execute({ sql: 'SELECT * FROM pt_bookings WHERE id = ?', args: [result[0].lastInsertRowid] });
  res.status(201).json({ booking: booking.rows[0] });
};

const cancelBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: 'SELECT b.*, s.date_time FROM pt_bookings b JOIN pt_slots s ON s.id = b.slot_id WHERE b.id = ? AND b.user_id = ?',
    args: [req.params.id, req.user.id],
  });
  const booking = bookingRes.rows[0];
  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });
  if (booking.status === 'cancelled') return res.status(400).json({ error: 'Boeking is al geannuleerd.' });

  const hoursUntil = (new Date(booking.date_time) - new Date()) / 3600000;
  if (hoursUntil < 24) {
    return res.status(400).json({ error: 'Annuleren is niet meer mogelijk binnen 24 uur voor de sessie. De les vervalt.' });
  }

  // Annuleer boeking + herstel slot + restitueer les bij pakket (alleen bij confirmed)
  const ops = [
    {
      sql: `UPDATE pt_bookings SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      args: [booking.id],
    },
    {
      sql: `UPDATE pt_slots SET status = 'available', updated_at = datetime('now') WHERE id = ?`,
      args: [booking.slot_id],
    },
  ];
  // Restitueer les als boeking confirmed was en pakket
  if (booking.status === 'confirmed' && booking.purchase_id) {
    ops.push({
      sql: `UPDATE pt_purchases SET lessons_remaining = lessons_remaining + 1, lessons_used = lessons_used - 1, updated_at = datetime('now') WHERE id = ?`,
      args: [booking.purchase_id],
    });
  }
  await db.batch(ops, 'write');
  res.json({ message: 'Boeking geannuleerd. Je les is teruggestort.' });
};

// ── Boekingen (admin) ────────────────────────────────────────────────────────

const allBookings = async (req, res) => {
  const result = await db.execute(`
    SELECT b.*, s.date_time, s.duration_minutes, s.trainer,
           u.first_name, u.last_name, u.email,
           pp.lessons_remaining
    FROM pt_bookings b
    JOIN pt_slots s ON s.id = b.slot_id
    JOIN users u ON u.id = b.user_id
    LEFT JOIN pt_purchases pp ON pp.id = b.purchase_id
    ORDER BY s.date_time DESC
  `);
  res.json({ bookings: result.rows });
};

const confirmBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: `SELECT b.*, s.date_time, u.email, u.first_name
          FROM pt_bookings b
          JOIN pt_slots s ON s.id = b.slot_id
          JOIN users u ON u.id = b.user_id
          WHERE b.id = ?`,
    args: [req.params.id],
  });
  const booking = bookingRes.rows[0];
  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });

  const ops = [
    {
      sql: `UPDATE pt_bookings SET status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      args: [booking.id],
    },
  ];

  // Deduceer les van pakket bij bevestiging
  if (booking.purchase_id) {
    ops.push({
      sql: `UPDATE pt_purchases SET lessons_remaining = lessons_remaining - 1, lessons_used = lessons_used + 1, updated_at = datetime('now') WHERE id = ?`,
      args: [booking.purchase_id],
    });
  }
  await db.batch(ops, 'write');

  // Stuur bevestigingsmail + push notificatie
  sendPtConfirmationEmail({
    to: booking.email, firstName: booking.first_name, dateTime: booking.date_time,
  }).catch((e) => console.error('[Email] PT confirm:', e.message));

  sendPush(booking.user_id, 'PT Sessie bevestigd! 💪', `Je personal training op ${new Date(booking.date_time).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })} is bevestigd!`);

  // Controleer of lessen bijna op zijn
  if (booking.purchase_id) {
    const purRes = await db.execute({ sql: 'SELECT * FROM pt_purchases WHERE id = ?', args: [booking.purchase_id] });
    const pur = purRes.rows[0];
    if (pur && pur.lessons_remaining <= 3 && pur.lessons_remaining > 0) {
      sendPush(booking.user_id, `Nog ${pur.lessons_remaining} les${pur.lessons_remaining > 1 ? 'sen' : ''} over`, 'Koop een nieuw pakket zodat je kunt blijven trainen!');
      sendPtLowBalanceEmail({ to: booking.email, firstName: booking.first_name, remaining: pur.lessons_remaining }).catch(() => {});
    }
  }

  res.json({ message: 'Boeking bevestigd.' });
};

const declineBooking = async (req, res) => {
  const bookingRes = await db.execute({
    sql: `SELECT b.*, s.date_time FROM pt_bookings b JOIN pt_slots s ON s.id = b.slot_id WHERE b.id = ?`,
    args: [req.params.id],
  });
  const booking = bookingRes.rows[0];
  if (!booking) return res.status(404).json({ error: 'Boeking niet gevonden.' });

  await db.batch([
    {
      sql: `UPDATE pt_bookings SET status = 'declined', updated_at = datetime('now') WHERE id = ?`,
      args: [booking.id],
    },
    {
      sql: `UPDATE pt_slots SET status = 'available', updated_at = datetime('now') WHERE id = ?`,
      args: [booking.slot_id],
    },
  ], 'write');

  sendPush(booking.user_id, 'PT sessie helaas niet bevestigd', 'Neem contact op met de gym voor een alternatieve tijd.');
  res.json({ message: 'Boeking afgewezen.' });
};

const toggleExtraPerson = async (req, res) => {
  const { extra_person } = req.body;
  await db.execute({
    sql: `UPDATE pt_bookings SET extra_person = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [extra_person ? 1 : 0, req.params.id],
  });
  res.json({ message: 'Extra persoon bijgewerkt.' });
};

// ── Lesson balance ────────────────────────────────────────────────────────────

const myBalance = async (req, res) => {
  const purchases = await db.execute({
    sql: `SELECT * FROM pt_purchases WHERE user_id = ? AND status = 'paid' AND lessons_remaining > 0 AND (expires_at IS NULL OR expires_at >= date('now')) ORDER BY created_at ASC`,
    args: [req.user.id],
  });
  const subscription = await db.execute({
    sql: `SELECT * FROM pt_subscriptions WHERE user_id = ? AND status IN ('active','cancelling') ORDER BY created_at DESC LIMIT 1`,
    args: [req.user.id],
  });
  res.json({
    purchases: purchases.rows,
    subscription: subscription.rows[0] || null,
    total_remaining: purchases.rows.reduce((s, p) => s + p.lessons_remaining, 0),
  });
};

const allBalances = async (req, res) => {
  const result = await db.execute(`
    SELECT pp.*, u.first_name, u.last_name, u.email
    FROM pt_purchases pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.status = 'paid' AND pp.lessons_remaining > 0
    ORDER BY pp.created_at DESC
  `);
  res.json({ balances: result.rows });
};

// ── Checkout pakket ───────────────────────────────────────────────────────────

const startPackageCheckout = async (req, res) => {
  const { package_id, agreed_to_terms } = req.body;
  if (!agreed_to_terms) return res.status(400).json({ error: 'Je moet akkoord gaan met de voorwaarden.' });

  const pkg = PT_PACKAGES.find((p) => p.id === parseInt(package_id));
  if (!pkg) return res.status(404).json({ error: 'Pakket niet gevonden.' });

  const userRes = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.user.id] });
  const user = userRes.rows[0];

  // Maak of hergebruik Mollie klant
  let mollieCustomerId = user.mollie_customer_id;
  if (!mollieCustomerId) {
    const customer = await mollieClient.customers.create({ name: `${user.first_name} ${user.last_name}`, email: user.email, locale: 'nl_NL' });
    mollieCustomerId = customer.id;
    await db.execute({ sql: 'UPDATE users SET mollie_customer_id = ? WHERE id = ?', args: [mollieCustomerId, user.id] });
  }

  const amount    = Number(pkg.total_price).toFixed(2);
  const redirectUrl = `${process.env.FRONTEND_URL || process.env.APP_BASE_URL}/personal-training?betaling=geslaagd`;
  const webhookUrl  = process.env.MOLLIE_WEBHOOK_URL;
  const description = `MHGym PT Pakket ${pkg.label}`;

  let payment;
  try {
    payment = await mollieClient.payments.create({
      amount: { currency: 'EUR', value: amount },
      customerId: mollieCustomerId,
      description,
      redirectUrl,
      webhookUrl,
      locale: 'nl_NL',
      metadata: { type: 'pt_package', user_id: String(user.id), package_id: String(pkg.id) },
    });
  } catch (err) {
    return res.status(502).json({ error: `Mollie fout: ${err.message}` });
  }

  // Sla betaling op
  await db.execute({
    sql: `INSERT INTO payments (user_id, mollie_payment_id, amount, description, type, checkout_url) VALUES (?, ?, ?, ?, 'pt_package', ?)`,
    args: [user.id, payment.id, amount, description, payment.getCheckoutUrl()],
  });

  res.json({ checkout_url: payment.getCheckoutUrl(), payment_id: payment.id });
};

// ── Checkout abonnement ───────────────────────────────────────────────────────

const startSubscriptionCheckout = async (req, res) => {
  const { plan_id, agreed_to_terms } = req.body;
  if (!agreed_to_terms) return res.status(400).json({ error: 'Je moet akkoord gaan met de voorwaarden.' });

  const plan = PT_PLANS.find((p) => p.id === parseInt(plan_id));
  if (!plan) return res.status(404).json({ error: 'Abonnement niet gevonden.' });

  // Check geen actief PT-abonnement
  const activeRes = await db.execute({
    sql: `SELECT id FROM pt_subscriptions WHERE user_id = ? AND status IN ('active','cancelling')`,
    args: [req.user.id],
  });
  if (activeRes.rows[0]) return res.status(400).json({ error: 'Je hebt al een actief PT-abonnement.' });

  const userRes = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [req.user.id] });
  const user = userRes.rows[0];

  let mollieCustomerId = user.mollie_customer_id;
  if (!mollieCustomerId) {
    const customer = await mollieClient.customers.create({ name: `${user.first_name} ${user.last_name}`, email: user.email, locale: 'nl_NL' });
    mollieCustomerId = customer.id;
    await db.execute({ sql: 'UPDATE users SET mollie_customer_id = ? WHERE id = ?', args: [mollieCustomerId, user.id] });
  }

  const amount      = Number(plan.price_monthly).toFixed(2);
  const redirectUrl = `${process.env.FRONTEND_URL || process.env.APP_BASE_URL}/personal-training?betaling=geslaagd`;
  const webhookUrl  = process.env.MOLLIE_WEBHOOK_URL;
  const description = `MHGym PT Abonnement ${plan.label} — eerste betaling`;

  let payment;
  try {
    payment = await mollieClient.payments.create({
      amount: { currency: 'EUR', value: amount },
      customerId: mollieCustomerId,
      sequenceType: 'first',
      description,
      redirectUrl,
      webhookUrl,
      locale: 'nl_NL',
      metadata: { type: 'pt_subscription_first', user_id: String(user.id), plan_id: String(plan.id) },
    });
  } catch (err) {
    return res.status(502).json({ error: `Mollie fout: ${err.message}` });
  }

  await db.execute({
    sql: `INSERT INTO payments (user_id, mollie_payment_id, amount, description, type, checkout_url) VALUES (?, ?, ?, ?, 'pt_subscription', ?)`,
    args: [user.id, payment.id, amount, description, payment.getCheckoutUrl()],
  });

  res.json({ checkout_url: payment.getCheckoutUrl(), payment_id: payment.id });
};

// ── PT abonnement opzeggen ────────────────────────────────────────────────────

const cancelPtSubscription = async (req, res) => {
  const subRes = await db.execute({
    sql: `SELECT * FROM pt_subscriptions WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
    args: [req.user.id],
  });
  const sub = subRes.rows[0];
  if (!sub) return res.status(404).json({ error: 'Geen actief PT-abonnement gevonden.' });

  const today       = new Date();
  const contractEnd = sub.contract_end ? new Date(sub.contract_end) : null;
  if (contractEnd && today < contractEnd) {
    const daysLeft = Math.ceil((contractEnd - today) / 86400000);
    return res.status(400).json({
      error: `Opzeggen pas mogelijk vanaf ${new Date(sub.contract_end).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })} (nog ${daysLeft} dagen).`,
    });
  }

  const cancelsAt = addMonths(today, 1);

  // Annuleer Mollie subscription indien aanwezig
  if (sub.mollie_subscription_id) {
    const userRes = await db.execute({ sql: 'SELECT mollie_customer_id FROM users WHERE id = ?', args: [req.user.id] });
    const customerId = userRes.rows[0]?.mollie_customer_id;
    if (customerId) {
      try { await mollieClient.subscriptions.cancel({ customerId, id: sub.mollie_subscription_id }); }
      catch (e) { console.error('[Mollie] PT sub annuleren mislukt:', e.message); }
    }
  }

  await db.execute({
    sql: `UPDATE pt_subscriptions SET status = 'cancelling', cancels_at = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [toDateStr(cancelsAt), sub.id],
  });

  res.json({ message: `PT-abonnement opgezegd. Toegang tot ${cancelsAt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}.` });
};

// ── Push notificaties ─────────────────────────────────────────────────────────

const subscribePush = async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'Ongeldige push subscription.' });
  }
  try {
    await db.execute({
      sql: `INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)`,
      args: [req.user.id, endpoint, keys.p256dh, keys.auth],
    });
    res.json({ message: 'Push notificaties ingeschakeld.' });
  } catch (e) {
    res.status(500).json({ error: 'Opslaan mislukt.' });
  }
};

const getVapidKey = (_, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
};

// ── Reminders (handmatig triggeren of via cron) ───────────────────────────────

const sendReminders = async (req, res) => {
  const in24h = new Date(Date.now() + 24 * 3600000);
  const in30m  = new Date(Date.now() + 30 * 60000);
  const from24 = new Date(Date.now() + 23 * 3600000);
  const from30 = new Date(Date.now() + 25 * 60000);

  // 24-uurs herinneringen
  const tmr = await db.execute({
    sql: `SELECT b.user_id, u.first_name, s.date_time FROM pt_bookings b JOIN pt_slots s ON s.id = b.slot_id JOIN users u ON u.id = b.user_id WHERE b.status = 'confirmed' AND s.date_time BETWEEN ? AND ?`,
    args: [from24.toISOString(), in24h.toISOString()],
  });
  for (const r of tmr.rows) {
    await sendPush(r.user_id, '⏰ PT morgen!', `Je personal training morgen om ${new Date(r.date_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} — vergeet niet annuleren vóór 24 uur voor de sessie!`);
  }

  // 30-minuten herinneringen
  const soon = await db.execute({
    sql: `SELECT b.user_id, s.date_time FROM pt_bookings b JOIN pt_slots s ON s.id = b.slot_id WHERE b.status = 'confirmed' AND s.date_time BETWEEN ? AND ?`,
    args: [from30.toISOString(), in30m.toISOString()],
  });
  for (const r of soon.rows) {
    await sendPush(r.user_id, '🥊 PT begint zo!', 'Je personal training sessie begint over 30 minuten!');
  }

  res.json({ reminders_24h: tmr.rows.length, reminders_30m: soon.rows.length });
};

module.exports = {
  getPackages, getPlans,
  getSlots, createSlot, updateSlot, deleteSlot,
  myBookings, createBooking, cancelBooking,
  allBookings, confirmBooking, declineBooking, toggleExtraPerson,
  myBalance, allBalances,
  startPackageCheckout, startSubscriptionCheckout, cancelPtSubscription,
  subscribePush, getVapidKey, sendReminders,
  // For use in payment webhook:
  PT_PACKAGES, PT_PLANS, sendPush,
};
