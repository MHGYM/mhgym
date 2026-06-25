/**
 * Migratie 013 — Online Trainingsplatform
 *
 * Maakt alle tabellen aan voor het trainingsplatform:
 *   training_subscriptions, exercises, training_programs, program_days,
 *   program_exercises, user_programs, workout_logs, exercise_logs,
 *   personal_records, body_measurements, nutrition_plans, nutrition_days
 *
 * Bestaande tabellen worden NIET aangeraakt.
 * Gebruik: node migrations/013_training_platform.js
 */

require('dotenv').config();
const { createClient } = require('@libsql/client');
const path = require('path');

const DB_PATH = (process.env.DB_PATH || './mhgym.db').replace('./', '');
const db = createClient({ url: 'file:' + path.resolve(DB_PATH) });

const run = async (sql) => { try { await db.execute(sql); } catch (e) { if (!e.message.includes('already exists')) throw e; } };

async function migrate() {
  console.log('🔄 Migratie 013 — Trainingsplatform\n');

  // ── Toegang ─────────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS training_subscriptions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status      TEXT    NOT NULL DEFAULT 'active',   -- active | cancelled | expired
      start_date  TEXT    NOT NULL,
      end_date    TEXT,
      price_paid  REAL,
      notes       TEXT,
      created_by  INTEGER REFERENCES users(id),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ training_subscriptions');

  // ── Oefeningen ──────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS exercises (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      name                        TEXT    NOT NULL,
      category                    TEXT    NOT NULL DEFAULT 'overig',
      muscle_groups               TEXT    NOT NULL DEFAULT '[]',  -- JSON array
      description                 TEXT,
      instructions                TEXT    NOT NULL DEFAULT '[]',  -- JSON array of steps
      bunny_video_id              TEXT,
      equipment                   TEXT    NOT NULL DEFAULT 'gym', -- gym | home | both
      difficulty                  TEXT    NOT NULL DEFAULT 'beginner', -- beginner | intermediate | advanced
      default_sets                INTEGER NOT NULL DEFAULT 3,
      default_reps                TEXT    NOT NULL DEFAULT '10',  -- string: '10', '8-12', '60s'
      default_rest_seconds        INTEGER NOT NULL DEFAULT 60,
      home_alternative_notes      TEXT,
      active                      INTEGER NOT NULL DEFAULT 1,
      created_at                  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ exercises');

  // ── Programma's ─────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS training_programs (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      name              TEXT    NOT NULL,
      goal              TEXT    NOT NULL DEFAULT 'full_body',
      description       TEXT,
      difficulty        TEXT    NOT NULL DEFAULT 'beginner',
      duration_weeks    INTEGER NOT NULL DEFAULT 4,
      sessions_per_week INTEGER NOT NULL DEFAULT 3,
      equipment         TEXT    NOT NULL DEFAULT 'gym', -- gym | home | both
      thumbnail_url     TEXT,
      active            INTEGER NOT NULL DEFAULT 1,
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ training_programs');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS program_days (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id   INTEGER NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL DEFAULT 1,
      day_number   INTEGER NOT NULL,
      day_name     TEXT    NOT NULL DEFAULT 'Training',
      focus        TEXT,
      is_rest_day  INTEGER NOT NULL DEFAULT 0,
      sort_order   INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ program_days');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS program_exercises (
      id                          INTEGER PRIMARY KEY AUTOINCREMENT,
      program_day_id              INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
      exercise_id                 INTEGER NOT NULL REFERENCES exercises(id),
      sort_order                  INTEGER NOT NULL DEFAULT 0,
      sets                        INTEGER NOT NULL DEFAULT 3,
      reps                        TEXT    NOT NULL DEFAULT '10',
      rest_seconds                INTEGER NOT NULL DEFAULT 60,
      notes                       TEXT,
      home_alternative_exercise_id INTEGER REFERENCES exercises(id),
      created_at                  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ program_exercises');

  // ── Voeding ─────────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS nutrition_plans (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      name            TEXT    NOT NULL,
      goal            TEXT    NOT NULL DEFAULT 'algemeen',
      description     TEXT,
      calories_target INTEGER,
      protein_g       INTEGER,
      carbs_g         INTEGER,
      fat_g           INTEGER,
      active          INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ nutrition_plans');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS nutrition_days (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      nutrition_plan_id INTEGER NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
      day_number       INTEGER NOT NULL,
      day_name         TEXT    NOT NULL DEFAULT 'Dag',
      meals            TEXT    NOT NULL DEFAULT '[]', -- JSON: [{name,description,calories,protein,carbs,fat}]
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ nutrition_days');

  // ── Gebruiker-programma koppeling ───────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_programs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_id       INTEGER NOT NULL REFERENCES training_programs(id),
      nutrition_plan_id INTEGER REFERENCES nutrition_plans(id),
      start_date       TEXT    NOT NULL DEFAULT (date('now')),
      status           TEXT    NOT NULL DEFAULT 'active', -- active | completed | paused
      created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ user_programs');

  // ── Workout logs ────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      program_day_id   INTEGER REFERENCES program_days(id),
      date             TEXT    NOT NULL DEFAULT (date('now')),
      duration_minutes INTEGER,
      notes            TEXT,
      completed        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ workout_logs');

  await db.execute(`
    CREATE TABLE IF NOT EXISTS exercise_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
      exercise_id    INTEGER NOT NULL REFERENCES exercises(id),
      set_number     INTEGER NOT NULL DEFAULT 1,
      reps_done      INTEGER,
      weight_kg      REAL,
      duration_seconds INTEGER,
      notes          TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ exercise_logs');

  // ── Persoonlijke records ────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS personal_records (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercises(id),
      reps        INTEGER,
      weight_kg   REAL,
      recorded_at TEXT    NOT NULL DEFAULT (date('now')),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ personal_records');

  // ── Metingen ────────────────────────────────────────────────────────────────
  await db.execute(`
    CREATE TABLE IF NOT EXISTS body_measurements (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date         TEXT    NOT NULL DEFAULT (date('now')),
      weight_kg    REAL,
      body_fat_pct REAL,
      chest_cm     REAL,
      waist_cm     REAL,
      hips_cm      REAL,
      arms_cm      REAL,
      legs_cm      REAL,
      notes        TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ body_measurements');

  // ── Indexes ─────────────────────────────────────────────────────────────────
  await run(`CREATE INDEX IF NOT EXISTS idx_training_sub_user ON training_subscriptions(user_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_training_sub_status ON training_subscriptions(status, end_date)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_exercises_active ON exercises(active, category)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_programs_active ON training_programs(active, goal)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_program_days_prog ON program_days(program_id, week_number, day_number)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_program_ex_day ON program_exercises(program_day_id, sort_order)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_user_programs_user ON user_programs(user_id, status)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_workout_logs_user ON workout_logs(user_id, date)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_exercise_logs_wl ON exercise_logs(workout_log_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_pr_user_ex ON personal_records(user_id, exercise_id)`);
  await run(`CREATE INDEX IF NOT EXISTS idx_measurements_user ON body_measurements(user_id, date)`);

  console.log('\n✅ Migratie 013 geslaagd — alle trainingsplatform-tabellen aangemaakt.\n');
  await db.close();
}

migrate().catch(e => { console.error('❌', e.message); process.exit(1); });
