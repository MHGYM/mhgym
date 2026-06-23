require('dotenv').config();
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:' + process.env.DB_PATH.replace('./', '') });
async function run() {
  const fm = await db.execute(`
    SELECT fm.id, fm.user_id, u.first_name, u.last_name, u.email,
           fm.fonds_type, fm.fonds_name, fm.start_date, fm.end_date,
           fm.amount_covered, fm.status, fm.created_at
    FROM fonds_members fm
    JOIN users u ON u.id = fm.user_id
    WHERE LOWER(u.last_name) LIKE '%guler%'
       OR LOWER(u.last_name) LIKE '%g%ler%'
       OR LOWER(u.email)     LIKE '%musab%'
       OR LOWER(u.email)     LIKE '%kapsalon%'
    ORDER BY fm.id
  `);
  console.log('=== fonds_members ===');
  console.table(fm.rows);

  const um = await db.execute(`
    SELECT um.id AS um_id, um.user_id, u.email,
           um.status AS mem_status, um.payment_type,
           um.fonds_member_id, um.membership_type_key, um.start_date
    FROM user_memberships um
    JOIN users u ON u.id = um.user_id
    WHERE LOWER(u.last_name) LIKE '%guler%'
       OR LOWER(u.last_name) LIKE '%g%ler%'
       OR LOWER(u.email)     LIKE '%musab%'
       OR LOWER(u.email)     LIKE '%kapsalon%'
    ORDER BY um.id
  `);
  console.log('=== user_memberships ===');
  console.table(um.rows);
}
run().catch(e => console.error(e.message));
