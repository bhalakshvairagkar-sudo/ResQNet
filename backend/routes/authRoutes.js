const express = require('express');
const auth = require('../services/authService');

module.exports = () => {
  const router = express.Router();

  // 1. Authenticate & Login
  router.post('/login', async (req, res) => {
    try {
      const { username, password } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      const session = await auth.login(username, password);
      if (!session) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const { token, ...user } = session;
      return res.json({ token, user });
    } catch (err) {
      console.error('[AUTH] Login error:', err.message);
      return res.status(500).json({ error: 'Login failed: ' + err.message });
    }
  });

  // 2. Register New User & Intake Profile
  router.post('/register', async (req, res) => {
    try {
      const session = await auth.register(req.body);
      const { token, ...user } = session;
      return res.status(201).json({ token, user });
    } catch (err) {
      console.error('[AUTH] Register error:', err.message);
      return res.status(400).json({ error: err.message });
    }
  });

  // 3. User Medical Intake Profile
  router.get('/medical-profile', auth.authenticate, async (req, res) => {
    try {
      const profile = await auth.getMedicalProfile(req.user.username || req.user.id);
      return res.json(profile || req.user.medicalProfile || null);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.post(['/medical-profile', '/medical-profile/save'], auth.authenticate, async (req, res) => {
    try {
      const updated = await auth.saveMedicalProfile(req.user.username || req.user.id, req.body);
      return res.json({ success: true, medicalProfile: updated });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 4. Logout
  router.post('/logout', auth.authenticate, (req, res) => {
    auth.revoke(auth.getToken(req));
    return res.status(204).end();
  });

  // 5. Current Session Info
  router.get('/me', auth.authenticate, (req, res) => {
    const { token, ...user } = req.user;
    return res.json(user);
  });

  return router;
};
