const crypto = require('crypto');

// Demo credentials are server-only and can be overridden without touching the UI.
const password = process.env.DEMO_PASSWORD || 'configurable-demo-password';
const users = [
  { username: process.env.COMMAND_CENTER_USER || 'operator', role: 'COMMAND_CENTER' },
  { username: process.env.USER_DEMO_USER || 'user1', role: 'USER', resourceId: process.env.USER_DEMO_USER || 'user1' },
  ...['1', '2', '3', '4', '5'].map(n => ({ username: `ambulance${n}`, role: 'AMBULANCE', resourceId: `AMB-${n.padStart(2, '0')}` })),
  ...['1', '2', '3', '4'].map(n => ({ username: `hospital${n}`, role: 'HOSPITAL', resourceId: `HOSP-${n.padStart(2, '0')}` }))
];
const sessions = new Map();
function login(username, suppliedPassword) {
  const user = users.find(u => u.username === String(username).toLowerCase());
  const suppliedHash = crypto.createHash('sha256').update(String(suppliedPassword || '')).digest();
  const passwordHash = crypto.createHash('sha256').update(password).digest();
  if (!user || !crypto.timingSafeEqual(suppliedHash, passwordHash)) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const session = { ...user, token, createdAt: new Date().toISOString() };
  sessions.set(token, session); return session;
}
function getToken(req) { const value = req.get('authorization') || ''; return value.startsWith('Bearer ') ? value.slice(7) : null; }
function authenticate(req, res, next) { const session = sessions.get(getToken(req)); if (!session) return res.status(401).json({ error: 'Authentication required' }); req.user = session; next(); }
function allow(...roles) { return (req, res, next) => !roles.includes(req.user.role) ? res.status(403).json({ error: 'Insufficient role' }) : next(); }
function revoke(token) { sessions.delete(token); }
function socketSession(token) { return sessions.get(token) || null; }
module.exports = { login, authenticate, allow, revoke, getToken, socketSession };
