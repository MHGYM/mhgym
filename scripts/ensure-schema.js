/**
 * ensure-schema.js — Idempotent database setup for production.
 *
 * Creates all tables (IF NOT EXISTS) and all extra columns (try/catch on ALTER).
 * Safe to call on every startup: no-ops if schema is already up-to-date.
 * Covers all 011 migrations consolidated into a single pass.
 */

const { createClient } = require('@libsql/client');
const path = require('path');

async function ensureSchema() {
  const dbPath = process.env.DB_PATH || './mhgym.db';
  const db = createClient({ url: `file:${path.resolve(dbPath)}` });

  console.log('[DB] Schema setup gestart…');

  // ── Helper ────────────────────────────────────────────────────────────────────
  const run = async (sql) => { try { await db.execute(sql); } catch (_) {} };

  // ── Migratie 014: verwijder UNIQUE op users.email (gezinsaccounts) ────────────
  try {
    const tableInfo = await db.execute(`SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`);
    const createSql = tableInfo.rows[0]?.sql || '';
    if (createSql.includes('UNIQUE')) {
      console.log('[DB] Migratie 014: UNIQUE op users.email verwijderen…');
      await db.execute(`PRAGMA foreign_keys = OFF`);
      await db.execute(`DROP TABLE IF EXISTS users_new`);
      await db.execute(`CREATE TABLE users_new (
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
      )`);
      await db.execute(`INSERT INTO users_new SELECT * FROM users`);
      await db.execute(`DROP TABLE users`);
      await db.execute(`ALTER TABLE users_new RENAME TO users`);
      await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
      await db.execute(`PRAGMA foreign_keys = ON`);
      console.log('[DB] Migratie 014 geslaagd — email niet langer uniek.');
    }
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_unique_person ON users(email, first_name, last_name)`);
  } catch (e) {
    console.error('[DB] Migratie 014 mislukt:', e.message);
  }

  // ── Core tables (001) ────────────────────────────────────────────────────────
  await db.execute(`PRAGMA foreign_keys = ON`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      email                   TEXT    NOT NULL,
      password                TEXT    NOT NULL,
      first_name              TEXT    NOT NULL DEFAULT '',
      last_name               TEXT    NOT NULL DEFAULT '',
      phone                   TEXT,
      role                    TEXT    NOT NULL DEFAULT 'member',
      birth_date              TEXT,
      address                 TEXT,
      postal_code             TEXT,
      city                    TEXT,
      mollie_customer_id      TEXT,
      is_cash_payer           INTEGER NOT NULL DEFAULT 0,
      admin_notes             TEXT,
      membership_paused       INTEGER NOT NULL DEFAULT 0,
      membership_paused_reason TEXT,
      created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS memberships (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      name                   TEXT    NOT NULL,
      category               TEXT    NOT NULL DEFAULT 'Volwassenen',
      duration_months        INTEGER NOT NULL DEFAULT 1,
      price_monthly          REAL    NOT NULL,
      max_bookings_per_month INTEGER NOT NULL DEFAULT -1,
      minimum_months         INTEGER NOT NULL DEFAULT 1,
      notice_period_months   INTEGER NOT NULL DEFAULT 1,
      description            TEXT,
      features               TEXT,
      created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_memberships (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      membership_id          INTEGER NOT NULL REFERENCES memberships(id),
      membership_type_key    TEXT,
      status                 TEXT    NOT NULL DEFAULT 'active',
      start_date             TEXT    NOT NULL DEFAULT (date('now')),
      end_date               TEXT,
      contract_start         TEXT,
      contract_end           TEXT,
      minimum_months         INTEGER DEFAULT 1,
      notice_period_months   INTEGER DEFAULT 1,
      agreed_to_terms        INTEGER DEFAULT 0,
      cancels_at             TEXT,
      mollie_subscription_id TEXT,
      mollie_customer_id     TEXT,
      is_cash                INTEGER NOT NULL DEFAULT 0,
      cash_paid              INTEGER NOT NULL DEFAULT 0,
      admin_price            REAL,
      payment_type           TEXT    NOT NULL DEFAULT 'mollie',
      quarterly_amount       REAL,
      next_quarter_due       TEXT,
      last_quarter_paid      TEXT,
      quarter_reminder_sent  INTEGER NOT NULL DEFAULT 0,
      fonds_member_id        INTEGER REFERENCES fonds_members(id),
      created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS classes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      description      TEXT,
      instructor       TEXT    NOT NULL,
      category         TEXT    NOT NULL,
      date_time        TEXT    NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      max_capacity     INTEGER NOT NULL DEFAULT 20,
      current_bookings INTEGER NOT NULL DEFAULT 0,
      location         TEXT    NOT NULL DEFAULT 'Zaal A',
      status           TEXT    NOT NULL DEFAULT 'scheduled',
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      status       TEXT    NOT NULL DEFAULT 'confirmed',
      booked_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      cancelled_at TEXT,
      UNIQUE(user_id, class_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payments (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mollie_payment_id TEXT    UNIQUE,
      amount            REAL    NOT NULL,
      currency          TEXT    NOT NULL DEFAULT 'EUR',
      status            TEXT    NOT NULL DEFAULT 'open',
      description       TEXT,
      type              TEXT    NOT NULL DEFAULT 'membership',
      membership_id     INTEGER REFERENCES memberships(id),
      checkout_url      TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Shop tables (003) ─────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT,
      price       REAL    NOT NULL,
      stock       INTEGER NOT NULL DEFAULT 0,
      image_url   TEXT,
      category    TEXT    NOT NULL DEFAULT 'general',
      status      TEXT    NOT NULL DEFAULT 'active',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_amount      REAL    NOT NULL,
      status            TEXT    NOT NULL DEFAULT 'pending',
      mollie_payment_id TEXT,
      checkout_url      TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity   INTEGER NOT NULL DEFAULT 1,
      price      REAL    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── PT tables (007) ───────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pt_slots (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      date_time        TEXT    NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      trainer          TEXT    NOT NULL DEFAULT 'Mohammed',
      status           TEXT    NOT NULL DEFAULT 'available',
      notes            TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pt_purchases (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      package_id        TEXT    NOT NULL,
      mollie_payment_id TEXT,
      lessons_total     INTEGER NOT NULL DEFAULT 0,
      lessons_remaining INTEGER NOT NULL DEFAULT 0,
      lessons_used      INTEGER NOT NULL DEFAULT 0,
      amount            REAL    NOT NULL DEFAULT 0,
      status            TEXT    NOT NULL DEFAULT 'pending',
      expires_at        TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pt_bookings (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot_id         INTEGER NOT NULL REFERENCES pt_slots(id),
      purchase_id     INTEGER REFERENCES pt_purchases(id),
      subscription_id INTEGER,
      status          TEXT    NOT NULL DEFAULT 'pending',
      extra_person    INTEGER NOT NULL DEFAULT 0,
      admin_notes     TEXT,
      cancelled_at    TEXT,
      confirmed_at    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS pt_subscriptions (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      freq_per_week          INTEGER NOT NULL,
      price_per_lesson       REAL    NOT NULL,
      price_monthly          REAL    NOT NULL,
      status                 TEXT    NOT NULL DEFAULT 'pending',
      mollie_subscription_id TEXT,
      start_date             TEXT,
      contract_end           TEXT,
      cancels_at             TEXT,
      minimum_months         INTEGER NOT NULL DEFAULT 6,
      agreed_to_terms        INTEGER NOT NULL DEFAULT 0,
      created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint   TEXT    NOT NULL UNIQUE,
      p256dh     TEXT    NOT NULL,
      auth       TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Community + VT bookings + Payment failures (008) ─────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS vrij_trainen_bookings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       TEXT    NOT NULL,
      start_time TEXT    NOT NULL,
      end_time   TEXT    NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'confirmed',
      notes      TEXT,
      slot_id    INTEGER REFERENCES vt_slots(id),
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_posts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT    NOT NULL DEFAULT 'member',
      title      TEXT,
      body       TEXT    NOT NULL,
      image_url  TEXT,
      pinned     INTEGER NOT NULL DEFAULT 0,
      send_push  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_likes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(post_id, user_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS community_comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id    INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body       TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS payment_failures (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      membership_id    INTEGER,
      amount           REAL    NOT NULL,
      description      TEXT,
      failure_count    INTEGER NOT NULL DEFAULT 1,
      surcharge_added  REAL    NOT NULL DEFAULT 0,
      status           TEXT    NOT NULL DEFAULT 'open',
      last_reminder_at TEXT,
      admin_notes      TEXT,
      reminder_day0_sent INTEGER NOT NULL DEFAULT 0,
      reminder_day3_sent INTEGER NOT NULL DEFAULT 0,
      reminder_day7_sent INTEGER NOT NULL DEFAULT 0,
      auto_paused_at   TEXT,
      mollie_paylink   TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── VT slots (009) ────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS vt_slots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      date         TEXT    NOT NULL,
      start_time   TEXT    NOT NULL,
      end_time     TEXT    NOT NULL,
      max_bookings INTEGER NOT NULL DEFAULT 10,
      notes        TEXT,
      status       TEXT    NOT NULL DEFAULT 'available',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Cash & Fonds (010) ────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS cash_payments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount       REAL    NOT NULL,
      payment_date TEXT    NOT NULL,
      payment_type TEXT    NOT NULL DEFAULT 'membership',
      sessions_paid INTEGER,
      note         TEXT,
      created_by   INTEGER REFERENCES users(id),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS fonds_members (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fonds_type            TEXT    NOT NULL,
      fonds_name            TEXT,
      start_date            TEXT    NOT NULL,
      end_date              TEXT    NOT NULL,
      amount_covered        REAL,
      notes                 TEXT,
      status                TEXT    NOT NULL DEFAULT 'active',
      expiry_reminder_sent  INTEGER NOT NULL DEFAULT 0,
      expiry_reminder2_sent INTEGER NOT NULL DEFAULT 0,
      expiry_urgent_sent    INTEGER NOT NULL DEFAULT 0,
      auto_paused_at        TEXT,
      created_by            INTEGER REFERENCES users(id),
      created_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Lichaamsmeting-rapporten (admin-upload, per lid) ──────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS measurement_reports (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      measured_at  TEXT    NOT NULL,
      filename     TEXT    NOT NULL,
      mime_type    TEXT    NOT NULL,
      uploaded_by  INTEGER REFERENCES users(id),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_measurement_reports_user ON measurement_reports(user_id, measured_at DESC)`);

  // ── Uitgelezen/bevestigde meetwaarden per rapport (1-op-1 met measurement_reports) ──
  // extraction_status: pending | extracted | failed | confirmed
  // Elke waarde is NULL totdat hij betrouwbaar is herkend — er wordt nooit een
  // waarde verzonnen. Losse, benoemde kolommen per metriek, zelfde patroon als
  // het bestaande body_measurements (geen JSON-blob), zodat dit consistent
  // blijft met de rest van de codebase.
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

  // ── ALTER TABLE safety patches (for existing DBs missing columns) ─────────────
  const patches = [
    // users
    `ALTER TABLE users ADD COLUMN birth_date TEXT`,
    `ALTER TABLE users ADD COLUMN address TEXT`,
    `ALTER TABLE users ADD COLUMN postal_code TEXT`,
    `ALTER TABLE users ADD COLUMN city TEXT`,
    `ALTER TABLE users ADD COLUMN mollie_customer_id TEXT`,
    `ALTER TABLE users ADD COLUMN is_cash_payer INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN admin_notes TEXT`,
    `ALTER TABLE users ADD COLUMN membership_paused INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN membership_paused_reason TEXT`,
    `ALTER TABLE users ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'sepa'`,
    // memberships
    `ALTER TABLE memberships ADD COLUMN minimum_months INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE memberships ADD COLUMN notice_period_months INTEGER NOT NULL DEFAULT 1`,
    // user_memberships
    `ALTER TABLE user_memberships ADD COLUMN membership_type_key TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN contract_start TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN contract_end TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN minimum_months INTEGER DEFAULT 1`,
    `ALTER TABLE user_memberships ADD COLUMN notice_period_months INTEGER DEFAULT 1`,
    `ALTER TABLE user_memberships ADD COLUMN agreed_to_terms INTEGER DEFAULT 0`,
    `ALTER TABLE user_memberships ADD COLUMN cancels_at TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN mollie_subscription_id TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN is_cash INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_memberships ADD COLUMN cash_paid INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_memberships ADD COLUMN admin_price REAL`,
    `ALTER TABLE user_memberships ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'mollie'`,
    `ALTER TABLE user_memberships ADD COLUMN quarterly_amount REAL`,
    `ALTER TABLE user_memberships ADD COLUMN next_quarter_due TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN last_quarter_paid TEXT`,
    `ALTER TABLE user_memberships ADD COLUMN quarter_reminder_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_memberships ADD COLUMN fonds_member_id INTEGER REFERENCES fonds_members(id)`,
    `ALTER TABLE user_memberships ADD COLUMN cash_overdue_reminder_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE user_memberships ADD COLUMN custom_amount REAL`,
    `ALTER TABLE user_memberships ADD COLUMN subscription_type TEXT NOT NULL DEFAULT 'standard'`,
    // classes — recurring support
    `ALTER TABLE classes ADD COLUMN repeat_type TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE classes ADD COLUMN repeat_group_id TEXT`,
    // vrij_trainen_bookings
    `ALTER TABLE vrij_trainen_bookings ADD COLUMN slot_id INTEGER REFERENCES vt_slots(id)`,
    // payment_failures
    `ALTER TABLE payment_failures ADD COLUMN reminder_day0_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE payment_failures ADD COLUMN reminder_day3_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE payment_failures ADD COLUMN reminder_day7_sent INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE payment_failures ADD COLUMN auto_paused_at TEXT`,
    `ALTER TABLE payment_failures ADD COLUMN mollie_paylink TEXT`,
    `ALTER TABLE payment_failures ADD COLUMN surcharge_added REAL NOT NULL DEFAULT 0`,
    // pt_subscriptions — tier-onderscheiding (Basic/Standard/Premium). NULL voor
    // bestaande abonnementen (aangemaakt vóór de tier-structuur) — geen aanname, geen gok.
    `ALTER TABLE pt_subscriptions ADD COLUMN tier TEXT`,
  ];
  for (const sql of patches) { await run(sql); }

  // ── Seed membership tiers (truly idempotent) ─────────────────────────────────
  // The memberships table has no UNIQUE constraint on business columns, so
  // INSERT OR IGNORE would silently insert a duplicate set on every restart.
  // Fix: first purge any duplicate rows (keep lowest id per unique combo),
  // then only insert when the table is completely empty.

  // Step 1 — remove duplicates created by previous buggy restarts.
  // We keep the row with the lowest id for each (name, category, duration_months)
  // and never touch rows that are referenced by a user_membership.
  await run(`
    DELETE FROM memberships
    WHERE id NOT IN (
      SELECT MIN(id) FROM memberships GROUP BY name, category, duration_months
    )
    AND id NOT IN (
      SELECT DISTINCT membership_id FROM user_memberships WHERE membership_id IS NOT NULL
    )
  `);

  // Step 2 — seed only when the table is empty (prevents future duplicates).
  const { rows: mbRows } = await db.execute('SELECT COUNT(*) AS n FROM memberships');
  if (Number(mbRows[0].n) === 0) {
    await db.execute(`
      INSERT INTO memberships
        (name, category, duration_months, price_monthly, minimum_months, notice_period_months, max_bookings_per_month, description, features)
      VALUES
        ('Jaar abonnement',      'Jeugd',       12, 45, 12, 1, -1, 'Jaarlijks jeugdabonnement',             '["Onbeperkt sporten","Jaarlijks abonnement","Laagste maandprijs","Alle faciliteiten","App toegang"]'),
        ('Half jaar abonnement', 'Jeugd',         6, 50,  6, 1, -1, 'Halfjaarlijks jeugdabonnement',         '["Onbeperkt sporten","Half jaar abonnement","Alle faciliteiten","App toegang"]'),
        ('Maand abonnement',     'Jeugd',         1, 55,  1, 1, -1, 'Flexibel maandelijks',                  '["Onbeperkt sporten","Maandelijks opzegbaar","Maximale flexibiliteit","Alle faciliteiten","App toegang"]'),
        ('Jaar abonnement',      'Volwassenen',  12, 55, 12, 1, -1, 'Jaarlijks abonnement 16+',              '["Onbeperkt sporten","Jaarlijks abonnement","Laagste maandprijs","Alle faciliteiten","App toegang"]'),
        ('Half jaar abonnement', 'Volwassenen',   6, 60,  6, 1, -1, 'Halfjaarlijks abonnement 16+',          '["Onbeperkt sporten","Half jaar abonnement","Alle faciliteiten","App toegang"]'),
        ('Maand abonnement',     'Volwassenen',   1, 65,  1, 1, -1, 'Flexibel maandelijks abonnement 16+',   '["Onbeperkt sporten","Maandelijks opzegbaar","Maximale flexibiliteit","Alle faciliteiten","App toegang"]')
    `);
  }

  // ── Chat berichten (012) ──────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender     TEXT    NOT NULL CHECK(sender IN ('admin','member')),
      body       TEXT    NOT NULL,
      read_at    TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  await run(`CREATE INDEX IF NOT EXISTS idx_messages_member ON messages(member_id, created_at)`);

  // ── Password reset tokens (011) ──────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT    NOT NULL UNIQUE,
      expires_at TEXT    NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ── Mijn Voortgang: aanwezigheid + voedingsschema (015) ──────────────────────
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

  // Voorkomt dubbele "we missen je" mails — bijgehouden per lid.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS attendance_reminders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sent_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

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

  // ── Indexes ───────────────────────────────────────────────────────────────────
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_vt_user_date    ON vrij_trainen_bookings(user_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_vtb_slot        ON vrij_trainen_bookings(slot_id)`,
    `CREATE INDEX IF NOT EXISTS idx_vt_slots_date   ON vt_slots(date)`,
    `CREATE INDEX IF NOT EXISTS idx_pf_user         ON payment_failures(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_community_created ON community_posts(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_cash_payments_user ON cash_payments(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_cash_payments_date ON cash_payments(payment_date)`,
    `CREATE INDEX IF NOT EXISTS idx_fonds_user      ON fonds_members(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_fonds_end       ON fonds_members(end_date)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_member_date ON attendance(member_id, date)`,
    `CREATE INDEX IF NOT EXISTS idx_attendance_reminders_member ON attendance_reminders(member_id, sent_at)`,
    `CREATE INDEX IF NOT EXISTS idx_nutrition_templates_member ON nutrition_templates(member_id, active)`,
    `CREATE INDEX IF NOT EXISTS idx_nutrition_logs_member_date ON nutrition_logs(member_id, date)`,
  ];
  for (const sql of indexes) { await run(sql); }

  await db.close();
  console.log('[DB] Schema ready.');
}

module.exports = ensureSchema;
