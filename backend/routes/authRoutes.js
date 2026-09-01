const express = require('express');
const auth = require('../services/authService');

module.exports = () => {
  const router = express.Router();

  // 1. User Registration (Custom Credentials)
  router.post('/register', async (req, res) => {
    try {
      const session = await auth.register(req.body);
      const { token, ...user } = session;
      return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        token,
        user
      });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });

  // 2. User Sign-In (Database + Demo Fallback)
  router.post('/login', async (req, res) => {
    try {
      const session = await auth.login(req.body.username, req.body.password);
      if (!session) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      const { token, ...user } = session;
      return res.json({ token, user });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. User Sign-Out
  router.post('/logout', auth.authenticate, (req, res) => {
    auth.revoke(auth.getToken(req));
    return res.status(204).end();
  });

  // 4. Current User Session
  router.get('/me', auth.authenticate, async (req, res) => {
    try {
      const profile = await auth.getMedicalProfile(req.user.username);
      const { token, ...user } = req.user;
      return res.json({ ...user, medicalProfile: profile });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 5. Retrieve Emergency Medical Profile
  router.get('/medical-profile', auth.authenticate, async (req, res) => {
    try {
      const profile = await auth.getMedicalProfile(req.user.username);
      return res.json({ success: true, profile });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6. Save / Update Emergency Medical Profile (Google Form Intake)
  router.post(['/medical-profile', '/profile/medical'], auth.authenticate, async (req, res) => {
    try {
      const savedProfile = await auth.saveMedicalProfile(req.user.username, req.body);
      return res.json({
        success: true,
        message: 'Medical Emergency Profile saved and encrypted into ResQNet Response Vault',
        profile: savedProfile
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
};

