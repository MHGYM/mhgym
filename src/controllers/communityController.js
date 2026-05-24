/**
 * Community controller
 *
 * GET  /api/community                — alle posts (gepagineerd)
 * POST /api/community                — maak post aan
 * DELETE /api/community/:id          — verwijder post (eigen of admin)
 * POST /api/community/:id/like       — like/unlike
 * GET  /api/community/:id/comments   — comments ophalen
 * POST /api/community/:id/comments   — comment plaatsen
 * DELETE /api/community/:id/comments/:cid — comment verwijderen
 * PUT  /api/community/:id/pin        — admin: vastzetten
 */
const db     = require('../config/database');
const { sendPush } = require('./ptController');

const getPosts = async (req, res) => {
  const limit  = parseInt(req.query.limit  || '20', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  const userId = req.user.id;

  const result = await db.execute({
    sql: `SELECT p.*, u.first_name, u.last_name, u.role AS author_role,
                 (SELECT COUNT(*) FROM community_likes cl WHERE cl.post_id = p.id) AS like_count,
                 (SELECT COUNT(*) FROM community_comments cc WHERE cc.post_id = p.id) AS comment_count,
                 (SELECT 1 FROM community_likes cl WHERE cl.post_id = p.id AND cl.user_id = ?) AS i_liked
          FROM community_posts p
          JOIN users u ON u.id = p.user_id
          ORDER BY p.pinned DESC, p.created_at DESC
          LIMIT ? OFFSET ?`,
    args: [userId, limit, offset],
  });
  res.json({ posts: result.rows });
};

const createPost = async (req, res) => {
  const { type, title, body, image_url, send_push } = req.body;
  if (!body) return res.status(400).json({ error: 'Tekst is verplicht.' });

  // Alleen admin mag admin-types plaatsen
  const allowedAdminTypes = ['admin_news', 'admin_announcement', 'admin_action', 'admin_motivation'];
  const allowedMemberTypes = ['member_result', 'member_progress', 'member_photo', 'member'];
  const postType = type || (req.user.role === 'admin' ? 'admin_news' : 'member');

  if (allowedAdminTypes.includes(postType) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang.' });
  }

  const result = await db.execute({
    sql: `INSERT INTO community_posts (user_id, type, title, body, image_url, send_push) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [req.user.id, postType, title || null, body, image_url || null, send_push ? 1 : 0],
  });

  const post = await db.execute({
    sql: `SELECT p.*, u.first_name, u.last_name, u.role AS author_role FROM community_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
    args: [result.lastInsertRowid],
  });

  // Push notificatie sturen voor admin aankondigingen
  if (send_push && req.user.role === 'admin') {
    const allUsers = await db.execute(`SELECT id FROM users WHERE role = 'member'`);
    for (const u of allUsers.rows) {
      sendPush(u.id, `📢 ${title || 'Nieuw bericht van MHGym'}`, body.slice(0, 120)).catch(() => {});
    }
  }

  res.status(201).json({ post: post.rows[0] });
};

const deletePost = async (req, res) => {
  const postRes = await db.execute({ sql: 'SELECT * FROM community_posts WHERE id = ?', args: [req.params.id] });
  const post = postRes.rows[0];
  if (!post) return res.status(404).json({ error: 'Bericht niet gevonden.' });
  if (post.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang.' });
  }
  await db.execute({ sql: 'DELETE FROM community_posts WHERE id = ?', args: [req.params.id] });
  res.json({ message: 'Bericht verwijderd.' });
};

const toggleLike = async (req, res) => {
  const postId = req.params.id;
  const existing = await db.execute({
    sql: 'SELECT id FROM community_likes WHERE post_id = ? AND user_id = ?',
    args: [postId, req.user.id],
  });
  if (existing.rows[0]) {
    await db.execute({ sql: 'DELETE FROM community_likes WHERE id = ?', args: [existing.rows[0].id] });
    res.json({ liked: false });
  } else {
    await db.execute({ sql: 'INSERT INTO community_likes (post_id, user_id) VALUES (?, ?)', args: [postId, req.user.id] });
    res.json({ liked: true });
  }
};

const getComments = async (req, res) => {
  const result = await db.execute({
    sql: `SELECT c.*, u.first_name, u.last_name, u.role AS author_role
          FROM community_comments c JOIN users u ON u.id = c.user_id
          WHERE c.post_id = ? ORDER BY c.created_at ASC`,
    args: [req.params.id],
  });
  res.json({ comments: result.rows });
};

const addComment = async (req, res) => {
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ error: 'Reactie is leeg.' });

  const result = await db.execute({
    sql: `INSERT INTO community_comments (post_id, user_id, body) VALUES (?, ?, ?)`,
    args: [req.params.id, req.user.id, body],
  });
  const comment = await db.execute({
    sql: `SELECT c.*, u.first_name, u.last_name, u.role AS author_role FROM community_comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    args: [result.lastInsertRowid],
  });
  res.status(201).json({ comment: comment.rows[0] });
};

const deleteComment = async (req, res) => {
  const c = await db.execute({ sql: 'SELECT * FROM community_comments WHERE id = ?', args: [req.params.cid] });
  if (!c.rows[0]) return res.status(404).json({ error: 'Reactie niet gevonden.' });
  if (c.rows[0].user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang.' });
  }
  await db.execute({ sql: 'DELETE FROM community_comments WHERE id = ?', args: [req.params.cid] });
  res.json({ message: 'Reactie verwijderd.' });
};

const pinPost = async (req, res) => {
  const { pinned } = req.body;
  await db.execute({
    sql: `UPDATE community_posts SET pinned = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [pinned ? 1 : 0, req.params.id],
  });
  res.json({ message: pinned ? 'Vastgezet.' : 'Los gemaakt.' });
};

module.exports = { getPosts, createPost, deletePost, toggleLike, getComments, addComment, deleteComment, pinPost };
