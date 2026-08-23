/**
 * Migratie 017 — measurement_reports
 *
 * Nieuwe, volledig aparte tabel voor door de admin geüploade foto's/screenshots
 * van lichaamsanalyse-/weegschaalrapporten, gekoppeld aan een specifiek lid.
 *
 * Dit is bewust een ANDERE tabel dan het bestaande `body_measurements`
 * (numerieke zelf-invoer door het lid via het trainingsplatform) — hier gaat
 * het om de originele afbeelding van een meting, admin-only, geen cijfers.
 *
 * Puur additief: geen bestaande tabel of kolom gewijzigd.
 *
 * Gebruik: node migrations/017_measurement_reports.js
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function run() {
  console.log('[017] measurement_reports aanmaken...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS measurement_reports (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      measured_at  TEXT    NOT NULL,
      filename     TEXT    NOT NULL,
      mime_type    TEXT    NOT NULL,
      uploaded_by  INTEGER REFERENCES users(id),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_measurement_reports_user ON measurement_reports(user_id, measured_at DESC)`);

  console.log('[017] Klaar! measurement_reports aangemaakt.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[017] Fout:', err.message); process.exit(1); });
