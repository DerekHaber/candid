const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const r2 = require('../lib/r2');

// GET /feed?cursor=<iso>&limit=10
router.get('/', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit ?? '10', 10), 50);
  const cursor = req.query.cursor || null;

  const values = [req.userId, limit];
  let cursorClause = '';
  if (cursor) {
    values.push(cursor);
    cursorClause = `AND p.created_at < $${values.length}`;
  }

  const { rows } = await db.query(
    `WITH accepted_friends AS (
       SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END as friend_id
       FROM friends
       WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'
     )
     SELECT p.id, p.user_id, p.storage_path, p.created_at, p.caption, p.media_type,
            json_build_object('username', u.username, 'avatar_url', u.avatar_url) as users
     FROM photos p
     JOIN users u ON u.id = p.user_id
     WHERE p.shared_to_feed = true AND p.developed = true
       AND p.user_id IN (SELECT friend_id FROM accepted_friends)
       AND p.user_id NOT IN (SELECT blocked_id FROM blocks WHERE blocker_id = $1)
       AND p.user_id NOT IN (SELECT blocker_id FROM blocks WHERE blocked_id = $1)
     ${cursorClause}
     ORDER BY p.created_at DESC
     LIMIT $2`,
    values
  );

  const withUrls = await attachSignedUrls(rows);
  res.json(withUrls);
});

// GET /feed/reactions?photoIds=id1,id2,...
router.get('/reactions', async (req, res) => {
  const ids = (req.query.photoIds ?? '').split(',').filter(Boolean);
  if (ids.length === 0) return res.json([]);
  const { rows } = await db.query(
    'SELECT photo_id, emoji, user_id FROM reactions WHERE photo_id = ANY($1::uuid[])',
    [ids]
  );
  res.json(rows);
});

// GET /feed/comments?photoIds=id1,id2,...
router.get('/comments', async (req, res) => {
  const ids = (req.query.photoIds ?? '').split(',').filter(Boolean);
  if (ids.length === 0) return res.json([]);
  const { rows } = await db.query(
    `SELECT c.id, c.photo_id, c.text, c.created_at,
            json_build_object('username', u.username) as users
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.photo_id = ANY($1::uuid[])
     ORDER BY c.created_at DESC`,
    [ids]
  );
  res.json(rows);
});

// POST /feed/reactions — toggle { photoId, emoji, action: 'insert'|'delete' }
router.post('/reactions', async (req, res) => {
  const { photoId, emoji, action } = req.body;
  if (action === 'delete') {
    await db.query(
      'DELETE FROM reactions WHERE user_id = $1 AND photo_id = $2 AND emoji = $3',
      [req.userId, photoId, emoji]
    );
  } else {
    await db.query(
      'INSERT INTO reactions (photo_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [photoId, req.userId, emoji]
    );
  }
  res.json({ ok: true });
});

async function attachSignedUrls(rows) {
  if (rows.length === 0) return [];
  const urls = await r2.getReadUrls(rows.map(r => r.storage_path));
  const urlMap = new Map(urls.map(u => [u.path, u.signedUrl]));
  return rows.map(r => ({ ...r, signedUrl: urlMap.get(r.storage_path) }));
}

module.exports = router;
