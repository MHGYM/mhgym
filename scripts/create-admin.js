/**
 * scripts/create-admin.js
 *
 * Creates or promotes a user to admin role.
 *
 * Usage:
 *   node scripts/create-admin.js <email> <password> [first_name] [last_name]
 *
 * Examples:
 *   node scripts/create-admin.js admin@mhgym.nl MySecret123 Mohammed Admin
 *   node scripts/create-admin.js existing@mhgym.nl newpassword
 *
 * On Railway (one-time run via Railway CLI):
 *   railway run node scripts/create-admin.js admin@mhgym.nl MySecret123 Mohammed Admin
 */

require('dotenv').config();
const bcrypt       = require('bcryptjs');
const { createClient } = require('@libsql/client');
const path         = require('path');

const [,, email, password, firstName = 'Admin', lastName = 'MHGym'] = process.argv;

if (!email || !password) {
  console.error('Usage: node scripts/create-admin.js <email> <password> [first_name] [last_name]');
  process.exit(1);
}

async function main() {
  const dbPath = process.env.DB_PATH || './mhgym.db';
  const db = createClient({ url: `file:${path.resolve(dbPath)}` });

  // Check if user already exists
  const existing = await db.execute({
    sql: 'SELECT id, email, role FROM users WHERE email = ?',
    args: [email],
  });

  const hash = await bcrypt.hash(password, 12);

  if (existing.rows.length > 0) {
    const user = existing.rows[0];
    // Promote existing user to admin and update password
    await db.execute({
      sql: `UPDATE users SET role = 'admin', password = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [hash, user.id],
    });
    console.log(`✅ User "${email}" (id=${user.id}) promoted to admin.`);
    console.log(`   Previous role: ${user.role}`);
  } else {
    // Create new admin user
    const result = await db.execute({
      sql: `INSERT INTO users (email, password, first_name, last_name, role)
            VALUES (?, ?, ?, ?, 'admin')`,
      args: [email, hash, firstName, lastName],
    });
    console.log(`✅ Admin user created: "${email}" (id=${Number(result.lastInsertRowid)})`);
  }

  console.log(`\nLogin at /login with:`);
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);

  await db.close();
}

main().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
