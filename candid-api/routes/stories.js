const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const r2 = require('../lib/r2');

// GET /stories — story users for the feed (friends with recent story photos)
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `WITH accepted_friends AS (
       SELECT CASE WHEN user_id = $1 THEN friend_id ELSE user_id END as friend_id
       FROM friends
       WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'
     ),
     story_photos AS (
       SELECT p.id, p.user_id
       FROM photos p
       WHERE p.user_id IN (SELECT friend_id FROM accepted_friends)
         AND p.shared_to_feed = true
         AND p.developed = true
         AND p.created_at >= NOW() - INTERVAL '7 days'
     )
     SELECT
       u.id, u.username, u.avatar_url,
       EXISTS(
         SELECT 1 FROM story_photos sp2
         WHERE sp2.user_id = u.id
           AND sp2.id NOT IN (
             SELECT photo_id FROM story_views WHERE viewer_id = $1
           )
       ) as has_unseen
     FROM users u
     WHERE u.id IN (SELECT DISTINCT user_id FROM story_photos)`,
    [req.userId]
  );
  // Map has_unseen → hasUnseen to match mobile type
  res.json(rows.map(r => ({ ...r, hasUnseen: r.has_unseen })));
});

// GET /stories/:userId — photos for one user's story
router.get('/:userId', async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { rows } = await db.query(
    `SELECT id, storage_path, created_at, caption
     FROM photos
     WHERE user_id = $1 AND shared_to_feed = true AND developed = true
       AND created_at >= $2
     ORDER BY created_at ASC`,
    [req.params.userId, sevenDaysAgo]
  );
  const withUrls = await attachSignedUrls(rows);
  res.json(withUrls);
});

// markViewed is exported for mounting at POST /story-views
async function markViewed(req, res) {
  const { photoId } = req.body;
  await db.query(
    `INSERT INTO story_views (viewer_id, photo_id)
     VALUES ($1, $2)
     ON CONFLICT (viewer_id, photo_id) DO NOTHING`,
    [req.userId, photoId]
  );
  res.json({ ok: true });
}

async function attachSignedUrls(rows) {
  if (rows.length === 0) return [];
  const urls = await r2.getReadUrls(rows.map(r => r.storage_path));
  const urlMap = new Map(urls.map(u => [u.path, u.signedUrl]));
  return rows.map(r => ({ ...r, signedUrl: urlMap.get(r.storage_path) }));
}

module.exports = router;
module.exports.markViewed = markViewed;
