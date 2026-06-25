/**
 * MHGym Health Check
 *
 * Controleert de database op:
 *  - Duplicaten (fonds_members, user_memberships per user)
 *  - Weesrecords (gebroken FK-koppelingen)
 *  - Data-inconsistenties (tellingen, datums, statussen)
 *  - Mollie-koppeling vs actieve memberships
 *  - Dashboard-totalen vs onderliggende data
 *
 * Maakt eerst een backup. Wijzigt NIETS.
 *
 * Gebruik: node scripts/health_check.js
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const DB_PATH = (process.env.DB_PATH || './mhgym.db').replace('./', '');
const db = createClient({ url: 'file:' + path.resolve(DB_PATH) });

// ── Opmaak helpers ────────────────────────────────────────────────────────────
const W  = '\x1b[33m';   // geel = waarschuwing
const E  = '\x1b[31m';   // rood  = fout
const OK = '\x1b[32m';   // groen = ok
const I  = '\x1b[36m';   // cyan  = info
const R  = '\x1b[0m';    // reset

const findings = { errors: [], warnings: [], info: [] };

function err(msg, rows = [])  { findings.errors.push({ msg, rows });   console.log(`${E}✖ ${msg}${R}`); if (rows.length) console.table(rows); }
function warn(msg, rows = []) { findings.warnings.push({ msg, rows }); console.log(`${W}⚠ ${msg}${R}`); if (rows.length) console.table(rows); }
function ok(msg)               { findings.info.push({ msg });           console.log(`${OK}✓ ${msg}${R}`); }
function info(msg, rows = [])  { findings.info.push({ msg });           console.log(`${I}ℹ ${msg}${R}`); if (rows.length) console.table(rows); }
function section(title)        { console.log(`\n${'═'.repeat(70)}\n  ${title}\n${'═'.repeat(70)}`); }

// ── Q helper ─────────────────────────────────────────────────────────────────
const Q = (sql, args = []) => db.execute({ sql, args }).then(r => r.rows);
const N = (sql, args = []) => Q(sql, args).then(rows => Number(rows[0]?.[Object.keys(rows[0])[0]] ?? 0));

// Controleer welke tabellen en kolommen aanwezig zijn
let existingTables = new Set();
const tableColumns = {};

async function loadTables() {
  const rows = await Q(`SELECT name FROM sqlite_master WHERE type = 'table'`);
  existingTables = new Set(rows.map(r => r.name));
  for (const t of existingTables) {
    const cols = await Q(`PRAGMA table_info(${t})`);
    tableColumns[t] = new Set(cols.map(c => c.name));
  }
}
function hasTable(t) { return existingTables.has(t); }
function hasCol(t, c) { return tableColumns[t]?.has(c) ?? false; }

// ════════════════════════════════════════════════════════════════════════════
async function run() {

  await loadTables();

  // ── Stap 0: backup ─────────────────────────────────────────────────────────
  const stamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir  = path.resolve(__dirname, '../backups');
  const backupFile = path.join(backupDir, `mhgym_health_${stamp}.db`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(path.resolve(DB_PATH), backupFile);
  console.log(`\n${OK}✅ Backup opgeslagen: ${backupFile}${R}\n`);

  // ── Basistellingen ──────────────────────────────────────────────────────────
  section('0. BASISTELLING');

  const rkSql   = hasTable('rittenkaarten')           ? '(SELECT COUNT(*) FROM rittenkaarten)'            : '0';
  const rktSql  = hasTable('rittenkaart_transacties') ? '(SELECT COUNT(*) FROM rittenkaart_transacties)'  : '0';

  const counts = await Q(`
    SELECT
      (SELECT COUNT(*) FROM users)              AS users,
      (SELECT COUNT(*) FROM user_memberships)   AS user_memberships,
      (SELECT COUNT(*) FROM memberships)        AS memberships,
      (SELECT COUNT(*) FROM fonds_members)      AS fonds_members,
      (SELECT COUNT(*) FROM cash_payments)      AS cash_payments,
      (SELECT COUNT(*) FROM payments)           AS payments,
      (SELECT COUNT(*) FROM bookings)           AS bookings,
      (SELECT COUNT(*) FROM classes)            AS classes,
      ${rkSql}                                  AS rittenkaarten,
      ${rktSql}                                 AS rk_transacties,
      (SELECT COUNT(*) FROM pt_purchases)       AS pt_purchases,
      (SELECT COUNT(*) FROM pt_bookings)        AS pt_bookings
  `);
  console.table(counts);
  if (!hasTable('rittenkaarten')) info('Rittenkaart-tabellen bestaan nog niet (wordt aangemaakt bij eerste serverstart via initDb). Rittenkaart-checks worden overgeslagen.');

  // ════════════════════════════════════════════════════════════════════════════
  section('1. DUPLICATEN');

  // 1a. Meerdere actieve memberships per user
  const dupMem = await Q(`
    SELECT u.id, u.first_name, u.last_name, u.email,
           COUNT(*) AS actieve_memberships,
           GROUP_CONCAT(um.id ORDER BY um.id) AS um_ids,
           GROUP_CONCAT(um.membership_type_key ORDER BY um.id) AS types,
           GROUP_CONCAT(um.payment_type ORDER BY um.id) AS payment_types
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.status IN ('active','cancelling')
    GROUP BY um.user_id
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `);
  if (dupMem.length) err(`${dupMem.length} gebruiker(s) met MEERDERE actieve memberships`, dupMem);
  else ok('Geen dubbele actieve memberships per gebruiker');

  // 1b. Meerdere actieve fonds_members van hetzelfde type per user
  const dupFonds = await Q(`
    SELECT fm.user_id, u.first_name, u.last_name, u.email,
           fm.fonds_type, COUNT(*) AS aantal,
           GROUP_CONCAT(fm.id ORDER BY fm.id) AS fm_ids
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status = 'active'
    GROUP BY fm.user_id, fm.fonds_type
    HAVING COUNT(*) > 1
  `);
  if (dupFonds.length) err(`${dupFonds.length} combinatie(s) user+fonds_type met MEERDERE actieve records`, dupFonds);
  else ok('Geen dubbele actieve fonds_members per user+type');

  // 1c. Duplicate emails in users
  const dupEmail = await Q(`
    SELECT email, COUNT(*) AS n, GROUP_CONCAT(id) AS user_ids
    FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1
  `);
  if (dupEmail.length) err(`${dupEmail.length} e-mailadres(sen) komen voor bij meerdere gebruikers`, dupEmail);
  else ok('Geen dubbele e-mailadressen');

  // 1d. Dubbele Mollie payment IDs
  const dupMollie = await Q(`
    SELECT mollie_payment_id, COUNT(*) AS n, GROUP_CONCAT(id) AS payment_ids
    FROM payments
    WHERE mollie_payment_id IS NOT NULL
    GROUP BY mollie_payment_id HAVING COUNT(*) > 1
  `);
  if (dupMollie.length) err(`${dupMollie.length} Mollie betaalID(s) komen meerdere keren voor`, dupMollie);
  else ok('Geen dubbele Mollie payment IDs in payments');

  // ════════════════════════════════════════════════════════════════════════════
  section('2. WEESRECORDS (gebroken FK-koppelingen)');

  // 2a. user_memberships zonder bestaande user
  const umNoUser = await Q(`
    SELECT um.id, um.user_id, um.status, um.membership_type_key
    FROM user_memberships um
    LEFT JOIN users u ON u.id = um.user_id
    WHERE u.id IS NULL
  `);
  if (umNoUser.length) err(`${umNoUser.length} user_membership(s) verwijzen naar niet-bestaande gebruiker`, umNoUser);
  else ok('Alle user_memberships hebben een geldige user');

  // 2b. user_memberships zonder bestaande memberships-type
  const umNoType = await Q(`
    SELECT um.id, um.user_id, um.membership_id, um.status
    FROM user_memberships um
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE m.id IS NULL
  `);
  if (umNoType.length) err(`${umNoType.length} user_membership(s) verwijzen naar niet-bestaand membership-type`, umNoType);
  else ok('Alle user_memberships hebben een geldig membership-type');

  // 2c. fonds_members zonder bestaande user
  const fmNoUser = await Q(`
    SELECT fm.id, fm.user_id, fm.fonds_type, fm.status
    FROM fonds_members fm
    LEFT JOIN users u ON u.id = fm.user_id
    WHERE u.id IS NULL
  `);
  if (fmNoUser.length) err(`${fmNoUser.length} fonds_member(s) verwijzen naar niet-bestaande gebruiker`, fmNoUser);
  else ok('Alle fonds_members hebben een geldige user');

  // 2d. user_memberships.fonds_member_id verwijst naar niet-bestaande fonds
  const umFondsGhost = await Q(`
    SELECT um.id, um.user_id, um.fonds_member_id, um.status
    FROM user_memberships um
    LEFT JOIN fonds_members fm ON fm.id = um.fonds_member_id
    WHERE um.fonds_member_id IS NOT NULL AND fm.id IS NULL
  `);
  if (umFondsGhost.length) err(`${umFondsGhost.length} user_membership(s) verwijzen naar niet-bestaand fonds_member`, umFondsGhost);
  else ok('Alle fonds_member_id koppelingen in user_memberships zijn geldig');

  // 2e. Actieve fonds_members die NIET gekoppeld zijn aan een actief/cancelling user_membership
  const fondsWees = await Q(`
    SELECT fm.id, fm.user_id, u.email, u.first_name, u.last_name,
           fm.fonds_type, fm.fonds_name, fm.start_date, fm.end_date,
           um.id AS um_id, um.status AS um_status
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    LEFT JOIN user_memberships um
           ON um.fonds_member_id = fm.id AND um.status IN ('active','cancelling')
    WHERE fm.status = 'active'
      AND um.id IS NULL
    ORDER BY fm.user_id
  `);
  if (fondsWees.length) err(`${fondsWees.length} actieve fonds_member(s) hebben GEEN gekoppeld actief user_membership (weesrecords)`, fondsWees);
  else ok('Alle actieve fonds_members zijn gekoppeld aan een actief membership');

  // 2f. user_memberships met payment_type='fonds' maar fonds_member_id is NULL
  const fondsNoLink = await Q(`
    SELECT um.id, um.user_id, u.email, u.first_name, u.last_name,
           um.status, um.fonds_member_id, um.membership_type_key
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.payment_type = 'fonds'
      AND um.status IN ('active','cancelling')
      AND um.fonds_member_id IS NULL
  `);
  if (fondsNoLink.length) err(`${fondsNoLink.length} actieve fonds-lidmaatschappen hebben GEEN fonds_member_id`, fondsNoLink);
  else ok("Alle actieve fonds-memberships hebben een fonds_member_id");

  // 2g. user_memberships met payment_type='fonds', koppelt naar GEANNULEERD fonds
  const fondsCancelled = await Q(`
    SELECT um.id AS um_id, um.user_id, u.email, u.first_name, u.last_name,
           um.status AS um_status, um.fonds_member_id,
           fm.status AS fm_status, fm.fonds_type
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    JOIN fonds_members fm ON fm.id = um.fonds_member_id
    WHERE um.payment_type = 'fonds'
      AND um.status IN ('active','cancelling')
      AND fm.status NOT IN ('active')
  `);
  if (fondsCancelled.length) warn(`${fondsCancelled.length} actieve fonds-memberships koppelen naar een NIET-actief fonds_member`, fondsCancelled);
  else ok('Alle actieve fonds-memberships koppelen naar een actief fonds_member');

  // 2h. cash_payments zonder bestaande user
  const cpNoUser = await Q(`
    SELECT cp.id, cp.user_id, cp.amount, cp.payment_date, cp.payment_type
    FROM cash_payments cp
    LEFT JOIN users u ON u.id = cp.user_id
    WHERE u.id IS NULL
  `);
  if (cpNoUser.length) err(`${cpNoUser.length} cash_payment(s) verwijzen naar niet-bestaande gebruiker`, cpNoUser);
  else ok('Alle cash_payments hebben een geldige user');

  // 2i. rittenkaarten zonder bestaande user
  if (hasTable('rittenkaarten')) {
    const rkNoUser = await Q(`
      SELECT rk.id, rk.user_id, rk.status, rk.ritten_resterend
      FROM rittenkaarten rk
      LEFT JOIN users u ON u.id = rk.user_id
      WHERE u.id IS NULL
    `);
    if (rkNoUser.length) err(`${rkNoUser.length} rittenkaart(en) verwijzen naar niet-bestaande gebruiker`, rkNoUser);
    else ok('Alle rittenkaarten hebben een geldige user');
  }

  // 2j. rittenkaart_transacties zonder bestaande rittenkaart
  if (hasTable('rittenkaart_transacties') && hasTable('rittenkaarten')) {
    const rktNoRk = await Q(`
      SELECT rkt.id, rkt.rittenkaart_id, rkt.delta, rkt.reden
      FROM rittenkaart_transacties rkt
      LEFT JOIN rittenkaarten rk ON rk.id = rkt.rittenkaart_id
      WHERE rk.id IS NULL
    `);
    if (rktNoRk.length) err(`${rktNoRk.length} rittenkaart_transactie(s) verwijzen naar niet-bestaande rittenkaart`, rktNoRk);
    else ok('Alle rittenkaart_transacties hebben een geldige rittenkaart');
  }

  // 2k. bookings zonder bestaande user
  const bkNoUser = await Q(`
    SELECT b.id, b.user_id, b.class_id, b.status
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    WHERE u.id IS NULL
  `);
  if (bkNoUser.length) err(`${bkNoUser.length} booking(s) verwijzen naar niet-bestaande gebruiker`, bkNoUser);
  else ok('Alle bookings hebben een geldige user');

  // 2l. bookings zonder bestaande class
  const bkNoClass = await Q(`
    SELECT b.id, b.user_id, b.class_id, b.status
    FROM bookings b
    LEFT JOIN classes c ON c.id = b.class_id
    WHERE c.id IS NULL
  `);
  if (bkNoClass.length) err(`${bkNoClass.length} booking(s) verwijzen naar niet-bestaande les`, bkNoClass);
  else ok('Alle bookings hebben een geldige les');

  // 2m. payments zonder bestaande user
  const pNoUser = await Q(`
    SELECT p.id, p.user_id, p.amount, p.status, p.mollie_payment_id
    FROM payments p
    LEFT JOIN users u ON u.id = p.user_id
    WHERE u.id IS NULL
  `);
  if (pNoUser.length) err(`${pNoUser.length} payment(s) verwijzen naar niet-bestaande gebruiker`, pNoUser);
  else ok('Alle payments hebben een geldige user');

  // ════════════════════════════════════════════════════════════════════════════
  section('3. DATA-INCONSISTENTIES');

  // 3a. Lessen waar current_bookings ≠ werkelijk aantal confirmed bookings
  const wrongCount = await Q(`
    SELECT c.id, c.name, c.date_time, c.current_bookings,
           COUNT(b.id) AS werkelijk_aantal,
           c.current_bookings - COUNT(b.id) AS verschil
    FROM classes c
    LEFT JOIN bookings b ON b.class_id = c.id AND b.status = 'confirmed'
    GROUP BY c.id
    HAVING c.current_bookings != COUNT(b.id)
    ORDER BY ABS(c.current_bookings - COUNT(b.id)) DESC
    LIMIT 50
  `);
  if (wrongCount.length) err(`${wrongCount.length} les(sen) hebben een verkeerde current_bookings teller`, wrongCount);
  else ok('Alle current_bookings tellers kloppen met het werkelijke aantal bevestigde boekingen');

  // 3b–3d. Rittenkaarten (alleen als tabel bestaat)
  if (hasTable('rittenkaarten')) {
    const rkNeg = await Q(`
      SELECT rk.id, rk.user_id, u.email, u.first_name, u.last_name,
             rk.ritten_totaal, rk.ritten_resterend, rk.status
      FROM rittenkaarten rk JOIN users u ON u.id = rk.user_id
      WHERE rk.ritten_resterend < 0
    `);
    if (rkNeg.length) err(`${rkNeg.length} rittenkaart(en) hebben NEGATIEF aantal resterende ritten`, rkNeg);
    else ok('Geen rittenkaarten met negatief resterend');

    const rkOver = await Q(`
      SELECT rk.id, rk.user_id, u.email, u.first_name, u.last_name,
             rk.ritten_totaal, rk.ritten_resterend, rk.status
      FROM rittenkaarten rk JOIN users u ON u.id = rk.user_id
      WHERE rk.ritten_resterend > rk.ritten_totaal
    `);
    if (rkOver.length) warn(`${rkOver.length} rittenkaart(en) hebben meer resterend dan totaal`, rkOver);
    else ok('Geen rittenkaarten waar resterend > totaal');

    const rkEmptyActive = await Q(`
      SELECT rk.id, rk.user_id, u.email, u.first_name, u.last_name,
             rk.ritten_totaal, rk.ritten_resterend, rk.status
      FROM rittenkaarten rk JOIN users u ON u.id = rk.user_id
      WHERE rk.status = 'active' AND rk.ritten_resterend = 0
    `);
    if (rkEmptyActive.length) warn(`${rkEmptyActive.length} rittenkaart(en) zijn 'active' maar hebben 0 resterende ritten`, rkEmptyActive);
    else ok("Geen actieve rittenkaarten met 0 resterende ritten");
  }

  // 3e. Ongeldige datum-patronen in fonds_members
  const badFondsDates = await Q(`
    SELECT fm.id, fm.user_id, u.email, fm.fonds_type,
           fm.start_date, fm.end_date, fm.status
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status = 'active'
      AND (
        LENGTH(fm.end_date) != 10
        OR CAST(substr(fm.end_date, 1, 4) AS INTEGER) < 2020
        OR CAST(substr(fm.end_date, 1, 4) AS INTEGER) > 2100
        OR fm.end_date < fm.start_date
      )
  `);
  if (badFondsDates.length) err(`${badFondsDates.length} actieve fonds_member(s) hebben ongeldige/verkeerde datums`, badFondsDates);
  else ok('Alle actieve fonds_members hebben geldige datums');

  // 3f. Ongeldige datum-patronen in user_memberships
  const badMemDates = await Q(`
    SELECT um.id, um.user_id, u.email, um.status, um.start_date, um.end_date
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.status IN ('active','cancelling')
      AND um.end_date IS NOT NULL
      AND (
        LENGTH(um.end_date) != 10
        OR CAST(substr(um.end_date, 1, 4) AS INTEGER) < 2020
        OR CAST(substr(um.end_date, 1, 4) AS INTEGER) > 2100
      )
  `);
  if (badMemDates.length) err(`${badMemDates.length} actieve membership(s) hebben ongeldige einddatum`, badMemDates);
  else ok('Alle actieve memberships hebben geldige datums');

  // 3g. Actieve fonds die al verlopen zijn (end_date < vandaag maar status = 'active')
  const expiredFonds = await Q(`
    SELECT fm.id, fm.user_id, u.email, u.first_name, u.last_name,
           fm.fonds_type, fm.fonds_name, fm.end_date, fm.status,
           ROUND(julianday('now') - julianday(fm.end_date)) AS days_over
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status = 'active'
      AND date(fm.end_date) < date('now')
    ORDER BY fm.end_date
  `);
  if (expiredFonds.length) warn(`${expiredFonds.length} fonds_member(s) zijn al verlopen maar nog 'active'`, expiredFonds);
  else ok("Geen verlopen fonds_members met status 'active'");

  // 3h. Leden met membership_paused=1 maar geen openstaande betaling of verlopen fonds
  const pausedNoReason = await Q(`
    SELECT u.id, u.email, u.first_name, u.last_name,
           u.membership_paused, u.membership_paused_reason
    FROM users u
    WHERE u.membership_paused = 1
      AND u.membership_paused_reason IS NULL
  `);
  if (pausedNoReason.length) warn(`${pausedNoReason.length} lid/leden zijn gepauzeerd zonder reden`, pausedNoReason);
  else ok('Alle gepauzeerde leden hebben een pauzeereden');

  // 3i. Users met is_cash_payer=1 maar geen actief cash-membership
  const cashPayerNoMem = await Q(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.is_cash_payer
    FROM users u
    LEFT JOIN user_memberships um
           ON um.user_id = u.id
          AND um.payment_type = 'cash'
          AND um.status IN ('active','cancelling')
    WHERE u.is_cash_payer = 1 AND um.id IS NULL
  `);
  if (cashPayerNoMem.length) warn(`${cashPayerNoMem.length} gebruiker(s) hebben is_cash_payer=1 maar geen actief cash-lidmaatschap`, cashPayerNoMem);
  else ok('Alle is_cash_payer=1 gebruikers hebben een actief cash-membership');

  // ════════════════════════════════════════════════════════════════════════════
  section('4. MOLLIE-ABONNEMENTEN VS DB');

  // 4a. Actieve Mollie-memberships zonder mollie_subscription_id
  const mollieNoSub = await Q(`
    SELECT um.id, um.user_id, u.email, u.first_name, u.last_name,
           u.mollie_customer_id, um.mollie_subscription_id,
           um.payment_type, um.status, um.membership_type_key,
           um.start_date, um.created_at
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.status IN ('active','cancelling')
      AND COALESCE(um.payment_type, 'mollie') = 'mollie'
      AND (um.mollie_subscription_id IS NULL OR um.mollie_subscription_id = '')
    ORDER BY um.created_at DESC
  `);
  if (mollieNoSub.length) warn(`${mollieNoSub.length} actieve Mollie-membership(s) hebben GEEN mollie_subscription_id`, mollieNoSub);
  else ok('Alle actieve Mollie-memberships hebben een subscription_id');

  // 4b. Actieve Mollie-memberships waar user geen mollie_customer_id heeft
  const mollieNoCustomer = await Q(`
    SELECT um.id AS um_id, u.id AS user_id, u.email, u.first_name, u.last_name,
           u.mollie_customer_id, um.mollie_subscription_id,
           um.payment_type, um.status
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.status IN ('active','cancelling')
      AND COALESCE(um.payment_type, 'mollie') = 'mollie'
      AND (u.mollie_customer_id IS NULL OR u.mollie_customer_id = '')
    ORDER BY u.created_at DESC
  `);
  if (mollieNoCustomer.length) warn(`${mollieNoCustomer.length} leden met actief Mollie-membership maar GEEN mollie_customer_id`, mollieNoCustomer);
  else ok('Alle Mollie-members hebben een mollie_customer_id');

  // 4c. Subscription IDs die meerdere keren voorkomen in user_memberships
  const dupSubIds = await Q(`
    SELECT mollie_subscription_id, COUNT(*) AS n,
           GROUP_CONCAT(user_id) AS user_ids,
           GROUP_CONCAT(id) AS um_ids
    FROM user_memberships
    WHERE mollie_subscription_id IS NOT NULL
      AND mollie_subscription_id != ''
      AND status IN ('active','cancelling')
    GROUP BY mollie_subscription_id
    HAVING COUNT(*) > 1
  `);
  if (dupSubIds.length) err(`${dupSubIds.length} Mollie subscription_id(s) zijn gekoppeld aan MEERDERE actieve memberships`, dupSubIds);
  else ok('Geen dubbele Mollie subscription_ids bij actieve memberships');

  // 4d. Payments met status='open' die ouder dan 7 dagen zijn (waarschijnlijk verlopen)
  const oldOpenPayments = await Q(`
    SELECT p.id, p.user_id, u.email, u.first_name, u.last_name,
           p.amount, p.description, p.mollie_payment_id,
           p.created_at,
           ROUND(julianday('now') - julianday(p.created_at)) AS days_open
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE p.status = 'open'
      AND julianday('now') - julianday(p.created_at) > 7
    ORDER BY days_open DESC
  `);
  if (oldOpenPayments.length) warn(`${oldOpenPayments.length} betaling(en) staan al >7 dagen op 'open' (mogelijk verlopen iDEAL)`, oldOpenPayments);
  else ok("Geen oude 'open' betalingen (>7 dagen)");

  // 4e. Membership aangemaakt maar geen enkele betaling in payments
  const memNoPayment = await Q(`
    SELECT u.id, u.email, u.first_name, u.last_name,
           um.id AS um_id, um.payment_type, um.status, um.start_date,
           um.mollie_subscription_id
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    LEFT JOIN payments p ON p.user_id = u.id AND p.status = 'paid'
    WHERE um.status IN ('active','cancelling')
      AND COALESCE(um.payment_type, 'mollie') = 'mollie'
      AND p.id IS NULL
    ORDER BY um.created_at DESC
  `);
  if (memNoPayment.length) warn(`${memNoPayment.length} actieve Mollie-leden hebben GEEN enkele betaling in payments (subscription nog niet gefired?)`, memNoPayment);
  else ok('Alle actieve Mollie-leden hebben minstens één betaling geregistreerd');

  // ════════════════════════════════════════════════════════════════════════════
  section('5. DASHBOARD TOTALEN VS ONDERLIGGENDE DATA');

  // 5a. Actieve leden: users vs user_memberships
  const totalUsers   = await N(`SELECT COUNT(*) AS n FROM users WHERE role = 'member'`);
  const activeMem    = await N(`SELECT COUNT(*) AS n FROM user_memberships WHERE status = 'active'`);
  const noActiveMem  = await N(`
    SELECT COUNT(*) AS n FROM users u
    WHERE u.role = 'member'
      AND NOT EXISTS (SELECT 1 FROM user_memberships um WHERE um.user_id = u.id AND um.status IN ('active','cancelling'))
  `);
  info(`Totaal leden: ${totalUsers} | Actieve memberships: ${activeMem} | Leden zonder membership: ${noActiveMem}`);
  if (noActiveMem > 0) {
    const noMemList = await Q(`
      SELECT u.id, u.email, u.first_name, u.last_name, u.created_at
      FROM users u
      WHERE u.role = 'member'
        AND NOT EXISTS (SELECT 1 FROM user_memberships um WHERE um.user_id = u.id AND um.status IN ('active','cancelling'))
      ORDER BY u.created_at DESC LIMIT 30
    `);
    warn(`${noActiveMem} lid/leden zonder actief of cancelling membership`, noMemList);
  } else {
    ok('Elk lid heeft een actief membership');
  }

  // 5b. Fondsen: telling per type
  const fondsPerType = await Q(`
    SELECT fonds_type,
           COUNT(*) AS totaal_records,
           SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END) AS actief,
           SUM(CASE WHEN status = 'expired'   THEN 1 ELSE 0 END) AS verlopen,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS geannuleerd,
           SUM(CASE WHEN status = 'inactive'  THEN 1 ELSE 0 END) AS inactief
    FROM fonds_members
    GROUP BY fonds_type
    ORDER BY fonds_type
  `);
  info('Fonds-overzicht per type:', fondsPerType);

  // 5c. Dashboard: actieve fonds tellen via inkomen-query vs directe COUNT
  const dashFondsCount = await N(`SELECT COUNT(DISTINCT user_id) AS n FROM fonds_members WHERE status = 'active'`);
  const dashFondsWithMem = await N(`
    SELECT COUNT(DISTINCT fm.user_id) AS n
    FROM fonds_members fm
    JOIN user_memberships um ON um.fonds_member_id = fm.id AND um.status IN ('active','cancelling')
    WHERE fm.status = 'active'
  `);
  if (dashFondsCount !== dashFondsWithMem) {
    warn(`Dashboard telt ${dashFondsCount} unieke fonds-leden, maar slechts ${dashFondsWithMem} hebben een gekoppeld actief membership (verschil: ${dashFondsCount - dashFondsWithMem})`);
  } else {
    ok(`Fonds-telling klopt: ${dashFondsCount} unieke leden`);
  }

  // 5d. Mollie-inkomsten verwacht: tel memberships
  const mollieBreakdown = await Q(`
    SELECT COALESCE(um.payment_type, 'mollie') AS payment_type,
           um.status,
           COUNT(*) AS aantal,
           SUM(COALESCE(um.admin_price, m.price_monthly, 0)) AS verwacht_per_maand
    FROM user_memberships um
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE um.status IN ('active','cancelling')
    GROUP BY COALESCE(um.payment_type, 'mollie'), um.status
    ORDER BY payment_type, um.status
  `);
  info('Membership-breakdown actief+cancelling per betaaltype:', mollieBreakdown);

  // 5e. Controleer fonds inkomen-berekening: memberships gekoppeld zonder admin_price of price_monthly
  const fondsNoAmount = await Q(`
    SELECT fm.id AS fm_id, fm.user_id, u.email, u.first_name, u.last_name,
           fm.fonds_type, um.id AS um_id, um.admin_price,
           m.price_monthly, um.membership_type_key
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    JOIN user_memberships um ON um.fonds_member_id = fm.id
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE fm.status = 'active'
      AND um.status IN ('active','cancelling')
      AND COALESCE(um.admin_price, m.price_monthly) IS NULL
  `);
  if (fondsNoAmount.length) warn(`${fondsNoAmount.length} actieve fonds-lid/leden hebben GEEN bedrag (admin_price + price_monthly zijn beiden NULL) — dashboard-bedrag klopt niet`, fondsNoAmount);
  else ok('Alle actieve fonds-leden hebben een bedrag voor het inkomen-dashboard');

  // 5f. Custom_amount column check (alleen als kolom bestaat)
  if (hasCol('user_memberships', 'custom_amount') && hasCol('user_memberships', 'subscription_type')) {
    const customAmountMismatch = await Q(`
      SELECT um.id, um.user_id, u.email, u.first_name, u.last_name,
             um.custom_amount, um.subscription_type, um.status
      FROM user_memberships um
      JOIN users u ON u.id = um.user_id
      WHERE um.status IN ('active','cancelling')
        AND um.custom_amount IS NOT NULL
        AND um.custom_amount > 0
        AND COALESCE(um.subscription_type, 'standard') != 'custom'
    `);
    if (customAmountMismatch.length) warn(`${customAmountMismatch.length} membership(s) hebben custom_amount maar subscription_type is niet 'custom'`, customAmountMismatch);
    else ok('Alle custom_amount memberships hebben subscription_type = custom');
  } else {
    info('Kolommen custom_amount/subscription_type ontbreken in user_memberships (schema-update nodig via ensure-schema.js)');
  }

  // 5g. Admin-prijs vs membership price_monthly (check op afwijkingen)
  const adminPriceDiff = await Q(`
    SELECT um.id, um.user_id, u.email, u.first_name, u.last_name,
           um.admin_price, m.price_monthly, um.payment_type,
           (um.admin_price - m.price_monthly) AS verschil
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE um.status IN ('active','cancelling')
      AND um.admin_price IS NOT NULL
      AND m.price_monthly IS NOT NULL
      AND um.admin_price != m.price_monthly
    ORDER BY ABS(um.admin_price - m.price_monthly) DESC
  `);
  if (adminPriceDiff.length) info(`${adminPriceDiff.length} membership(s) hebben een admin_price die afwijkt van de standaard price_monthly (maatwerkprijs)`, adminPriceDiff);
  else ok('Alle memberships met admin_price komen overeen met de standaard prijs (of geen admin_price ingesteld)');

  // ════════════════════════════════════════════════════════════════════════════
  section('6. EXTRA CONTROLES');

  // 6a. PT purchases met negatief lessons_remaining
  const ptNeg = await Q(`
    SELECT pp.id, pp.user_id, u.email, u.first_name, u.last_name,
           pp.lessons_total, pp.lessons_remaining, pp.lessons_used, pp.status
    FROM pt_purchases pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.lessons_remaining < 0
  `);
  if (ptNeg.length) err(`${ptNeg.length} pt_purchase(s) hebben NEGATIEF aantal resterende lessen`, ptNeg);
  else ok('Geen pt_purchases met negatief resterende lessen');

  // 6b. PT purchases: lessons_remaining + lessons_used ≠ lessons_total
  const ptMismatch = await Q(`
    SELECT pp.id, pp.user_id, u.email,
           pp.lessons_total, pp.lessons_remaining, pp.lessons_used,
           (pp.lessons_remaining + pp.lessons_used) AS som,
           pp.status
    FROM pt_purchases pp
    JOIN users u ON u.id = pp.user_id
    WHERE pp.lessons_remaining + pp.lessons_used != pp.lessons_total
    LIMIT 30
  `);
  if (ptMismatch.length) warn(`${ptMismatch.length} pt_purchase(s): remaining + used ≠ total`, ptMismatch);
  else ok('PT purchase tellingen kloppen (remaining + used = total)');

  // 6c. Memberships zonder enkel actief lid (ongebruikte membership-types in DB)
  const unusedTypes = await Q(`
    SELECT m.id, m.name, m.category, m.price_monthly
    FROM memberships m
    LEFT JOIN user_memberships um ON um.membership_id = m.id AND um.status IN ('active','cancelling')
    WHERE um.id IS NULL
    ORDER BY m.category, m.name
  `);
  if (unusedTypes.length) info(`${unusedTypes.length} membership-type(s) hebben geen actief lid`, unusedTypes);
  else ok('Alle membership-types zijn in gebruik');

  // 6d. Cash betalingen zonder bestaand user
  const cashOrphan = await Q(`
    SELECT cp.id, cp.user_id, cp.amount, cp.payment_date, cp.payment_type
    FROM cash_payments cp
    LEFT JOIN users u ON u.id = cp.user_id
    WHERE u.id IS NULL
  `);
  if (cashOrphan.length) err(`${cashOrphan.length} cash_payment(s) hebben geen bestaand lid`, cashOrphan);
  else ok('Alle cash_payments horen bij een bestaand lid');

  // 6e. Openstaande payment_failures
  const openFailures = await Q(`
    SELECT pf.id, pf.user_id, u.email, u.first_name, u.last_name,
           pf.amount, pf.failure_count, pf.status,
           ROUND(julianday('now') - julianday(pf.created_at)) AS days_open,
           pf.surcharge_added, pf.auto_paused_at
    FROM payment_failures pf
    JOIN users u ON u.id = pf.user_id
    WHERE pf.status IN ('open','paused')
    ORDER BY days_open DESC
  `);
  if (openFailures.length) warn(`${openFailures.length} openstaande payment_failures`, openFailures);
  else ok('Geen openstaande payment_failures');

  // 6f. Dubbele (user_id, class_id) in bookings
  const dupBookings = await Q(`
    SELECT user_id, class_id, COUNT(*) AS n, GROUP_CONCAT(id) AS booking_ids,
           GROUP_CONCAT(status) AS statuses
    FROM bookings
    GROUP BY user_id, class_id HAVING COUNT(*) > 1
    ORDER BY n DESC LIMIT 20
  `);
  if (dupBookings.length) warn(`${dupBookings.length} dubbele (user_id, class_id) combinaties in bookings`, dupBookings);
  else ok('Geen dubbele boekingen (user_id + class_id)');

  // 6g. Mollie payments where status != paid but are old (>30 days)
  const staleMollie = await Q(`
    SELECT p.id, p.user_id, u.email, p.mollie_payment_id, p.amount,
           p.status, p.description,
           ROUND(julianday('now') - julianday(p.created_at)) AS days_old
    FROM payments p
    JOIN users u ON u.id = p.user_id
    WHERE p.status NOT IN ('paid')
      AND julianday('now') - julianday(p.created_at) > 30
      AND p.mollie_payment_id IS NOT NULL
    ORDER BY days_old DESC
  `);
  if (staleMollie.length) info(`${staleMollie.length} Mollie payment(s) ouder dan 30 dagen met status != 'paid'`, staleMollie);

  // ════════════════════════════════════════════════════════════════════════════
  section('7. SAMENVATTING');

  const totalErrors   = findings.errors.length;
  const totalWarnings = findings.warnings.length;

  console.log(`\n  ${E}Fouten:${R}      ${totalErrors}`);
  console.log(`  ${W}Waarschuwingen:${R} ${totalWarnings}`);
  console.log(`  ${I}Info:${R}          ${findings.info.length}\n`);

  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(`${OK}✅ Health check geslaagd — geen problemen gevonden.${R}\n`);
  } else {
    console.log(`${E}❌ Health check voltooid — zie bevindingen hierboven.${R}`);
    console.log(`   Backup staat op: ${backupFile}\n`);
    if (totalErrors > 0) {
      console.log(`${E}FOUTEN (actie vereist):${R}`);
      findings.errors.forEach((f, i) => console.log(`  ${i + 1}. ${f.msg}`));
    }
    if (totalWarnings > 0) {
      console.log(`\n${W}WAARSCHUWINGEN (controleer):${R}`);
      findings.warnings.forEach((f, i) => console.log(`  ${i + 1}. ${f.msg}`));
    }
  }

  await db.close();
}

run().catch(e => {
  console.error(`\n${E}❌ Script gecrasht:${R}`, e.message);
  console.error(e.stack);
  process.exit(1);
});
