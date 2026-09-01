const crypto = require('crypto');
const db = require('../database/db');

// Demo credentials for quick out-of-the-box evaluations and automated test backwards compatibility
const password = process.env.DEMO_PASSWORD || 'configurable-demo-password';
const demoUsers = [
  { username: process.env.COMMAND_CENTER_USER || 'operator', role: 'COMMAND_CENTER', fullName: 'Emergency Operations Command' },
  { username: process.env.USER_DEMO_USER || 'user1', role: 'USER', resourceId: process.env.USER_DEMO_USER || 'user1', fullName: 'Demo Citizen' },
  ...['1', '2', '3', '4', '5'].map(n => ({ username: `ambulance${n}`, role: 'AMBULANCE', resourceId: `AMB-${n.padStart(2, '0')}`, fullName: `Ambulance Unit ${n}` })),
  ...['1', '2', '3', '4'].map(n => ({ username: `hospital${n}`, role: 'HOSPITAL', resourceId: `HOSP-${n.padStart(2, '0')}`, fullName: `Trauma Center ${n}` }))
];

const sessions = new Map();

function hashPassword(plainPassword, salt) {
  return crypto.createHash('sha256').update(String(plainPassword) + salt).digest('hex');
}

async function register(userData) {
  const username = String(userData.username || '').toLowerCase().trim();
  const rawPassword = String(userData.password || '').trim();
  const fullName = String(userData.fullName || userData.name || '').trim();
  const phone = String(userData.phone || '').trim();
  const email = String(userData.email || '').trim();
  const role = ['USER', 'CITIZEN', 'AMBULANCE', 'HOSPITAL', 'COMMAND_CENTER'].includes(userData.role) 
    ? (userData.role === 'CITIZEN' ? 'USER' : userData.role) 
    : 'USER';

  if (!username || username.length < 3) {
    throw new Error('Username must be at least 3 characters long');
  }
  if (!rawPassword || rawPassword.length < 4) {
    throw new Error('Password must be at least 4 characters long');
  }

  // Check if username already exists in DB
  const existingDb = await db.findUserByUsername(username);
  if (existingDb) {
    throw new Error(`Username "${username}" is already taken. Please choose another.`);
  }

  // Check demo accounts collision
  const existingDemo = demoUsers.find(u => u.username === username);
  if (existingDemo) {
    throw new Error(`Username "${username}" is reserved by the system.`);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(rawPassword, salt);

  const resourceId = userData.resourceId || (
    role === 'AMBULANCE' ? `AMB-${Date.now().toString().slice(-2)}` :
    role === 'HOSPITAL' ? `HOSP-${Date.now().toString().slice(-2)}` :
    `USER-${Date.now().toString().slice(-6)}`
  );

  const newUserRecord = {
    username,
    passwordHash,
    salt,
    fullName: fullName || username,
    phone,
    email,
    role,
    resourceId,
    medicalProfile: {
      bloodGroup: userData.bloodGroup || 'UNKNOWN',
      allergies: Array.isArray(userData.allergies) ? userData.allergies : (userData.allergies ? [userData.allergies] : []),
      chronicConditions: Array.isArray(userData.chronicConditions) ? userData.chronicConditions : (userData.chronicConditions ? [userData.chronicConditions] : []),
      currentMedications: userData.currentMedications || '',
      primaryContact: {
        name: userData.emergencyContactName || '',
        phone: userData.emergencyContactPhone || '',
        relation: userData.emergencyContactRelation || 'Primary Contact'
      },
      isComplete: false
    }
  };

  const created = await db.createUser(newUserRecord);
  const token = crypto.randomBytes(32).toString('hex');
  const session = {
    id: created._id || created.id || username,
    username: created.username,
    fullName: created.fullName,
    phone: created.phone,
    role: created.role,
    resourceId: created.resourceId,
    hasCompletedMedicalProfile: false,
    token,
    createdAt: new Date().toISOString()
  };

  sessions.set(token, session);
  return session;
}

async function login(username, suppliedPassword) {
  const cleanUsername = String(username || '').toLowerCase().trim();
  const cleanPass = String(suppliedPassword || '');

  // 1. Check Registered Database Users First
  const dbUser = await db.findUserByUsername(cleanUsername);
  if (dbUser && dbUser.salt && dbUser.passwordHash) {
    const computedHash = hashPassword(cleanPass, dbUser.salt);
    if (computedHash === dbUser.passwordHash) {
      const token = crypto.randomBytes(32).toString('hex');
      const session = {
        id: dbUser._id || dbUser.id || dbUser.username,
        username: dbUser.username,
        fullName: dbUser.fullName || dbUser.username,
        phone: dbUser.phone,
        role: dbUser.role || 'USER',
        resourceId: dbUser.resourceId || `USER-${dbUser.username}`,
        hasCompletedMedicalProfile: !!(dbUser.medicalProfile?.isComplete),
        medicalProfile: dbUser.medicalProfile || null,
        token,
        createdAt: new Date().toISOString()
      };
      sessions.set(token, session);
      return session;
    }
  }

  // 2. Backward Compatibility with Demo Accounts
  const demoUser = demoUsers.find(u => u.username === cleanUsername);
  if (demoUser) {
    const suppliedHash = crypto.createHash('sha256').update(cleanPass).digest();
    const passwordHash = crypto.createHash('sha256').update(password).digest();
    if (crypto.timingSafeEqual(suppliedHash, passwordHash)) {
      const token = crypto.randomBytes(32).toString('hex');
      const session = {
        ...demoUser,
        hasCompletedMedicalProfile: true,
        token,
        createdAt: new Date().toISOString()
      };
      sessions.set(token, session);
      return session;
    }
  }

  return null;
}

async function saveMedicalProfile(usernameOrId, profileData) {
  const updated = await db.saveMedicalProfile(usernameOrId, profileData);
  // Update in-memory active session if matching
  for (const session of sessions.values()) {
    if (session.username === usernameOrId || session.id === usernameOrId) {
      session.hasCompletedMedicalProfile = true;
      session.medicalProfile = updated;
    }
  }
  return updated;
}

async function getMedicalProfile(usernameOrId) {
  return await db.getMedicalProfile(usernameOrId);
}

function getToken(req) {
  const value = req.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

function authenticate(req, res, next) {
  const token = getToken(req);
  const session = token ? sessions.get(token) : null;
  if (!session) return res.status(401).json({ error: 'Authentication required' });
  req.user = session;
  next();
}

function allow(...roles) {
  return (req, res, next) => !roles.includes(req.user.role) ? res.status(403).json({ error: 'Insufficient role' }) : next();
}

function revoke(token) {
  sessions.delete(token);
}

function socketSession(token) {
  return sessions.get(token) || null;
}

module.exports = {
  login,
  register,
  saveMedicalProfile,
  getMedicalProfile,
  authenticate,
  allow,
  revoke,
  getToken,
  socketSession,
  hashPassword
};

