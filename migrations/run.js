require('dotenv').config();
const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '001_initial.sql'), 'utf8');

  // Splits op ; en voer per statement uit
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    await db.execute(stmt);
  }

  console.log('✅ Database migratie succesvol uitgevoerd.');
  await db.close();
}

migrate().catch((err) => {
  console.error('❌ Migratie mislukt:', err);
  process.exit(1);
});
