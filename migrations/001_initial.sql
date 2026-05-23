-- =============================================
-- MHGym Database Schema
-- =============================================

PRAGMA foreign_keys = ON;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  email       TEXT    NOT NULL UNIQUE,
  password    TEXT    NOT NULL,
  first_name  TEXT    NOT NULL,
  last_name   TEXT    NOT NULL,
  phone       TEXT,
  role        TEXT    NOT NULL DEFAULT 'member', -- member | admin
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Membership tiers
CREATE TABLE IF NOT EXISTS memberships (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  name                   TEXT    NOT NULL,          -- Jaar abonnement | Half jaar abonnement | Maand abonnement
  category               TEXT    NOT NULL DEFAULT 'Volwassenen', -- Jeugd | Volwassenen
  duration_months        INTEGER NOT NULL DEFAULT 1,             -- 12 | 6 | 1
  price_monthly          REAL    NOT NULL,
  max_bookings_per_month INTEGER NOT NULL DEFAULT -1,            -- -1 = onbeperkt
  description            TEXT,
  features               TEXT,                      -- JSON array
  created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Active membership per user
CREATE TABLE IF NOT EXISTS user_memberships (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_id           INTEGER NOT NULL REFERENCES memberships(id),
  status                  TEXT    NOT NULL DEFAULT 'active', -- active | cancelled | expired
  start_date              TEXT    NOT NULL DEFAULT (date('now')),
  end_date                TEXT,
  mollie_subscription_id  TEXT,
  mollie_customer_id      TEXT,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at              TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Classes / lessen
CREATE TABLE IF NOT EXISTS classes (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  description      TEXT,
  instructor       TEXT    NOT NULL,
  category         TEXT    NOT NULL,   -- yoga | spinning | crossfit | boxing | pilates
  date_time        TEXT    NOT NULL,   -- ISO 8601
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  max_capacity     INTEGER NOT NULL DEFAULT 20,
  current_bookings INTEGER NOT NULL DEFAULT 0,
  location         TEXT    NOT NULL DEFAULT 'Studio 1',
  status           TEXT    NOT NULL DEFAULT 'scheduled', -- scheduled | cancelled | completed
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id     INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  status       TEXT    NOT NULL DEFAULT 'confirmed', -- confirmed | cancelled | attended | no_show
  booked_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  cancelled_at TEXT,
  UNIQUE(user_id, class_id)
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mollie_payment_id TEXT    UNIQUE,
  amount            REAL    NOT NULL,
  currency          TEXT    NOT NULL DEFAULT 'EUR',
  status            TEXT    NOT NULL DEFAULT 'open', -- open | paid | cancelled | failed | expired
  description       TEXT,
  type              TEXT    NOT NULL DEFAULT 'membership', -- membership | one_time
  membership_id     INTEGER REFERENCES memberships(id),
  checkout_url      TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- =============================================
-- Seed data
-- =============================================

INSERT OR IGNORE INTO memberships (name, category, duration_months, price_monthly, max_bookings_per_month, description, features) VALUES
  ('Jaar abonnement',      'Jeugd',      12, 45.00, -1, 'Jaarlijks jeugdabonnement — beste prijs',    '["Onbeperkt sporten","Jaarlijks abonnement","Laagste maandprijs","Alle faciliteiten","App toegang"]'),
  ('Half jaar abonnement', 'Jeugd',       6, 50.00, -1, 'Halfjaarlijks jeugdabonnement',              '["Onbeperkt sporten","Half jaar abonnement","Alle faciliteiten","App toegang"]'),
  ('Maand abonnement',     'Jeugd',       1, 55.00, -1, 'Flexibel maandelijks jeugdabonnement',       '["Onbeperkt sporten","Maandelijks opzegbaar","Maximale flexibiliteit","Alle faciliteiten","App toegang"]'),
  ('Jaar abonnement',      'Volwassenen', 12, 55.00, -1, 'Jaarlijks abonnement 16+ — beste prijs',   '["Onbeperkt sporten","Jaarlijks abonnement","Laagste maandprijs","Alle faciliteiten","App toegang"]'),
  ('Half jaar abonnement', 'Volwassenen',  6, 60.00, -1, 'Halfjaarlijks abonnement 16+',              '["Onbeperkt sporten","Half jaar abonnement","Alle faciliteiten","App toegang"]'),
  ('Maand abonnement',     'Volwassenen',  1, 65.00, -1, 'Flexibel maandelijks abonnement 16+',       '["Onbeperkt sporten","Maandelijks opzegbaar","Maximale flexibiliteit","Alle faciliteiten","App toegang"]');
