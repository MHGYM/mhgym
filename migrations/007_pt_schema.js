/**
 * Migratie 007 — Personal Training schema
 *
 * - pt_slots         : beschikbare PT-tijdslots (door admin aangemaakt)
 * - pt_purchases     : gekochte lessen-pakketten
 * - pt_bookings      : boekingen van PT-sessies
 * - pt_subscriptions : PT-abonnementen (6 maanden minimum)
 * - push_subscriptions: PWA push-notificatie subscriptions
 *
 * Gebruik: node migrations/007_pt_schema.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function run() {
  console.log('[007] PT-schema aanmaken...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pt_slots (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      date_time        TEXT    NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      trainer          TEXT    NOT NULL DEFAULT 'Mohammed',
      status           TEXT    NOT NULL DEFAULT 'available',
      notes            TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pt_purchases (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      package_id        INTEGER NOT NULL,
      lessons_total     INTEGER NOT NULL,
      lessons_used      INTEGER NOT NULL DEFAULT 0,
      lessons_remaining INTEGER NOT NULL,
      mollie_payment_id TEXT,
      amount            REAL    NOT NULL,
      status            TEXT    NOT NULL DEFAULT 'pending',
      expires_at        TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pt_bookings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      slot_id         INTEGER NOT NULL,
      purchase_id     INTEGER,
      subscription_id INTEGER,
      status          TEXT    NOT NULL DEFAULT 'pending',
      extra_person    INTEGER NOT NULL DEFAULT 0,
      admin_notes     TEXT,
      cancelled_at    TEXT,
      confirmed_at    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id)   REFERENCES users(id),
      FOREIGN KEY (slot_id)   REFERENCES pt_slots(id),
      FOREIGN KEY (purchase_id) REFERENCES pt_purchases(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pt_subscriptions (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id               INTEGER NOT NULL,
      freq_per_week         INTEGER NOT NULL,
      price_per_lesson      REAL    NOT NULL,
      price_monthly         REAL    NOT NULL,
      status                TEXT    NOT NULL DEFAULT 'pending',
      mollie_subscription_id TEXT,
      start_date            TEXT,
      contract_end          TEXT,
      cancels_at            TEXT,
      minimum_months        INTEGER NOT NULL DEFAULT 6,
      agreed_to_terms       INTEGER NOT NULL DEFAULT 0,
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      endpoint   TEXT    NOT NULL UNIQUE,
      p256dh     TEXT    NOT NULL,
      auth       TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  console.log('[007] Klaar! PT-tabellen aangemaakt.');
  await db.close();
}

run().catch((err) => {
  console.error('[007] Fout:', err);
  process.exit(1);
});
