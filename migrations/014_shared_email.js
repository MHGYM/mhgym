/**
 * Migratie 014 — Gedeeld e-mailadres voor gezinsleden
 *
 * Verwijdert de UNIQUE-constraint op users.email zodat een ouder
 * meerdere kinderen kan inschrijven onder één gezinsmail.
 * Elk kind blijft een eigen record (eigen naam, membership, betalingen, etc.).
 *
 * Login handelt meerdere profielen af via een profile-picker in de frontend.
 *
 * SQLite ondersteunt geen ALTER TABLE DROP CONSTRAINT, dus we herscheppen
 * de tabel zonder de UNIQUE-definitie en hernoemen daarna.
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const DB_PATH = (process.env.DB_PATH || './mhgym.db').replace('./', '');
const db = createClient({ url: 'file:' + path.resolve(DB_PATH) });

async function migrate() {
  console.log('🔄 Migratie 014 — Gedeeld e-mailadres\n');

  // Controleer of de UNIQUE constraint al verwijderd is
  const tableInfo = await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`);
  const createSql = tableInfo.rows[0]?.sql || '';
  if (!createSql.includes('UNIQUE') || createSql.toLowerCase().includes('users_new')) {
    console.log('✅ UNIQUE constraint al verwijderd — migratie overgeslagen.');
    await db.close();
    return;
  }

  // Stap 1: maak nieuwe tabel zonder UNIQUE op email
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users_new (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      email                    TEXT    NOT NULL,
      password                 TEXT    NOT NULL,
      first_name               TEXT    NOT NULL,
      last_name                TEXT    NOT NULL,
      phone                    TEXT,
      role                     TEXT    NOT NULL DEFAULT 'member',
      created_at               TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at               TEXT    NOT NULL DEFAULT (datetime('now')),
      birth_date               TEXT,
      address                  TEXT,
      postal_code              TEXT,
      city                     TEXT,
      mollie_customer_id       TEXT,
      is_cash_payer            INTEGER NOT NULL DEFAULT 0,
      admin_notes              TEXT,
      membership_paused        INTEGER NOT NULL DEFAULT 0,
      membership_paused_reason TEXT,
      payment_method           TEXT    NOT NULL DEFAULT 'sepa'
    )
  `);
  console.log('✓ users_new aangemaakt');

  // Stap 2: data kopiëren
  await db.execute(`INSERT INTO users_new SELECT * FROM users`);
  console.log('✓ Data gekopieerd');

  // Stap 3: FK-constraints tijdelijk uit voor hernoemen
  await db.execute(`PRAGMA foreign_keys = OFF`);

  // Stap 4: oude tabel droppen, nieuwe hernoemen
  await db.execute(`DROP TABLE users`);
  await db.execute(`ALTER TABLE users_new RENAME TO users`);
  console.log('✓ Tabel hernoemd');

  // Stap 5: index op email (niet-uniek) voor snelle lookup
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  console.log('✓ Index idx_users_email aangemaakt');

  await db.execute(`PRAGMA foreign_keys = ON`);

  console.log('\n✅ Migratie 014 geslaagd — email is niet langer uniek.\n');
  await db.close();
}

migrate().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
