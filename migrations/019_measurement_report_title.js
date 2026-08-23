/**
 * Migratie 019 — measurement_reports.title
 *
 * Optioneel label/titel per meetresultaat (bv. "Maandmeting augustus"),
 * zodat een lid/admin meerdere rapporten uit elkaar kan houden naast de datum.
 * Puur additief: nullable kolom op een bestaande tabel, geen bestaande rijen
 * gewijzigd.
 *
 * Gebruik: node migrations/019_measurement_report_title.js
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function run() {
  console.log('[019] measurement_reports.title toevoegen...');
  try {
    await db.execute(`ALTER TABLE measurement_reports ADD COLUMN title TEXT`);
    console.log('[019] Kolom toegevoegd.');
  } catch (e) {
    if (/duplicate column/i.test(e.message)) console.log('[019] Kolom bestaat al — overslaan.');
    else throw e;
  }
  console.log('[019] Klaar!');
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[019] Fout:', err.message); process.exit(1); });
