/**
 * badgeService.js — isoleert de toekenningsregels (progressie-berekening
 * inbegrepen) los van de HTTP-laag en los van de badge-catalogus zelf.
 *
 * Elke regel werkt uitsluitend met daadwerkelijk aanwezige, door de admin
 * BEVESTIGDE meetwaarden (measurement_report_values.extraction_status =
 * 'confirmed'). Zolang een upload alleen een foto is zonder bevestigde
 * cijfers, wordt er nooit progressie of doelbereiking verzonnen — hoogstens
 * "Eerste Meting"/"Consistent"/"Toegewijd", die uitsluitend het AANTAL
 * geregistreerde meetmomenten tellen, geen inhoud van de foto interpreteren.
 *
 * Duplicaten zijn structureel onmogelijk: member_badges heeft een
 * UNIQUE(user_id, badge_key)-constraint en elke toekenning gebeurt via
 * INSERT ... ON CONFLICT DO NOTHING.
 */

const db = require('../config/database');
const { BADGES } = require('../config/badges');

const GOAL_METRICS = ['weight_kg', 'body_fat_pct', 'muscle_mass_kg'];

async function getReportsForUser(userId) {
  // Secundair sorteren op id: datetime('now') heeft slechts secondeprecisie,
  // dus twee uploads binnen dezelfde seconde zouden anders een niet-
  // gegarandeerde volgorde krijgen — id ASC valt terug op de garandeerd
  // oplopende (dus chronologische) invoegvolgorde.
  const result = await db.execute({
    sql: `SELECT mr.id, mr.created_at, mrv.extraction_status,
                 mrv.weight_kg, mrv.body_fat_pct, mrv.muscle_mass_kg
          FROM measurement_reports mr
          LEFT JOIN measurement_report_values mrv ON mrv.report_id = mr.id
          WHERE mr.user_id = ?
          ORDER BY mr.created_at ASC, mr.id ASC`,
    args: [userId],
  });
  return result.rows;
}

async function getActiveGoal(userId) {
  const result = await db.execute({
    sql: `SELECT * FROM member_goals WHERE user_id = ? AND achieved_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    args: [userId],
  });
  return result.rows[0] || null;
}

/** true zodra minimaal `n` metingen zijn geregistreerd — telt uploads, interpreteert geen inhoud. */
function hasAtLeastMeasurements(reports, n) {
  return reports.length >= n;
}

/** Eerste meetresultaat met bevestigde (niet-verzonnen) cijfers. */
function hasCompleteReport(reports) {
  return reports.some(r => r.extraction_status === 'confirmed');
}

/**
 * Meerdere opeenvolgende meetmomenten: minimaal 3 uploads, elk niet verder
 * dan 45 dagen na de vorige — voorkomt dat drie losse, jaren uit elkaar
 * liggende foto's als "opeenvolgend"/"toegewijd" worden gezien.
 */
function hasConsecutiveMeasurements(reports, n = 3, maxGapDays = 45) {
  if (reports.length < n) return false;
  const recent = reports.slice(-n);
  for (let i = 1; i < recent.length; i++) {
    const gapDays = (new Date(recent[i].created_at) - new Date(recent[i - 1].created_at)) / 86400000;
    if (gapDays > maxGapDays) return false;
  }
  return true;
}

/**
 * Aantoonbare, meetbare verandering tussen de eerste en de laatste
 * BEVESTIGDE meting — nooit gebaseerd op een niet-bevestigde/enkel-foto-upload.
 * Signalen: lichaamsvet% omlaag of spiermassa omhoog (beide neutrale,
 * niet-medische fitnessmaatstaven — geen "gezond"/"ongezond"-oordeel).
 */
function hasProgression(reports) {
  const confirmed = reports.filter(r => r.extraction_status === 'confirmed'
    && (r.body_fat_pct != null || r.muscle_mass_kg != null));
  if (confirmed.length < 2) return false;

  const first = confirmed[0];
  const last = confirmed[confirmed.length - 1];

  const fatDown = first.body_fat_pct != null && last.body_fat_pct != null && last.body_fat_pct < first.body_fat_pct;
  const muscleUp = first.muscle_mass_kg != null && last.muscle_mass_kg != null && last.muscle_mass_kg > first.muscle_mass_kg;
  return fatDown || muscleUp;
}

/**
 * Een door de trainer ingesteld doel is bereikt — uitsluitend op basis van de
 * meest recente BEVESTIGDE waarde voor de gekozen metric. Bij bereiken wordt
 * het doel meteen als behaald gemarkeerd (achieved_at), zodat het niet
 * telkens opnieuw "net behaald" lijkt en een volgend doel kan worden gezet.
 */
async function checkAndMarkGoal(userId, reports) {
  const goal = await getActiveGoal(userId);
  if (!goal || !GOAL_METRICS.includes(goal.metric)) return false;

  const latestConfirmed = [...reports].reverse().find(r => r.extraction_status === 'confirmed' && r[goal.metric] != null);
  if (!latestConfirmed) return false;

  const value = latestConfirmed[goal.metric];
  const reached = goal.direction === 'lower' ? value <= goal.target_value : value >= goal.target_value;
  if (reached) {
    await db.execute({
      sql: `UPDATE member_goals SET achieved_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      args: [goal.id],
    });
  }
  return reached;
}

