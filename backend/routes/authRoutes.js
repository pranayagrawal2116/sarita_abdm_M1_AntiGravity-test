const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per `window` (here, per 15 minutes)
  message: { success: false, message: 'Too many login attempts from this IP, please try again after 15 minutes' },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

router.post('/login', loginLimiter, (req, res) => {
  const { id, password } = req.body;
  if (id === 'Admin' && password === 'Admin@123$') {
    return res.status(200).json({ success: true, message: 'Login successful' });
  } else {
    return res.status(401).json({ success: false, message: 'Incorrect ID or Password' });
  }
});

module.exports = router;
