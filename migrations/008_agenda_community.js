/**
 * Migration 008 — Agenda, Community, Cash-leden, Betalingsalerts
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:' + process.env.DB_PATH.replace('./', '') });

async function run() {
  // ── Vrij trainen boekingen ────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS vrij_trainen_bookings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date         TEXT    NOT NULL,
      start_time   TEXT    NOT NULL,
      end_time     TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'confirmed',
      notes        TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ vrij_trainen_bookings');

  // ── Community posts ───────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type               TEXT    NOT NULL DEFAULT 'member',
      title              TEXT,
      body               TEXT    NOT NULL,
      image_url          TEXT,
      pinned             INTEGER NOT NULL DEFAULT 0,
      send_push          INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ community_posts');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_likes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(post_id, user_id)
    )
  `);
  console.log('✓ community_likes');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ community_comments');

  // ── Betalingsfouten ───────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS payment_failures (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      membership_id      INTEGER,
      amount             REAL    NOT NULL,
      description        TEXT,
      failure_count      INTEGER NOT NULL DEFAULT 1,
      surcharge_added    REAL    NOT NULL DEFAULT 0,
      status             TEXT    NOT NULL DEFAULT 'open',
      last_reminder_at   TEXT,
      admin_notes        TEXT,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ payment_failures');

  // ── Kolommen toevoegen aan users ──────────────────────────────────────────
  for (const col of [
    `ALTER TABLE users ADD COLUMN is_cash_payer INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN admin_notes TEXT`,
    `ALTER TABLE users ADD COLUMN membership_paused INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN membership_paused_reason TEXT`,
  ]) {
    try { await db.execute(col); } catch (_) { /* kolom bestaat al */ }
  }
  console.log('✓ users kolommen bijgewerkt');

  // ── Kolommen toevoegen aan user_memberships ───────────────────────────────
  for (const col of [
    `ALTER TABLE user_memberships ADD COLUMN is_cash INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_memberships ADD COLUMN cash_paid INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_memberships ADD COLUMN admin_price REAL`,
    `ALTER TABLE user_memberships ADD COLUMN membership_type_key TEXT`,
  ]) {
    try { await db.execute(col); } catch (_) { /* kolom bestaat al */ }
  }
  console.log('✓ user_memberships kolommen bijgewerkt');

  // ── Indices ────────────────────────────────────────────────────────────────
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_vt_user_date ON vrij_trainen_bookings(user_id, date)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_community_created ON community_posts(created_at DESC)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_pf_user ON payment_failures(user_id)`);

  console.log('\n✅ Migratie 008 geslaagd.');
}

run().catch((e) => { console.error('❌', e.message); process.exit(1); });
