require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { auth } = require('./middleware/auth');
const usersRouter = require('./routes/users');
const photosRouter = require('./routes/photos');
const feedRouter = require('./routes/feed');
const friendsRouter = require('./routes/friends');
const storiesRouter = require('./routes/stories');
const commentsRouter = require('./routes/comments');
const blocksRouter = require('./routes/blocks');
const reportsRouter = require('./routes/reports');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/users', auth, usersRouter);
app.use('/photos', auth, photosRouter);
app.use('/feed', auth, feedRouter);
app.use('/friends', auth, friendsRouter);
app.use('/stories', auth, storiesRouter);
app.use('/comments', auth, commentsRouter);
app.use('/blocks', auth, blocksRouter);
app.use('/reports', auth, reportsRouter);

app.post('/story-views', auth, storiesRouter.markViewed);

// Stub — implement push notifications when ready
app.post('/notify-friends', auth, (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`candid-api running on port ${PORT}`));
