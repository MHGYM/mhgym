/**
 * Training Platform controller
 *
 * Blok A: training_subscriptions (admin CRUD), toegangscheck
 * Blok B: exercises, programs (admin CRUD)
 * Blok C: workout-logger (lid)
 * Blok D: progress (logs, PR's, metingen)
 * Blok E: nutrition
 */

const db = require('../config/database');

// ── Helper ────────────────────────────────────────────────────────────────────
const Q = (sql, args = []) => db.execute({ sql, args }).then(r => r.rows);
const X = (sql, args = []) => db.execute({ sql, args });
const json = (v) => { try { return JSON.parse(v); } catch { return v; } };

// ════════════════════════════════════════════════════════════════════════════
// BLOK A — TOEGANG
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/training/access — eigen toegangsstatus */
const getMyAccess = async (req, res) => {
  const rows = await Q(`
    SELECT ts.*, u.first_name, u.last_name
    FROM training_subscriptions ts
    JOIN users u ON u.id = ts.user_id
    WHERE ts.user_id = ?
      AND ts.status = 'active'
      AND (ts.end_date IS NULL OR date(ts.end_date) >= date('now'))
    ORDER BY ts.created_at DESC LIMIT 1
  `, [req.user.id]);
  res.json({ access: rows[0] || null, has_access: rows.length > 0 });
};

// ── Admin: abonnementen beheren ───────────────────────────────────────────────

/** GET /api/training/admin/subscriptions */
const listSubscriptions = async (req, res) => {
  const rows = await Q(`
    SELECT ts.*, u.first_name, u.last_name, u.email,
           cb.first_name AS created_by_first, cb.last_name AS created_by_last,
           CASE
             WHEN ts.status != 'active' THEN ts.status
             WHEN ts.end_date IS NOT NULL AND date(ts.end_date) < date('now') THEN 'expired'
             ELSE 'active'
           END AS effective_status,
           ROUND(julianday(ts.end_date) - julianday('now')) AS days_remaining
    FROM training_subscriptions ts
    JOIN users u ON u.id = ts.user_id
    LEFT JOIN users cb ON cb.id = ts.created_by
    ORDER BY ts.created_at DESC
  `);
  res.json({ subscriptions: rows });
};

/** POST /api/training/admin/subscriptions */
const createSubscription = async (req, res) => {
  const { user_id, start_date, end_date, price_paid, notes } = req.body;
  if (!user_id || !start_date) return res.status(400).json({ error: 'user_id en start_date zijn verplicht.' });

  const userRes = await Q('SELECT id, email, first_name FROM users WHERE id = ?', [user_id]);
  if (!userRes[0]) return res.status(404).json({ error: 'Gebruiker niet gevonden.' });

  // Deactiveer bestaand actief abonnement
  await X(`UPDATE training_subscriptions SET status='cancelled', updated_at=datetime('now') WHERE user_id=? AND status='active'`, [user_id]);

  const r = await X(`
    INSERT INTO training_subscriptions (user_id, status, start_date, end_date, price_paid, notes, created_by)
    VALUES (?, 'active', ?, ?, ?, ?, ?)
  `, [user_id, start_date, end_date || null, price_paid ? Number(price_paid) : null, notes || null, req.user.id]);

  console.log(`[Training] Abonnement aangemaakt voor user ${user_id} door admin ${req.user.id}`);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: `Trainingstoegang verleend aan ${userRes[0].first_name}.` });
};

/** PUT /api/training/admin/subscriptions/:id */
const updateSubscription = async (req, res) => {
  const { status, start_date, end_date, price_paid, notes } = req.body;
  await X(`
    UPDATE training_subscriptions
    SET status     = COALESCE(?, status),
        start_date = COALESCE(?, start_date),
        end_date   = COALESCE(?, end_date),
        price_paid = COALESCE(?, price_paid),
        notes      = COALESCE(?, notes),
        updated_at = datetime('now')
    WHERE id = ?
  `, [status || null, start_date || null, end_date !== undefined ? (end_date || null) : null,
      price_paid != null ? Number(price_paid) : null, notes !== undefined ? (notes || null) : null,
      req.params.id]);
  res.json({ message: 'Abonnement bijgewerkt.' });
};

/** DELETE /api/training/admin/subscriptions/:id */
const cancelSubscription = async (req, res) => {
  await X(`UPDATE training_subscriptions SET status='cancelled', updated_at=datetime('now') WHERE id=?`, [req.params.id]);
  res.json({ message: 'Abonnement geannuleerd.' });
};

