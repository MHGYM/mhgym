/**
 * Migratie 004 — Correct rooster (Joep / Mohammed) + echte MHGym producten
 *
 * Gebruik: node migrations/004_fix_schedule_and_products.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

// ── Nederlandse feestdagen ─────────────────────────────────────────────────
const HOLIDAYS = new Set([
  '2025-01-01','2025-03-30','2025-04-18','2025-04-20','2025-04-21',
  '2025-04-27','2025-05-29','2025-06-06','2025-06-08','2025-06-09',
  '2025-12-25','2025-12-26',
  '2026-01-01','2026-03-20','2026-04-03','2026-04-05','2026-04-06',
  '2026-04-27','2026-05-14','2026-05-24','2026-05-25','2026-05-27',
  '2026-12-25','2026-12-26',
]);

function isHoliday(dateStr) { return HOLIDAYS.has(dateStr); }

// ── Echt MHGym rooster met correcte trainers ───────────────────────────────
// dag: 1=ma 2=di 3=wo 4=do 5=vr
const WEEKLY_SCHEDULE = [
  // Maandag — Trainer: Joep
  { day: 1, hour: 16, minute: 0,  name: 'Kickboksen Kids',       category: 'kids',        instructor: 'Joep',     duration: 60, capacity: 15, location: 'Zaal 1' },
  { day: 1, hour: 19, minute: 0,  name: 'Kickboksen Recreanten', category: 'recreanten',  instructor: 'Joep',     duration: 60, capacity: 20, location: 'Zaal 1' },
  { day: 1, hour: 20, minute: 15, name: 'Boksen Ladies-Only',    category: 'ladies-only', instructor: 'Joep',     duration: 60, capacity: 15, location: 'Zaal 1' },
  // Dinsdag — Trainer: Mohammed
  { day: 2, hour: 17, minute: 0,  name: 'Jeugd',                 category: 'jeugd',       instructor: 'Mohammed', duration: 60, capacity: 15, location: 'Zaal 1' },
  { day: 2, hour: 19, minute: 0,  name: 'Boksen Recreanten',     category: 'recreanten',  instructor: 'Mohammed', duration: 60, capacity: 20, location: 'Zaal 1' },
  // Woensdag — Trainer: Mohammed
  { day: 3, hour: 20, minute: 0,  name: 'Kickboksen Ladies-Only',category: 'ladies-only', instructor: 'Mohammed', duration: 60, capacity: 15, location: 'Zaal 1' },
  // Donderdag — Trainer: Mohammed
  { day: 4, hour: 19, minute: 0,  name: 'Boksen Recreanten',     category: 'recreanten',  instructor: 'Mohammed', duration: 60, capacity: 20, location: 'Zaal 1' },
  // Vrijdag — Trainer: Mohammed
  { day: 5, hour: 16, minute: 0,  name: 'Boksen Kids',           category: 'kids',        instructor: 'Mohammed', duration: 60, capacity: 15, location: 'Zaal 1' },
  { day: 5, hour: 17, minute: 0,  name: 'Kickboksen Jeugd',      category: 'jeugd',       instructor: 'Mohammed', duration: 60, capacity: 15, location: 'Zaal 1' },
];

// ── Echte MHGym producten ─────────────────────────────────────────────────
const PRODUCTS = [
  {
    name: 'Kids bokshandschoenen',
    category: 'handschoenen',
    price: 50.00, stock: 20,
    description: 'Officiële MHGym bokshandschoenen voor kids — speciaal ontworpen voor jonge boksers',
  },
  {
    name: 'Kids scheenbescherming',
    category: 'bescherming',
    price: 50.00, stock: 20,
    description: 'MHGym scheenbescherming voor kids — comfortabele pasvorm met klittenband',
  },
  {
    name: 'Kids SET',
    category: 'sets',
    price: 100.00, stock: 15,
    description: 'Bokshandschoenen + scheenbescherming voor kids. GRATIS bidon erbij!',
    bonus: 'GRATIS bidon',
  },
  {
    name: 'Volwassenen bokshandschoenen',
    category: 'handschoenen',
    price: 60.00, stock: 20,
    description: 'Officiële MHGym bokshandschoenen voor volwassenen — professionele kwaliteit',
  },
  {
    name: 'Volwassenen scheenbescherming',
    category: 'bescherming',
    price: 60.00, stock: 20,
    description: 'MHGym scheenbescherming voor volwassenen — maximale bescherming tijdens sparren',
  },
  {
    name: 'Volwassenen SET',
    category: 'sets',
    price: 120.00, stock: 15,
    description: 'Bokshandschoenen + scheenbescherming voor volwassenen. GRATIS bandage erbij!',
    bonus: 'GRATIS bandage',
  },
  {
    name: 'Losse bandage',
    category: 'bescherming',
    price: 11.95, stock: 50,
    description: '4,5m elastische boksbandage voor maximale polsbescherming',
  },
  {
    name: 'Mondbeschermer',
    category: 'bescherming',
    price: 11.95, stock: 30,
    description: 'Aanpasbare mondbeschermer — BPA-vrij, geschikt voor alle leeftijden',
  },
  {
    name: 'MHGym T-shirt',
    category: 'kleding',
    price: 30.00, stock: 40,
    description: 'Officieel MHGym T-shirt — unisex, maten XS–XXL',
  },
];

function generateClasses(weeksAhead = 16) {
  const classes = [];
  const now = new Date();
  const startOfWeek = new Date(now);
  const dayOfWeek = startOfWeek.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  startOfWeek.setDate(startOfWeek.getDate() + diff);
  startOfWeek.setHours(0, 0, 0, 0);

  for (let week = 0; week < weeksAhead; week++) {
    for (const slot of WEEKLY_SCHEDULE) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + (week * 7) + (slot.day - 1));
      d.setHours(slot.hour, slot.minute, 0, 0);
      const dateStr = d.toISOString().split('T')[0];
      if (isHoliday(dateStr)) continue;
      classes.push({
        name: slot.name,
        description: `${slot.name} met ${slot.instructor} — MHGym`,
        instructor: slot.instructor,
        category: slot.category,
        date_time: d.toISOString(),
        duration_minutes: slot.duration,
        max_capacity: slot.capacity,
        location: slot.location,
      });
    }
  }
  return classes;
}

async function migrate() {
  console.log('🔄 Migratie 004 — Correct rooster + echte producten...\n');

  // ── 1. Voeg bonus kolom toe aan products als die er nog niet is ────────────
  try {
    await db.execute(`ALTER TABLE products ADD COLUMN bonus TEXT`);
    console.log('  ✅ Kolom "bonus" toegevoegd aan products');
  } catch {
    console.log('  ℹ️  Kolom "bonus" bestaat al');
  }

  // ── 2. Reset lessen ────────────────────────────────────────────────────────
  await db.execute('DELETE FROM bookings');
  await db.execute('DELETE FROM classes');
  console.log('  🗑️  Oude lessen verwijderd');

  const classes = generateClasses(16);
  await db.batch(
    classes.map((c) => ({
      sql: `INSERT INTO classes (name, description, instructor, category, date_time, duration_minutes, max_capacity, location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [c.name, c.description, c.instructor, c.category, c.date_time, c.duration_minutes, c.max_capacity, c.location],
    })),
    'write'
  );
  console.log(`  ✅ ${classes.length} lessen aangemaakt (Joep ma, Mohammed di–vr)`);

  // ── 3. Reset producten ─────────────────────────────────────────────────────
  await db.execute('DELETE FROM order_items');
  await db.execute('DELETE FROM orders');
  await db.execute('DELETE FROM products');
  console.log('  🗑️  Oude producten verwijderd');

  await db.batch(
    PRODUCTS.map((p) => ({
      sql: `INSERT INTO products (name, category, description, price, stock, bonus)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [p.name, p.category, p.description, p.price, p.stock, p.bonus || null],
    })),
    'write'
  );
  console.log(`  ✅ ${PRODUCTS.length} echte MHGym producten toegevoegd`);

  // ── 4. Verificatie ─────────────────────────────────────────────────────────
  const classCount   = await db.execute('SELECT COUNT(*) as n FROM classes');
  const productCount = await db.execute('SELECT COUNT(*) as n FROM products');
  const instructors  = await db.execute('SELECT DISTINCT instructor, COUNT(*) as n FROM classes GROUP BY instructor');

  console.log(`\n  📅 Lessen:    ${classCount.rows[0].n}`);
  console.log(`  📦 Producten: ${productCount.rows[0].n}`);
  console.log('  👥 Trainers:');
  instructors.rows.forEach((r) => console.log(`     ${r.instructor}: ${r.n} lessen`));

  console.log('\n✅ Migratie 004 succesvol!\n');
  await db.close();
}

migrate().catch((err) => {
  console.error('❌ Migratie mislukt:', err);
  process.exit(1);
});
