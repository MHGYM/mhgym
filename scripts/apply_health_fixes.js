/**
 * apply_health_fixes.js — eenmalige reparaties n.a.v. health check 2026-06-23
 *
 * Fix 1: Verlopen test-betalingen (status 'open' > 7 dagen) → 'expired'
 * Fix 2: Wees fonds_members (actief maar geen actief membership) → 'cancelled'
 * Fix 3: Schema-update via ensure-schema.js (toevoegt custom_amount, subscription_type, etc.)
 *
 * Raakt Mollie NIET aan — alleen lokale DB-status.
 * Maakt eerst een backup.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const DB_PATH = (process.env.DB_PATH || './mhgym.db').replace('./', '');
const db = createClient({ url: 'file:' + path.resolve(DB_PATH) });

const OK = '\x1b[32m'; const W = '\x1b[33m'; const E = '\x1b[31m'; const I = '\x1b[36m'; const R = '\x1b[0m';

function section(t) { console.log(`\n${'═'.repeat(60)}\n  ${t}\n${'═'.repeat(60)}`); }
const Q = (sql, args = []) => db.execute({ sql, args }).then(r => r.rows);

async function run() {

  // ── Backup ─────────────────────────────────────────────────────────────────
  const stamp      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir  = path.resolve(__dirname, '../backups');
  const backupFile = path.join(backupDir, `mhgym_pre_fixes_${stamp}.db`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(path.resolve(DB_PATH), backupFile);
  console.log(`\n${OK}✅ Backup opgeslagen: ${backupFile}${R}`);

  // ════════════════════════════════════════════════════════════════════════════
  section('FIX 1 — Verlopen test-betalingen → expired');

  // Toon eerst wat we gaan wijzigen
  const openOld = await Q(`
    SELECT p.id, p.mollie_payment_id, p.amount, p.description, p.status,
           ROUND(julianday('now') - julianday(p.created_at)) AS days_open
    FROM payments p
    WHERE p.status = 'open'
      AND julianday('now') - julianday(p.created_at) > 7
    ORDER BY days_open DESC
  `);

  if (!openOld.length) {
    console.log(`${OK}  Geen verlopen open betalingen gevonden — skip.${R}`);
  } else {
    console.log(`  ${W}${openOld.length} betalingen worden van 'open' → 'expired':${R}`);
    console.table(openOld);

    const result = await db.execute(`
      UPDATE payments
      SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'open'
        AND julianday('now') - julianday(created_at) > 7
    `);
    console.log(`${OK}  ✓ ${result.rowsAffected} rij(en) bijgewerkt naar 'expired'.${R}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  section('FIX 2 — Wees fonds_members → cancelled');

  const fondsWees = await Q(`
    SELECT fm.id, fm.user_id, u.email, u.first_name, u.last_name,
           fm.fonds_type, fm.fonds_name, fm.start_date, fm.end_date, fm.status
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    LEFT JOIN user_memberships um
           ON um.fonds_member_id = fm.id AND um.status IN ('active','cancelling')
    WHERE fm.status = 'active'
      AND um.id IS NULL
  `);

  if (!fondsWees.length) {
    console.log(`${OK}  Geen wees-fonds_members gevonden — skip.${R}`);
  } else {
    console.log(`  ${W}${fondsWees.length} actieve wees-fonds_member(s) worden geannuleerd:${R}`);
    console.table(fondsWees);

    const result = await db.execute(`
      UPDATE fonds_members
      SET status = 'cancelled', updated_at = datetime('now')
      WHERE status = 'active'
        AND id NOT IN (
          SELECT DISTINCT fm2.id
          FROM fonds_members fm2
          JOIN user_memberships um2 ON um2.fonds_member_id = fm2.id
          WHERE um2.status IN ('active','cancelling')
        )
    `);
    console.log(`${OK}  ✓ ${result.rowsAffected} wees-fonds_member(s) geannuleerd.${R}`);
  }

  // ════════════════════════════════════════════════════════════════════════════
  section('FIX 3 — Schema-update (ensure-schema.js)');

  // Sluit huidige verbinding zodat ensure-schema zijn eigen verbinding kan openen
  await db.close();

  const ensureSchema = require('./ensure-schema.js');
  await ensureSchema();
  console.log(`${OK}  ✓ Schema-update voltooid.${R}`);

  // ════════════════════════════════════════════════════════════════════════════
  section('VERIFICATIE — fonds dashboard-teller');

  // Heropen DB na schema-update
  const db2 = createClient({ url: 'file:' + path.resolve(DB_PATH) });

  const Q2 = (sql, args = []) => db2.execute({ sql, args }).then(r => r.rows);

  const fondsAlle = await Q2(`
    SELECT fonds_type,
           COUNT(*) AS totaal,
           SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END) AS actief,
           SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS geannuleerd,
           SUM(CASE WHEN status = 'expired'   THEN 1 ELSE 0 END) AS verlopen
    FROM fonds_members
    GROUP BY fonds_type
  `);
  console.log('\n  Fonds_members per type na fixes:');
  console.table(fondsAlle);

  const dashCount = await Q2(`SELECT COUNT(DISTINCT user_id) AS n FROM fonds_members WHERE status = 'active'`);
  const withMem   = await Q2(`
    SELECT COUNT(DISTINCT fm.user_id) AS n
    FROM fonds_members fm
    JOIN user_memberships um ON um.fonds_member_id = fm.id AND um.status IN ('active','cancelling')
    WHERE fm.status = 'active'
  `);

  const countAll  = Number(dashCount[0].n);
  const countLink = Number(withMem[0].n);

  if (countAll === countLink) {
    console.log(`${OK}  ✓ Dashboard fonds-teller klopt: ${countAll} actieve leden, allemaal gekoppeld aan een membership.${R}`);
  } else {
    console.log(`${W}  ⚠ Dashboard telt ${countAll} actieve fonds-leden, slechts ${countLink} zijn gekoppeld — nog ${countAll - countLink} weesrecord(s).${R}`);
  }

  // Controleer verlopen payments na fix
  const stillOpen = await Q2(`SELECT COUNT(*) AS n FROM payments WHERE status = 'open' AND julianday('now') - julianday(created_at) > 7`);
  console.log(Number(stillOpen[0].n) === 0
    ? `${OK}  ✓ Geen verlopen 'open' betalingen meer.${R}`
    : `${W}  ⚠ Nog ${stillOpen[0].n} verlopen open betaling(en).${R}`
  );

  // Controleer nieuwe kolommen
  const cols2 = await Q2(`PRAGMA table_info(user_memberships)`);
  const colNames = cols2.map(c => c.name);
  const hasCustom = colNames.includes('custom_amount');
  const hasSubType = colNames.includes('subscription_type');
  console.log(hasCustom && hasSubType
    ? `${OK}  ✓ Kolommen custom_amount en subscription_type aanwezig.${R}`
    : `${W}  ⚠ Kolom(men) nog steeds ontbrekend: ${[!hasCustom && 'custom_amount', !hasSubType && 'subscription_type'].filter(Boolean).join(', ')}${R}`
  );

  await db2.close();

  console.log(`\n${OK}✅ Alle fixes uitgevoerd. Health-check opnieuw uitvoeren om te bevestigen.${R}\n`);
}

run().catch(e => {
  console.error(`\n${E}❌ Script gecrasht:${R}`, e.message);
  console.error(e.stack);
  process.exit(1);
});