// ════════════════════════════════════════════════════════════════════════════
// BLOK B — OEFENINGEN (admin CRUD)
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/training/exercises */
const listExercises = async (req, res) => {
  const { category, equipment, difficulty, q } = req.query;
  let sql = `SELECT * FROM exercises WHERE 1=1`;
  const args = [];
  // Admins zien alles; leden zien alleen actieve
  if (req.user.role !== 'admin') { sql += ` AND active = 1`; }
  if (category)   { sql += ` AND category = ?`;                          args.push(category); }
  if (equipment)  { sql += ` AND (equipment = ? OR equipment = 'both')`; args.push(equipment); }
  if (difficulty) { sql += ` AND difficulty = ?`;                        args.push(difficulty); }
  if (q)          { sql += ` AND name LIKE ?`;                           args.push(`%${q}%`); }
  sql += ` ORDER BY name`;
  const rows = await Q(sql, args);
  res.json({ exercises: rows.map(r => ({ ...r, muscle_groups: json(r.muscle_groups), instructions: json(r.instructions) })) });
};

/** GET /api/training/exercises/:id */
const getExercise = async (req, res) => {
  const rows = await Q('SELECT * FROM exercises WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Oefening niet gevonden.' });
  const ex = rows[0];
  res.json({ exercise: { ...ex, muscle_groups: json(ex.muscle_groups), instructions: json(ex.instructions) } });
};

