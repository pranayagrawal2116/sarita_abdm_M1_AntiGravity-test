/**
 * Header: m2AuthRoutes.js
 * Purpose: Express router definition for M2 TokenManager initialization.
 * Responsibility: Maps HTTP endpoints to M2AuthController.
 */

const express = require("express");
const router = express.Router();
const M2AuthController = require("../controllers/m2AuthController");

router.post("/initialize", M2AuthController.initialize);

module.exports = router;
