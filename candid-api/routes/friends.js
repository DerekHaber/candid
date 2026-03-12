const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// GET /friends/pending-count
router.get('/pending-count', async (req, res) => {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int as count FROM friends WHERE friend_id = $1 AND status = $2',
    [req.userId, 'pending']
  );
  res.json({ count: rows[0].count });
});

// GET /friends — all relationships involving current user
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, user_id, friend_id, status
     FROM friends WHERE user_id = $1 OR friend_id = $1`,
    [req.userId]
  );
  res.json(rows);
});

// POST /friends — send request { friend_id }
router.post('/', async (req, res) => {
  const { friend_id } = req.body;
  const { rows } = await db.query(
    `INSERT INTO friends (user_id, friend_id, status)
     VALUES ($1, $2, 'pending')
     ON CONFLICT (user_id, friend_id) DO NOTHING
     RETURNING id, user_id, friend_id, status`,
    [req.userId, friend_id]
  );
  res.json(rows[0] ?? { ok: true });
});

// PATCH /friends/:id — accept { status: 'accepted' }
router.patch('/:id', async (req, res) => {
  const { status } = req.body;
  await db.query(
    'UPDATE friends SET status = $1 WHERE id = $2',
    [status, req.params.id]
  );
  res.json({ ok: true });
});

// DELETE /friends/:id
router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM friends WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
