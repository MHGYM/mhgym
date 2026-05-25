/**
 * Migration 011 — pt_purchases.amount: NOT NULL DEFAULT 0
 *
 * SQLite doesn't support ALTER COLUMN, so we recreate the table with a DEFAULT
 * and copy existing data (NULLs become 0).
 */
const db = require('../src/config/database');

async function run() {
  console.log('Migration 011: pt_purchases.amount → NOT NULL DEFAULT 0');

  const info = await db.execute('PRAGMA table_info(pt_purchases)');
  const col  = info.rows.find(r => r.name === 'amount');

  if (col && col.dflt_value !== null) {
    console.log('✓ Already has DEFAULT — skipping.');
    return;
  }

  // Recreate table with DEFAULT 0
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS pt_purchases_new (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      package_id        TEXT    NOT NULL,
      mollie_payment_id TEXT,
      lessons_total     INTEGER NOT NULL DEFAULT 0,
      lessons_remaining INTEGER NOT NULL DEFAULT 0,
      lessons_used      INTEGER NOT NULL DEFAULT 0,
      amount            REAL    NOT NULL DEFAULT 0,
      status            TEXT    NOT NULL DEFAULT 'pending',
      expires_at        TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO pt_purchases_new
      SELECT id, user_id, package_id, mollie_payment_id,
             lessons_total, lessons_remaining, lessons_used,
             COALESCE(amount, 0),
             status, expires_at, created_at, updated_at
      FROM pt_purchases;

    DROP TABLE pt_purchases;
    ALTER TABLE pt_purchases_new RENAME TO pt_purchases;
  `);

  console.log('✓ pt_purchases.amount now has DEFAULT 0');
}

run()
  .then(() => { console.log('Migration 011 done.'); process.exit(0); })
  .catch(e  => { console.error('Migration 011 FAILED:', e.message); process.exit(1); });
