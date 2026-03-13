const express = require('express');
const router = express.Router();
const db = require('../lib/db');

// GET / — dashboard with open reports
router.get('/', async (req, res) => {
  const { rows: reports } = await db.query(`
    SELECT
      r.id,
      r.reason,
      r.created_at,
      r.reported_user_id,
      r.reported_photo_id,
      reporter.username  AS reporter_username,
      reporter.id        AS reporter_id,
      reported.username  AS reported_username,
      reported.banned_at AS reported_banned_at,
      p.storage_path     AS photo_path,
      p.caption          AS photo_caption,
      p.media_type       AS photo_media_type
    FROM reports r
    LEFT JOIN users reporter ON reporter.id = r.reporter_id
    LEFT JOIN users reported ON reported.id = r.reported_user_id
    LEFT JOIN photos p ON p.id = r.reported_photo_id
    ORDER BY r.created_at DESC
  `);

  const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
  const enriched = reports.map(r => ({
    ...r,
    photo_url: r.photo_path ? `${R2_PUBLIC_URL}/${r.photo_path}` : null,
  }));

  res.render('reports', { reports: enriched });
});

// POST /reports/:id/dismiss
router.post('/reports/:id/dismiss', async (req, res) => {
  await db.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
  res.redirect('/');
});

// POST /reports/:id/delete-post — remove the photo record, dismiss report
router.post('/reports/:id/delete-post', async (req, res) => {
  const { rows } = await db.query(
    'SELECT reported_photo_id FROM reports WHERE id = $1',
    [req.params.id]
  );
  const photoId = rows[0]?.reported_photo_id;
  if (photoId) {
    await db.query('DELETE FROM photos WHERE id = $1', [photoId]);
  }
  await db.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
  res.redirect('/');
});

// POST /reports/:id/ban-user — soft ban (sets banned_at), dismisses all reports on this user
router.post('/reports/:id/ban-user', async (req, res) => {
  const { rows } = await db.query(
    'SELECT reported_user_id FROM reports WHERE id = $1',
    [req.params.id]
  );
  const userId = rows[0]?.reported_user_id;
  if (userId) {
    await db.query('UPDATE users SET banned_at = now() WHERE id = $1', [userId]);
    await db.query('DELETE FROM reports WHERE reported_user_id = $1', [userId]);
  } else {
    await db.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
  }
  res.redirect('/');
});

// POST /reports/:id/delete-user — hard delete from DB + Supabase Auth, dismisses all reports
router.post('/reports/:id/delete-user', async (req, res) => {
  const { rows } = await db.query(
    'SELECT reported_user_id FROM reports WHERE id = $1',
    [req.params.id]
  );
  const userId = rows[0]?.reported_user_id;
  if (userId) {
    await db.query('DELETE FROM reports WHERE reported_user_id = $1', [userId]);
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      {
        method: 'DELETE',
        headers: {
          apikey: process.env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        },
      }
    );
  } else {
    await db.query('DELETE FROM reports WHERE id = $1', [req.params.id]);
  }
  res.redirect('/');
});

// POST /users/:id/unban
router.post('/users/:id/unban', async (req, res) => {
  await db.query('UPDATE users SET banned_at = NULL WHERE id = $1', [req.params.id]);
  res.redirect('/');
});

module.exports = router;
