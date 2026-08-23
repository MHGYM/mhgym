/**
 * badgeController.js — dunne HTTP-laag boven badgeService.js.
 *
 * Endpoints:
 *   GET  /voortgang/badges/mine              — eigen badges (member)
 *   POST /voortgang/admin/goals              — doel instellen voor een lid (admin)
 *   GET  /voortgang/admin/goals/:memberId    — doelen van een lid (admin)
 */

const db = require('../config/database');
const badgeService = require('../services/badgeService');

// ── GET /voortgang/badges/mine ────────────────────────────────────────────────
const myBadges = async (req, res) => {
  const badges = await badgeService.getMyBadges(req.user.id);
  res.json({ badges });
};

// ── GET /voortgang/admin/badges/:memberId ─────────────────────────────────────
const memberBadges = async (req, res) => {
  const userId = parseInt(req.params.memberId, 10);
  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Ongeldig lid.' });
  const badges = await badgeService.getMyBadges(userId);
  res.json({ badges });
};

// ── POST /voortgang/admin/goals ───────────────────────────────────────────────
const setGoal = async (req, res) => {
  const { member_id, metric, target_value, direction } = req.body;
  const userId = parseInt(member_id, 10);

  if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: 'Ongeldig lid.' });
  if (!badgeService.GOAL_METRICS.includes(metric)) return res.status(400).json({ error: 'Ongeldige metriek.' });
  if (!['lower', 'higher'].includes(direction)) return res.status(400).json({ error: 'Ongeldige richting.' });
  const value = Number(target_value);
  if (!Number.isFinite(value)) return res.status(400).json({ error: 'Ongeldige doelwaarde.' });

  const memberRes = await db.execute({ sql: 'SELECT id FROM users WHERE id = ?', args: [userId] });
  if (!memberRes.rows[0]) return res.status(404).json({ error: 'Lid niet gevonden.' });

  // Eerdere, nog niet behaalde doelen voor dit lid verwijderen — er is
  // telkens maar één actief doel per lid. Ze zijn nooit bereikt (anders
  // stond achieved_at al gevuld), dus er gaat geen historie verloren door
  // ze te vervangen in plaats van ze als "bereikt" te markeren.
  await db.execute({
    sql: `DELETE FROM member_goals WHERE user_id = ? AND achieved_at IS NULL`,
    args: [userId],
  });

  const insert = await db.execute({
    sql: `INSERT INTO member_goals (user_id, metric, target_value, direction, created_by) VALUES (?, ?, ?, ?, ?)`,
    args: [userId, metric, value, direction, req.user.id],
  });
  const created = await db.execute({ sql: 'SELECT * FROM member_goals WHERE id = ?', args: [Number(insert.lastInsertRowid)] });
  res.status(201).json({ goal: created.rows[0] });
};

// ── GET /voortgang/admin/goals/:memberId ──────────────────────────────────────
const listGoals = async (req, res) => {
  const userId = parseInt(req.params.memberId, 10);
  const result = await db.execute({
    sql: 'SELECT * FROM member_goals WHERE user_id = ? ORDER BY created_at DESC',
    args: [userId],
  });
  res.json({ goals: result.rows });
};

module.exports = { myBadges, memberBadges, setGoal, listGoals };
