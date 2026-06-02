const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { sendPush } = require('./ptController');
const { sendEmail, sendAdminWelcomeEmail, sendPtConfirmationEmail } = require('../services/emailService');

// ── Lidmaatschapstypes (constanten) ────────────────────────────────────────
const MEMBERSHIP_TYPES = [
  // Groepslessen
  { key: 'jeugd_jaar',               label: 'Jeugd Jaar',               category: 'groepslessen', price_monthly: 45,  duration_months: 12, minimum_months: 12 },
  { key: 'jeugd_half_jaar',          label: 'Jeugd Half jaar',          category: 'groepslessen', price_monthly: 50,  duration_months: 6,  minimum_months: 6  },
  { key: 'jeugd_maand',              label: 'Jeugd Maand',              category: 'groepslessen', price_monthly: 55,  duration_months: 1,  minimum_months: 1  },
  { key: 'volwassenen_jaar',         label: 'Volwassenen Jaar',         category: 'groepslessen', price_monthly: 55,  duration_months: 12, minimum_months: 12 },
  { key: 'volwassenen_half_jaar',    label: 'Volwassenen Half jaar',    category: 'groepslessen', price_monthly: 60,  duration_months: 6,  minimum_months: 6  },
  { key: 'volwassenen_maand',        label: 'Volwassenen Maand',        category: 'groepslessen', price_monthly: 65,  duration_months: 1,  minimum_months: 1  },
  // Vrij trainen
  { key: 'vt_onbeperkt',             label: 'Vrij Trainen Onbeperkt',   category: 'vrij_trainen', price_monthly: null, custom_price: true },
  { key: 'vt_10x',                   label: 'Vrij Trainen 10x kaart',   category: 'vrij_trainen', price_monthly: null, custom_price: true },
  { key: 'vt_dagpas',                label: 'Vrij Trainen Dagpas',      category: 'vrij_trainen', price_monthly: null, custom_price: true },
  // Personal Training
  { key: 'pt_losse_les',             label: 'PT Losse les',             category: 'pt',           price_monthly: null, price_per_lesson: 70,  lessons: 1  },
  { key: 'pt_10_lessen',             label: 'PT 10 lessen',             category: 'pt',           price_monthly: null, price_per_lesson: 60,  lessons: 10 },
  { key: 'pt_20_lessen',             label: 'PT 20 lessen',             category: 'pt',           price_monthly: null, price_per_lesson: 58,  lessons: 20 },
  { key: 'pt_30_lessen',             label: 'PT 30 lessen',             category: 'pt',           price_monthly: null, price_per_lesson: 56,  lessons: 30 },
  { key: 'pt_40_lessen',             label: 'PT 40 lessen',             category: 'pt',           price_monthly: null, price_per_lesson: 54,  lessons: 40 },
  { key: 'pt_50_lessen',             label: 'PT 50 lessen',             category: 'pt',           price_monthly: null, price_per_lesson: 52,  lessons: 50 },
  { key: 'pt_abo_1x',                label: 'PT Abonnement 1x/week',    category: 'pt_abo',       price_monthly: 240,  price_per_lesson: 60,  minimum_months: 6  },
  { key: 'pt_abo_2x',                label: 'PT Abonnement 2x/week',    category: 'pt_abo',       price_monthly: 440,  price_per_lesson: 55,  minimum_months: 6  },
  { key: 'pt_abo_3x',                label: 'PT Abonnement 3x/week',    category: 'pt_abo',       price_monthly: 600,  price_per_lesson: 50,  minimum_months: 6  },
];

// ── Leden ──────────────────────────────────────────────────────────────────

