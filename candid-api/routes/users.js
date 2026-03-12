const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const r2 = require('../lib/r2');

// POST /users — create user row on signup (upsert so re-signup is safe)
router.post('/', async (req, res) => {
  const { username } = req.body;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO users (id, username)
       VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username
       RETURNING id, username`,
      [req.userId, username.trim().toLowerCase()]
    );
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    throw e;
  }
});

// PATCH /users/push-token
router.patch('/push-token', async (req, res) => {
  const { push_token } = req.body;
  await db.query('UPDATE users SET push_token = $1 WHERE id = $2', [push_token, req.userId]);
  res.json({ ok: true });
});

// GET /users/me
router.get('/me', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, username, display_name, avatar_url FROM users WHERE id = $1',
    [req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ ...rows[0], avatar_url: await resolveAvatarUrl(rows[0].avatar_url) });
});

// PATCH /users/me
router.patch('/me', async (req, res) => {
  const allowed = ['display_name', 'avatar_url'];
  const updates = [];
  const values = [];
  let i = 1;
  for (const key of allowed) {
    if (key in req.body) {
      updates.push(`${key} = $${i++}`);
      values.push(req.body[key]);
    }
  }
  if (updates.length === 0) return res.json({ ok: true });
  values.push(req.userId);
  await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, values);
  res.json({ ok: true });
});

// GET /users/search?q=
router.get('/search', async (req, res) => {
  const q = `%${(req.query.q ?? '').trim()}%`;
  const { rows } = await db.query(
    'SELECT id, username FROM users WHERE username ILIKE $1 AND id != $2 LIMIT 20',
    [q, req.userId]
  );
  res.json(rows);
});

// POST /users/avatar-url — presigned PUT for avatar upload
// Returns uploadUrl for the client to PUT to, and the R2 key to store in DB
router.post('/avatar-url', async (req, res) => {
  const { contentType = 'image/jpeg' } = req.body ?? {};
  const key = `avatars/${req.userId}/avatar.jpg`;
  const uploadUrl = await r2.getUploadUrl(key, contentType);
  // Return the key (not a signed URL) — client stores this key in users.avatar_url
  res.json({ uploadUrl, avatarKey: key });
});

// GET /users/:id
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, username, avatar_url FROM users WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json({ ...rows[0], avatar_url: await resolveAvatarUrl(rows[0].avatar_url) });
});

// R2 keys start with "avatars/" — full http(s) URLs are legacy Supabase, pass through
async function resolveAvatarUrl(avatar_url) {
  if (!avatar_url) return null;
  if (avatar_url.startsWith('avatars/')) return r2.getReadUrl(avatar_url);
  return avatar_url; // existing Supabase public URL — still works
}

module.exports = router;
