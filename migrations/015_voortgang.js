/**
 * Migratie 015 — "Mijn Voortgang" dashboard
 *
 * Nieuwe tabellen voor aanwezigheid-tracking en per-lid voedingsschema's.
 * Raakt geen bestaande tabellen aan.
 *
 *  - attendance             : gelogd bezoek per lid (les-checkin of voltooide PT-afspraak)
 *  - attendance_reminders   : voorkomt dubbele "we missen je" mails
 *  - nutrition_templates    : voedingsschema per lid, door coach/admin aangemaakt
 *  - nutrition_logs         : dagelijkse afvink-status per maaltijd tegen een template
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const DB_PATH = (process.env.DB_PATH || './mhgym.db').replace('./', '');
const db = createClient({ url: 'file:' + path.resolve(DB_PATH) });

async function migrate() {
  console.log('🔄 Migratie 015 — Mijn Voortgang\n');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS attendance (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       TEXT    NOT NULL,
      class_id   INTEGER REFERENCES classes(id),
      source     TEXT    NOT NULL DEFAULT 'class',
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ attendance tabel klaar');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS attendance_reminders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sent_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ attendance_reminders tabel klaar');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS nutrition_templates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_id   INTEGER REFERENCES users(id),
      title      TEXT    NOT NULL,
      meals      TEXT    NOT NULL DEFAULT '[]',
      active     INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ nutrition_templates tabel klaar');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS nutrition_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES nutrition_templates(id) ON DELETE CASCADE,
      date        TEXT    NOT NULL,
      meal_ref    TEXT    NOT NULL,
      completed   INTEGER NOT NULL DEFAULT 0,
      note        TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(member_id, template_id, date, meal_ref)
    )
  `);
  console.log('✓ nutrition_logs tabel klaar');

  await db.execute(`CREATE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_attendance_reminders_member ON attendance_reminders(member_id, sent_at)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_nutrition_templates_member ON nutrition_templates(member_id, active)`);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_nutrition_logs_member_date ON nutrition_logs(member_id, date)`);
  console.log('✓ indexes klaar');

  console.log('\n✅ Migratie 015 geslaagd.\n');
  await db.close();
}

migrate().catch(e => {
  console.error('❌ Migratie 015 mislukt:', e.message);
  process.exit(1);
});