async function isEligible(badgeKey, userId, reports) {
  switch (badgeKey) {
    case 'eerste_meting': return hasAtLeastMeasurements(reports, 1);
    case 'consistent':    return hasAtLeastMeasurements(reports, 3);
    case 'sterke_start':  return hasCompleteReport(reports);
    case 'toegewijd':     return hasConsecutiveMeasurements(reports, 3);
    case 'progressie':    return hasProgression(reports);
    case 'doel_bereikt':  return checkAndMarkGoal(userId, reports);
    default: return false;
  }
}

/**
 * Evalueert alle badge-regels voor een lid en kent nieuw-verdiende badges toe.
 * Aan te roepen na elke gebeurtenis die iets kan veranderen: upload, admin-
 * bevestiging van cijfers, of gewoon bij het ophalen (idempotent, veilig om
 * vaker te draaien dankzij de UNIQUE-constraint).
 */
async function evaluateAndAwardBadges(userId) {
  const reports = await getReportsForUser(userId);
  const newlyAwarded = [];

  for (const badge of BADGES) {
    let eligible = false;
    try {
      eligible = await isEligible(badge.key, userId, reports);
    } catch (e) {
      console.error(`[badgeService] Fout bij evalueren van badge "${badge.key}":`, e.message);
      continue;
    }
    if (!eligible) continue;

    const result = await db.execute({
      sql: `INSERT INTO member_badges (user_id, badge_key) VALUES (?, ?) ON CONFLICT(user_id, badge_key) DO NOTHING`,
      args: [userId, badge.key],
    });
    if (Number(result.rowsAffected) > 0) newlyAwarded.push(badge.key);
  }

  return newlyAwarded;
}

/** Alle badges met earned/earned_at, voor weergave bij "Mijn Voortgang". */
async function getMyBadges(userId) {
  await evaluateAndAwardBadges(userId).catch(() => {}); // veiligheidsnet, mag nooit de weergave blokkeren

  const earnedRes = await db.execute({
    sql: `SELECT badge_key, earned_at FROM member_badges WHERE user_id = ?`,
    args: [userId],
  });
  const earnedMap = new Map(earnedRes.rows.map(r => [r.badge_key, r.earned_at]));

  return BADGES.map(b => ({
    ...b,
    earned: earnedMap.has(b.key),
    earned_at: earnedMap.get(b.key) || null,
  }));
}

module.exports = { evaluateAndAwardBadges, getMyBadges, GOAL_METRICS };
