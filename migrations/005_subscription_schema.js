/**
 * Migratie 005 — Recurring subscription schema
 *
 * - Voegt profiel- en Mollie-velden toe aan users
 * - Voegt contract-velden toe aan user_memberships
 * - Voegt minimum_months en notice_period_months toe aan memberships
 * - Werkt bestaande membership data bij
 *
 * Gebruik: node migrations/005_subscription_schema.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function addColumn(table, col, def) {
  try {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
    console.log(`  ✅ ${table}.${col} toegevoegd`);
  } catch {
    console.log(`  ℹ️  ${table}.${col} bestaat al`);
  }
}

async function migrate() {
  console.log('🔄 Migratie 005 — Subscription schema...\n');

  // ── users ──────────────────────────────────────────────────────────────────
  await addColumn('users', 'birth_date',        'TEXT');
  await addColumn('users', 'address',           'TEXT');
  await addColumn('users', 'postal_code',       'TEXT');
  await addColumn('users', 'city',              'TEXT');
  await addColumn('users', 'mollie_customer_id','TEXT');

  // ── user_memberships ────────────────────────────────────────────────────────
  await addColumn('user_memberships', 'contract_start',          'TEXT');
  await addColumn('user_memberships', 'contract_end',            'TEXT');
  await addColumn('user_memberships', 'minimum_months',          'INTEGER DEFAULT 1');
  await addColumn('user_memberships', 'notice_period_months',    'INTEGER DEFAULT 1');
  await addColumn('user_memberships', 'mollie_subscription_id',  'TEXT');
  await addColumn('user_memberships', 'agreed_to_terms',         'INTEGER DEFAULT 0');
  await addColumn('user_memberships', 'cancels_at',              'TEXT');

  // ── memberships ─────────────────────────────────────────────────────────────
  await addColumn('memberships', 'minimum_months',       'INTEGER NOT NULL DEFAULT 1');
  await addColumn('memberships', 'notice_period_months', 'INTEGER NOT NULL DEFAULT 1');

  // ── Update membership minimums ──────────────────────────────────────────────
  await db.execute(`UPDATE memberships SET minimum_months = 12, notice_period_months = 1 WHERE duration_months = 12`);
  await db.execute(`UPDATE memberships SET minimum_months = 6,  notice_period_months = 1 WHERE duration_months = 6`);
  await db.execute(`UPDATE memberships SET minimum_months = 1,  notice_period_months = 1 WHERE duration_months = 1`);
  console.log('\n  ✅ Membership minimums bijgewerkt');

  // ── Verificatie ─────────────────────────────────────────────────────────────
  const memberships = await db.execute(
    'SELECT category, name, duration_months, minimum_months, notice_period_months, price_monthly FROM memberships ORDER BY category, duration_months DESC'
  );
  console.log('\n  📋 Abonnementen:');
  console.log('  Cat.         Naam                     Min.  Prijs');
  console.log('  ' + '─'.repeat(60));
  for (const m of memberships.rows) {
    console.log(`  ${m.category.padEnd(13)}${m.name.padEnd(25)}${String(m.minimum_months + 'mnd').padEnd(6)}€${m.price_monthly}/mnd`);
  }

  console.log('\n✅ Migratie 005 succesvol!\n');
  await db.close();
}

migrate().catch((err) => {
  console.error('❌ Migratie mislukt:', err);
  process.exit(1);
});
