const db = require('../config/database');

async function initDb() {
  await db.execute(`CREATE TABLE IF NOT EXISTS rittenkaart_types (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    naam             TEXT    NOT NULL,
    ritten           INTEGER NOT NULL,
    prijs            REAL    NOT NULL,
    geldigheid_dagen INTEGER,
    actief           INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS rittenkaarten (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type_id           INTEGER NOT NULL REFERENCES rittenkaart_types(id),
    ritten_totaal     INTEGER NOT NULL,
    ritten_resterend  INTEGER NOT NULL,
    prijs             REAL    NOT NULL,
    betaalmethode     TEXT    NOT NULL DEFAULT 'contant',
    betaald           INTEGER NOT NULL DEFAULT 0,
    betaaldatum       TEXT,
    vervaldatum       TEXT,
    status            TEXT    NOT NULL DEFAULT 'active',
    aangemaakt_door   INTEGER REFERENCES users(id),
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS rittenkaart_transacties (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    rittenkaart_id   INTEGER NOT NULL REFERENCES rittenkaarten(id) ON DELETE CASCADE,
    booking_id       INTEGER REFERENCES bookings(id),
    delta            INTEGER NOT NULL,
    reden            TEXT    NOT NULL,
    aangemaakt_door  INTEGER REFERENCES users(id),
    created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
  )`);

  // Herstel corrupte einddatums (jaar buiten 2020-2100, typisch door verkeerde invoer)
  await db.execute(`
    UPDATE fonds_members
    SET end_date = date(start_date, '+1 year')
    WHERE start_date IS NOT NULL AND start_date != ''
      AND (LENGTH(end_date) != 10
        OR CAST(substr(end_date, 1, 4) AS INTEGER) < 2020
        OR CAST(substr(end_date, 1, 4) AS INTEGER) > 2100)
  `);
  await db.execute(`
    UPDATE user_memberships
    SET end_date = date(start_date, '+12 months')
    WHERE end_date IS NOT NULL AND start_date IS NOT NULL AND start_date != ''
      AND status IN ('active', 'cancelling')
      AND (LENGTH(end_date) != 10
        OR CAST(substr(end_date, 1, 4) AS INTEGER) < 2020
        OR CAST(substr(end_date, 1, 4) AS INTEGER) > 2100)
  `);

  // Migratie 014: verwijder UNIQUE-constraint op users.email (gezinsaccounts)
  try {
    const tableInfo = await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`);
    const createSql = tableInfo.rows[0]?.sql || '';
    if (createSql.includes('UNIQUE') && !createSql.includes('users_new')) {
      await db.execute(`PRAGMA foreign_keys = OFF`);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS users_new (
          id                       INTEGER PRIMARY KEY AUTOINCREMENT,
          email                    TEXT    NOT NULL,
          password                 TEXT    NOT NULL,
          first_name               TEXT    NOT NULL,
          last_name                TEXT    NOT NULL,
          phone                    TEXT,
          role                     TEXT    NOT NULL DEFAULT 'member',
          created_at               TEXT    NOT NULL DEFAULT (datetime('now')),
          updated_at               TEXT    NOT NULL DEFAULT (datetime('now')),
          birth_date               TEXT,
          address                  TEXT,
          postal_code              TEXT,
          city                     TEXT,
          mollie_customer_id       TEXT,
          is_cash_payer            INTEGER NOT NULL DEFAULT 0,
          admin_notes              TEXT,
          membership_paused        INTEGER NOT NULL DEFAULT 0,
          membership_paused_reason TEXT,
          payment_method           TEXT    NOT NULL DEFAULT 'sepa'
        )
      `);
      await db.execute(`INSERT INTO users_new SELECT * FROM users`);
      await db.execute(`DROP TABLE users`);
      await db.execute(`ALTER TABLE users_new RENAME TO users`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
      await db.execute(`PRAGMA foreign_keys = ON`);
      console.log('[DB] Migratie 014: UNIQUE op users.email verwijderd (gezinsaccounts).');
    }
  } catch (e) {
    console.error('[DB] Migratie 014 mislukt:', e.message);
  }

  const existing = await db.execute('SELECT COUNT(*) as n FROM rittenkaart_types');
  if (Number(existing.rows[0].n) === 0) {
    await db.batch([
      { sql: `INSERT INTO rittenkaart_types (naam, ritten, prijs) VALUES (?, ?, ?)`, args: ['5 ritten',  5,  92.50] },
      { sql: `INSERT INTO rittenkaart_types (naam, ritten, prijs) VALUES (?, ?, ?)`, args: ['10 ritten', 10, 160.00] },
      { sql: `INSERT INTO rittenkaart_types (naam, ritten, prijs) VALUES (?, ?, ?)`, args: ['15 ritten', 15, 210.00] },
      { sql: `INSERT INTO rittenkaart_types (naam, ritten, prijs) VALUES (?, ?, ?)`, args: ['20 ritten', 20, 240.00] },
    ], 'write');
    console.log('[DB] Rittenkaart standaardtypen aangemaakt.');
  }
}

module.exports = { initDb };
