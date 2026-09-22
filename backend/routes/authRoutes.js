const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const router = express.Router();
require('dotenv').config();

// Store active sessions: mapping of userId -> { sessionId, userId, hospitalId, createdAt, lastHeartbeat }
const activeSessions = {};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const SESSION_STALE_TIMEOUT_MS = parseInt(process.env.SESSION_STALE_TIMEOUT_MS) || 60000;
const ADMIN_ID = process.env.ADMIN_ID || 'Admin';

// Default password hash for 'Admin@123$' using SHA-256 (for safe default if env is missing)
const DEFAULT_PASSWORD_HASH = crypto.createHash('sha256').update('Admin@123$').digest('hex');
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || DEFAULT_PASSWORD_HASH;

router.post('/login', loginLimiter, (req, res) => {
  const { id, password } = req.body;
  
  if (!id || !password) {
    return res.status(400).json({ success: false, message: 'Missing credentials' });
  }

  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

  // Server authenticates user
  if (id === ADMIN_ID && passwordHash === ADMIN_PASSWORD_HASH) {
    const now = Date.now();
    
    // Server checks whether that account already has an active session
    // Atomic check-and-create in Node's single-threaded event loop
    const existingSession = activeSessions[id];
    
    if (existingSession) {
      if ((now - existingSession.lastHeartbeat) < SESSION_STALE_TIMEOUT_MS) {
        // ACTIVE SESSION EXISTS -> reject second login
        return res.status(409).json({ 
          success: false, 
          code: 'ACTIVE_SESSION',
          message: 'This account is already logged in on another device or browser. Please log out from the other session first.' 
        });
      }
      // If stale, it falls through and we overwrite it
    }

    // If no active session (or stale): create exactly one server-side session
    const sessionId = crypto.randomBytes(32).toString('hex');
    activeSessions[id] = {
      sessionId,
      userId: id,
      hospitalId: 'DEFAULT_HOSPITAL', // Set default or pull from config if multi-tenant
      createdAt: now,
      lastHeartbeat: now
    };
    
    return res.status(200).json({ success: true, message: 'Login successful', token: sessionId });
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
  
  // Verify sessionId belongs to an active session
  const sessionEntry = Object.values(activeSessions).find(session => session.sessionId === token);
  
  if (sessionEntry) {
    const now = Date.now();
    // Verify the session has not expired/revoked
    if ((now - sessionEntry.lastHeartbeat) > SESSION_STALE_TIMEOUT_MS) {
       // Stale - cleanup and reject
       delete activeSessions[sessionEntry.userId];
       return res.status(401).json({ error: 'Session expired' });
    }

    // Update lastHeartbeat/lastSeen
    activeSessions[sessionEntry.userId].lastHeartbeat = now;
    return res.status(200).json({ success: true });
  } else {
    return res.status(401).json({ error: 'Session not found or expired' });
  }
});

router.post('/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const sessionEntry = Object.values(activeSessions).find(session => session.sessionId === token);
    
    // Revokes/removes the session
    if (sessionEntry) {
      delete activeSessions[sessionEntry.userId];
    }
  }
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// Middleware to verify active session for protected APIs
const requireActiveSession = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authentication token' });
  }
  
  const token = authHeader.split(' ')[1];
  
  const sessionEntry = Object.values(activeSessions).find(session => session.sessionId === token);
  
  if (!sessionEntry) {
    return res.status(401).json({ error: 'Session not found or invalidated' });
  }

  const now = Date.now();
  if ((now - sessionEntry.lastHeartbeat) > SESSION_STALE_TIMEOUT_MS) {
    delete activeSessions[sessionEntry.userId];
    return res.status(401).json({ error: 'Session expired due to inactivity' });
  }
  
  // Inject context: real request authentication middleware
  req.auth = {
    userId: sessionEntry.userId,
    hospitalId: sessionEntry.hospitalId,
    sessionId: sessionEntry.sessionId
  };
  
  next();
};

module.exports = { router, requireActiveSession, activeSessions };
