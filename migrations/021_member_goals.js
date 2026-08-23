/**
 * Migratie 021 — member_goals
 *
 * Door de trainer (admin) ingesteld, meetbaar doel per lid — nodig voor de
 * "Doel Bereikt"-badge. Metric is een whitelisted kolomnaam uit
 * measurement_report_values (weight_kg | body_fat_pct | muscle_mass_kg),
 * gevalideerd in badgeController.js — nooit vrije tekst in SQL.
 *
 * Puur additief: nieuwe tabel, geen bestaande data gewijzigd.
 *
 * Gebruik: node migrations/021_member_goals.js
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function run() {
  console.log('[021] member_goals aanmaken...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS member_goals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      metric       TEXT    NOT NULL,
      target_value REAL    NOT NULL,
      direction    TEXT    NOT NULL CHECK (direction IN ('lower','higher')),
      created_by   INTEGER REFERENCES users(id),
      achieved_at  TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_member_goals_user ON member_goals(user_id, achieved_at)`);

  console.log('[021] Klaar! member_goals aangemaakt.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[021] Fout:', err.message); process.exit(1); });
