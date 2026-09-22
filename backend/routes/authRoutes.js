const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const router = express.Router();

// Store active sessions: mapping of userId -> current session token
const activeSessions = {};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per `window`
  message: { success: false, message: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Session timeout (10 seconds)
const SESSION_TIMEOUT_MS = 10 * 1000;

router.post('/login', loginLimiter, (req, res) => {
  const { id, password } = req.body;
  if (id === 'Admin' && password === 'Admin@123$') {
    
    // Check if an active session already exists and hasn't timed out
    const existingSession = activeSessions[id];
    if (existingSession && (Date.now() - existingSession.lastActive) < SESSION_TIMEOUT_MS) {
      return res.status(403).json({ 
        success: false, 
        message: 'User is already active on another page. Please close the other tab and wait a few seconds.' 
      });
    }

    // Generate a new session token
    const token = crypto.randomBytes(32).toString('hex');
    activeSessions[id] = { token, lastActive: Date.now() };
    
    return res.status(200).json({ success: true, message: 'Login successful', token });
  } else {
    return res.status(401).json({ success: false, message: 'Incorrect ID or Password' });
  }
});

router.post('/heartbeat', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  
  const token = authHeader.split(' ')[1];
  const userId = Object.keys(activeSessions).find(id => activeSessions[id].token === token);
  
  if (userId) {
    activeSessions[userId].lastActive = Date.now();
    return res.status(200).json({ success: true });
  } else {
    return res.status(401).json({ error: 'Session not found or expired' });
  }
});

router.post('/logout', (req, res) => {
  const { id } = req.body;
  if (id && activeSessions[id]) {
    delete activeSessions[id];
  }
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// Middleware to verify active session
const requireActiveSession = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authentication token' });
  }
  
  const token = authHeader.split(' ')[1];
  
  // Verify token belongs to an active session
  const activeSessionObj = Object.values(activeSessions).find(session => session.token === token);
  
  if (!activeSessionObj || (Date.now() - activeSessionObj.lastActive) > SESSION_TIMEOUT_MS) {
    return res.status(401).json({ error: 'Session expired or invalidated by a new login' });
  }
  
  next();
};

module.exports = { router, requireActiveSession, activeSessions };
