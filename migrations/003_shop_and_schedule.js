/**
 * Migratie 003 — Winkel tabellen + echt MHGym lesrooster
 *
 * - Voegt products, orders, order_items tabellen toe
 * - Seeded MHGym boksproducten
 * - Verwijdert alle nep-lessen en seeded het echte wekelijkse rooster (16 weken vooruit)
 *
 * Gebruik: node migrations/003_shop_and_schedule.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

// ── Nederlandse feestdagen (gesloten) ──────────────────────────────────────
const HOLIDAYS_2025 = new Set([
  '2025-01-01', // Nieuwjaarsdag
  '2025-03-30', // Suikerfeest (Eid al-Fitr)
  '2025-04-18', // Goede Vrijdag
  '2025-04-20', // Eerste Paasdag
  '2025-04-21', // Tweede Paasdag
  '2025-04-27', // Koningsdag
  '2025-05-29', // Hemelvaartsdag
  '2025-06-06', // Offerfeest (Eid al-Adha)
  '2025-06-08', // Eerste Pinksterdag
  '2025-06-09', // Tweede Pinksterdag
  '2025-12-25', // Eerste Kerstdag
  '2025-12-26', // Tweede Kerstdag
]);

const HOLIDAYS_2026 = new Set([
  '2026-01-01', // Nieuwjaarsdag
  '2026-03-20', // Suikerfeest (Eid al-Fitr)
  '2026-04-03', // Goede Vrijdag
  '2026-04-05', // Eerste Paasdag
  '2026-04-06', // Tweede Paasdag
  '2026-04-27', // Koningsdag
  '2026-05-14', // Hemelvaartsdag
  '2026-05-24', // Eerste Pinksterdag
  '2026-05-25', // Tweede Pinksterdag
  '2026-05-27', // Offerfeest (Eid al-Adha)
  '2026-12-25', // Eerste Kerstdag
  '2026-12-26', // Tweede Kerstdag
]);

function isHoliday(dateStr) {
  return HOLIDAYS_2025.has(dateStr) || HOLIDAYS_2026.has(dateStr);
}

// ── Wekelijks rooster (dag 1=ma, 5=vr) ────────────────────────────────────
// Elke entry: { day, hour, minute, name, category, instructor, duration, capacity, location }
const WEEKLY_SCHEDULE = [
  // Maandag
  { day: 1, hour: 16, minute: 0,  name: 'Kickboksen Kids',      category: 'kickboksen', instructor: 'Coach Youssef', duration: 60, capacity: 15, location: 'Zaal A' },
  { day: 1, hour: 19, minute: 0,  name: 'Kickboksen Recreanten', category: 'kickboksen', instructor: 'Coach Youssef', duration: 60, capacity: 20, location: 'Zaal A' },
  { day: 1, hour: 20, minute: 15, name: 'Boksen Ladies-Only',    category: 'boksen',     instructor: 'Coach Fatima',  duration: 60, capacity: 15, location: 'Zaal B' },
  // Dinsdag
  { day: 2, hour: 17, minute: 0,  name: 'Kickboksen Jeugd',     category: 'kickboksen', instructor: 'Coach Youssef', duration: 60, capacity: 15, location: 'Zaal A' },
  { day: 2, hour: 19, minute: 0,  name: 'Boksen Recreanten',     category: 'boksen',     instructor: 'Coach Hamza',   duration: 60, capacity: 20, location: 'Zaal A' },
  // Woensdag
  { day: 3, hour: 20, minute: 0,  name: 'Kickboksen Ladies-Only', category: 'kickboksen', instructor: 'Coach Fatima', duration: 60, capacity: 15, location: 'Zaal B' },
  // Donderdag
  { day: 4, hour: 19, minute: 0,  name: 'Boksen Recreanten',     category: 'boksen',     instructor: 'Coach Hamza',   duration: 60, capacity: 20, location: 'Zaal A' },
  // Vrijdag
  { day: 5, hour: 16, minute: 0,  name: 'Boksen Kids',          category: 'boksen',     instructor: 'Coach Hamza',   duration: 60, capacity: 15, location: 'Zaal A' },
  { day: 5, hour: 17, minute: 0,  name: 'Kickboksen Jeugd',     category: 'kickboksen', instructor: 'Coach Youssef', duration: 60, capacity: 15, location: 'Zaal A' },
];

// ── Winkelproducten ────────────────────────────────────────────────────────
const PRODUCTS = [
  { name: 'Bokshandschoenen 10oz',  category: 'handschoenen', price: 44.99, stock: 20, description: 'Professionele bokshandschoenen 10oz — ideaal voor beginners en recreanten', image_url: null },
  { name: 'Bokshandschoenen 12oz',  category: 'handschoenen', price: 49.99, stock: 20, description: 'Bokshandschoenen 12oz — voor gevorderden en sparring', image_url: null },
  { name: 'Bokshandschoenen 14oz',  category: 'handschoenen', price: 54.99, stock: 15, description: 'Zware bokshandschoenen 14oz — voor intensief sparren', image_url: null },
  { name: 'Bandages / Hand Wraps',  category: 'bescherming',  price: 14.99, stock: 50, description: '4,5m elastische bandages voor maximale polsbescherming', image_url: null },
  { name: 'Mondbeschermer',         category: 'bescherming',  price: 9.99,  stock: 30, description: 'Aanpasbare mondbeschermer — BPA-vrij', image_url: null },
  { name: 'Scheenbeschermers',      category: 'bescherming',  price: 39.99, stock: 15, description: 'Kickboks scheenbeschermers met voetbescherming', image_url: null },
  { name: 'MHGym Boksbroek',        category: 'kleding',      price: 34.99, stock: 25, description: 'Officiële MHGym boksbroek — licht en ademend', image_url: null },
  { name: 'MHGym T-Shirt',          category: 'kleding',      price: 24.99, stock: 40, description: 'MHGym logo T-shirt — unisex, maten XS–XXL', image_url: null },
  { name: 'MHGym Hoodie',           category: 'kleding',      price: 54.99, stock: 20, description: 'MHGym fleece hoodie — warm na de training', image_url: null },
  { name: 'Springtouw Pro',         category: 'accessoires',  price: 19.99, stock: 20, description: 'Speed rope met kogellager — 3 meter verstelbaar', image_url: null },
];

function generateClasses(weeksAhead = 16) {
  const classes = [];
  const now = new Date();
  // Start from current Monday
  const startOfWeek = new Date(now);
  const dayOfWeek = startOfWeek.getDay(); // 0=Sun, 1=Mon...
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
        description: `${slot.name} — MHGym wekelijkse les`,
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
  console.log('🔄 Migratie 003 — Winkel + echt lesrooster...\n');

  // ── 1. Maak producten tabel ──────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      category    TEXT    NOT NULL DEFAULT 'accessoires',
      description TEXT,
      price       REAL    NOT NULL,
      stock       INTEGER NOT NULL DEFAULT 0,
      image_url   TEXT,
      active      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('  ✅ Tabel "products" aangemaakt');

  // ── 2. Maak orders tabel ─────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mollie_payment_id TEXT    UNIQUE,
      total_amount      REAL    NOT NULL,
      status            TEXT    NOT NULL DEFAULT 'pending',
      checkout_url      TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('  ✅ Tabel "orders" aangemaakt');

  // ── 3. Maak order_items tabel ────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity   INTEGER NOT NULL DEFAULT 1,
      unit_price REAL    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('  ✅ Tabel "order_items" aangemaakt');

  // ── 4. Seed producten ────────────────────────────────────────────────────
  await db.execute('DELETE FROM products');
  await db.batch(
    PRODUCTS.map((p) => ({
      sql: `INSERT INTO products (name, category, description, price, stock, image_url)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [p.name, p.category, p.description, p.price, p.stock, p.image_url],
    })),
    'write'
  );
  console.log(`  ✅ ${PRODUCTS.length} producten toegevoegd`);

  // ── 5. Vervang nep-lessen door echt rooster ──────────────────────────────
  await db.execute('DELETE FROM bookings');
  await db.execute('DELETE FROM classes');
  console.log('  🗑️  Nep-lessen verwijderd');

  const classes = generateClasses(16);
  await db.batch(
    classes.map((c) => ({
      sql: `INSERT INTO classes (name, description, instructor, category, date_time, duration_minutes, max_capacity, location)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [c.name, c.description, c.instructor, c.category, c.date_time, c.duration_minutes, c.max_capacity, c.location],
    })),
    'write'
  );
  console.log(`  ✅ ${classes.length} echte lessen aangemaakt (16 weken)`);

  // ── 6. Verificatie ───────────────────────────────────────────────────────
  const prodCount  = await db.execute('SELECT COUNT(*) as n FROM products');
  const classCount = await db.execute('SELECT COUNT(*) as n FROM classes');
  console.log(`\n  📋 Producten: ${prodCount.rows[0].n}`);
  console.log(`  📅 Lessen:    ${classCount.rows[0].n}`);

  console.log('\n✅ Migratie 003 succesvol afgerond!\n');
  await db.close();
}

migrate().catch((err) => {
  console.error('❌ Migratie mislukt:', err);
  process.exit(1);
});
