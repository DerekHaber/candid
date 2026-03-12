const { createRemoteJWKSet, jwtVerify } = require('jose');
const jwt = require('jsonwebtoken');

let jwks;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  return jwks;
}

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
      const result = await jwtVerify(token, getJwks());
      payload = result.payload;
    }
    req.userId = payload.sub;
    req.userEmail = payload.email ?? null;
    next();
  } catch (e) {
    console.error('JWT verify failed:', e.message);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { auth };