/** POST /api/training/admin/exercises */
const createExercise = async (req, res) => {
  const {
    name, category = 'overig', muscle_groups = [], description, instructions = [],
    bunny_video_id, equipment = 'gym', difficulty = 'beginner',
    default_sets = 3, default_reps = '10', default_rest_seconds = 60,
    home_alternative_notes, active = 1,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'Naam is verplicht.' });

  const r = await X(`
    INSERT INTO exercises (name, category, muscle_groups, description, instructions,
      bunny_video_id, equipment, difficulty, default_sets, default_reps,
      default_rest_seconds, home_alternative_notes, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [name, category, JSON.stringify(muscle_groups), description || null,
      JSON.stringify(instructions), bunny_video_id || null, equipment, difficulty,
      Number(default_sets), String(default_reps), Number(default_rest_seconds),
      home_alternative_notes || null, active ? 1 : 0]);

  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Oefening aangemaakt.' });
};

/** PUT /api/training/admin/exercises/:id */
const updateExercise = async (req, res) => {
  const ex = (await Q('SELECT * FROM exercises WHERE id = ?', [req.params.id]))[0];
  if (!ex) return res.status(404).json({ error: 'Oefening niet gevonden.' });

  const b = req.body;
  await X(`
    UPDATE exercises SET
      name                   = COALESCE(?, name),
      category               = COALESCE(?, category),
      muscle_groups          = COALESCE(?, muscle_groups),
      description            = COALESCE(?, description),
      instructions           = COALESCE(?, instructions),
      bunny_video_id         = ?,
      equipment              = COALESCE(?, equipment),
      difficulty             = COALESCE(?, difficulty),
      default_sets           = COALESCE(?, default_sets),
      default_reps           = COALESCE(?, default_reps),
      default_rest_seconds   = COALESCE(?, default_rest_seconds),
      home_alternative_notes = COALESCE(?, home_alternative_notes),
      active                 = COALESCE(?, active),
      updated_at             = datetime('now')
    WHERE id = ?
  `, [
    b.name || null,
    b.category || null,
    b.muscle_groups != null ? JSON.stringify(b.muscle_groups) : null,
    b.description !== undefined ? (b.description || null) : null,
    b.instructions != null ? JSON.stringify(b.instructions) : null,
    b.bunny_video_id !== undefined ? (b.bunny_video_id || null) : ex.bunny_video_id,
    b.equipment || null,
    b.difficulty || null,
    b.default_sets != null ? Number(b.default_sets) : null,
    b.default_reps != null ? String(b.default_reps) : null,
    b.default_rest_seconds != null ? Number(b.default_rest_seconds) : null,
    b.home_alternative_notes !== undefined ? (b.home_alternative_notes || null) : null,
    b.active != null ? (b.active ? 1 : 0) : null,
    req.params.id,
  ]);
  res.json({ message: 'Oefening bijgewerkt.' });
};

/** DELETE /api/training/admin/exercises/:id (soft delete) */
const deleteExercise = async (req, res) => {
  await X(`UPDATE exercises SET active = 0, updated_at = datetime('now') WHERE id = ?`, [req.params.id]);
  res.json({ message: 'Oefening verwijderd.' });
};

// ════════════════════════════════════════════════════════════════════════════
// BLOK B — PROGRAMMA'S (admin CRUD)
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/training/programs */
const listPrograms = async (req, res) => {
  const { goal, equipment } = req.query;
  let sql = `SELECT * FROM training_programs WHERE 1=1`;
  const args = [];
  if (req.user.role !== 'admin') { sql += ` AND active = 1`; }
  if (goal)      { sql += ` AND goal = ?`;      args.push(goal); }
  if (equipment) { sql += ` AND (equipment = ? OR equipment = 'both')`; args.push(equipment); }
  sql += ` ORDER BY sort_order, name`;
  const rows = await Q(sql, args);
  res.json({ programs: rows });
};

/** GET /api/training/programs/:id — inclusief dagen + oefeningen */
const getProgram = async (req, res) => {
  const progs = await Q('SELECT * FROM training_programs WHERE id = ?', [req.params.id]);
  if (!progs[0]) return res.status(404).json({ error: 'Programma niet gevonden.' });
  if (req.user.role !== 'admin' && !progs[0].active) return res.status(403).json({ error: 'Niet beschikbaar.' });

  const days = await Q(`
    SELECT pd.*,
      (SELECT json_group_array(json_object(
        'id',           pe.id,
        'sort_order',   pe.sort_order,
        'sets',         pe.sets,
        'reps',         pe.reps,
        'rest_seconds', pe.rest_seconds,
        'notes',        pe.notes,
        'exercise',     json_object(
          'id',              e.id,
          'name',            e.name,
          'category',        e.category,
          'muscle_groups',   e.muscle_groups,
          'bunny_video_id',  e.bunny_video_id,
          'equipment',       e.equipment,
          'difficulty',      e.difficulty,
          'instructions',    e.instructions,
          'default_sets',    e.default_sets,
          'default_reps',    e.default_reps,
          'default_rest_seconds', e.default_rest_seconds,
          'home_alternative_notes', e.home_alternative_notes
        ),
        'home_alt_exercise_id', pe.home_alternative_exercise_id
      ) ORDER BY pe.sort_order)
      FROM program_exercises pe
      JOIN exercises e ON e.id = pe.exercise_id
      WHERE pe.program_day_id = pd.id
      ) AS exercises_json
    FROM program_days pd
    WHERE pd.program_id = ?
    ORDER BY pd.week_number, pd.day_number
  `, [req.params.id]);

  const program = {
    ...progs[0],
    days: days.map(d => ({
      ...d,
      exercises: (() => {
        try {
          const arr = JSON.parse(d.exercises_json || '[]');
          return arr.map(ex => ({
            ...ex,
            exercise: ex.exercise ? {
              ...ex.exercise,
              muscle_groups: json(ex.exercise.muscle_groups),
              instructions:  json(ex.exercise.instructions),
            } : null,
          }));
        } catch { return []; }
      })(),
    })),
  };
  res.json({ program });
};

/** POST /api/training/admin/programs */
const createProgram = async (req, res) => {
  const { name, goal = 'full_body', description, difficulty = 'beginner',
          duration_weeks = 4, sessions_per_week = 3, equipment = 'gym',
          thumbnail_url, sort_order = 0, active = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'Naam is verplicht.' });
  const r = await X(`
    INSERT INTO training_programs (name, goal, description, difficulty, duration_weeks,
      sessions_per_week, equipment, thumbnail_url, sort_order, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [name, goal, description || null, difficulty, Number(duration_weeks),
      Number(sessions_per_week), equipment, thumbnail_url || null, Number(sort_order), active ? 1 : 0]);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Programma aangemaakt.' });
};