const listMembers = async (req, res) => {
  const { q } = req.query;
  let sql = `
    SELECT
      u.id, u.email, u.first_name, u.last_name, u.phone, u.role,
      u.is_cash_payer, u.admin_notes, u.membership_paused, u.created_at,
      um.id AS user_membership_id, um.status AS membership_status,
      um.start_date, um.end_date, um.is_cash, um.cash_paid, um.admin_price, um.membership_type_key,
      m.name AS membership_name, m.category AS membership_category, m.price_monthly,
      (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id AND b.status = 'confirmed') AS total_bookings,
      (SELECT COUNT(*) FROM pt_bookings pb WHERE pb.user_id = u.id AND pb.status IN ('confirmed','completed')) AS total_pt,
      (SELECT SUM(pp.lessons_remaining) FROM pt_purchases pp WHERE pp.user_id = u.id AND pp.status = 'paid' AND pp.lessons_remaining > 0) AS pt_lessons_remaining,
      fm.fonds_type, fm.fonds_name, fm.end_date AS fonds_end_date,
      ROUND(julianday(fm.end_date) - julianday('now')) AS fonds_days_remaining
    FROM users u
    LEFT JOIN user_memberships um ON um.user_id = u.id AND um.status IN ('active','cancelling')
    LEFT JOIN memberships m ON m.id = um.membership_id
    LEFT JOIN fonds_members fm ON fm.user_id = u.id AND fm.status = 'active'
  `;
  const args = [];
  if (q) {
    sql += ` WHERE (u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)`;
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  sql += ' ORDER BY u.created_at DESC';

  const result = await db.execute({ sql, args });
  res.json({ members: result.rows, membership_types: MEMBERSHIP_TYPES });
};

const getMember = async (req, res) => {
  const userRes = await db.execute({
    sql: `SELECT u.*, '' AS password_hash FROM users u WHERE u.id = ?`,
    args: [req.params.id],
  });
  if (!userRes.rows[0]) return res.status(404).json({ error: 'Lid niet gevonden.' });

  const [membershipRes, bookingRes, paymentRes, ptRes, vtRes, cashRes, fondsRes] = await Promise.all([
    db.execute({
      sql: `SELECT um.*, m.name AS membership_name, m.category FROM user_memberships um LEFT JOIN memberships m ON m.id = um.membership_id WHERE um.user_id = ? ORDER BY um.created_at DESC`,
      args: [req.params.id],
    }),
    db.execute({
      sql: `SELECT b.*, c.name AS class_name, c.date_time, c.category FROM bookings b JOIN classes c ON c.id = b.class_id WHERE b.user_id = ? ORDER BY c.date_time DESC LIMIT 20`,
      args: [req.params.id],
    }),
    db.execute({
      sql: `SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
      args: [req.params.id],
    }),
    db.execute({
      sql: `SELECT pb.*, ps.date_time, ps.trainer FROM pt_bookings pb JOIN pt_slots ps ON ps.id = pb.slot_id WHERE pb.user_id = ? ORDER BY ps.date_time DESC LIMIT 20`,
      args: [req.params.id],
    }),
    db.execute({
      sql: `SELECT * FROM vrij_trainen_bookings WHERE user_id = ? ORDER BY date DESC LIMIT 20`,
      args: [req.params.id],
    }),
    db.execute({
      sql: `SELECT * FROM cash_payments WHERE user_id = ? ORDER BY payment_date DESC LIMIT 30`,
      args: [req.params.id],
    }),
    db.execute({
      sql: `SELECT *, ROUND(julianday(end_date) - julianday('now')) AS days_remaining FROM fonds_members WHERE user_id = ? ORDER BY created_at DESC`,
      args: [req.params.id],
    }),
  ]);

  const member = { ...userRes.rows[0] };
  delete member.password_hash;

  res.json({
    member,
    memberships:     membershipRes.rows,
    bookings:        bookingRes.rows,
    payments:        paymentRes.rows,
    pt_sessions:     ptRes.rows,
    vt_bookings:     vtRes.rows,
    cash_payments:   cashRes.rows,
    fonds:           fondsRes.rows,
    membership_types: MEMBERSHIP_TYPES,
  });
};

const setMemberRole = async (req, res) => {
  const { role } = req.body;
  if (!['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Ongeldige rol.' });
  await db.execute({ sql: `UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?`, args: [role, req.params.id] });
  res.json({ message: `Rol bijgewerkt naar ${role}.` });
};

const updateMemberNotes = async (req, res) => {
  const { admin_notes, is_cash_payer } = req.body;
  await db.execute({
    sql: `UPDATE users SET admin_notes = COALESCE(?, admin_notes), is_cash_payer = COALESCE(?, is_cash_payer), updated_at = datetime('now') WHERE id = ?`,
    args: [admin_notes ?? null, is_cash_payer != null ? (is_cash_payer ? 1 : 0) : null, req.params.id],
  });
  res.json({ message: 'Bijgewerkt.' });
};

const pauseMembership = async (req, res) => {
  const { paused, reason } = req.body;
  await db.execute({
    sql: `UPDATE users SET membership_paused = ?, membership_paused_reason = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [paused ? 1 : 0, reason || null, req.params.id],
  });
  res.json({ message: paused ? 'Lidmaatschap gepauzeerd.' : 'Lidmaatschap hervat.' });
};

// Admin wijst handmatig lidmaatschap toe (Mollie, Cash kwartaal of Fonds)
const assignMembership = async (req, res) => {
  const {
    membership_type_key, admin_price, start_date, is_cash, cash_paid, notes,
    payment_type,      // 'mollie' | 'cash' | 'fonds'
    quarterly_amount,  // voor cash kwartaal
    // fonds velden
    fonds_type, fonds_name, fonds_end_date, fonds_amount_covered,
  } = req.body;
  if (!membership_type_key) return res.status(400).json({ error: 'membership_type_key is verplicht.' });

  const mtype = MEMBERSHIP_TYPES.find((t) => t.key === membership_type_key);
  if (!mtype) return res.status(404).json({ error: 'Onbekend lidmaatschapstype.' });

  const pType     = payment_type || (is_cash ? 'cash' : 'mollie');
  const startDate = start_date || new Date().toISOString().split('T')[0];
  const endDate   = mtype.duration_months ? (() => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + mtype.duration_months);
    return d.toISOString().split('T')[0];
  })() : null;

  // Bereken kwartaalvervaldatum als cash-kwartaal
  const nextQuarterDue = (pType === 'cash' && quarterly_amount) ? (() => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  })() : null;
  const lastQuarterPaid = (pType === 'cash' && quarterly_amount) ? startDate : null;

  // Deactiveer bestaand actief lidmaatschap
  await db.execute({
    sql: `UPDATE user_memberships SET status = 'cancelled', updated_at = datetime('now') WHERE user_id = ? AND status IN ('active','cancelling')`,
    args: [req.params.id],
  });

  // Zoek of maak een membership record
  let membershipId = null;
  const existingM = await db.execute({ sql: `SELECT id FROM memberships WHERE name = ?`, args: [mtype.label] });
  if (existingM.rows[0]) {
    membershipId = existingM.rows[0].id;
  } else {
    const ins = await db.execute({
      sql: `INSERT INTO memberships (name, category, price_monthly, duration_months, minimum_months, features, notice_period_months) VALUES (?, ?, ?, ?, ?, ?, 1)`,
      args: [mtype.label, mtype.category, mtype.price_monthly || admin_price || 0, mtype.duration_months || 1, mtype.minimum_months || 1, '[]'],
    });
    membershipId = ins.lastInsertRowid;
  }

  const result = await db.execute({
    sql: `INSERT INTO user_memberships
          (user_id, membership_id, status, start_date, end_date, is_cash, cash_paid, admin_price, membership_type_key,
           payment_type, quarterly_amount, next_quarter_due, last_quarter_paid)
          VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      req.params.id, membershipId, startDate, endDate,
      (pType === 'cash' || is_cash) ? 1 : 0,
      cash_paid ? 1 : 0,
      admin_price || null,
      membership_type_key,
      pType,
      quarterly_amount ? Number(quarterly_amount) : null,
      nextQuarterDue,
      lastQuarterPaid,
    ],
  });
  const newMembershipId = result.lastInsertRowid;

  // Fonds: maak een fonds_members record en koppel
  if (pType === 'fonds' && fonds_type && fonds_end_date) {
    const fondsRes = await db.execute({
      sql: `INSERT INTO fonds_members (user_id, fonds_type, fonds_name, start_date, end_date, amount_covered, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [req.params.id, fonds_type, fonds_name || fonds_type, startDate, fonds_end_date, fonds_amount_covered || null, req.user.id],
    });
    await db.execute({
      sql: `UPDATE user_memberships SET fonds_member_id = ? WHERE id = ?`,
      args: [fondsRes.lastInsertRowid, newMembershipId],
    });
  }

  // PT lessen aanmaken
  if (mtype.category === 'pt' && mtype.lessons) {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    const purchaseAmount = Number(admin_price) || (Number(mtype.price_per_lesson || 0) * Number(mtype.lessons || 0));
    await db.execute({
      sql: `INSERT INTO pt_purchases (user_id, package_id, lessons_total, lessons_remaining, lessons_used, amount, status, expires_at) VALUES (?, ?, ?, ?, 0, ?, 'paid', ?)`,
      args: [req.params.id, mtype.key, mtype.lessons, mtype.lessons, purchaseAmount, expiresAt.toISOString().split('T')[0]],
    });
  }

  // Cash betaler markeren
  if (pType === 'cash' || is_cash) {
    await db.execute({ sql: `UPDATE users SET is_cash_payer = 1, updated_at = datetime('now') WHERE id = ?`, args: [req.params.id] });
  }

  if (notes) {
    await db.execute({ sql: `UPDATE users SET admin_notes = ?, updated_at = datetime('now') WHERE id = ?`, args: [notes, req.params.id] });
  }

  res.status(201).json({ message: `Lidmaatschap "${mtype.label}" toegewezen (${pType}).` });
};

