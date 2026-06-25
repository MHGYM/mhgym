/**
 * Diagnose deel 2: toon mechanisme van duplicaten + dashboard-impact
 * ALLEEN reads — past niets aan.
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:' + process.env.DB_PATH.replace('./', '') });

async function run() {
  // ── Alle fonds_members incl. cancelled ───────────────────────────────────────
  console.log('\n═══ ALLE FONDS_MEMBERS (incl. cancelled) ═══');
  const allIncCancelled = await db.execute(`
    SELECT fm.id, fm.user_id, u.email,
           fm.fonds_type, fm.fonds_name, fm.status,
           fm.start_date, fm.end_date, fm.amount_covered,
           fm.created_at
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    ORDER BY fm.user_id, fm.fonds_type, fm.id
  `);
  console.table(allIncCancelled.rows);

  // ── Alle user_memberships met fonds link ─────────────────────────────────────
  console.log('\n═══ USER_MEMBERSHIPS met fonds_member_id (alle statussen) ═══');
  const allMems = await db.execute(`
    SELECT um.id AS um_id, um.user_id, u.email,
           um.status AS mem_status, um.payment_type,
           um.fonds_member_id,
           fm.fonds_type, fm.status AS fonds_status,
           um.admin_price, m.price_monthly, m.name AS membership_name
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    LEFT JOIN fonds_members fm ON fm.id = um.fonds_member_id
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE um.fonds_member_id IS NOT NULL
       OR um.payment_type = 'fonds'
    ORDER BY um.user_id, um.id
  `);
  console.table(allMems.rows);

  // ── Dashboard-simulatie: fonds_members actief maar NIET via user_memberships ─
  console.log('\n═══ WEES-FONDS (actief maar niet via JOIN op user_memberships.fonds_member_id gevonden) ═══');
  const weesUitDashboard = await db.execute(`
    SELECT fm.id, fm.user_id, u.email, fm.fonds_type, fm.fonds_name, fm.status
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE fm.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM user_memberships um
        WHERE um.fonds_member_id = fm.id
          AND um.status IN ('active','cancelling')
      )
  `);
  if (weesUitDashboard.rows.length === 0) console.log('Geen wees-records.');
  else console.table(weesUitDashboard.rows);

  // ── Actieve fonds_members waarvan user_membership gecancelled is ──────────────
  console.log('\n═══ FONDS ACTIEF maar user_membership CANCELLED ═══');
  const fondsZonderActiefMem = await db.execute(`
    SELECT fm.id, fm.user_id, u.email, fm.fonds_type, fm.status AS fonds_status,
           um.id AS um_id, um.status AS mem_status
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    LEFT JOIN user_memberships um ON um.fonds_member_id = fm.id
    WHERE fm.status = 'active'
      AND (um.id IS NULL OR um.status NOT IN ('active','cancelling'))
  `);
  if (fondsZonderActiefMem.rows.length === 0) console.log('Geen records.');
  else console.table(fondsZonderActiefMem.rows);

  // ── fondsActive count (zoals in dashboard) ───────────────────────────────────
  const fondsActiveCount = await db.execute(`
    SELECT COUNT(*) AS actieve_fonds_records FROM fonds_members WHERE status = 'active'
  `);
  const fondsUniekeUsers = await db.execute(`
    SELECT COUNT(DISTINCT user_id) AS unieke_leden FROM fonds_members WHERE status = 'active'
  `);
  console.log('\n═══ DASHBOARD: actieve fonds teller ═══');
  console.log('Records (dashboard toont dit als "actieve fonds leden"):', fondsActiveCount.rows[0].actieve_fonds_records);
  console.log('Unieke gebruikers:', fondsUniekeUsers.rows[0].unieke_leden);

  // ── Per fonds-type: wat de dashboard-query vindt vs werkelijk uniek ───────────
  console.log('\n═══ PER FONDS-TYPE: dashboard-query (via JOIN) vs werkelijke unieke leden ═══');
  const dashboardQuery = await db.execute(`
    SELECT fm.fonds_type,
           COUNT(DISTINCT fm.user_id)  AS unieke_leden_in_fonds_members,
           COUNT(*)                    AS rijen_in_dashboard_query,
           SUM(COALESCE(um.admin_price, m.price_monthly, 0)) AS dashboard_bedrag
    FROM fonds_members fm
    JOIN user_memberships um ON um.fonds_member_id = fm.id
    LEFT JOIN memberships m ON m.id = um.membership_id
    WHERE fm.status = 'active'
    GROUP BY fm.fonds_type
  `);
  console.table(dashboardQuery.rows);

  // ── Fonds_type waarden in DB ─────────────────────────────────────────────────
  console.log('\n═══ FONDS_TYPE WAARDEN in database ═══');
  const fondsTypes = await db.execute(`
    SELECT DISTINCT fonds_type, COUNT(*) AS aantal FROM fonds_members GROUP BY fonds_type
  `);
  console.table(fondsTypes.rows);

  console.log('\n✅ Diagnose 2 voltooid. Geen wijzigingen aangebracht.');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
