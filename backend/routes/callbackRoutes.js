const express = require("express");
const router = express.Router();

// Consent callback
router.post("/consent/on-status", (req, res) => {
  console.log("Consent Status:", "<omitted for security>");
  res.status(200).send({});
});

// Data callback
router.post("/data/on-fetch", (req, res) => {
  console.log("Health Data:", "<omitted for security>");
  res.status(200).send({});
});

module.exports = router;