const markCashPaid = async (req, res) => {
  await db.execute({
    sql: `UPDATE user_memberships SET cash_paid = 1, updated_at = datetime('now') WHERE id = ? AND is_cash = 1`,
    args: [req.params.mid],
  });
  res.json({ message: 'Betaling gemarkeerd als ontvangen.' });
};

// Admin voegt handmatig PT lessen toe
const addPtLessons = async (req, res) => {
  const { lessons, notes, amount: lessonAmount } = req.body;
  if (!lessons || lessons < 1) return res.status(400).json({ error: 'Geef een geldig aantal lessen op.' });

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  await db.execute({
    sql: `INSERT INTO pt_purchases (user_id, package_id, lessons_total, lessons_remaining, lessons_used, amount, status, expires_at)
          VALUES (?, 'admin_manual', ?, ?, 0, ?, 'paid', ?)`,
    args: [req.params.id, lessons, lessons, Number(lessonAmount) || 0, expiresAt.toISOString().split('T')[0]],
  });
  if (notes) {
    await db.execute({
      sql: `UPDATE users SET admin_notes = COALESCE(admin_notes, '') || '\n[PT +' || ? || ' lessen] ' || ? WHERE id = ?`,
      args: [lessons, notes, req.params.id],
    });
  }
  res.json({ message: `${lessons} PT lessen toegevoegd.` });
};

/**
 * Admin maakt handmatig een nieuw lid aan via IBAN + kiest abonnement.
 * - Genereert tijdelijk wachtwoord
 * - Maakt Mollie klant aan
 * - Legt SEPA mandate vast
 * - Maakt Mollie recurring subscription aan (start volgende maand)
 * - Activeer lidmaatschap direct
 * - Stuurt welkomstmail met tijdelijk wachtwoord
 */
