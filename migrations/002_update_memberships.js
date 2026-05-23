/**
 * Migratie 002 — Echte MHGym abonnementsprijzen
 *
 * Voegt category + duration_months kolommen toe aan bestaande DB
 * en vervangt de placeholder tiers door de echte prijzen.
 *
 * Gebruik: node migrations/002_update_memberships.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const dbPath = process.env.DB_PATH || './mhgym.db';
const db = createClient({ url: `file:${path.resolve(dbPath)}` });

const NEW_MEMBERSHIPS = [
  // Jeugd
  {
    name: 'Jaar abonnement', category: 'Jeugd', duration_months: 12,
    price_monthly: 45.00, max_bookings_per_month: -1,
    description: 'Jaarlijks jeugdabonnement — beste prijs',
    features: JSON.stringify(['Onbeperkt sporten', 'Jaarlijks abonnement', 'Laagste maandprijs', 'Alle faciliteiten', 'App toegang']),
  },
  {
    name: 'Half jaar abonnement', category: 'Jeugd', duration_months: 6,
    price_monthly: 50.00, max_bookings_per_month: -1,
    description: 'Halfjaarlijks jeugdabonnement',
    features: JSON.stringify(['Onbeperkt sporten', 'Half jaar abonnement', 'Alle faciliteiten', 'App toegang']),
  },
  {
    name: 'Maand abonnement', category: 'Jeugd', duration_months: 1,
    price_monthly: 55.00, max_bookings_per_month: -1,
    description: 'Flexibel maandelijks jeugdabonnement',
    features: JSON.stringify(['Onbeperkt sporten', 'Maandelijks opzegbaar', 'Maximale flexibiliteit', 'Alle faciliteiten', 'App toegang']),
  },
  // Volwassenen 16+
  {
    name: 'Jaar abonnement', category: 'Volwassenen', duration_months: 12,
    price_monthly: 55.00, max_bookings_per_month: -1,
    description: 'Jaarlijks abonnement 16+ — beste prijs',
    features: JSON.stringify(['Onbeperkt sporten', 'Jaarlijks abonnement', 'Laagste maandprijs', 'Alle faciliteiten', 'App toegang']),
  },
  {
    name: 'Half jaar abonnement', category: 'Volwassenen', duration_months: 6,
    price_monthly: 60.00, max_bookings_per_month: -1,
    description: 'Halfjaarlijks abonnement 16+',
    features: JSON.stringify(['Onbeperkt sporten', 'Half jaar abonnement', 'Alle faciliteiten', 'App toegang']),
  },
  {
    name: 'Maand abonnement', category: 'Volwassenen', duration_months: 1,
    price_monthly: 65.00, max_bookings_per_month: -1,
    description: 'Flexibel maandelijks abonnement 16+',
    features: JSON.stringify(['Onbeperkt sporten', 'Maandelijks opzegbaar', 'Maximale flexibiliteit', 'Alle faciliteiten', 'App toegang']),
  },
];

async function migrate() {
  console.log('🔄 Migratie 002 — MHGym abonnementsprijzen bijwerken...\n');

  // 1. Voeg nieuwe kolommen toe (negeert fout als ze al bestaan)
  for (const [col, def] of [
    ['category',        "TEXT NOT NULL DEFAULT 'Volwassenen'"],
    ['duration_months', 'INTEGER NOT NULL DEFAULT 1'],
  ]) {
    try {
      await db.execute(`ALTER TABLE memberships ADD COLUMN ${col} ${def}`);
      console.log(`  ✅ Kolom "${col}" toegevoegd`);
    } catch {
      console.log(`  ℹ️  Kolom "${col}" bestaat al`);
    }
  }

  // 2. Zet max_bookings_per_month op -1 voor bestaande records (legacy fix)
  await db.execute('UPDATE memberships SET max_bookings_per_month = -1');

  // 3. Verwijder alle oude memberships
  //    (user_memberships blijven bewaard — foreign key wijst naar id die we opnieuw aanmaken)
  await db.execute('DELETE FROM memberships');
  console.log('\n  🗑️  Oude abonnementen verwijderd');

  // 4. Voeg nieuwe memberships in
  await db.batch(
    NEW_MEMBERSHIPS.map((m) => ({
      sql: `INSERT INTO memberships
              (name, category, duration_months, price_monthly, max_bookings_per_month, description, features)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [m.name, m.category, m.duration_months, m.price_monthly,
             m.max_bookings_per_month, m.description, m.features],
    })),
    'write'
  );

  // 5. Verificatie
  const result = await db.execute('SELECT id, category, name, price_monthly FROM memberships ORDER BY category, duration_months DESC');
  console.log('\n  📋 Nieuwe abonnementen:\n');
  console.log('  ID  Categorie      Naam                     Prijs/mnd');
  console.log('  ' + '─'.repeat(58));
  for (const row of result.rows) {
    const id   = String(row.id).padEnd(4);
    const cat  = String(row.category).padEnd(14);
    const name = String(row.name).padEnd(24);
    const price = `€${Number(row.price_monthly).toFixed(2)}`;
    console.log(`  ${id}${cat}${name}${price}`);
  }

  console.log('\n✅ Migratie 002 succesvol afgerond!\n');
  await db.close();
}

migrate().catch((err) => {
  console.error('❌ Migratie mislukt:', err);
  process.exit(1);
});
