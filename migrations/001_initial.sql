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
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT    NOT NULL,          -- Basic | Premium | VIP
  price_monthly         REAL    NOT NULL,
  max_bookings_per_month INTEGER NOT NULL DEFAULT 8,
  description           TEXT,
  features              TEXT,                      -- JSON array
  created_at            TEXT    NOT NULL DEFAULT (datetime('now'))
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

INSERT OR IGNORE INTO memberships (name, price_monthly, max_bookings_per_month, description, features) VALUES
  ('Basic',   29.95, 8,  'Perfecte start voor beginners',    '["8 lessen per maand","Toegang tot alle basisklassen","App toegang"]'),
  ('Premium', 49.95, 20, 'Meest populair voor enthousiaste sporters', '["20 lessen per maand","Alle klassen inclusief premium","Gratis handdoek","Locker"]'),
  ('VIP',     79.95, -1, 'Onbeperkt sporten, alles inbegrepen', '["Onbeperkt lessen","Persoonlijk trainingsplan","Maandelijks voortgangsgesprek","Gratis sportvoeding","Prioriteit bij reservering"]');
