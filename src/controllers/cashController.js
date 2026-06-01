/**
 * Cash & Fonds controller
 *
 * Beheert:
 *  - Handmatige cash betalingen (lidmaatschap, PT, kwartaal)
 *  - Fonds lidmaatschappen (Jeugdfonds, Volwassenenfonds) met verloop-tracking
 *  - Automatische herinneringen voor kwartaalbetalingen en fonds verlopen
 *  - Inkomen dashboard (uitsplitsing per betaaltype)
 */
const db = require('../config/database');
const { sendPush } = require('./ptController');
const { sendEmail } = require('../services/emailService');

// ── Cash betalingen ──────────────────────────────────────────────────────────

/** Registreer een handmatige cash betaling */
const logCashPayment = async (req, res) => {
  const { user_id, amount, payment_date, payment_type, sessions_paid, note } = req.body;
  if (!user_id || !amount || !payment_date) {
    return res.status(400).json({ error: 'user_id, amount en payment_date zijn verplicht.' });
  }
  const result = await db.execute({
    sql: `INSERT INTO cash_payments (user_id, amount, payment_date, payment_type, sessions_paid, note, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [user_id, amount, payment_date, payment_type || 'membership', sessions_paid || null, note || null, req.user.id],
  });

  // Als het PT sessies zijn, voeg ook toe aan pt_purchases
  if (payment_type === 'pt' && sessions_paid) {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const pricePerSession = sessions_paid > 0 ? Number(amount) / Number(sessions_paid) : 0;
    await db.execute({
      sql: `INSERT INTO pt_purchases (user_id, package_id, lessons_total, lessons_remaining, lessons_used, amount, status, expires_at)
            VALUES (?, 'cash_pt', ?, ?, 0, ?, 'paid', ?)`,
      args: [user_id, sessions_paid, sessions_paid, Number(amount), expiresAt.toISOString().split('T')[0]],
    });
  }

  res.status(201).json({ id: Number(result.lastInsertRowid), message: 'Cash betaling geregistreerd.' });
};

/** Overzicht van cash betalingen (filter op user_id of maand) */
const getCashPayments = async (req, res) => {
  const { user_id, month } = req.query;
  let sql = `
    SELECT cp.*, u.first_name, u.last_name, u.email
    FROM cash_payments cp
    JOIN users u ON u.id = cp.user_id
    WHERE 1=1
  `;
  const args = [];
  if (user_id) { sql += ' AND cp.user_id = ?'; args.push(user_id); }
  if (month)   { sql += ` AND strftime('%Y-%m', cp.payment_date) = ?`; args.push(month); }
  sql += ' ORDER BY cp.payment_date DESC LIMIT 200';
  const result = await db.execute({ sql, args });
  res.json({ payments: result.rows });
};

/** Markeer kwartaalbetaling als ontvangen voor een user_membership */
const markQuarterlyPaid = async (req, res) => {
  const { amount, payment_date, note } = req.body;
  const memRes = await db.execute({
    sql: `SELECT um.*, u.first_name, u.last_name, u.email
          FROM user_memberships um
          JOIN users u ON u.id = um.user_id
          WHERE um.id = ?`,
    args: [req.params.id],
  });
  const mem = memRes.rows[0];
  if (!mem) return res.status(404).json({ error: 'Lidmaatschap niet gevonden.' });

  const paidDate   = payment_date || new Date().toISOString().split('T')[0];
  const paidAmount = Number(amount || mem.quarterly_amount || 0);

  // Bereken volgende kwartaalvervaldatum
  const nextDue = new Date(paidDate);
  nextDue.setMonth(nextDue.getMonth() + 3);
  const nextDueStr = nextDue.toISOString().split('T')[0];

  await db.execute({
    sql: `UPDATE user_memberships
          SET last_quarter_paid = ?, next_quarter_due = ?, quarter_reminder_sent = 0, updated_at = datetime('now')
          WHERE id = ?`,
    args: [paidDate, nextDueStr, req.params.id],
  });

  await db.execute({
    sql: `INSERT INTO cash_payments (user_id, amount, payment_date, payment_type, note, created_by)
          VALUES (?, ?, ?, 'quarter', ?, ?)`,
    args: [mem.user_id, paidAmount, paidDate, note || `Kwartaalbetaling ${paidDate}`, req.user.id],
  });

  res.json({ message: 'Kwartaalbetaling geregistreerd.', next_due: nextDueStr });
};

/** Alle cash-betalende leden met kwartaalinfo */
const getCashMembers = async (req, res) => {
  const result = await db.execute(`
    SELECT u.id, u.first_name, u.last_name, u.email, u.phone,
           um.id AS membership_id, um.quarterly_amount, um.next_quarter_due,
           um.last_quarter_paid, um.quarter_reminder_sent,
           um.status AS membership_status, um.membership_type_key, um.start_date,
           m.name AS membership_name,
           ROUND(julianday(um.next_quarter_due) - julianday('now')) AS days_until_due
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE um.payment_type = 'cash' AND um.status IN ('active','cancelling')
    ORDER BY um.next_quarter_due ASC NULLS LAST
  `);
  res.json({ members: result.rows });
};

// ── Fonds leden ──────────────────────────────────────────────────────────────

/** Maak een fonds lidmaatschap aan */
const createFondsMembership = async (req, res) => {
  const { user_id, fonds_type, fonds_name, start_date, end_date, amount_covered, notes } = req.body;
  if (!user_id || !fonds_type || !start_date || !end_date) {
    return res.status(400).json({ error: 'user_id, fonds_type, start_date en end_date zijn verplicht.' });
  }

  const result = await db.execute({
    sql: `INSERT INTO fonds_members (user_id, fonds_type, fonds_name, start_date, end_date, amount_covered, notes, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [user_id, fonds_type, fonds_name || fonds_type, start_date, end_date, amount_covered || null, notes || null, req.user.id],
  });
  const fondsId = Number(result.lastInsertRowid);

  // Koppel aan actief lidmaatschap
  await db.execute({
    sql: `UPDATE user_memberships SET payment_type = 'fonds', fonds_member_id = ?, updated_at = datetime('now')
          WHERE user_id = ? AND status IN ('active','cancelling')`,
    args: [fondsId, user_id],
  });

  // Stuur welkomstbericht naar lid
  const userRes = await db.execute({ sql: 'SELECT email, first_name FROM users WHERE id = ?', args: [user_id] });
  if (userRes.rows[0]) {
    await sendPush(user_id, '✅ Fonds geactiveerd!', `Je ${fonds_name || fonds_type} is geactiveerd t/m ${end_date}.`).catch(() => {});
  }

  res.status(201).json({ id: fondsId, message: 'Fonds lidmaatschap aangemaakt.' });
};

/** Overzicht van alle actieve fonds leden (optioneel filter: ?type=jeugdsportfonds) */
const listFondsMembers = async (req, res) => {
  const { type, status } = req.query;
  let sql = `
    SELECT fm.*, u.first_name, u.last_name, u.email, u.phone,
           ROUND(julianday(fm.end_date) - julianday('now')) AS days_remaining
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE 1=1
  `;
  const args = [];
  if (type)   { sql += ' AND LOWER(fm.fonds_type) = LOWER(?)'; args.push(type); }
  if (status) { sql += ' AND fm.status = ?'; args.push(status); }
  sql += ' ORDER BY fm.end_date ASC';
  const result = await db.execute({ sql, args });
  res.json({ members: result.rows });
};

/** Update fonds lidmaatschap (verlengen, aanpassen, status wijzigen) */
const updateFondsMembership = async (req, res) => {
  const { fonds_type, fonds_name, start_date, end_date, amount_covered, notes, status } = req.body;
  await db.execute({
    sql: `UPDATE fonds_members SET
          fonds_type   = COALESCE(?, fonds_type),
          fonds_name   = COALESCE(?, fonds_name),
          start_date   = COALESCE(?, start_date),
          end_date     = COALESCE(?, end_date),
          amount_covered = COALESCE(?, amount_covered),
          notes        = COALESCE(?, notes),
          status       = COALESCE(?, status),
          expiry_reminder_sent  = 0,
          expiry_reminder2_sent = 0,
          expiry_urgent_sent    = 0,
          auto_paused_at        = NULL,
          updated_at   = datetime('now')
          WHERE id = ?`,
    args: [
      fonds_type || null, fonds_name || null, start_date || null, end_date || null,
      amount_covered != null ? amount_covered : null,
      notes !== undefined ? notes : null,
      status || null,
      req.params.id,
    ],
  });

  // Als verlengd, hervat lidmaatschap indien gepauzeerd
  if (end_date) {
    const fondsRes = await db.execute({ sql: 'SELECT user_id FROM fonds_members WHERE id = ?', args: [req.params.id] });
    if (fondsRes.rows[0]) {
      await db.execute({
        sql: `UPDATE users SET membership_paused = 0, membership_paused_reason = NULL, updated_at = datetime('now') WHERE id = ? AND membership_paused = 1`,
        args: [fondsRes.rows[0].user_id],
      });
    }
  }

  res.json({ message: 'Fonds bijgewerkt.' });
};

// ── Automatische herinneringen ───────────────────────────────────────────────

/** Verwerk fonds-verloopmeldingen: 30/14/7 dagen voor + auto-pauze op verloopdatum */
// Interne logica — kan ook door cron worden aangeroepen
const runFondsReminders = async () => {
  const results = { month1: 0, weeks2: 0, week1: 0, auto_paused: 0 };

  const fondsMembers = await db.execute(`
    SELECT fm.*, u.email, u.first_name, u.last_name
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status = 'active'
  `);

  for (const fm of fondsMembers.rows) {
    const daysRemaining = Math.round((new Date(fm.end_date) - new Date()) / 86400000);
    const fondsLabel = fm.fonds_name || fm.fonds_type;

    // 1 maand voor verlopen (30 dagen)
    if (daysRemaining <= 30 && !fm.expiry_reminder_sent) {
      await sendEmail({
        to: fm.email,
        subject: `Je ${fondsLabel} loopt binnenkort af — MHGym`,
        html: `<p>Hoi ${fm.first_name},</p>
               <p>Je <strong>${fondsLabel}</strong> loopt af op <strong>${fm.end_date}</strong> (over ${daysRemaining} dagen).</p>
               <p>Vraag zo snel mogelijk een nieuw fonds aan, anders kun je niet meer meedoen bij MHGym!</p>
               <p>Neem contact op: <a href="mailto:info@mhgym.nl">info@mhgym.nl</a></p>`,
      }).catch(() => {});
      await sendPush(fm.user_id, `⚠️ ${fondsLabel} loopt af`, `Je fonds loopt af op ${fm.end_date}. Vraag zsm een nieuw fonds aan!`).catch(() => {});
      await db.execute({ sql: `UPDATE fonds_members SET expiry_reminder_sent = 1, updated_at = datetime('now') WHERE id = ?`, args: [fm.id] });
      results.month1++;
    }

    // 2 weken voor verlopen (14 dagen)
    if (daysRemaining <= 14 && !fm.expiry_reminder2_sent) {
      await sendEmail({
        to: fm.email,
        subject: `⚠️ ${fondsLabel} verloopt over 2 weken — MHGym`,
        html: `<p>Hoi ${fm.first_name},</p>
               <p>Herinnering: je <strong>${fondsLabel}</strong> verloopt over <strong>${daysRemaining} dagen</strong> (${fm.end_date}).</p>
               <p>Regel zo snel mogelijk een nieuw fonds!</p>`,
      }).catch(() => {});
      await sendPush(fm.user_id, `🔔 ${fondsLabel}: 2 weken over`, `Fonds verloopt op ${fm.end_date}. Regel nu een nieuw fonds.`).catch(() => {});
      await db.execute({ sql: `UPDATE fonds_members SET expiry_reminder2_sent = 1, updated_at = datetime('now') WHERE id = ?`, args: [fm.id] });
      results.weeks2++;
    }

    // 1 week voor verlopen (7 dagen) — ook admins notificeren
    if (daysRemaining <= 7 && daysRemaining >= 0 && !fm.expiry_urgent_sent) {
      await sendEmail({
        to: fm.email,
        subject: `🔴 URGENT: ${fondsLabel} verloopt over ${daysRemaining} dag${daysRemaining !== 1 ? 'en' : ''} — MHGym`,
        html: `<p>Hoi ${fm.first_name},</p>
               <p><strong>Let op!</strong> Je ${fondsLabel} verloopt over <strong>${daysRemaining} dag${daysRemaining !== 1 ? 'en' : ''}</strong> op <strong>${fm.end_date}</strong>.</p>
               <p>Als je fonds verloopt wordt je lidmaatschap automatisch gepauzeerd. Neem direct contact op!</p>`,
      }).catch(() => {});
      await sendPush(fm.user_id, `🔴 URGENT: ${fondsLabel} verloopt binnenkort`, `Over ${daysRemaining} dag${daysRemaining !== 1 ? 'en' : ''}: ${fm.end_date}. Direct actie nodig!`).catch(() => {});

      const admins = await db.execute({ sql: `SELECT id FROM users WHERE role = 'admin'`, args: [] });
      for (const admin of admins.rows) {
        await sendPush(admin.id, `⚠️ Fonds: ${fm.first_name} ${fm.last_name}`, `${fondsLabel} verloopt ${fm.end_date} (${daysRemaining}d)`).catch(() => {});
      }

      await db.execute({ sql: `UPDATE fonds_members SET expiry_urgent_sent = 1, updated_at = datetime('now') WHERE id = ?`, args: [fm.id] });
      results.week1++;
    }

    // Verloopdatum bereikt — automatisch pauzeren
    if (daysRemaining < 0 && !fm.auto_paused_at) {
      await db.execute({
        sql: `UPDATE users SET membership_paused = 1, membership_paused_reason = ?, updated_at = datetime('now') WHERE id = ?`,
        args: [`Fonds verlopen op ${fm.end_date}`, fm.user_id],
      });
      await db.execute({
        sql: `UPDATE fonds_members SET auto_paused_at = datetime('now'), status = 'expired', updated_at = datetime('now') WHERE id = ?`,
        args: [fm.id],
      });
      await sendEmail({
        to: fm.email,
        subject: 'Lidmaatschap gepauzeerd — fonds verlopen — MHGym',
        html: `<p>Hoi ${fm.first_name},</p>
               <p>Je ${fondsLabel} is verlopen op ${fm.end_date}. Je lidmaatschap is tijdelijk gepauzeerd.</p>
               <p>Neem contact op om dit te herstellen: <a href="mailto:info@mhgym.nl">info@mhgym.nl</a></p>`,
      }).catch(() => {});
      results.auto_paused++;
    }
  }

  return results;
};

const processFondsReminders = async (req, res) => {
  const results = await runFondsReminders();
  res.json({ message: 'Fonds herinneringen verwerkt.', results });
};

/** Verwerk kwartaal-betalingsherinneringen: 14 dagen → admin, 7 dagen → lid */
const runQuarterlyReminders = async () => {
  const results = { admin_14d: 0, member_7d: 0 };

  const cashMembers = await db.execute(`
    SELECT um.*, u.email, u.first_name, u.last_name,
           ROUND(julianday(um.next_quarter_due) - julianday('now')) AS days_until_due
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.payment_type = 'cash'
      AND um.status IN ('active','cancelling')
      AND um.next_quarter_due IS NOT NULL
    ORDER BY um.next_quarter_due
  `);

  for (const mem of cashMembers.rows) {
    const days = Math.round(Number(mem.days_until_due) || 99);

    // 14 dagen voor vervaldatum → notificeer admin
    if (days <= 14 && days > 7 && !mem.quarter_reminder_sent) {
      const admins = await db.execute({ sql: `SELECT id FROM users WHERE role = 'admin'`, args: [] });
      for (const admin of admins.rows) {
        await sendPush(admin.id, `💰 Kwartaalbetaling bijna: ${mem.first_name}`, `${mem.first_name} ${mem.last_name}: €${mem.quarterly_amount} verwacht op ${mem.next_quarter_due}`).catch(() => {});
      }
      await db.execute({ sql: `UPDATE user_memberships SET quarter_reminder_sent = 1, updated_at = datetime('now') WHERE id = ?`, args: [mem.id] });
      results.admin_14d++;
    }

    // 7 dagen voor vervaldatum → notificeer lid
    if (days <= 7 && days >= 0) {
      await sendPush(mem.user_id, '💰 Kwartaalbetaling binnenkort', `Je kwartaalbetaling van €${mem.quarterly_amount} is verschuldigd op ${mem.next_quarter_due}.`).catch(() => {});
      await sendEmail({
        to: mem.email,
        subject: 'Kwartaalbetaling binnenkort — MHGym',
        html: `<p>Hoi ${mem.first_name},</p>
               <p>Je kwartaalbetaling van <strong>€${mem.quarterly_amount}</strong> bij MHGym is verschuldigd op <strong>${mem.next_quarter_due}</strong>.</p>
               <p>Betaal dit graag contant aan de balie. Bij vragen: <a href="mailto:info@mhgym.nl">info@mhgym.nl</a></p>`,
      }).catch(() => {});
      results.member_7d++;
    }
  }

  return results;
};

const processQuarterlyReminders = async (req, res) => {
  const results = await runQuarterlyReminders();
  res.json({ message: 'Kwartaalherinneringen verwerkt.', results });
};

/** Verwerk achterstand-meldingen voor cash leden: betaling is over datum */
const processCashOverdueReminders = async (req, res) => {
  const results = { newly_overdue: 0 };

  const overdueMembers = await db.execute(`
    SELECT um.*, u.email, u.first_name, u.last_name,
           ROUND(julianday('now') - julianday(um.next_quarter_due)) AS days_overdue
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.payment_type = 'cash'
      AND um.status IN ('active', 'cancelling')
      AND um.next_quarter_due IS NOT NULL
      AND julianday('now') > julianday(um.next_quarter_due)
      AND um.cash_overdue_reminder_sent = 0
  `);

  for (const mem of overdueMembers.rows) {
    const days = Math.round(Number(mem.days_overdue) || 0);
    const label = `${mem.first_name} ${mem.last_name}`;
    const amount = mem.quarterly_amount ? `€${mem.quarterly_amount}` : 'onbekend bedrag';

    // Notificeer alle admins
    const admins = await db.execute({ sql: `SELECT id FROM users WHERE role = 'admin'`, args: [] });
    for (const admin of admins.rows) {
      await sendPush(
        admin.id,
        `⚠️ Achterstand: ${label}`,
        `Kwartaalbetaling van ${amount} was verwacht op ${mem.next_quarter_due} (${days} dag${days !== 1 ? 'en' : ''} geleden).`
      ).catch(() => {});
    }

    // Notificeer het lid zelf
    await sendPush(
      mem.user_id,
      '⚠️ Betaling achterstallig',
      `Je kwartaalbetaling van ${amount} was verschuldigd op ${mem.next_quarter_due}. Betaal zo snel mogelijk aan de balie.`
    ).catch(() => {});

    await sendEmail({
      to: mem.email,
      subject: 'Betalingsherinnering — achterstallige betaling — MHGym',
      html: `<p>Hoi ${mem.first_name},</p>
             <p>Je kwartaalbetaling van <strong>${amount}</strong> was verschuldigd op <strong>${mem.next_quarter_due}</strong> en is nog niet ontvangen.</p>
             <p>Betaal dit graag zo snel mogelijk contant aan de balie. Bij vragen: <a href="mailto:info@mhgym.nl">info@mhgym.nl</a></p>`,
    }).catch(() => {});

    await db.execute({
      sql: `UPDATE user_memberships SET cash_overdue_reminder_sent = 1, updated_at = datetime('now') WHERE id = ?`,
      args: [mem.id],
    });

    results.newly_overdue++;
  }

  res.json({ message: 'Achterstand-meldingen verwerkt.', results });
};

// ── Cash PT overzicht ─────────────────────────────────────────────────────────

const getCashPtOverview = async (req, res) => {
  const result = await db.execute(`
    SELECT u.id, u.first_name, u.last_name, u.email,
           COALESCE(pp.total_paid, 0)      AS total_sessions_paid,
           COALESCE(pp.total_remaining, 0) AS sessions_remaining,
           COALESCE(pp.total_used, 0)      AS sessions_used,
           COALESCE(cp.total_cash_pt, 0)  AS total_cash_income,
           pp.last_payment
    FROM users u
    LEFT JOIN (
      SELECT user_id,
             SUM(lessons_total)     AS total_paid,
             SUM(lessons_remaining) AS total_remaining,
             SUM(lessons_used)      AS total_used,
             MAX(created_at)        AS last_payment
      FROM pt_purchases WHERE status = 'paid'
      GROUP BY user_id
    ) pp ON pp.user_id = u.id
    LEFT JOIN (
      SELECT user_id, SUM(amount) AS total_cash_pt
      FROM cash_payments WHERE payment_type = 'pt'
      GROUP BY user_id
    ) cp ON cp.user_id = u.id
    WHERE pp.total_paid > 0 OR cp.total_cash_pt > 0
    ORDER BY pp.total_remaining ASC
  `);
  res.json({ members: result.rows });
};

// ── Inkomen dashboard ──────────────────────────────────────────────────────────

const getIncomeBreakdown = async (req, res) => {
  const { month } = req.query;
  const targetMonth = month || new Date().toISOString().substring(0, 7);

  const [y, m] = targetMonth.split('-').map(Number);
  const nextMonthDate = new Date(y, m, 1);
  const nextMonth = nextMonthDate.toISOString().substring(0, 7);

  const [mollie, cashMembership, cashPt, cashQuarter, shop, outstanding, prevMonths] = await Promise.all([
    // Mollie (betalingen via de webhook)
    db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
            FROM payments WHERE status = 'paid' AND strftime('%Y-%m', created_at) = ?`,
      args: [targetMonth],
    }),
    // Cash lidmaatschap betalingen
    db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
            FROM cash_payments WHERE strftime('%Y-%m', payment_date) = ? AND payment_type = 'membership'`,
      args: [targetMonth],
    }),
    // Cash PT betalingen
    db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count,
                   COALESCE(SUM(sessions_paid), 0) AS sessions
            FROM cash_payments WHERE strftime('%Y-%m', payment_date) = ? AND payment_type = 'pt'`,
      args: [targetMonth],
    }),
    // Kwartaalbetalingen
    db.execute({
      sql: `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
            FROM cash_payments WHERE strftime('%Y-%m', payment_date) = ? AND payment_type = 'quarter'`,
      args: [targetMonth],
    }),
    // Winkel
    db.execute({
      sql: `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
            FROM orders WHERE status = 'paid' AND strftime('%Y-%m', created_at) = ?`,
      args: [targetMonth],
    }),
    // Openstaande betalingen
    db.execute(`
      SELECT COALESCE(SUM(amount + COALESCE(surcharge_added, 0)), 0) AS total, COUNT(*) AS count
      FROM payment_failures WHERE status = 'open'
    `),
    // 6 maanden historiek
    db.execute(`
      SELECT strftime('%Y-%m', payment_date) AS month,
             SUM(amount) AS cash_total, COUNT(*) AS count
      FROM cash_payments
      WHERE payment_date >= date('now', '-6 months')
      GROUP BY month ORDER BY month DESC
    `),
  ]);

  // Verwachte inkomsten volgende maand (actieve Mollie abonnementen)
  const expectedMollie = await db.execute(`
    SELECT COALESCE(SUM(COALESCE(um.admin_price, m.price_monthly)), 0) AS expected
    FROM user_memberships um
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE um.status = 'active' AND COALESCE(um.payment_type, 'mollie') = 'mollie'
  `);

  // Verwachte cash kwartaalbetalingen volgende maand
  const expectedCash = await db.execute({
    sql: `SELECT COALESCE(SUM(quarterly_amount), 0) AS expected, COUNT(*) AS count
          FROM user_memberships
          WHERE payment_type = 'cash' AND status = 'active'
            AND strftime('%Y-%m', next_quarter_due) = ?`,
    args: [nextMonth],
  });

  // Actieve fonds leden
  const fondsActive = await db.execute(`
    SELECT COUNT(*) AS count FROM fonds_members WHERE status = 'active'
  `);
  const fondsExpiring = await db.execute(`
    SELECT COUNT(*) AS count FROM fonds_members
    WHERE status = 'active' AND julianday(end_date) - julianday('now') <= 30
  `);

  const totalThisMonth =
    Number(mollie.rows[0].total) +
    Number(cashMembership.rows[0].total) +
    Number(cashPt.rows[0].total) +
    Number(cashQuarter.rows[0].total) +
    Number(shop.rows[0].total);

  res.json({
    month: targetMonth,
    total: totalThisMonth,
    breakdown: {
      mollie:          { total: mollie.rows[0].total,          count: mollie.rows[0].count },
      cash_membership: { total: cashMembership.rows[0].total,  count: cashMembership.rows[0].count },
      cash_pt:         { total: cashPt.rows[0].total,          count: cashPt.rows[0].count, sessions: cashPt.rows[0].sessions },
      cash_quarter:    { total: cashQuarter.rows[0].total,     count: cashQuarter.rows[0].count },
      shop:            { total: shop.rows[0].total,            count: shop.rows[0].count },
    },
    outstanding: { total: outstanding.rows[0].total, count: outstanding.rows[0].count },
    expected_next_month: {
      mollie: expectedMollie.rows[0].expected,
      cash:   expectedCash.rows[0].expected,
      cash_count: expectedCash.rows[0].count,
      total:  Number(expectedMollie.rows[0].expected) + Number(expectedCash.rows[0].expected),
    },
    fonds: {
      active:   fondsActive.rows[0].count,
      expiring: fondsExpiring.rows[0].count,
    },
    cash_history: prevMonths.rows,
  });
};

module.exports = {
  logCashPayment, getCashPayments, markQuarterlyPaid, getCashMembers,
  createFondsMembership, listFondsMembers, updateFondsMembership,
  processFondsReminders, processQuarterlyReminders, processCashOverdueReminders,
  runFondsReminders, runQuarterlyReminders,
  getIncomeBreakdown, getCashPtOverview,
};
