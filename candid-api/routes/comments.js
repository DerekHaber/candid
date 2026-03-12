const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// GET /comments?photoId=
router.get('/', async (req, res) => {
  const { photoId } = req.query;
  if (!photoId) return res.json([]);
  const { rows } = await db.query(
    `SELECT c.id, c.photo_id, c.text, c.created_at,
            json_build_object('username', u.username) as users
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.photo_id = $1
     ORDER BY c.created_at ASC`,
    [photoId]
  );
  res.json(rows);
});

// POST /comments
router.post('/', async (req, res) => {
  const { photo_id, text } = req.body;
  const { rows } = await db.query(
    `INSERT INTO comments (photo_id, user_id, text)
     VALUES ($1, $2, $3)
     RETURNING id, photo_id, text, created_at`,
    [photo_id, req.userId, text]
  );
  // Fetch username for response
  const { rows: userRows } = await db.query(
    'SELECT username FROM users WHERE id = $1',
    [req.userId]
  );
  res.json({
    ...rows[0],
    users: userRows[0] ? { username: userRows[0].username } : null,
  });
});

module.exports = router;
