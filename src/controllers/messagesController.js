/**
 * messagesController.js — berichten tussen leden en admin
 *
 * Member endpoints (JWT auth, eigen berichten):
 *   GET  /api/messages           → eigen conversatie ophalen
 *   POST /api/messages           → bericht sturen naar admin
 *
 * Admin endpoints (JWT + requireAdmin):
 *   GET  /api/admin/messages              → alle conversaties + ongelezen tellers
 *   GET  /api/admin/messages/unread-count → snelle ongelezen teller
 *   GET  /api/admin/messages/:memberId    → conversatie met specifiek lid
 *   POST /api/admin/messages/:memberId    → bericht sturen naar lid
 */

const db = require('../config/database');
const { sendPush } = require('./ptController');

// ── Lid: eigen berichten ophalen ─────────────────────────────────────────────

const getMemberMessages = async (req, res) => {
  const memberId = req.user.id;

  // Markeer alle admin-berichten als gelezen (lid opent het gesprek)
  await db.execute({
    sql: `UPDATE messages SET read_at = datetime('now')
          WHERE member_id = ? AND sender = 'admin' AND read_at IS NULL`,
    args: [memberId],
  });

  const result = await db.execute({
    sql: `SELECT id, sender, body, read_at, created_at
          FROM messages WHERE member_id = ? ORDER BY created_at ASC`,
    args: [memberId],
  });

  res.json({ messages: result.rows });
};

// ── Lid: bericht sturen naar admin ───────────────────────────────────────────

const sendMemberMessage = async (req, res) => {
  const memberId = req.user.id;
  const { body } = req.body;

  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Bericht mag niet leeg zijn.' });
  }
  const text = String(body).trim().slice(0, 2000);

  await db.execute({
    sql: `INSERT INTO messages (member_id, sender, body) VALUES (?, 'member', ?)`,
    args: [memberId, text],
  });

  // Push-notificatie naar alle admins
  const userRes = await db.execute({
    sql: 'SELECT first_name, last_name FROM users WHERE id = ?',
    args: [memberId],
  });
  const user = userRes.rows[0];
  if (user) {
    const adminRes = await db.execute({ sql: `SELECT id FROM users WHERE role = 'admin'` });
    for (const admin of adminRes.rows) {
      sendPush(
        admin.id,
        `💬 ${user.first_name} ${user.last_name}`,
        text.slice(0, 120)
      ).catch(() => {});
    }
  }

  res.status(201).json({ message: 'Bericht verstuurd.' });
};

// ── Admin: snelle ongelezen teller ────────────────────────────────────────────

const adminUnreadCount = async (req, res) => {
  const result = await db.execute(`
    SELECT COUNT(*) AS total_unread FROM messages
    WHERE sender = 'member' AND read_at IS NULL
  `);
  res.json({ unread: Number(result.rows[0].total_unread) });
};

// ── Admin: alle conversaties ──────────────────────────────────────────────────

const adminListConversations = async (req, res) => {
  const result = await db.execute(`
    SELECT
      u.id   AS member_id,
      u.first_name, u.last_name, u.email,
      (SELECT body       FROM messages WHERE member_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_body,
      (SELECT sender     FROM messages WHERE member_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_sender,
      (SELECT created_at FROM messages WHERE member_id = u.id ORDER BY created_at DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*)   FROM messages WHERE member_id = u.id AND sender = 'member' AND read_at IS NULL) AS unread_count
    FROM users u
    WHERE EXISTS (SELECT 1 FROM messages WHERE member_id = u.id)
    ORDER BY last_at DESC
  `);
  res.json({ conversations: result.rows });
};

// ── Admin: conversatie met één lid ophalen ────────────────────────────────────

const adminGetConversation = async (req, res) => {
  const memberId = req.params.memberId;

  const userRes = await db.execute({
    sql: 'SELECT id, first_name, last_name, email FROM users WHERE id = ?',
    args: [memberId],
  });
  if (!userRes.rows[0]) return res.status(404).json({ error: 'Lid niet gevonden.' });

  // Markeer ongelezen member-berichten als gelezen door admin
  await db.execute({
    sql: `UPDATE messages SET read_at = datetime('now')
          WHERE member_id = ? AND sender = 'member' AND read_at IS NULL`,
    args: [memberId],
  });

  const result = await db.execute({
    sql: `SELECT id, sender, body, read_at, created_at
          FROM messages WHERE member_id = ? ORDER BY created_at ASC`,
    args: [memberId],
  });

  res.json({ member: userRes.rows[0], messages: result.rows });
};

// ── Admin: bericht sturen naar lid ───────────────────────────────────────────

const adminSendMessage = async (req, res) => {
  const memberId = req.params.memberId;
  const { body } = req.body;

  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Bericht mag niet leeg zijn.' });
  }
  const text = String(body).trim().slice(0, 2000);

  const userRes = await db.execute({
    sql: 'SELECT id, first_name FROM users WHERE id = ?',
    args: [memberId],
  });
  if (!userRes.rows[0]) return res.status(404).json({ error: 'Lid niet gevonden.' });

  await db.execute({
    sql: `INSERT INTO messages (member_id, sender, body) VALUES (?, 'admin', ?)`,
    args: [memberId, text],
  });

  // Push-notificatie naar het lid
  sendPush(memberId, '💬 Bericht van MHGym', text.slice(0, 120)).catch(() => {});

  res.status(201).json({ message: 'Bericht verstuurd.' });
};

module.exports = {
  getMemberMessages,
  sendMemberMessage,
  adminUnreadCount,
  adminListConversations,
  adminGetConversation,
  adminSendMessage,
};
