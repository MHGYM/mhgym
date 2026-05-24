/**
 * Migration 010
 * - cash_payments: manual cash payment log (membership/PT/quarterly)
 * - fonds_members: Jeugdfonds/Volwassenenfonds tracking with expiry
 * - user_memberships: payment_type, quarterly fields, fonds link
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:' + process.env.DB_PATH.replace('./', '') });

async function run() {
  // ── Cash payments log ───────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cash_payments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount       REAL    NOT NULL,
      payment_date TEXT    NOT NULL,
      payment_type TEXT    NOT NULL DEFAULT 'membership',
      sessions_paid INTEGER,
      note         TEXT,
      created_by   INTEGER REFERENCES users(id),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ cash_payments');

  // ── Fonds memberships ────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS fonds_members (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fonds_type            TEXT    NOT NULL,
      fonds_name            TEXT,
      start_date            TEXT    NOT NULL,
      end_date              TEXT    NOT NULL,
      amount_covered        REAL,
      notes                 TEXT,
      status                TEXT    NOT NULL DEFAULT 'active',
      expiry_reminder_sent  INTEGER NOT NULL DEFAULT 0,
      expiry_reminder2_sent INTEGER NOT NULL DEFAULT 0,
      expiry_urgent_sent    INTEGER NOT NULL DEFAULT 0,
      auto_paused_at        TEXT,
      created_by            INTEGER REFERENCES users(id),
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ fonds_members');

  // ── user_memberships: payment_type + quarterly fields ─────────────────────
  for (const col of [
    `ALTER TABLE user_memberships ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'mollie'`,
    `ALTER TABLE user_memberships ADD COLUMN quarterly_amount REAL`,
    `ALTER TABLE user_memberships ADD COLUMN next_quarter_due TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN last_quarter_paid TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN quarter_reminder_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_memberships ADD COLUMN fonds_member_id INTEGER REFERENCES fonds_members(id)`,
  ]) {
    try { await db.execute(col); } catch (_) {}
  }
  console.log('✓ user_memberships uitgebreid');

  // ── Indexes ─────────────────────────────────────────────────────────────────
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cash_payments_user ON cash_payments(user_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_cash_payments_date ON cash_payments(payment_date)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_fonds_user ON fonds_members(user_id)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_fonds_end ON fonds_members(end_date)`);

  console.log('\n✅ Migratie 010 geslaagd.');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
