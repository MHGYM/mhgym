/**
 * Diagnostisch script: toon duplicaten in fonds_members en dashboard-impact
 * Voert ALLEEN read queries uit — past niets aan.
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:' + process.env.DB_PATH.replace('./', '') });

async function run() {
  // ── 1. Alle actieve fonds_members ────────────────────────────────────────────
  console.log('\n═══ 1. ALLE ACTIEVE FONDS_MEMBERS ═══');
  const all = await db.execute(`
    SELECT fm.id, fm.user_id, u.first_name, u.last_name, u.email,
           fm.fonds_type, fm.fonds_name, fm.start_date, fm.end_date,
           fm.amount_covered, fm.status, fm.created_at
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status != 'cancelled'
    ORDER BY u.email, fm.fonds_type, fm.created_at
  `);
  console.table(all.rows);

  // ── 2. Aantoon duplicaten: zelfde user_id + fonds_type meer dan 1x ──────────
  console.log('\n═══ 2. DUPLICATEN (zelfde user_id + fonds_type, status != cancelled) ═══');
  const dups = await db.execute(`
    SELECT fm.user_id, u.first_name, u.last_name, u.email,
           fm.fonds_type, COUNT(*) AS aantal_records,
           GROUP_CONCAT(fm.id ORDER BY fm.id) AS fonds_ids
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status != 'cancelled'
    GROUP BY fm.user_id, fm.fonds_type
    HAVING COUNT(*) > 1
  `);
  if (dups.rows.length === 0) {
    console.log('Geen duplicaten gevonden.');
  } else {
    console.table(dups.rows);
  }

  // ── 3. user_memberships gekoppeld aan fonds ──────────────────────────────────
  console.log('\n═══ 3. USER_MEMBERSHIPS MET FONDS_MEMBER_ID ═══');
  const linked = await db.execute(`
    SELECT um.id AS um_id, um.user_id, u.first_name, u.last_name, u.email,
           um.fonds_member_id, fm.fonds_type, fm.fonds_name, fm.status AS fonds_status,
           um.status AS mem_status, um.admin_price,
           m.price_monthly, m.name AS membership_name
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    LEFT JOIN fonds_members fm ON fm.id = um.fonds_member_id
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE um.payment_type = 'fonds'
    ORDER BY u.email, um.id
  `);
  console.table(linked.rows);

  // ── 4. Wees-fonds_members (geen user_membership wijst naar dit record) ───────
  console.log('\n═══ 4. WEES-FONDS_MEMBERS (niet gekoppeld via user_memberships.fonds_member_id) ═══');
  const orphans = await db.execute(`
    SELECT fm.id, fm.user_id, u.first_name, u.last_name, u.email,
           fm.fonds_type, fm.status, fm.created_at
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status != 'cancelled'
      AND NOT EXISTS (
        SELECT 1 FROM user_memberships um WHERE um.fonds_member_id = fm.id
      )
    ORDER BY u.email, fm.fonds_type
  `);
  if (orphans.rows.length === 0) {
    console.log('Geen wees-records gevonden.');
  } else {
    console.table(orphans.rows);
  }

  // ── 5. Dashboard-query simulatie: huidige maand (duplicaat-impact) ───────────
  const today = new Date().toISOString().substring(0, 7);
  console.log(`\n═══ 5. DASHBOARD-QUERY RESULT (maand: ${today}) ═══`);

  const jeugd = await db.execute({
    sql: `SELECT fm.id AS fm_id, fm.user_id, u.email,
                 fm.fonds_type, fm.status,
                 um.id AS um_id, um.admin_price, m.price_monthly,
                 COALESCE(um.admin_price, m.price_monthly, 0) AS gebruikt_bedrag
          FROM fonds_members fm
          JOIN user_memberships um ON um.fonds_member_id = fm.id
          LEFT JOIN memberships m ON m.id = um.membership_id
          JOIN users u ON u.id = fm.user_id
          WHERE fm.status = 'active'
            AND fm.fonds_type = 'jeugdsportfonds'
            AND fm.start_date <= date(? || '-01', '+1 month', '-1 day')
            AND fm.end_date   >= date(? || '-01')`,
    args: [today, today],
  });
  console.log('Jeugdsportfonds detail:');
  console.table(jeugd.rows);

  const volw = await db.execute({
    sql: `SELECT fm.id AS fm_id, fm.user_id, u.email,
                 fm.fonds_type, fm.status,
                 um.id AS um_id, um.admin_price, m.price_monthly,
                 COALESCE(um.admin_price, m.price_monthly, 0) AS gebruikt_bedrag
          FROM fonds_members fm
          JOIN user_memberships um ON um.fonds_member_id = fm.id
          LEFT JOIN memberships m ON m.id = um.membership_id
          JOIN users u ON u.id = fm.user_id
          WHERE fm.status = 'active'
            AND fm.fonds_type = 'volwassenenfonds'
            AND fm.start_date <= date(? || '-01', '+1 month', '-1 day')
            AND fm.end_date   >= date(? || '-01')`,
    args: [today, today],
  });
  console.log('Volwassenenfonds detail:');
  console.table(volw.rows);

  // ── 6. Totaal per fonds (zoals dashboard) vs uniek per lid ───────────────────
  console.log('\n═══ 6. OVERZICHT: dashboard-totaal vs. uniek per lid ═══');
  const summary = await db.execute({
    sql: `SELECT fm.fonds_type,
                 COUNT(DISTINCT fm.user_id) AS unieke_leden,
                 COUNT(*) AS dashboard_count,
                 SUM(COALESCE(um.admin_price, m.price_monthly, 0)) AS dashboard_bedrag
          FROM fonds_members fm
          JOIN user_memberships um ON um.fonds_member_id = fm.id
          LEFT JOIN memberships m ON m.id = um.membership_id
          WHERE fm.status = 'active'
            AND fm.start_date <= date('now', '+1 month', '-1 day')
            AND fm.end_date   >= date('now', 'start of month')
          GROUP BY fm.fonds_type`,
    args: [],
  });
  console.table(summary.rows);

  console.log('\n✅ Diagnose voltooid. Geen wijzigingen aangebracht.');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
