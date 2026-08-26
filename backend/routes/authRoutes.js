const express = require('express');
const auth = require('../services/authService');
module.exports = () => {
  const router = express.Router();
  router.post('/login', (req, res) => { const session = auth.login(req.body.username, req.body.password); if (!session) return res.status(401).json({ error: 'Invalid credentials' }); const { token, ...user } = session; res.json({ token, user }); });
  router.post('/logout', auth.authenticate, (req, res) => { auth.revoke(auth.getToken(req)); res.status(204).end(); });
  router.get('/me', auth.authenticate, (req, res) => { const { token, ...user } = req.user; res.json(user); });
  return router;
};