const createMemberWithSepa = async (req, res) => {
  const { first_name, last_name, email, phone, iban, membership_id } = req.body;

  if (!first_name || !last_name || !email || !membership_id) {
    return res.status(400).json({ error: 'Voornaam, achternaam, e-mail en abonnement zijn verplicht.' });
  }

  // Controleer of e-mail al bestaat
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE email = ?', args: [email] });
  if (existing.rows[0]) {
    return res.status(409).json({ error: 'Er bestaat al een account met dit e-mailadres.' });
  }

  // Haal membership op
  const mRes = await db.execute({ sql: 'SELECT * FROM memberships WHERE id = ?', args: [membership_id] });
  const membership = mRes.rows[0];
  if (!membership) return res.status(404).json({ error: 'Abonnement niet gevonden.' });

  // Tijdelijk wachtwoord aanmaken
  const tempPassword = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 tekens
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  // Gebruiker aanmaken
  const userRes = await db.execute({
    sql: `INSERT INTO users (email, password_hash, first_name, last_name, phone, role, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 'member', datetime('now'), datetime('now'))`,
    args: [email.toLowerCase().trim(), passwordHash, first_name.trim(), last_name.trim(), phone?.trim() || null],
  });
  const userId = Number(userRes.lastInsertRowid);

  // Mollie klant aanmaken
  let mollieCustomerId = null;
  let subscriptionId   = null;

  try {
    const { createMollieClient } = require('@mollie/api-client');
    if (process.env.MOLLIE_API_KEY && process.env.MOLLIE_API_KEY !== 'test_dummy') {
      const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });

      // Klant aanmaken
      const customer = await mollie.customers.create({
        name:   `${first_name.trim()} ${last_name.trim()}`,
        email:  email.toLowerCase().trim(),
        locale: 'nl_NL',
      });
      mollieCustomerId = customer.id;

      // Sla customer ID op bij user
      await db.execute({ sql: `UPDATE users SET mollie_customer_id = ? WHERE id = ?`, args: [mollieCustomerId, userId] });

      // SEPA mandate aanmaken via Mollie (alleen als IBAN opgegeven)
      if (iban) {
        await mollie.customerMandates.create(mollieCustomerId, {
          method:          'directdebit',
          consumerName:    `${first_name.trim()} ${last_name.trim()}`,
          consumerAccount: iban.replace(/\s/g, '').toUpperCase(),
        });
      }

      // Recurring subscription alleen aanmaken als IBAN (mandate) aanwezig is
      if (iban) {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const startDate = nextMonth.toISOString().split('T')[0];

        const subscription = await mollie.subscriptions.create({
          customerId:  mollieCustomerId,
          amount:      { currency: 'EUR', value: Number(membership.price_monthly).toFixed(2) },
          interval:    '1 month',
          startDate,
          description: `MHGym ${membership.name} (${membership.category}) — maandelijks`,
          webhookUrl:  process.env.MOLLIE_WEBHOOK_URL,
          metadata: {
            type:          'subscription_payment',
            user_id:       String(userId),
            membership_id: String(membership_id),
          },
        });
        subscriptionId = subscription.id;
        console.log(`[Admin] Mollie subscription aangemaakt: ${subscriptionId} voor nieuwe user ${userId}`);
      } else {
        console.log(`[Admin] Geen IBAN — subscription overgeslagen voor user ${userId}`);
      }
    } else {
      console.warn('[Admin] Geen Mollie API key — SEPA mandate overgeslagen voor user', userId);
    }
  } catch (mollieErr) {
    console.error('[Admin] Mollie fout bij aanmaken mandate/subscription:', mollieErr.message);
    // We gaan door — lidmaatschap wordt alsnog geactiveerd, admin kan later corrigeren
  }

  // Lidmaatschap activeren
  const now          = new Date();
  const contractEnd  = new Date(now);
  contractEnd.setMonth(contractEnd.getMonth() + (membership.minimum_months || 1));

  await db.execute({
    sql: `INSERT INTO user_memberships
            (user_id, membership_id, status, start_date, contract_start, contract_end,
             minimum_months, notice_period_months, mollie_subscription_id, agreed_to_terms, payment_type)
          VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, 1, 'mollie')`,
    args: [
      userId, membership_id,
      now.toISOString().split('T')[0],
      now.toISOString().split('T')[0],
      contractEnd.toISOString().split('T')[0],
      membership.minimum_months || 1,
      membership.notice_period_months || 1,
      subscriptionId,
    ],
  });

  // Welkomstmail sturen
  const loginUrl = `${process.env.FRONTEND_URL || 'https://app.mhgym.nl'}/login`;
  const memberNote = iban
    ? 'Je incassomachtiging (SEPA) is ingesteld. Elke maand wordt automatisch het abonnementsbedrag afgeschreven.'
    : 'Via de app kun je het lesrooster bekijken, lessen reserveren en je boekingen beheren. Je betaalt contant aan de balie.';
  sendAdminWelcomeEmail({
    to: email.toLowerCase().trim(),
    firstName: first_name.trim(),
    tempPassword,
    loginUrl,
    memberNote,
  }).catch(e => console.error('[Email] admin welcome:', e.message));

  console.log(`[Admin] Nieuw lid aangemaakt: ${email} (user ${userId}) — subscription: ${subscriptionId || 'geen'}`);

  res.status(201).json({
    message: `Lid ${first_name} ${last_name} aangemaakt. Welkomstmail verstuurd naar ${email}.`,
    user_id: userId,
    mollie_customer_id: mollieCustomerId,
    subscription_id: subscriptionId,
  });
};

const deleteMember = async (req, res) => {
  const existing = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [req.params.id] });
  if (!existing.rows[0]) return res.status(404).json({ error: 'Lid niet gevonden.' });
  if (String(existing.rows[0].id) === String(req.user.id)) return res.status(400).json({ error: 'Je kunt jezelf niet verwijderen.' });
  await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [req.params.id] });
  res.json({ message: 'Lid verwijderd.' });
};

// ── Lessen ──────────────────────────────────────────────────────────────────

const adminListClasses = async (req, res) => {
  const result = await db.execute(`
    SELECT c.*, (c.max_capacity - c.current_bookings) AS spots_left,
           (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status = 'confirmed') AS confirmed_bookings
    FROM classes c ORDER BY c.date_time DESC LIMIT 200
  `);
  res.json({ classes: result.rows });
};

const adminCreateClass = async (req, res) => {
  const {
    name, description, instructor, category, date_time, duration_minutes, max_capacity, location,
    repeat_type = 'none', repeat_weeks = 4,
  } = req.body;
  if (!name || !instructor || !category || !date_time) {
    return res.status(400).json({ error: 'Naam, instructeur, categorie en datum zijn verplicht.' });
  }

  // Parse date components from local datetime string (format: 2025-06-02T16:00 or 2025-06-02T16:00:00)
  const [datePart, timePart = '00:00'] = date_time.split('T');
  const [yr, mo, dy] = datePart.split('-').map(Number);
  const [hr, mn = 0] = timePart.replace(/:\d\d$/, '').split(':').map(Number);

  const toDateTimeStr = (d) => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  };

  // Determine occurrences and interval
  let occurrences  = 1;
  let intervalDays = 0;
  if (repeat_type === 'weekly') {
    occurrences  = Math.min(Math.max(1, parseInt(repeat_weeks) || 4), 26);
    intervalDays = 7;
  } else if (repeat_type === 'biweekly') {
    occurrences  = Math.min(Math.max(1, parseInt(repeat_weeks) || 4), 26);
    intervalDays = 14;
  }

  // Unique group id for this repeat batch (to allow bulk-delete later)
  const repeatGroupId = occurrences > 1 ? `rg-${Date.now()}` : null;

  const created = [];
  for (let i = 0; i < occurrences; i++) {
    const d = new Date(yr, mo - 1, dy + i * intervalDays, hr, mn);
    const dtStr = toDateTimeStr(d);
    const r = await db.execute({
      sql: `INSERT INTO classes (name, description, instructor, category, date_time, duration_minutes, max_capacity, location, repeat_type, repeat_group_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [name, description || null, instructor, category, dtStr,
             duration_minutes || 60, max_capacity || 20, location || 'Zaal A',
             repeat_type, repeatGroupId],
    });
    created.push(Number(r.lastInsertRowid));
  }

  if (created.length === 1) {
    const cls = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [created[0]] });
    return res.status(201).json({ class: cls.rows[0], count: 1 });
  }

  res.status(201).json({ count: created.length, message: `${created.length} lessen aangemaakt (${repeat_type}).`, repeat_group_id: repeatGroupId });
};

const adminGetClassBookings = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT b.id, b.status, b.booked_at, u.first_name, u.last_name, u.email
          FROM bookings b
          JOIN users u ON u.id = b.user_id
          WHERE b.class_id = ? AND b.status = 'confirmed'
          ORDER BY b.booked_at`,
    args: [req.params.id],
  });
  res.json({ bookings: result.rows });
};

