const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// GET /blocks — users I've blocked
router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.username
     FROM blocks b
     JOIN users u ON u.id = b.blocked_id
     WHERE b.blocker_id = $1
     ORDER BY b.created_at DESC`,
    [req.userId]
  );
  res.json(rows);
});

// POST /blocks — block { blocked_id }
router.post('/', async (req, res) => {
  const { blocked_id } = req.body;
  if (!blocked_id) return res.status(400).json({ error: 'blocked_id required' });

  // Remove any existing friendship
  await db.query(
    `DELETE FROM friends
     WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [req.userId, blocked_id]
  );

  await db.query(
    `INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [req.userId, blocked_id]
  );
  res.json({ ok: true });
});

// DELETE /blocks/:blocked_id — unblock
router.delete('/:blocked_id', async (req, res) => {
  await db.query(
    'DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2',
    [req.userId, req.params.blocked_id]
  );
  res.json({ ok: true });
});

module.exports = router;
