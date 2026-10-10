const crypto = require('crypto');
const db = require('../database/db');

const hospitalDemoUsers = [
  { username: 'sassoon_trauma01', password: 'Sassoon@RQN26!', role: 'HOSPITAL', resourceId: 'HOSP-01', fullName: 'Sassoon General Hospital / BJGMC' },
  { username: 'rubyhall_emergency01', password: 'Ruby@RQN26#', role: 'HOSPITAL', resourceId: 'HOSP-02', fullName: 'Ruby Hall Clinic – Sassoon Road' },
  { username: 'jehangir_trauma01', password: 'Jehangir@RQN26!', role: 'HOSPITAL', resourceId: 'HOSP-03', fullName: 'Jehangir Hospital' },
  { username: 'ranka_emergency01', password: 'Ranka@RQN26#', role: 'HOSPITAL', resourceId: 'HOSP-04', fullName: 'Ranka Hospital' },
  { username: 'noble_trauma01', password: 'Noble@RQN26!', role: 'HOSPITAL', resourceId: 'HOSP-05', fullName: 'Noble Hospital, Hadapsar' },
  { username: 'sancheti_trauma01', password: 'Sancheti@RQN26#', role: 'HOSPITAL', resourceId: 'HOSP-06', fullName: 'Sancheti Hospital' },
  { username: 'dmh_emergency01', password: 'DMH@RQN26!p7', role: 'HOSPITAL', resourceId: 'HOSP-07', fullName: 'Deenanath Mangeshkar Hospital' },
  { username: 'sahyadri_emergency01', password: 'Sahyadri@RQN26#', role: 'HOSPITAL', resourceId: 'HOSP-08', fullName: 'Sahyadri Super Speciality – Nagar Road' },
  { username: 'aims_emergency01', password: 'AIMS@RQN26!', role: 'HOSPITAL', resourceId: 'HOSP-09', fullName: 'AIMS Hospital, Aundh' },
  { username: 'bharati_trauma01', password: 'Bharati@RQN26#', role: 'HOSPITAL', resourceId: 'HOSP-10', fullName: 'Bharati Hospital & Research Centre' },
  { username: 'lokmanya_trauma01', password: 'Lokmanya@RQN26!', role: 'HOSPITAL', resourceId: 'HOSP-11', fullName: 'Lokmanya Hospital, Pune' },
  { username: 'zplus_accident01', password: 'ZPlus@RQN26#', role: 'HOSPITAL', resourceId: 'HOSP-12', fullName: 'Z Plus Accident Hospital, Hadapsar' },
  { username: 'metro_trauma01', password: 'Metro@RQN26!', role: 'HOSPITAL', resourceId: 'HOSP-13', fullName: 'Metro Superspeciality Hospital & Trauma Center, Wagholi' },
  { username: 'global_emergency01', password: 'Global@RQN26#', role: 'HOSPITAL', resourceId: 'HOSP-14', fullName: 'Global Multispeciality Hospital, Dighi' },
  { username: 'ycm_emergency01', password: 'YCM@RQN26!', role: 'HOSPITAL', resourceId: 'HOSP-15', fullName: 'YCM Hospital, Pimpri' }
];

