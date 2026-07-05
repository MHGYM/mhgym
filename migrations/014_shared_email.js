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

  if (!createSql.includes('UNIQUE')) {
    console.log('✅ UNIQUE constraint al verwijderd — tabelstructuur controleren...');
    // Voeg partial-unique index toe als die nog niet bestaat
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_person ON users(email, first_name, last_name)`);
    console.log('✅ idx_users_unique_person gecontroleerd/aangemaakt.');
    await db.close();
    return;
  }

  // FK-constraints uit voor de tabelwissel
  await db.execute(`PRAGMA foreign_keys = OFF`);

  // Verwijder eventuele half-aangemaakte users_new van eerdere mislukte poging
  await db.execute(`DROP TABLE IF EXISTS users_new`);
  console.log('✓ Eventuele restanten users_new opgeruimd');

  // Nieuwe tabel zonder UNIQUE op email
  await db.execute(`
    CREATE TABLE users_new (
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
  console.log('✓ users_new aangemaakt (zonder UNIQUE)');

  // Data kopiëren
  await db.execute(`INSERT INTO users_new SELECT * FROM users`);
  console.log('✓ Data gekopieerd naar users_new');

  // Oude tabel weg, nieuwe hernoemen
  await db.execute(`DROP TABLE users`);
  await db.execute(`ALTER TABLE users_new RENAME TO users`);
  console.log('✓ Tabel hernoemd: users_new → users');

  // Niet-unieke index voor snelle email-lookup
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
  console.log('✓ idx_users_email aangemaakt (niet-uniek)');

  // Partial-unique index: dezelfde combinatie (email + voornaam + achternaam) blokkeert echte duplicaten
  await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_person ON users(email, first_name, last_name)`);
  console.log('✓ idx_users_unique_person aangemaakt (email + naam uniek)');

  await db.execute(`PRAGMA foreign_keys = ON`);

  console.log('\n✅ Migratie 014 geslaagd — email is niet langer uniek.\n');
  await db.close();
}

migrate().catch(e => {
  console.error('❌ Migratie 014 mislukt:', e.message);
  process.exit(1);
});
