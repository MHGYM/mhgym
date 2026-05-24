/**
 * Migration 009
 * - vt_slots: admin-created Vrij Trainen slots
 * - vrij_trainen_bookings: add slot_id + requested status
 * - payment_failures: reminder tracking columns
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:' + process.env.DB_PATH.replace('./', '') });

async function run() {
  // ── Vrij Trainen slots (admin maakt beschikbare slots aan) ─────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS vt_slots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          TEXT    NOT NULL,
      start_time    TEXT    NOT NULL,
      end_time      TEXT    NOT NULL,
      max_bookings  INTEGER NOT NULL DEFAULT 10,
      notes         TEXT,
      status        TEXT    NOT NULL DEFAULT 'available',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ vt_slots');

  // ── vrij_trainen_bookings: slot_id + status uitbreiden ────────────────────
  for (const col of [
    `ALTER TABLE vrij_trainen_bookings ADD COLUMN slot_id INTEGER REFERENCES vt_slots(id)`,
  ]) {
    try { await db.execute(col); } catch (_) {}
  }
  console.log('✓ vrij_trainen_bookings uitgebreid');

  // ── payment_failures: reminder tracking ───────────────────────────────────
  for (const col of [
    `ALTER TABLE payment_failures ADD COLUMN reminder_day0_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE payment_failures ADD COLUMN reminder_day3_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE payment_failures ADD COLUMN reminder_day7_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE payment_failures ADD COLUMN auto_paused_at TEXT`,
    `ALTER TABLE payment_failures ADD COLUMN mollie_paylink TEXT`,
  ]) {
    try { await db.execute(col); } catch (_) {}
  }
  console.log('✓ payment_failures uitgebreid');

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_vt_slots_date ON vt_slots(date)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_vtb_slot ON vrij_trainen_bookings(slot_id)`);

  console.log('\n✅ Migratie 009 geslaagd.');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
