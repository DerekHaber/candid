require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.ADMIN_SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 hours
}));

app.use('/auth', require('./routes/auth'));
app.use('/', require('./middleware/requireAdmin'), require('./routes/admin'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Candid admin running on port ${PORT}`));