/** PUT /api/training/admin/programs/:id */
const updateProgram = async (req, res) => {
  if (!(await Q('SELECT id FROM training_programs WHERE id=?', [req.params.id]))[0])
    return res.status(404).json({ error: 'Programma niet gevonden.' });
  const b = req.body;
  await X(`
    UPDATE training_programs SET
      name             = COALESCE(?, name),
      goal             = COALESCE(?, goal),
      description      = COALESCE(?, description),
      difficulty       = COALESCE(?, difficulty),
      duration_weeks   = COALESCE(?, duration_weeks),
      sessions_per_week= COALESCE(?, sessions_per_week),
      equipment        = COALESCE(?, equipment),
      thumbnail_url    = COALESCE(?, thumbnail_url),
      sort_order       = COALESCE(?, sort_order),
      active           = COALESCE(?, active),
      updated_at       = datetime('now')
    WHERE id = ?
  `, [b.name||null, b.goal||null, b.description!==undefined?(b.description||null):null,
      b.difficulty||null, b.duration_weeks!=null?Number(b.duration_weeks):null,
      b.sessions_per_week!=null?Number(b.sessions_per_week):null, b.equipment||null,
      b.thumbnail_url!==undefined?(b.thumbnail_url||null):null,
      b.sort_order!=null?Number(b.sort_order):null,
      b.active!=null?(b.active?1:0):null, req.params.id]);
  res.json({ message: 'Programma bijgewerkt.' });
};

/** DELETE /api/training/admin/programs/:id */
const deleteProgram = async (req, res) => {
  await X(`UPDATE training_programs SET active=0, updated_at=datetime('now') WHERE id=?`, [req.params.id]);
  res.json({ message: 'Programma verwijderd.' });
};

// ── Dag-beheer ────────────────────────────────────────────────────────────────

