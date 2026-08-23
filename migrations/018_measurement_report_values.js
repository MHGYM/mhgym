/**
 * Migratie 018 — measurement_report_values
 *
 * Nieuwe, 1-op-1 gekoppelde tabel aan het bestaande measurement_reports
 * (de geüploade afbeelding). Slaat de automatisch uitgelezen én door de admin
 * bevestigde meetwaarden op. Elke waarde is nullable — een niet-herkende
 * waarde wordt nooit verzonnen, alleen leeg gelaten.
 *
 * Puur additief: geen bestaande tabel/kolom gewijzigd. Bestaande
 * measurement_reports-rijen (alleen de afbeelding) blijven ongewijzigd
 * werken zonder een values-rij totdat er daadwerkelijk wordt uitgelezen.
 *
 * Gebruik: node migrations/018_measurement_report_values.js
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function run() {
  console.log('[018] measurement_report_values aanmaken...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS measurement_report_values (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id                   INTEGER NOT NULL UNIQUE REFERENCES measurement_reports(id) ON DELETE CASCADE,
      extraction_status           TEXT    NOT NULL DEFAULT 'pending',
      extraction_notes            TEXT,
      weight_kg                   REAL,
      bmi                         REAL,
      body_fat_pct                REAL,
      fat_mass_kg                 REAL,
      fat_free_weight_kg          REAL,
      muscle_mass_kg              REAL,
      muscle_rate_pct             REAL,
      skeletal_muscle_kg          REAL,
      bone_mass_kg                REAL,
      protein_mass_kg             REAL,
      protein_pct                 REAL,
      water_weight_kg             REAL,
      body_water_pct              REAL,
      subcutaneous_fat_pct        REAL,
      visceral_fat_rating         REAL,
      bmr_kcal                    REAL,
      body_age                    INTEGER,
      whr                         REAL,
      ideal_weight_kg             REAL,
      segment_fat_left_arm_pct    REAL,
      segment_fat_right_arm_pct   REAL,
      segment_fat_trunk_pct       REAL,
      segment_fat_left_leg_pct    REAL,
      segment_fat_right_leg_pct   REAL,
      segment_muscle_left_arm_pct  REAL,
      segment_muscle_right_arm_pct REAL,
      segment_muscle_trunk_pct     REAL,
      segment_muscle_left_leg_pct  REAL,
      segment_muscle_right_leg_pct REAL,
      confirmed_by                INTEGER REFERENCES users(id),
      confirmed_at                TEXT,
      created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  console.log('[018] Klaar! measurement_report_values aangemaakt.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[018] Fout:', err.message); process.exit(1); });