const adminUpdateClass = async (req, res) => {
  const { name, description, instructor, category, date_time, duration_minutes, max_capacity, location, status } = req.body;
  const existing = await db.execute({ sql: 'SELECT id FROM classes WHERE id = ?', args: [req.params.id] });
  if (!existing.rows[0]) return res.status(404).json({ error: 'Les niet gevonden.' });
  await db.execute({
    sql: `UPDATE classes SET name=COALESCE(?,name), description=COALESCE(?,description), instructor=COALESCE(?,instructor),
          category=COALESCE(?,category), date_time=COALESCE(?,date_time), duration_minutes=COALESCE(?,duration_minutes),
          max_capacity=COALESCE(?,max_capacity), location=COALESCE(?,location), status=COALESCE(?,status), updated_at=datetime('now') WHERE id=?`,
    args: [name??null,description??null,instructor??null,category??null,date_time??null,duration_minutes??null,max_capacity??null,location??null,status??null,req.params.id],
  });
  const updated = await db.execute({ sql: 'SELECT * FROM classes WHERE id = ?', args: [req.params.id] });
  res.json({ class: updated.rows[0] });
};

const adminCancelClass = async (req, res) => {
  await db.execute({ sql: `UPDATE classes SET status='cancelled', updated_at=datetime('now') WHERE id=?`, args: [req.params.id] });
  res.json({ message: 'Les geannuleerd.' });
};

// ── Boekingen ──────────────────────────────────────────────────────────────

const adminListBookings = async (req, res) => {
  const result = await db.execute(`
    SELECT b.*, u.first_name, u.last_name, u.email, c.name AS class_name, c.date_time, c.category, c.instructor
    FROM bookings b JOIN users u ON u.id = b.user_id JOIN classes c ON c.id = b.class_id
    ORDER BY b.booked_at DESC LIMIT 500
  `);
  res.json({ bookings: result.rows });
};

// ── Betalingen & Statistieken ──────────────────────────────────────────────

const adminListPayments = async (req, res) => {
  const result = await db.execute(`
    SELECT p.*, u.first_name, u.last_name, u.email, m.name AS membership_name, m.category AS membership_category
    FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN memberships m ON m.id = p.membership_id
    ORDER BY p.created_at DESC
  `);
  res.json({ payments: result.rows });
};