const ambulanceDemoUsers = [
  { resourceId: 'AMB-01', usernames: ['ambulance1', 'amb-01', 'amb01', 'amb_shivajinagar'], password: 'Amb01@RQN26!', role: 'AMBULANCE', fullName: 'Ambulance Unit 01 – Shivajinagar Hub (ALS)', station: 'Shivajinagar Hub', type: 'ALS' },
  { resourceId: 'AMB-02', usernames: ['ambulance2', 'amb-02', 'amb02', 'amb_swargate'], password: 'Amb02@RQN26!', role: 'AMBULANCE', fullName: 'Ambulance Unit 02 – Swargate Central (ALS)', station: 'Swargate Central', type: 'ALS' },
  { resourceId: 'AMB-03', usernames: ['ambulance3', 'amb-03', 'amb03', 'amb_punestation'], password: 'Amb03@RQN26!', role: 'AMBULANCE', fullName: 'Ambulance Unit 03 – Pune Station Base (BLS)', station: 'Pune Station Base', type: 'BLS' },
  { resourceId: 'AMB-04', usernames: ['ambulance4', 'amb-04', 'amb04', 'amb_kothrud'], password: 'Amb04@RQN26!', role: 'AMBULANCE', fullName: 'Ambulance Unit 04 – Kothrud Depot (ALS)', station: 'Kothrud Depot', type: 'ALS' },
  { resourceId: 'AMB-05', usernames: ['ambulance5', 'amb-05', 'amb05', 'amb_aundh'], password: 'Amb05@RQN26!', role: 'AMBULANCE', fullName: 'Ambulance Unit 05 – Aundh Smart Point (ALS)', station: 'Aundh Smart Point', type: 'ALS' },
  { resourceId: 'AMB-06', usernames: ['ambulance6', 'amb-06', 'amb06', 'amb_hadapsar'], password: 'Amb06@RQN26!', role: 'AMBULANCE', fullName: 'Ambulance Unit 06 – Hadapsar Rapid Hub (ALS)', station: 'Hadapsar Rapid Hub', type: 'ALS' },
  { resourceId: 'AMB-07', usernames: ['ambulance7', 'amb-07', 'amb07', 'amb_hinjewadi'], password: 'Amb07@RQN26!', role: 'AMBULANCE', fullName: 'Ambulance Unit 07 – Hinjewadi IT Depot (ALS)', station: 'Hinjewadi IT Depot', type: 'ALS' }
];

// Demo credentials for quick out-of-the-box evaluations and automated test backwards compatibility
const password = process.env.DEMO_PASSWORD || 'configurable-demo-password';
const demoUsers = [
  { username: process.env.COMMAND_CENTER_USER || 'operator', role: 'COMMAND_CENTER', fullName: 'Emergency Operations Command' },
  { username: process.env.USER_DEMO_USER || 'user1', role: 'USER', resourceId: process.env.USER_DEMO_USER || 'user1', fullName: 'Demo Citizen' },
  ...['1', '2', '3', '4', '5', '6', '7'].map(n => ({ username: `ambulance${n}`, role: 'AMBULANCE', resourceId: `AMB-${n.padStart(2, '0')}`, fullName: `Ambulance Unit ${n}` })),
  ...['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'].map(n => ({ username: `hospital${n}`, role: 'HOSPITAL', resourceId: `HOSP-${n.padStart(2, '0')}`, fullName: `Trauma Center ${n}` }))
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
  const existingDemo = demoUsers.find(u => u.username === username) || 
                       hospitalDemoUsers.find(u => u.username === username) ||
                       ambulanceDemoUsers.find(u => u.usernames.includes(username));
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

  // 2. Check 15 Pune Hospital Demo Credentials from Table 2
  const hospUser = hospitalDemoUsers.find(u => u.username.toLowerCase() === cleanUsername);
  if (hospUser) {
    if (cleanPass === hospUser.password) {
      const token = crypto.randomBytes(32).toString('hex');
      const session = {
        id: hospUser.resourceId,
        username: hospUser.username,
        fullName: hospUser.fullName,
        role: 'HOSPITAL',
        resourceId: hospUser.resourceId,
        hasCompletedMedicalProfile: true,
        token,
        createdAt: new Date().toISOString()
      };
      sessions.set(token, session);
      return session;
    }
  }

  // 3. Check 7 Pune Ambulance Fleet Demo Credentials
  const ambUser = ambulanceDemoUsers.find(u => u.usernames.map(x => x.toLowerCase()).includes(cleanUsername));
  if (ambUser) {
    if (cleanPass === ambUser.password || cleanPass === password || cleanPass === 'Ambulance@2026' || cleanPass === 'resqnet2026') {
      const token = crypto.randomBytes(32).toString('hex');
      const session = {
        id: ambUser.resourceId,
        username: cleanUsername,
        fullName: ambUser.fullName,
        role: 'AMBULANCE',
        resourceId: ambUser.resourceId,
        hasCompletedMedicalProfile: true,
        token,
        createdAt: new Date().toISOString()
      };
      sessions.set(token, session);
      return session;
    }
  }

  // 4. Backward Compatibility with generic Demo Accounts
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
  hashPassword,
  hospitalDemoUsers,
  ambulanceDemoUsers
};

