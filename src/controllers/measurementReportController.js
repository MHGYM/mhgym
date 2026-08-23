/**
 * measurementReportController.js — admin-upload van meetrapport-foto's per lid
 *
 * Dit is een aparte functionaliteit los van het bestaande `body_measurements`
 * (numerieke zelf-invoer door het lid via het trainingsplatform). Hier gaat
 * het om de originele afbeelding van een lichaamsanalyse-/weegschaalrapport,
 * uitsluitend door de admin toe te voegen en te verwijderen.
 *
 * Na upload wordt de afbeelding automatisch uitgelezen (visionExtractionService)
 * — dat resultaat is altijd een VOORSTEL (extraction_status='extracted') totdat
 * de admin het expliciet bevestigt (extraction_status='confirmed'). Er wordt
 * nooit een waarde verzonnen: niet-herkende velden blijven null.
 *
 * Endpoints (gemount onder /api/admin, al beveiligd met authenticate+requireAdmin):
 *   GET    /admin/members/:id/measurement-reports          — lijst voor één lid
 *   POST   /admin/members/:id/measurement-reports          — nieuwe upload + automatische uitlezing
 *   GET    /admin/measurement-reports/:reportId/image      — de afbeelding zelf
 *   GET    /admin/measurement-reports/:reportId/values      — huidige (voorgestelde/bevestigde) waarden
 *   PUT    /admin/measurement-reports/:reportId/values      — admin corrigeert + bevestigt
 *   DELETE /admin/measurement-reports/:reportId            — verwijderen (afbeelding + waarden)
 *
 * Endpoints voor het lid zelf (gemount onder /api/voortgang, authenticate):
 *   GET /voortgang/measurement-report/mine        — metadata van het eigen, meest recente rapport
 *   GET /voortgang/measurement-report/mine/image  — de afbeelding zelf
 * Deze twee nemen het lid-ID uitsluitend uit het JWT (req.user.id) — er wordt
 * nergens een report-ID of user-ID uit de request geaccepteerd, dus er is geen
 * ID/URL om te manipuleren om andermans rapport te zien.
 */

const fs   = require('fs');
const path = require('path');
const db   = require('../config/database');
const { extractMeasurementValues, FIELD_NAMES } = require('../services/visionExtractionService');

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — ruim voldoende voor een foto/screenshot
const ALLOWED_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Opslag naast het databasebestand, zodat dit op Railway automatisch in het
// persistente volume terechtkomt (zelfde map als DB_PATH) i.p.v. in de
// wegwerpbare build-directory.
const DB_PATH     = process.env.DB_PATH || './mhgym.db';
const UPLOADS_DIR = path.join(path.dirname(path.resolve(DB_PATH)), 'uploads', 'measurement-reports');

function ensureUploadsDir() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/** Valideert en ontleedt een data-URL (data:image/xxx;base64,....). Geeft null bij ongeldige input. */
function parseImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return null;
  return { mime, ext: ALLOWED_MIME[mime], buffer };
}

/** Valideert dat het opgegeven lid daadwerkelijk bestaat. */
async function memberExists(userId) {
  if (!Number.isInteger(userId) || userId <= 0) return false;
  const r = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [userId] });
  return !!r.rows[0];
}

// ── GET /admin/members/:id/measurement-reports ────────────────────────────────
const listForMember = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!(await memberExists(userId))) return res.status(404).json({ error: 'Lid niet gevonden.' });

  const result = await db.execute({
    sql: `SELECT mr.id, mr.user_id, mr.measured_at, mr.mime_type, mr.created_at,
                 mrv.extraction_status, mrv.weight_kg, mrv.bmi, mrv.body_fat_pct
          FROM measurement_reports mr
          LEFT JOIN measurement_report_values mrv ON mrv.report_id = mr.id
          WHERE mr.user_id = ? ORDER BY mr.measured_at DESC, mr.created_at DESC`,
    args: [userId],
  });
  res.json({ reports: result.rows });
};

