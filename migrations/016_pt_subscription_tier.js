/**
 * Migratie 016 — pt_subscriptions.tier
 *
 * Voegt een tier-kolom toe aan pt_subscriptions zodat een actief PT-abonnement
 * betrouwbaar Basic/Standard/Premium kan onderscheiden (los van freq_per_week,
 * dat sinds de nieuwe 9-plannenstructuur niet meer 1-op-1 met tier overeenkomt).
 *
 * Puur additief:
 *  - bestaande rijen worden niet aangeraakt (geen UPDATE)
 *  - nieuwe kolom is nullable, geen DEFAULT — bestaande abonnementen (aangemaakt
 *    vóór de tier-structuur) krijgen NULL, wat eerlijk weergeeft dat hun tier
 *    onbekend is, in plaats van een gegokte waarde
 *
 * Gebruik: node migrations/016_pt_subscription_tier.js
 */
require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

async function run() {
  console.log('[016] pt_subscriptions.tier toevoegen...');

  const info = await db.execute('PRAGMA table_info(pt_subscriptions)');
  const alreadyExists = info.rows.some((r) => r.name === 'tier');

  if (alreadyExists) {
    console.log('[016] Kolom "tier" bestaat al — niets te doen.');
    return;
  }

  await db.execute('ALTER TABLE pt_subscriptions ADD COLUMN tier TEXT');
  console.log('[016] Klaar! pt_subscriptions.tier toegevoegd (NULL voor bestaande rijen).');
}

run()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[016] Fout:', err.message); process.exit(1); });
