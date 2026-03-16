const express = require('express');
const router = express.Router();
const db = require('../lib/db');
const r2 = require('../lib/r2');
const { moderatePhoto } = require('../lib/moderation');

// POST /photos/upload-url
router.post('/upload-url', async (req, res) => {
  const { filename, contentType = 'image/jpeg' } = req.body;
  const storagePath = `${req.userId}/${filename}`;
  const uploadUrl = await r2.getUploadUrl(storagePath, contentType);
  res.json({ uploadUrl, storagePath });
});

// POST /photos/signed-urls — batch presigned GET URLs
router.post('/signed-urls', async (req, res) => {
  const { paths = [] } = req.body;
  const results = await r2.getReadUrls(paths);
  res.json(results);
});

// GET /photos/developing
router.get('/developing', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, storage_path, develop_at, created_at, media_type
     FROM photos WHERE user_id = $1 AND developed = false AND moderation_status != 'flagged'
     ORDER BY develop_at ASC`,
    [req.userId]
  );
  const withUrls = await attachSignedUrls(rows);
  res.json(withUrls);
});

// GET /photos/developed
router.get('/developed', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, storage_path, created_at, shared_to_feed, caption, media_type
     FROM photos WHERE user_id = $1 AND developed = true
     ORDER BY created_at DESC`,
    [req.userId]
  );
  const withUrls = await attachSignedUrls(rows);
  res.json(withUrls);
});

// POST /photos
router.post('/', async (req, res) => {
  const { storage_path, media_type = 'photo' } = req.body;
  const { rows } = await db.query(
    `INSERT INTO photos (user_id, storage_path, media_type, moderation_status)
     VALUES ($1, $2, $3, 'pending')
     RETURNING id, storage_path, develop_at, created_at, media_type`,
    [req.userId, storage_path, media_type]
  );
  res.json(rows[0]);
  // Run moderation after responding so the user sees no delay
  moderatePhoto(rows[0]).catch(err => console.error('[moderation] unhandled:', err.message));
});

// GET /photos/:id — returns photo metadata + signed URL
router.get('/:id', async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, storage_path, media_type, develop_at, developed, shared_to_feed, caption
     FROM photos WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Photo not found' });
  const signedUrl = await r2.getReadUrl(rows[0].storage_path);
  res.json({ ...rows[0], signedUrl });
});

// PATCH /photos/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['developed', 'shared_to_feed', 'caption'];
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
  values.push(req.params.id, req.userId);
  await db.query(
    `UPDATE photos SET ${updates.join(', ')} WHERE id = $${i++} AND user_id = $${i}`,
    values
  );
  res.json({ ok: true });
});

// DELETE /photos/:id
router.delete('/:id', async (req, res) => {
  const { rows } = await db.query(
    'SELECT storage_path FROM photos WHERE id = $1 AND user_id = $2',
    [req.params.id, req.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Photo not found' });
  await db.query('DELETE FROM photos WHERE id = $1', [req.params.id]);
  r2.deleteObject(rows[0].storage_path).catch(e => console.error('R2 delete failed:', e));
  res.json({ ok: true });
});

async function attachSignedUrls(rows) {
  if (rows.length === 0) return [];
  const urls = await r2.getReadUrls(rows.map(r => r.storage_path));
  const urlMap = new Map(urls.map(u => [u.path, u.signedUrl]));
  return rows.map(r => ({ ...r, signedUrl: urlMap.get(r.storage_path) }));
}

module.exports = router;
