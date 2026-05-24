/**
 * Migratie 006 — Reset lesrooster
 *
 * - Verwijdert alle bestaande lessen en bijbehorende boekingen
 * - Herinsert het volledige MHGym-rooster voor de komende 52 weken
 * - Gebruikt samengestelde categorieën (kickboksen-kids, boksen-recreanten, etc.)
 *
 * Gebruik: node migrations/006_reset_schedule.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

// ── Roostertemplate ───────────────────────────────────────────────────────────
// [dayOfWeek (1=ma,2=di,3=wo,4=do,5=vr), startH, startM, name, instructor, category, durationMin, maxCapacity]
const TEMPLATE = [
  // Maandag
  [1, 16,  0, 'Kickboksen Kids',        'Joep',     'kickboksen-kids',        60, 20],
  [1, 19,  0, 'Kickboksen Recreanten',  'Joep',     'kickboksen-recreanten',  60, 18],
  [1, 20, 15, 'Boksen Ladies-Only',     'Ecrin',    'boksen-ladies-only',     60, 18],
  // Dinsdag
  [2, 17,  0, 'Jeugd',                  'Mohammed', 'jeugd',                  60, 20],
  [2, 19,  0, 'Boksen Recreanten',      'Mohammed', 'boksen-recreanten',      60, 18],
  // Woensdag
  [3, 20,  0, 'Kickboksen Ladies-Only', 'Ecrin',    'kickboksen-ladies-only', 60, 18],
  // Donderdag
  [4, 19,  0, 'Boksen Recreanten',      'Mohammed', 'boksen-recreanten',      60, 20],
  // Vrijdag
  [5, 16,  0, 'Kickboksen Kids',        'Mohammed', 'kickboksen-kids',        60, 20],
  [5, 17,  0, 'Kickboksen Jeugd',       'Mohammed', 'kickboksen-jeugd',       60, 20],
];

async function run() {
  console.log('[006] Verwijder bestaande boekingen en lessen...');
  await db.execute('DELETE FROM bookings');
  await db.execute('DELETE FROM classes');
  console.log('[006] Tabellen geleegd.');

  // Maandag van de huidige week bepalen
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const monday = new Date(now);
  const dow = now.getDay(); // 0=zo, 1=ma ... 6=za
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));

  let total = 0;

  for (let week = 0; week < 52; week++) {
    const weekMonday = new Date(monday);
    weekMonday.setDate(monday.getDate() + week * 7);

    for (const [dayNum, h, m, name, instructor, category, duration, maxCap] of TEMPLATE) {
      // dayNum: 1=ma -> +0, 2=di -> +1 ... 5=vr -> +4
      const classDate = new Date(weekMonday);
      classDate.setDate(weekMonday.getDate() + (dayNum - 1));
      classDate.setHours(h, m, 0, 0);

      // Sla verleden lessen over (alleen voor week 0)
      if (week === 0 && classDate < new Date()) continue;

      await db.execute({
        sql: `INSERT INTO classes
                (name, instructor, category, date_time, duration_minutes, max_capacity, location, status)
              VALUES (?, ?, ?, ?, ?, ?, 'Zaal 1', 'scheduled')`,
        args: [name, instructor, category, classDate.toISOString(), duration, maxCap],
      });
      total++;
    }
  }

  console.log(`[006] Klaar! ${total} lessen ingevoerd voor 52 weken.`);
  await db.close();
}

run().catch((err) => {
  console.error('[006] Fout:', err);
  process.exit(1);
});