const getStats = async (req, res) => {
  const [memberCount, activeMembers, totalRevenue, monthRevenue, classCount, bookingCount, orderCount, productCount] = await Promise.all([
    db.execute(`SELECT COUNT(*) as n FROM users WHERE role='member'`),
    db.execute(`SELECT COUNT(*) as n FROM user_memberships WHERE status='active'`),
    db.execute(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid'`),
    db.execute(`SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status='paid' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`),
    db.execute(`SELECT COUNT(*) as n FROM classes WHERE status='scheduled' AND date_time>=datetime('now')`),
    db.execute(`SELECT COUNT(*) as n FROM bookings WHERE status='confirmed'`),
    db.execute(`SELECT COUNT(*) as n FROM orders WHERE status='paid'`),
    db.execute(`SELECT COUNT(*) as n FROM products WHERE active=1`),
  ]);
  const revenueByMonth = await db.execute(`SELECT strftime('%Y-%m',created_at) as month, SUM(amount) as revenue, COUNT(*) as count FROM payments WHERE status='paid' AND created_at>=datetime('now','-6 months') GROUP BY month ORDER BY month DESC`);
  const membershipBreakdown = await db.execute(`SELECT m.name, m.category, COUNT(*) as count FROM user_memberships um JOIN memberships m ON m.id=um.membership_id WHERE um.status='active' GROUP BY m.id ORDER BY count DESC`);
  const topClasses = await db.execute(`SELECT c.name, c.category, c.instructor, COUNT(b.id) as bookings FROM classes c LEFT JOIN bookings b ON b.class_id=c.id AND b.status='confirmed' WHERE c.date_time>=datetime('now','-30 days') GROUP BY c.name,c.category,c.instructor ORDER BY bookings DESC LIMIT 5`);
  res.json({
    stats: {
      member_count: memberCount.rows[0].n, active_members: activeMembers.rows[0].n,
      total_revenue: totalRevenue.rows[0].total, month_revenue: monthRevenue.rows[0].total,
      class_count: classCount.rows[0].n, booking_count: bookingCount.rows[0].n,
      order_count: orderCount.rows[0].n, product_count: productCount.rows[0].n,
    },
    revenue_by_month: revenueByMonth.rows,
    membership_breakdown: membershipBreakdown.rows,
    top_classes: topClasses.rows,
  });
};

// ── Betalingsfouten ─────────────────────────────────────────────────────────

const getPaymentDetail = async (req, res) => {
  const pfRes = await db.execute({
    sql: `SELECT pf.*, u.first_name, u.last_name, u.email, u.phone, u.membership_paused
          FROM payment_failures pf
          JOIN users u ON u.id = pf.user_id
          WHERE pf.id = ?`,
    args: [req.params.id],
  });
  const pf = pfRes.rows[0];
  if (!pf) return res.status(404).json({ error: 'Niet gevonden.' });

  // Betaalhistorie van dit lid (laatste 20)
  const history = await db.execute({
    sql: `SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`,
    args: [pf.user_id],
  });

  // Actief lidmaatschap
  const memRes = await db.execute({
    sql: `SELECT um.*, m.name AS membership_name, m.category FROM user_memberships um LEFT JOIN memberships m ON m.id = um.membership_id WHERE um.user_id = ? AND um.status IN ('active','cancelling') LIMIT 1`,
    args: [pf.user_id],
  });

  res.json({
    failure: pf,
    payment_history: history.rows,
    active_membership: memRes.rows[0] || null,
  });
};

const getPaymentFailures = async (req, res) => {
  const result = await db.execute(`
    SELECT pf.*, u.first_name, u.last_name, u.email
    FROM payment_failures pf JOIN users u ON u.id = pf.user_id
    WHERE pf.status = 'open'
    ORDER BY pf.failure_count DESC, pf.created_at DESC
  `);
  res.json({ failures: result.rows });
};

const sendPaymentReminder = async (req, res) => {
  const pfRes = await db.execute({ sql: 'SELECT pf.*, u.email, u.first_name FROM payment_failures pf JOIN users u ON u.id = pf.user_id WHERE pf.id = ?', args: [req.params.id] });
  const pf = pfRes.rows[0];
  if (!pf) return res.status(404).json({ error: 'Niet gevonden.' });

  await sendEmail({
    to: pf.email,
    subject: 'Herinnering: openstaande betaling MHGym',
    html: `<p>Beste ${pf.first_name},</p>
           <p>Je hebt een openstaande betaling van <strong>€${pf.amount}</strong> bij MHGym.</p>
           <p>Neem contact op om dit te regelen.</p>
           <p>Met vriendelijke groet,<br/>Team MHGym</p>`,
  }).catch(() => {});

  await sendPush(pf.user_id, '💳 Openstaande betaling', `Je hebt een openstaande betaling van €${pf.amount}. Neem contact op.`).catch(() => {});

  await db.execute({
    sql: `UPDATE payment_failures SET last_reminder_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Herinnering verstuurd.' });
};

const markPaymentPaid = async (req, res) => {
  const pfRes = await db.execute({ sql: 'SELECT * FROM payment_failures WHERE id = ?', args: [req.params.id] });
  if (!pfRes.rows[0]) return res.status(404).json({ error: 'Niet gevonden.' });
  await db.execute({
    sql: `UPDATE payment_failures SET status = 'paid', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Betaling gemarkeerd als voldaan.' });
};

const sendPayLink = async (req, res) => {
  const pfRes = await db.execute({
    sql: `SELECT pf.*, u.email, u.first_name, u.last_name FROM payment_failures pf JOIN users u ON u.id = pf.user_id WHERE pf.id = ?`,
    args: [req.params.id],
  });
  const pf = pfRes.rows[0];
  if (!pf) return res.status(404).json({ error: 'Niet gevonden.' });

  // Probeer Mollie betaallink aan te maken
  let payLink = null;
  try {
    const { createMollieClient } = require('@mollie/api-client');
    if (process.env.MOLLIE_API_KEY && process.env.MOLLIE_API_KEY !== 'test_dummy') {
      const mollie = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });
      const total  = (Number(pf.amount) + Number(pf.surcharge_added || 0)).toFixed(2);
      const payment = await mollie.payments.create({
        amount:      { currency: 'EUR', value: total },
        description: pf.description || `Openstaande betaling MHGym - ${pf.first_name} ${pf.last_name}`,
        redirectUrl: `${process.env.FRONTEND_URL || 'https://mhgym.nl'}/dashboard`,
        metadata:    { payment_failure_id: pf.id, user_id: pf.user_id },
      });
      payLink = payment._links.checkout.href;
    }
  } catch (e) {
    console.warn('[Mollie] Kon geen betaallink aanmaken:', e.message);
  }

  // Stuur e-mail + push met of zonder link
  const total = (Number(pf.amount) + Number(pf.surcharge_added || 0)).toFixed(2);
  const linkHtml = payLink
    ? `<div style="margin:24px 0;text-align:center"><a href="${payLink}" style="background:#F5C200;color:#000;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;display:inline-block">Betaal nu €${total}</a></div>`
    : `<p>Neem contact op met MHGym om de betaling te regelen.</p>`;

  await sendEmail({
    to: pf.email,
    subject: 'Betaalverzoek MHGym',
    html: `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto">
      <div style="background:#000;padding:24px 32px;text-align:center"><span style="font-size:26px;font-weight:900;color:#F5C200">MH</span><span style="font-size:26px;font-weight:900;color:#fff">GYM</span></div>
      <div style="padding:32px">
        <h2 style="color:#F5C200">Openstaande betaling</h2>
        <p>Hoi ${pf.first_name},</p>
        <p>Er staat nog een betaling van <strong style="color:#F5C200">€${total}</strong> open bij MHGym.</p>
        ${linkHtml}
        <p style="color:#666;font-size:13px">Vragen? <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a></p>
      </div>
    </div>`,
  }).catch(() => {});

  await sendPush(pf.user_id, '💳 Betaalverzoek MHGym', `Er staat €${total} open. Klik voor je betaallink.`).catch(() => {});

  // Sla de link op
  await db.execute({
    sql: `UPDATE payment_failures SET mollie_paylink = ?, last_reminder_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    args: [payLink || null, req.params.id],
  });

  res.json({ message: 'Betaallink verstuurd.', pay_link: payLink });
};

/**
 * Automatische herinneringen: dag 0, 3, 7, 8 (auto-pauze)
 * Wordt aangeroepen via een cron-achtige endpoint (POST /admin/payment-failures/auto-remind)
 */
const processAutoReminders = async (req, res) => {
  const now = new Date();
  const results = { day0: 0, day3: 0, day7: 0, auto_paused: 0 };

  const failures = await db.execute({
    sql: `SELECT pf.*, u.email, u.first_name, u.last_name
          FROM payment_failures pf
          JOIN users u ON u.id = pf.user_id
          WHERE pf.status = 'open'
          ORDER BY pf.created_at`,
    args: [],
  });

  for (const pf of failures.rows) {
    const daysOld = Math.floor((now - new Date(pf.created_at)) / 86400000);

    // ── €10 toeslag bij tweede stornering ─────────────────────────────────────
    if (pf.failure_count >= 2 && (!pf.surcharge_added || Number(pf.surcharge_added) === 0)) {
      await db.execute({
        sql: `UPDATE payment_failures SET surcharge_added = 10, updated_at = datetime('now') WHERE id = ?`,
        args: [pf.id],
      });
      await sendPush(pf.user_id, '⚠️ €10 administratiekosten toegevoegd', 'Wegens een tweede mislukte betaling zijn €10 administratiekosten in rekening gebracht.').catch(() => {});
    }

    const total = (Number(pf.amount) + Number(pf.surcharge_added || 0) + (pf.failure_count >= 2 && !pf.surcharge_added ? 10 : 0)).toFixed(2);

    // Dag 0 — directe herinnering
    if (daysOld >= 0 && !pf.reminder_day0_sent) {
      await sendEmail({
        to: pf.email,
        subject: 'Betaling mislukt — MHGym',
        html: `<p>Hoi ${pf.first_name},</p><p>Je betaling van €${total} is niet gelukt. Zorg dat je rekening saldo heeft, dan proberen we het opnieuw.</p><p>Vragen? <a href="mailto:info@mhgym.nl">info@mhgym.nl</a></p>`,
      }).catch(() => {});
      await sendPush(pf.user_id, '⚠️ Betaling mislukt', `Je betaling van €${total} is niet gelukt. Controleer je rekening.`).catch(() => {});
      await db.execute({ sql: `UPDATE payment_failures SET reminder_day0_sent = 1, last_reminder_at = datetime('now') WHERE id = ?`, args: [pf.id] });
      results.day0++;
    }

    // Dag 3 — tweede herinnering
    if (daysOld >= 3 && !pf.reminder_day3_sent) {
      await sendEmail({
        to: pf.email,
        subject: 'Herinnering: openstaande betaling — MHGym',
        html: `<p>Hoi ${pf.first_name},</p><p>Je betaling van €${total} staat nog steeds open (${daysOld} dagen). Los dit zo snel mogelijk op om je lidmaatschap actief te houden.</p>`,
      }).catch(() => {});
      await sendPush(pf.user_id, '📋 Betaling nog open', `Dag 3: je betaling van €${total} staat nog open.`).catch(() => {});
      await db.execute({ sql: `UPDATE payment_failures SET reminder_day3_sent = 1, last_reminder_at = datetime('now') WHERE id = ?`, args: [pf.id] });
      results.day3++;
    }

    // Dag 7 — waarschuwing voor auto-pauze
    if (daysOld >= 7 && !pf.reminder_day7_sent) {
      await sendEmail({
        to: pf.email,
        subject: '⚠️ Laatste waarschuwing: betaling MHGym',
        html: `<p>Hoi ${pf.first_name},</p><p>Je betaling van €${total} staat al 7 dagen open. <strong>Als dit morgen niet is opgelost, wordt je lidmaatschap automatisch gepauzeerd.</strong></p><p>Neem direct contact op: <a href="mailto:info@mhgym.nl">info@mhgym.nl</a></p>`,
      }).catch(() => {});
      await sendPush(pf.user_id, '🔴 Laatste waarschuwing', `Je betaling van €${total} staat 7 dagen open. Morgen wordt je lid gepauzeerd.`).catch(() => {});
      await db.execute({ sql: `UPDATE payment_failures SET reminder_day7_sent = 1, last_reminder_at = datetime('now') WHERE id = ?`, args: [pf.id] });
      results.day7++;
    }

    // Dag 8 — automatisch pauzeren
    if (daysOld >= 8 && !pf.auto_paused_at) {
      await db.execute({
        sql: `UPDATE users SET membership_paused = 1, membership_paused_reason = 'Automatisch gepauzeerd wegens openstaande betaling', updated_at = datetime('now') WHERE id = ?`,
        args: [pf.user_id],
      });
      await db.execute({
        sql: `UPDATE payment_failures SET auto_paused_at = datetime('now'), status = 'paused', updated_at = datetime('now') WHERE id = ?`,
        args: [pf.id],
      });
      await sendEmail({
        to: pf.email,
        subject: 'Lidmaatschap gepauzeerd — MHGym',
        html: `<p>Hoi ${pf.first_name},</p><p>Wegens een openstaande betaling van €${total} is je lidmaatschap tijdelijk gepauzeerd. Neem contact op om dit te herstellen: <a href="mailto:info@mhgym.nl">info@mhgym.nl</a></p>`,
      }).catch(() => {});
      await sendPush(pf.user_id, '🔒 Lidmaatschap gepauzeerd', `Je lidmaatschap is gepauzeerd wegens een openstaande betaling van €${total}.`).catch(() => {});
      results.auto_paused++;
    }
  }

  res.json({ message: 'Auto-herinneringen verwerkt.', results });
};

const pauseMembershipFromFailure = async (req, res) => {
  const pfRes = await db.execute({ sql: 'SELECT * FROM payment_failures WHERE id = ?', args: [req.params.id] });
  const pf = pfRes.rows[0];
  if (!pf) return res.status(404).json({ error: 'Niet gevonden.' });
  await db.execute({
    sql: `UPDATE users SET membership_paused = 1, membership_paused_reason = 'Openstaande betaling', updated_at = datetime('now') WHERE id = ?`,
    args: [pf.user_id],
  });
  await db.execute({
    sql: `UPDATE payment_failures SET status = 'paused', updated_at = datetime('now') WHERE id = ?`,
    args: [req.params.id],
  });
  res.json({ message: 'Lidmaatschap gepauzeerd.' });
};

// ── Admin: lid inboeken in groepsles ───────────────────────────────────────

// ── Admin: lid inboeken in groepsles ───────────────────────────────────────

const adminBookClass = async (req, res) => {
  const { class_id, user_id } = req.body;
  if (!class_id || !user_id) return res.status(400).json({ error: 'class_id en user_id zijn verplicht.' });

  const clsRes = await db.execute({
    sql: `SELECT * FROM classes WHERE id = ? AND status = 'scheduled'`,
    args: [class_id],
  });
  const cls = clsRes.rows[0];
  if (!cls) return res.status(404).json({ error: 'Les niet gevonden of al geannuleerd.' });
  if (Number(cls.current_bookings) >= Number(cls.max_capacity)) {
    return res.status(400).json({ error: 'Les is vol.' });
  }

  const dup = await db.execute({
    sql: `SELECT id FROM bookings WHERE user_id = ? AND class_id = ? AND status = 'confirmed'`,
    args: [user_id, class_id],
  });
  if (dup.rows[0]) return res.status(409).json({ error: 'Dit lid is al ingeschreven voor deze les.' });

  await db.execute({ sql: `INSERT INTO bookings (user_id, class_id) VALUES (?, ?)`, args: [user_id, class_id] });
  await db.execute({ sql: `UPDATE classes SET current_bookings = current_bookings + 1 WHERE id = ?`, args: [class_id] });

  const dtStr = new Date(cls.date_time).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  sendPush(user_id, `Ingeboekt: ${cls.name}`, `Je bent ingeboekt voor ${cls.name} op ${dtStr}.`).catch(() => {});

  // E-mail sturen
  const userRes = await db.execute({ sql: 'SELECT email, first_name FROM users WHERE id = ?', args: [user_id] });
  const usr = userRes.rows[0];
  if (usr) {
    const fmtDate = new Date(cls.date_time).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    const fmtTime = new Date(cls.date_time).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
    sendEmail({
      to: usr.email,
      subject: `MHGym — ingeboekt voor ${cls.name}`,
      html: `<div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;max-width:560px;margin:0 auto;border-radius:8px;padding:32px">
        <h2 style="color:#F5C200;margin:0 0 12px">Je bent ingeboekt! 🥊</h2>
        <p style="color:#ccc">Hoi ${usr.first_name}, je bent door de planner ingeboekt voor een les.</p>
        <div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:20px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;padding:6px 0">Les</td><td style="color:#fff;font-weight:600;text-align:right">${cls.name}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Datum</td><td style="color:#fff;font-weight:600;text-align:right">${fmtDate}</td></tr>
            <tr><td style="color:#888;padding:6px 0">Tijd</td><td style="color:#F5C200;font-weight:700;text-align:right">${fmtTime}</td></tr>
          </table>
        </div>
        <p style="color:#666;font-size:13px">Tot dan! 💪<br>Vragen? <a href="mailto:info@mhgym.nl" style="color:#F5C200">info@mhgym.nl</a></p>
      </div>`,
    }).catch(() => {});
  }

  res.status(201).json({ message: `Lid ingeboekt voor ${cls.name}.` });
};

// ── Admin: lid inboeken in PT slot ─────────────────────────────────────────

const adminBookPt = async (req, res) => {
  const { slot_id, user_id } = req.body;
  if (!slot_id || !user_id) return res.status(400).json({ error: 'slot_id en user_id zijn verplicht.' });

  const slotRes = await db.execute({
    sql: `SELECT * FROM pt_slots WHERE id = ? AND status = 'available'`,
    args: [slot_id],
  });
  const slot = slotRes.rows[0];
  if (!slot) return res.status(404).json({ error: 'PT slot niet gevonden of al geboekt.' });

  const dup = await db.execute({
    sql: `SELECT id FROM pt_bookings WHERE slot_id = ? AND status NOT IN ('cancelled','declined')`,
    args: [slot_id],
  });
  if (dup.rows[0]) return res.status(409).json({ error: 'Dit slot is al geboekt.' });

  await db.execute({
    sql: `INSERT INTO pt_bookings (user_id, slot_id, status) VALUES (?, ?, 'confirmed')`,
    args: [user_id, slot_id],
  });
  await db.execute({
    sql: `UPDATE pt_slots SET status = 'booked', updated_at = datetime('now') WHERE id = ?`,
    args: [slot_id],
  });

  const dtStr = new Date(slot.date_time).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  sendPush(user_id, 'PT Sessie ingeboekt! 💪', `Je personal training op ${dtStr} is bevestigd.`).catch(() => {});

  // E-mail sturen via bestaande PT bevestigingsmail
  const userRes2 = await db.execute({ sql: 'SELECT email, first_name FROM users WHERE id = ?', args: [user_id] });
  const usr2 = userRes2.rows[0];
  if (usr2) {
    sendPtConfirmationEmail({ to: usr2.email, firstName: usr2.first_name, dateTime: slot.date_time }).catch(() => {});
  }

  res.status(201).json({ message: 'Lid ingeboekt voor PT sessie.' });
};

module.exports = {
  MEMBERSHIP_TYPES,
  listMembers, getMember, setMemberRole, updateMemberNotes, pauseMembership,
  assignMembership, markCashPaid, addPtLessons, deleteMember, createMemberWithSepa,
  adminListClasses, adminCreateClass, adminUpdateClass, adminCancelClass, adminGetClassBookings,
  adminListBookings,
  adminListPayments,
  getStats,
  getPaymentFailures, getPaymentDetail, sendPaymentReminder, sendPayLink,
  markPaymentPaid, pauseMembershipFromFailure, processAutoReminders,
  adminBookClass, adminBookPt,
};