// ── POST /admin/members/:id/measurement-reports ───────────────────────────────
const uploadForMember = async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!(await memberExists(userId))) return res.status(404).json({ error: 'Lid niet gevonden.' });

  const { measured_at, image_data } = req.body;
  if (!measured_at || !/^\d{4}-\d{2}-\d{2}$/.test(measured_at)) {
    return res.status(400).json({ error: 'Geef een geldige datum op (JJJJ-MM-DD).' });
  }

  const parsed = parseImageDataUrl(image_data);
  if (!parsed) {
    return res.status(400).json({ error: 'Ongeldige afbeelding. Gebruik JPG, PNG of WEBP (max. 8MB).' });
  }

  ensureUploadsDir();
  const filename = `member${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${parsed.ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), parsed.buffer);

  const insert = await db.execute({
    sql: `INSERT INTO measurement_reports (user_id, measured_at, filename, mime_type, uploaded_by)
          VALUES (?, ?, ?, ?, ?)`,
    args: [userId, measured_at, filename, parsed.mime, req.user.id],
  });
  const reportId = Number(insert.lastInsertRowid);

  const created = await db.execute({
    sql: `SELECT id, user_id, measured_at, mime_type, created_at FROM measurement_reports WHERE id = ?`,
    args: [reportId],
  });

  // Automatische uitlezing — een voorstel, nooit definitief. Faalt dit (bv.
  // geen API-key of een tijdelijke fout), dan blijft het rapport gewoon
  // bewaard met alle waarden leeg; de admin kan alles handmatig invullen.
  const extraction = await extractMeasurementValues(parsed.buffer, parsed.mime);

  const cols = FIELD_NAMES.join(', ');
  const placeholders = FIELD_NAMES.map(() => '?').join(', ');
  await db.execute({
    sql: `INSERT INTO measurement_report_values (report_id, extraction_status, extraction_notes, ${cols})
          VALUES (?, ?, ?, ${placeholders})`,
    args: [reportId, extraction.status, extraction.notes, ...FIELD_NAMES.map(f => extraction.values[f])],
  });

  const valuesRow = await db.execute({
    sql: 'SELECT * FROM measurement_report_values WHERE report_id = ?',
    args: [reportId],
  });

  res.status(201).json({ report: created.rows[0], values: valuesRow.rows[0] });
};

// ── GET /admin/measurement-reports/:reportId/values ───────────────────────────
const getValues = async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT filename FROM measurement_reports WHERE id = ?',
    args: [req.params.reportId],
  });
  if (!result.rows[0]) return res.status(404).json({ error: 'Meetrapport niet gevonden.' });

  const valuesRow = await db.execute({
    sql: 'SELECT * FROM measurement_report_values WHERE report_id = ?',
    args: [req.params.reportId],
  });
  res.json({ values: valuesRow.rows[0] || null });
};

// ── PUT /admin/measurement-reports/:reportId/values ───────────────────────────
// Admin corrigeert (optioneel) de voorgestelde waarden en bevestigt ze definitief.
const confirmValues = async (req, res) => {
  const reportRes = await db.execute({
    sql: 'SELECT id FROM measurement_reports WHERE id = ?',
    args: [req.params.reportId],
  });
  if (!reportRes.rows[0]) return res.status(404).json({ error: 'Meetrapport niet gevonden.' });

  const existing = await db.execute({
    sql: 'SELECT id FROM measurement_report_values WHERE report_id = ?',
    args: [req.params.reportId],
  });
  if (!existing.rows[0]) return res.status(404).json({ error: 'Nog geen uitlezing voor dit rapport.' });

  // Uitsluitend de bekende, numerieke velden overnemen — nooit ongefilterde
  // request-data direct in de query zetten.
  const sets = FIELD_NAMES.map(f => `${f} = ?`).join(', ');
  const args = FIELD_NAMES.map(f => {
    const v = req.body[f];
    if (v === '' || v === null || v === undefined) return null;
    const num = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(num) ? num : null;
  });

  await db.execute({
    sql: `UPDATE measurement_report_values SET
            ${sets},
            extraction_status = 'confirmed',
            confirmed_by = ?,
            confirmed_at = datetime('now'),
            updated_at = datetime('now')
          WHERE report_id = ?`,
    args: [...args, req.user.id, req.params.reportId],
  });

  const updated = await db.execute({
    sql: 'SELECT * FROM measurement_report_values WHERE report_id = ?',
    args: [req.params.reportId],
  });
  res.json({ values: updated.rows[0] });
};

// ── GET /admin/measurement-reports/:reportId/image ────────────────────────────
const getImage = async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT filename, mime_type, user_id FROM measurement_reports WHERE id = ?',
    args: [req.params.reportId],
  });
  const report = result.rows[0];
  if (!report) return res.status(404).json({ error: 'Meetrapport niet gevonden.' });

  const filePath = path.join(UPLOADS_DIR, report.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Afbeelding niet gevonden op schijf.' });

  res.setHeader('Content-Type', report.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
};

// ── DELETE /admin/measurement-reports/:reportId ───────────────────────────────
const deleteReport = async (req, res) => {
  const result = await db.execute({
    sql: 'SELECT filename FROM measurement_reports WHERE id = ?',
    args: [req.params.reportId],
  });
  const report = result.rows[0];
  if (!report) return res.status(404).json({ error: 'Meetrapport niet gevonden.' });

  // Expliciet ook de gekoppelde waarden verwijderen — niet vertrouwen op
  // ON DELETE CASCADE, want niet elke SQLite-verbinding heeft foreign_keys=ON.
  await db.execute({ sql: 'DELETE FROM measurement_report_values WHERE report_id = ?', args: [req.params.reportId] });
  await db.execute({ sql: 'DELETE FROM measurement_reports WHERE id = ?', args: [req.params.reportId] });

  try { fs.unlinkSync(path.join(UPLOADS_DIR, report.filename)); } catch (_) { /* bestand al weg — geen probleem */ }

  res.json({ message: 'Meetrapport verwijderd.' });
};

// ── GET /voortgang/measurement-report/mine ────────────────────────────────────
// Uitsluitend het eigen, meest recente rapport van de ingelogde gebruiker.
// "Meest recente" = laatst geüploade (created_at), zodat een nieuwe upload
// door de admin altijd het rapport vervangt dat het lid te zien krijgt,
// ongeacht welke measured_at-datum is ingevuld.
const myReport = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT id, measured_at, mime_type, created_at
          FROM measurement_reports WHERE user_id = ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [req.user.id],
  });
  res.json({ report: result.rows[0] || null });
};

// ── GET /voortgang/measurement-report/mine/image ──────────────────────────────
const myReportImage = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT filename, mime_type FROM measurement_reports WHERE user_id = ?
          ORDER BY created_at DESC LIMIT 1`,
    args: [req.user.id],
  });
  const report = result.rows[0];
  if (!report) return res.status(404).json({ error: 'Nog geen meetrapport beschikbaar.' });

  const filePath = path.join(UPLOADS_DIR, report.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Afbeelding niet gevonden op schijf.' });

  res.setHeader('Content-Type', report.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
};

module.exports = { listForMember, uploadForMember, getImage, getValues, confirmValues, deleteReport, myReport, myReportImage };
