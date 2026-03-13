const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// POST /reports — submit a report { reported_user_id?, reported_photo_id?, reason }
router.post('/', async (req, res) => {
  const { reported_user_id, reported_photo_id, reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'reason required' });
  if (!reported_user_id && !reported_photo_id) {
    return res.status(400).json({ error: 'reported_user_id or reported_photo_id required' });
  }
  await db.query(
    `INSERT INTO reports (reporter_id, reported_user_id, reported_photo_id, reason)
     VALUES ($1, $2, $3, $4)`,
    [req.userId, reported_user_id ?? null, reported_photo_id ?? null, reason]
  );
  res.json({ ok: true });
});

module.exports = router;
