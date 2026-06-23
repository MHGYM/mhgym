/**
 * Migratie 012 — Dedup fonds_members
 *
 * Standaard: DRY-RUN — laat alleen zien wat er zou gebeuren.
 * Uitvoeren:  node migrations/012_dedup_fonds.js --execute
 *
 * Selectieregel (welk record blijft):
 *   Per combinatie van (user_id + fonds_type) met status = 'active' wordt
 *   het record met het HOOGSTE id bewaard (= het meest recent ingevoerde).
 *   Alle andere actieve records voor diezelfde combinatie worden op 'cancelled' gezet.
 *
 * Reden voor die keuze:
 *   Het nieuwste record heeft altijd de meest actuele einddatum, bedrag en naam.
 *   Bovendien wijst user_memberships.fonds_member_id na de laatste toewijzing
 *   vrijwel altijd naar het hoogste id — we verstoren de bestaande koppeling dus
 *   zo min mogelijk.
 *
 * Stap 2 — herstel user_memberships-koppelingen:
 *   Als een actief/cancelling user_membership nog verwijst naar een nu-geannuleerd
 *   fonds_member, wordt fonds_member_id bijgewerkt naar het bewaarde record.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const DRY_RUN = !process.argv.includes('--execute');
const DB_PATH = process.env.DB_PATH.replace('./', '');
const db = createClient({ url: 'file:' + DB_PATH });

// ── Hulpfunctie: alleen printen bij dry-run, anders uitvoeren ────────────────
async function exec(label, sql, args = []) {
  if (DRY_RUN) {
    console.log(`  [DRY] ${label}`);
    return { rowsAffected: 0 };
  }
  const r = await db.execute({ sql, args });
  console.log(`  ✓ ${label} — ${r.rowsAffected} rij(en) bijgewerkt`);
  return r;
}

async function run() {
  console.log(DRY_RUN
    ? '\n🔍 DRY-RUN — er wordt NIETS gewijzigd. Geef --execute mee om écht uit te voeren.\n'
    : '\n⚠️  EXECUTE-MODUS — wijzigingen worden permanent opgeslagen!\n');

  // ── Stap 0: backup (alleen bij echte uitvoering) ──────────────────────────
  if (!DRY_RUN) {
    const stamp  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = path.resolve(__dirname, `../backups/mhgym_voor_012_${stamp}.db`);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(path.resolve(DB_PATH), backup);
    console.log(`✅ Backup opgeslagen: ${backup}\n`);
  }

  // ── Stap 1: identificeer duplicaten ──────────────────────────────────────
  const dups = await db.execute(`
    SELECT fm.user_id,
           u.first_name, u.last_name, u.email,
           fm.fonds_type,
           COUNT(*)                                      AS aantal_records,
           MAX(fm.id)                                    AS bewaar_id,
           GROUP_CONCAT(fm.id ORDER BY fm.id)            AS alle_ids
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status = 'active'
    GROUP BY fm.user_id, fm.fonds_type
    HAVING COUNT(*) > 1
  `);

  if (dups.rows.length === 0) {
    console.log('✅ Geen duplicaten gevonden. Niets te doen.');
    return;
  }

  console.log(`⚠️  ${dups.rows.length} duplicaat-combinatie(s) gevonden:\n`);

  for (const row of dups.rows) {
    const alleIds   = String(row.alle_ids).split(',').map(Number);
    const bewaarId  = Number(row.bewaar_id);
    const verwijder = alleIds.filter(id => id !== bewaarId);

    console.log(`  Lid:        ${row.first_name} ${row.last_name} <${row.email}>`);
    console.log(`  Fonds type: ${row.fonds_type}`);
    console.log(`  Records:    id's [${alleIds.join(', ')}]`);
    console.log(`  BEWAREN:    id ${bewaarId}  (hoogste id = meest recent aangemaakt)`);
    console.log(`  ANNULEREN:  id's [${verwijder.join(', ')}]`);
    console.log('');
  }

  // ── Stap 2: ids die gecancelled worden ───────────────────────────────────
  const teAnnuleren = await db.execute(`
    SELECT id, user_id, fonds_type, fonds_name, start_date, end_date, amount_covered, created_at
    FROM fonds_members
    WHERE status = 'active'
      AND id NOT IN (
        SELECT MAX(id)
        FROM fonds_members
        WHERE status = 'active'
        GROUP BY user_id, fonds_type
      )
  `);

  console.log('═══ RECORDS DIE WORDEN GEANNULEERD ═══');
  console.table(teAnnuleren.rows);

  // ── Stap 3: ids die bewaard worden ───────────────────────────────────────
  const teBewaren = await db.execute(`
    SELECT fm.id, fm.user_id, u.email, fm.fonds_type, fm.fonds_name,
           fm.start_date, fm.end_date, fm.amount_covered, fm.created_at
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status = 'active'
      AND fm.id IN (
        SELECT MAX(id)
        FROM fonds_members
        WHERE status = 'active'
        GROUP BY user_id, fonds_type
      )
      AND fm.user_id IN (
        SELECT user_id FROM fonds_members WHERE status = 'active'
        GROUP BY user_id, fonds_type HAVING COUNT(*) > 1
      )
  `);

  console.log('═══ RECORDS DIE BEWAARD BLIJVEN ═══');
  console.table(teBewaren.rows);

  // ── Stap 4: user_memberships die herkoppeld moeten worden ────────────────
  const teHerkoppelen = await db.execute(`
    SELECT um.id AS um_id, um.user_id, u.email,
           um.status AS mem_status, um.fonds_member_id AS oud_fonds_id,
           (SELECT MAX(fm2.id)
            FROM fonds_members fm2
            WHERE fm2.user_id = um.user_id
              AND fm2.status = 'active'
              AND fm2.fonds_type = (SELECT fonds_type FROM fonds_members WHERE id = um.fonds_member_id)
           ) AS nieuw_fonds_id
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE um.payment_type = 'fonds'
      AND um.status IN ('active','cancelling')
      AND um.fonds_member_id NOT IN (
        SELECT MAX(id)
        FROM fonds_members
        WHERE status = 'active'
        GROUP BY user_id, fonds_type
      )
  `);

  if (teHerkoppelen.rows.length > 0) {
    console.log('═══ USER_MEMBERSHIPS DIE WORDEN HERGEKOPPELD ═══');
    console.table(teHerkoppelen.rows);
  } else {
    console.log('═══ USER_MEMBERSHIPS: geen herkoppeling nodig ═══');
  }

  if (DRY_RUN) {
    console.log('\n🔍 Dry-run klaar. Voer --execute uit om bovenstaande te bevestigen.\n');
    return;
  }

  // ── Echte uitvoering ─────────────────────────────────────────────────────
  console.log('\n🚀 Uitvoeren...\n');

  await exec(
    'Annuleer duplicaat fonds_members (behoud MAX(id) per user+type)',
    `UPDATE fonds_members
     SET status = 'cancelled', updated_at = datetime('now')
     WHERE status = 'active'
       AND id NOT IN (
         SELECT MAX(id)
         FROM fonds_members
         WHERE status = 'active'
         GROUP BY user_id, fonds_type
       )`,
  );

  await exec(
    'Herstel user_memberships die verwijzen naar geannuleerde fonds_members',
    `UPDATE user_memberships
     SET fonds_member_id = (
           SELECT MAX(fm.id)
           FROM fonds_members fm
           WHERE fm.user_id = user_memberships.user_id
             AND fm.status  = 'active'
             AND fm.fonds_type = (
                   SELECT f2.fonds_type FROM fonds_members f2
                   WHERE f2.id = user_memberships.fonds_member_id
                 )
         ),
         updated_at = datetime('now')
     WHERE payment_type = 'fonds'
       AND status IN ('active','cancelling')
       AND fonds_member_id NOT IN (
         SELECT MAX(id)
         FROM fonds_members
         WHERE status = 'active'
         GROUP BY user_id, fonds_type
       )`,
  );

  // ── Verificatie ───────────────────────────────────────────────────────────
  console.log('\n═══ VERIFICATIE NA DEDUP ═══');
  const verify = await db.execute(`
    SELECT fm.fonds_type,
           COUNT(DISTINCT fm.user_id)  AS unieke_leden,
           COUNT(*)                    AS actieve_records,
           SUM(COALESCE(um.admin_price, m.price_monthly, 0)) AS dashboard_bedrag
    FROM fonds_members fm
    LEFT JOIN user_memberships um ON um.fonds_member_id = fm.id AND um.status IN ('active','cancelling')
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE fm.status = 'active'
    GROUP BY fm.fonds_type
  `);
  console.table(verify.rows);

  const restDups = await db.execute(`
    SELECT COUNT(*) AS resterende_duplicaten
    FROM (
      SELECT user_id, fonds_type
      FROM fonds_members WHERE status = 'active'
      GROUP BY user_id, fonds_type HAVING COUNT(*) > 1
    )
  `);
  console.log('Resterende duplicaten na migratie:', restDups.rows[0].resterende_duplicaten);

  console.log('\n✅ Migratie 012 geslaagd.\n');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
