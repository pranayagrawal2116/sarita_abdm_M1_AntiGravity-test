const express = require('express');
const router = express.Router();

router.post('/login', (req, res) => {
  const { id, password } = req.body;
  if (id === 'Admin' && password === 'Admin@123$') {
    return res.status(200).json({ success: true, message: 'Login successful' });
  } else {
    return res.status(401).json({ success: false, message: 'Incorrect ID or Password' });
  }
});

module.exports = router;
