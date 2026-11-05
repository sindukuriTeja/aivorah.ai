const firebaseAdmin = require('../services/firebaseAdmin');
const supabase = require('../services/supabase');

// Identity comes only from a verified Firebase ID token, never from query/body params.
async function requireUser(req, res, next) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  if (!firebaseAdmin) return res.status(503).json({ error: 'Auth is not configured on this server' });

  let decoded;
  try {
    decoded = await firebaseAdmin.auth().verifyIdToken(match[1]);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (!decoded.email) return res.status(401).json({ error: 'Token has no email claim' });

  const email = decoded.email.toLowerCase();
  const { data: user, error } = await supabase
    .from('users').select('id, role').eq('email', email).maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not resolve user' });
  if (!user) return res.status(403).json({ error: 'No account found for this identity' });

  req.auth = { uid: decoded.uid, email, userId: user.id, role: user.role };
  next();
}

module.exports = { requireUser };
