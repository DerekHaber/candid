const { createRemoteJWKSet, jwtVerify } = require('jose');
const jwt = require('jsonwebtoken');
const db = require('../lib/db');

const jwks = createRemoteJWKSet(
  new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
);

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization' });
  }
  const token = header.slice(7);

  // Check algorithm from token header
  const decoded = jwt.decode(token, { complete: true });
  const alg = decoded?.header?.alg;

  try {
    let payload;
    if (alg === 'HS256') {
      payload = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    } else {
      // RS256 — verify against Supabase JWKS
      const result = await jwtVerify(token, jwks);
      payload = result.payload;
    }
    req.userId = payload.sub;
    req.userEmail = payload.email ?? null;

    // Reject banned users
    const { rows } = await db.query(
      'SELECT banned_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (rows[0]?.banned_at) {
      return res.status(403).json({ error: 'Account suspended.' });
    }

    next();
  } catch (e) {
    console.error('JWT verify failed:', e.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { auth };