/** POST /api/training/admin/programs/:id/days */
const createDay = async (req, res) => {
  const { week_number = 1, day_number, day_name = 'Training', focus, is_rest_day = 0, sort_order = 0 } = req.body;
  if (day_number == null) return res.status(400).json({ error: 'day_number is verplicht.' });
  const r = await X(`
    INSERT INTO program_days (program_id, week_number, day_number, day_name, focus, is_rest_day, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [req.params.id, Number(week_number), Number(day_number), day_name, focus||null, is_rest_day?1:0, Number(sort_order)]);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Dag aangemaakt.' });
};

/** PUT /api/training/admin/days/:dayId */
const updateDay = async (req, res) => {
  const b = req.body;
  await X(`
    UPDATE program_days SET
      week_number = COALESCE(?, week_number),
      day_number  = COALESCE(?, day_number),
      day_name    = COALESCE(?, day_name),
      focus       = COALESCE(?, focus),
      is_rest_day = COALESCE(?, is_rest_day),
      sort_order  = COALESCE(?, sort_order)
    WHERE id = ?
  `, [b.week_number!=null?Number(b.week_number):null, b.day_number!=null?Number(b.day_number):null,
      b.day_name||null, b.focus!==undefined?(b.focus||null):null,
      b.is_rest_day!=null?(b.is_rest_day?1:0):null,
      b.sort_order!=null?Number(b.sort_order):null, req.params.dayId]);
  res.json({ message: 'Dag bijgewerkt.' });
};

/** DELETE /api/training/admin/days/:dayId */
const deleteDay = async (req, res) => {
  await X(`DELETE FROM program_days WHERE id = ?`, [req.params.dayId]);
  res.json({ message: 'Dag verwijderd.' });
};

/** POST /api/training/admin/days/:dayId/exercises */
const addExerciseToDay = async (req, res) => {
  const { exercise_id, sort_order = 0, sets = 3, reps = '10', rest_seconds = 60,
          notes, home_alternative_exercise_id } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'exercise_id is verplicht.' });
  const r = await X(`
    INSERT INTO program_exercises (program_day_id, exercise_id, sort_order, sets, reps, rest_seconds, notes, home_alternative_exercise_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [req.params.dayId, Number(exercise_id), Number(sort_order), Number(sets), String(reps),
      Number(rest_seconds), notes||null, home_alternative_exercise_id||null]);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Oefening toegevoegd aan dag.' });
};

/** PUT /api/training/admin/program-exercises/:peId */
const updateProgramExercise = async (req, res) => {
  const b = req.body;
  await X(`
    UPDATE program_exercises SET
      sort_order                   = COALESCE(?, sort_order),
      sets                         = COALESCE(?, sets),
      reps                         = COALESCE(?, reps),
      rest_seconds                 = COALESCE(?, rest_seconds),
      notes                        = COALESCE(?, notes),
      home_alternative_exercise_id = COALESCE(?, home_alternative_exercise_id)
    WHERE id = ?
  `, [b.sort_order!=null?Number(b.sort_order):null, b.sets!=null?Number(b.sets):null,
      b.reps!=null?String(b.reps):null, b.rest_seconds!=null?Number(b.rest_seconds):null,
      b.notes!==undefined?(b.notes||null):null,
      b.home_alternative_exercise_id!==undefined?(b.home_alternative_exercise_id||null):null,
      req.params.peId]);
  res.json({ message: 'Bijgewerkt.' });
};

/** DELETE /api/training/admin/program-exercises/:peId */
const removeProgramExercise = async (req, res) => {
  await X(`DELETE FROM program_exercises WHERE id = ?`, [req.params.peId]);
  res.json({ message: 'Oefening verwijderd uit dag.' });
};

// ════════════════════════════════════════════════════════════════════════════
// BLOK C — WORKOUT LOGGING (lid)
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/training/my/program — actief programma van lid */
const getMyProgram = async (req, res) => {
  const rows = await Q(`
    SELECT up.*, tp.name AS program_name, tp.goal, tp.duration_weeks,
           tp.sessions_per_week, tp.description, tp.difficulty, tp.equipment,
           np.name AS nutrition_plan_name
    FROM user_programs up
    JOIN training_programs tp ON tp.id = up.program_id
    LEFT JOIN nutrition_plans np ON np.id = up.nutrition_plan_id
    WHERE up.user_id = ? AND up.status = 'active'
    ORDER BY up.created_at DESC LIMIT 1
  `, [req.user.id]);
  res.json({ user_program: rows[0] || null });
};

/** POST /api/training/my/program — kies programma */
const selectProgram = async (req, res) => {
  const { program_id, nutrition_plan_id } = req.body;
  if (!program_id) return res.status(400).json({ error: 'program_id is verplicht.' });

  const prog = (await Q('SELECT id FROM training_programs WHERE id=? AND active=1', [program_id]))[0];
  if (!prog) return res.status(404).json({ error: 'Programma niet gevonden.' });

  // Pauzeer bestaand actief programma
  await X(`UPDATE user_programs SET status='paused', updated_at=datetime('now') WHERE user_id=? AND status='active'`, [req.user.id]);

  const r = await X(`
    INSERT INTO user_programs (user_id, program_id, nutrition_plan_id, start_date, status)
    VALUES (?, ?, ?, date('now'), 'active')
  `, [req.user.id, Number(program_id), nutrition_plan_id ? Number(nutrition_plan_id) : null]);

  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Programma gestart.' });
};

/** POST /api/training/my/logs — log een workout */
const logWorkout = async (req, res) => {
  const { program_day_id, date, duration_minutes, notes, exercises = [] } = req.body;

  const wlRes = await X(`
    INSERT INTO workout_logs (user_id, program_day_id, date, duration_minutes, notes, completed)
    VALUES (?, ?, ?, ?, ?, 1)
  `, [req.user.id, program_day_id||null, date||new Date().toISOString().split('T')[0],
      duration_minutes||null, notes||null]);
  const workoutLogId = Number(wlRes.lastInsertRowid);

  // Log oefeningen + sets
  for (const ex of exercises) {
    for (const set of (ex.sets || [])) {
      await X(`
        INSERT INTO exercise_logs (workout_log_id, exercise_id, set_number, reps_done, weight_kg, duration_seconds, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [workoutLogId, Number(ex.exercise_id), Number(set.set_number || 1),
          set.reps_done != null ? Number(set.reps_done) : null,
          set.weight_kg != null ? Number(set.weight_kg) : null,
          set.duration_seconds != null ? Number(set.duration_seconds) : null,
          set.notes || null]);

      // Bijwerk PR als weight zwaarder is dan bekend record
      if (set.weight_kg != null && set.reps_done != null) {
        const pr = (await Q(
          'SELECT id, weight_kg FROM personal_records WHERE user_id=? AND exercise_id=? ORDER BY weight_kg DESC LIMIT 1',
          [req.user.id, Number(ex.exercise_id)]
        ))[0];
        if (!pr || Number(set.weight_kg) > Number(pr.weight_kg)) {
          await X(`
            INSERT INTO personal_records (user_id, exercise_id, reps, weight_kg, recorded_at)
            VALUES (?, ?, ?, ?, date('now'))
          `, [req.user.id, Number(ex.exercise_id), Number(set.reps_done), Number(set.weight_kg)]);
        }
      }
    }
  }

  res.status(201).json({ workout_log_id: workoutLogId, message: 'Workout gelogd.' });
};

/** GET /api/training/my/logs — eigen workout historie */
const getMyLogs = async (req, res) => {
  const { limit = 20, offset = 0 } = req.query;
  const logs = await Q(`
    SELECT wl.*, pd.day_name, pd.focus, tp.name AS program_name,
           (SELECT COUNT(*) FROM exercise_logs el WHERE el.workout_log_id = wl.id) AS exercise_count
    FROM workout_logs wl
    LEFT JOIN program_days pd ON pd.id = wl.program_day_id
    LEFT JOIN training_programs tp ON tp.id = pd.program_id
    WHERE wl.user_id = ?
    ORDER BY wl.date DESC, wl.created_at DESC
    LIMIT ? OFFSET ?
  `, [req.user.id, Number(limit), Number(offset)]);
  res.json({ logs });
};

/** GET /api/training/my/logs/:id — workout detail */
const getWorkoutDetail = async (req, res) => {
  const wl = (await Q('SELECT * FROM workout_logs WHERE id=? AND user_id=?', [req.params.id, req.user.id]))[0];
  if (!wl) return res.status(404).json({ error: 'Niet gevonden.' });

  const sets = await Q(`
    SELECT el.*, e.name AS exercise_name, e.category, e.bunny_video_id
    FROM exercise_logs el
    JOIN exercises e ON e.id = el.exercise_id
    WHERE el.workout_log_id = ?
    ORDER BY el.exercise_id, el.set_number
  `, [req.params.id]);

  // Groepeer sets per oefening
  const exerciseMap = {};
  for (const s of sets) {
    if (!exerciseMap[s.exercise_id]) {
      exerciseMap[s.exercise_id] = { exercise_id: s.exercise_id, exercise_name: s.exercise_name, category: s.category, bunny_video_id: s.bunny_video_id, sets: [] };
    }
    exerciseMap[s.exercise_id].sets.push({ set_number: s.set_number, reps_done: s.reps_done, weight_kg: s.weight_kg, duration_seconds: s.duration_seconds, notes: s.notes });
  }

  res.json({ workout: { ...wl, exercises: Object.values(exerciseMap) } });
};

// ════════════════════════════════════════════════════════════════════════════
// BLOK D — VOORTGANG (lid)
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/training/my/records — persoonlijke records */
const getMyRecords = async (req, res) => {
  const rows = await Q(`
    SELECT pr.*, e.name AS exercise_name, e.category
    FROM personal_records pr
    JOIN exercises e ON e.id = pr.exercise_id
    WHERE pr.user_id = ?
    ORDER BY pr.recorded_at DESC
  `, [req.user.id]);
  res.json({ records: rows });
};

/** GET /api/training/my/measurements */
const getMeasurements = async (req, res) => {
  const rows = await Q(`SELECT * FROM body_measurements WHERE user_id=? ORDER BY date DESC LIMIT 50`, [req.user.id]);
  res.json({ measurements: rows });
};

/** POST /api/training/my/measurements */
const addMeasurement = async (req, res) => {
  const { date, weight_kg, body_fat_pct, chest_cm, waist_cm, hips_cm, arms_cm, legs_cm, notes } = req.body;
  const r = await X(`
    INSERT INTO body_measurements (user_id, date, weight_kg, body_fat_pct, chest_cm, waist_cm, hips_cm, arms_cm, legs_cm, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [req.user.id, date||new Date().toISOString().split('T')[0],
      weight_kg!=null?Number(weight_kg):null, body_fat_pct!=null?Number(body_fat_pct):null,
      chest_cm!=null?Number(chest_cm):null, waist_cm!=null?Number(waist_cm):null,
      hips_cm!=null?Number(hips_cm):null, arms_cm!=null?Number(arms_cm):null,
      legs_cm!=null?Number(legs_cm):null, notes||null]);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Meting opgeslagen.' });
};

/** DELETE /api/training/my/measurements/:id */
const deleteMeasurement = async (req, res) => {
  await X(`DELETE FROM body_measurements WHERE id=? AND user_id=?`, [req.params.id, req.user.id]);
  res.json({ message: 'Meting verwijderd.' });
};

// ════════════════════════════════════════════════════════════════════════════
// BLOK E — VOEDING (admin CRUD + lid view)
// ════════════════════════════════════════════════════════════════════════════

/** GET /api/training/nutrition — voor lid: eigen + actieve plannen */
const listNutritionPlans = async (req, res) => {
  let sql = `SELECT * FROM nutrition_plans`;
  if (req.user.role !== 'admin') sql += ` WHERE active = 1`;
  sql += ` ORDER BY name`;
  const rows = await Q(sql);
  res.json({ plans: rows });
};

/** GET /api/training/nutrition/:id — inclusief dagen */
const getNutritionPlan = async (req, res) => {
  const plan = (await Q('SELECT * FROM nutrition_plans WHERE id=?', [req.params.id]))[0];
  if (!plan) return res.status(404).json({ error: 'Plan niet gevonden.' });
  if (req.user.role !== 'admin' && !plan.active) return res.status(403).json({ error: 'Niet beschikbaar.' });

  const days = await Q('SELECT * FROM nutrition_days WHERE nutrition_plan_id=? ORDER BY day_number', [req.params.id]);
  res.json({ plan: { ...plan, days: days.map(d => ({ ...d, meals: json(d.meals) })) } });
};

/** POST /api/training/admin/nutrition */
const createNutritionPlan = async (req, res) => {
  const { name, goal = 'algemeen', description, calories_target, protein_g, carbs_g, fat_g, active = 1 } = req.body;
  if (!name) return res.status(400).json({ error: 'Naam is verplicht.' });
  const r = await X(`
    INSERT INTO nutrition_plans (name, goal, description, calories_target, protein_g, carbs_g, fat_g, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [name, goal, description||null, calories_target!=null?Number(calories_target):null,
      protein_g!=null?Number(protein_g):null, carbs_g!=null?Number(carbs_g):null,
      fat_g!=null?Number(fat_g):null, active?1:0]);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Voedingsplan aangemaakt.' });
};

/** PUT /api/training/admin/nutrition/:id */
const updateNutritionPlan = async (req, res) => {
  const b = req.body;
  await X(`
    UPDATE nutrition_plans SET
      name            = COALESCE(?, name),
      goal            = COALESCE(?, goal),
      description     = COALESCE(?, description),
      calories_target = COALESCE(?, calories_target),
      protein_g       = COALESCE(?, protein_g),
      carbs_g         = COALESCE(?, carbs_g),
      fat_g           = COALESCE(?, fat_g),
      active          = COALESCE(?, active),
      updated_at      = datetime('now')
    WHERE id = ?
  `, [b.name||null, b.goal||null, b.description!==undefined?(b.description||null):null,
      b.calories_target!=null?Number(b.calories_target):null,
      b.protein_g!=null?Number(b.protein_g):null, b.carbs_g!=null?Number(b.carbs_g):null,
      b.fat_g!=null?Number(b.fat_g):null, b.active!=null?(b.active?1:0):null, req.params.id]);
  res.json({ message: 'Plan bijgewerkt.' });
};

/** DELETE /api/training/admin/nutrition/:id */
const deleteNutritionPlan = async (req, res) => {
  await X(`UPDATE nutrition_plans SET active=0, updated_at=datetime('now') WHERE id=?`, [req.params.id]);
  res.json({ message: 'Plan verwijderd.' });
};

/** POST /api/training/admin/nutrition/:id/days */
const addNutritionDay = async (req, res) => {
  const { day_number, day_name = 'Dag', meals = [] } = req.body;
  if (day_number == null) return res.status(400).json({ error: 'day_number is verplicht.' });
  const r = await X(`
    INSERT INTO nutrition_days (nutrition_plan_id, day_number, day_name, meals)
    VALUES (?, ?, ?, ?)
  `, [req.params.id, Number(day_number), day_name, JSON.stringify(meals)]);
  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Dag aangemaakt.' });
};

/** PUT /api/training/admin/nutrition-days/:dayId */
const updateNutritionDay = async (req, res) => {
  const b = req.body;
  await X(`
    UPDATE nutrition_days SET
      day_number = COALESCE(?, day_number),
      day_name   = COALESCE(?, day_name),
      meals      = COALESCE(?, meals)
    WHERE id = ?
  `, [b.day_number!=null?Number(b.day_number):null, b.day_name||null,
      b.meals!=null?JSON.stringify(b.meals):null, req.params.dayId]);
  res.json({ message: 'Dag bijgewerkt.' });
};

/** DELETE /api/training/admin/nutrition-days/:dayId */
const deleteNutritionDay = async (req, res) => {
  await X(`DELETE FROM nutrition_days WHERE id = ?`, [req.params.dayId]);
  res.json({ message: 'Dag verwijderd.' });
};

/** GET /api/training/my/nutrition — eigen voedingsplan */
const getMyNutrition = async (req, res) => {
  const up = (await Q(
    'SELECT nutrition_plan_id FROM user_programs WHERE user_id=? AND status=\'active\' ORDER BY created_at DESC LIMIT 1',
    [req.user.id]
  ))[0];
  if (!up?.nutrition_plan_id) return res.json({ plan: null });

  const plan = (await Q('SELECT * FROM nutrition_plans WHERE id=?', [up.nutrition_plan_id]))[0];
  if (!plan) return res.json({ plan: null });

  const days = await Q('SELECT * FROM nutrition_days WHERE nutrition_plan_id=? ORDER BY day_number', [up.nutrition_plan_id]);
  res.json({ plan: { ...plan, days: days.map(d => ({ ...d, meals: json(d.meals) })) } });
};

// ── Admin: koppel voedingsplan aan user_program ───────────────────────────────
/** POST /api/training/admin/assign-nutrition */
const assignNutritionPlan = async (req, res) => {
  const { user_id, nutrition_plan_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is verplicht.' });
  await X(`
    UPDATE user_programs SET nutrition_plan_id=?, updated_at=datetime('now')
    WHERE user_id=? AND status='active'
  `, [nutrition_plan_id ? Number(nutrition_plan_id) : null, Number(user_id)]);
  res.json({ message: 'Voedingsplan gekoppeld.' });
};

// ── Admin: wijs programma toe aan lid ────────────────────────────────────────
/** POST /api/training/admin/assign-program */
const adminAssignProgram = async (req, res) => {
  const { user_id, program_id, nutrition_plan_id } = req.body;
  if (!user_id || !program_id) return res.status(400).json({ error: 'user_id en program_id zijn verplicht.' });

  await X(`UPDATE user_programs SET status='paused', updated_at=datetime('now') WHERE user_id=? AND status='active'`, [Number(user_id)]);

  const r = await X(`
    INSERT INTO user_programs (user_id, program_id, nutrition_plan_id, start_date, status)
    VALUES (?, ?, ?, date('now'), 'active')
  `, [Number(user_id), Number(program_id), nutrition_plan_id ? Number(nutrition_plan_id) : null]);

  res.status(201).json({ id: Number(r.lastInsertRowid), message: 'Programma toegewezen.' });
};

/** GET /api/training/config — frontend config (bunny library ID) */
const getConfig = (_req, res) => {
  res.json({ bunny_library_id: process.env.BUNNY_LIBRARY_ID || '' });
};

/** GET /api/training/admin/users — lijst alle gebruikers voor abonnement-toewijzing */
const listUsers = async (_req, res) => {
  const rows = await Q(`
    SELECT id, email, first_name, last_name,
           (SELECT 1 FROM training_subscriptions ts
            WHERE ts.user_id = users.id AND ts.status='active'
              AND (ts.end_date IS NULL OR date(ts.end_date) >= date('now'))
            LIMIT 1) AS has_training
    FROM users
    ORDER BY first_name, last_name
  `);
  res.json({ users: rows });
};

module.exports = {
  // Config + users
  getConfig, listUsers,
  // Access
  getMyAccess,
  listSubscriptions, createSubscription, updateSubscription, cancelSubscription,
  // Exercises
  listExercises, getExercise, createExercise, updateExercise, deleteExercise,
  // Programs
  listPrograms, getProgram, createProgram, updateProgram, deleteProgram,
  createDay, updateDay, deleteDay,
  addExerciseToDay, updateProgramExercise, removeProgramExercise,
  adminAssignProgram,
  // My program
  getMyProgram, selectProgram,
  // Logs
  logWorkout, getMyLogs, getWorkoutDetail,
  // Progress
  getMyRecords, getMeasurements, addMeasurement, deleteMeasurement,
  // Nutrition
  listNutritionPlans, getNutritionPlan, createNutritionPlan, updateNutritionPlan, deleteNutritionPlan,
  addNutritionDay, updateNutritionDay, deleteNutritionDay,
  getMyNutrition, assignNutritionPlan,
};
