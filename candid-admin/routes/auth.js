const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session?.admin) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { password } = req.body;
  const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) return res.render('login', { error: 'Invalid password.' });
  req.session.admin = true;
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/auth/login'));
});

module.exports = router;
