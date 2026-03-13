module.exports = (req, res, next) => {
  if (req.session?.admin) return next();
  res.redirect('/auth/login');
};
