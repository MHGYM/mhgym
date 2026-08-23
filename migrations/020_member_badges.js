/**
 * Migratie 020 — member_badges
 *
 * Bijgehouden, daadwerkelijk-behaalde badges per lid. De badge-definities
 * (icoon/label/omschrijving/toekenningsregel) staan centraal in
 * src/config/badges.js + src/services/badgeService.js — deze tabel slaat
 * uitsluitend op WIE WELKE badge WANNEER heeft behaald.
 *
 * UNIQUE(user_id, badge_key) voorkomt op database-niveau dat dezelfde badge
 * dubbel wordt toegekend (INSERT ... ON CONFLICT DO NOTHING in badgeService).
 *
 * Puur additief: nieuwe tabel, geen bestaande data gewijzigd.
 *
 * Gebruik: node migrations/020_member_badges.js
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function run() {
  console.log('[020] member_badges aanmaken...');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS member_badges (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      badge_key  TEXT    NOT NULL,
      earned_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, badge_key)
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS idx_member_badges_user ON member_badges(user_id)`);

  console.log('[020] Klaar! member_badges aangemaakt.');
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[020] Fout:', err.message); process.exit(1); });
