/**
 * Header: m3AuthRoutes.js
 * Purpose: Express router definition for M3 Auth and Registration.
 * Responsibility: Maps HTTP endpoints to M3AuthController.
 */

const express = require("express");
const router = express.Router();
const M3AuthController = require("../controllers/m3AuthController");

// POST Session API (Generate Token)
router.post("/session", M3AuthController.generateSession);

// PATCH Update Bridge URL
router.patch("/bridge/url", M3AuthController.updateBridgeUrl);

// POST Registration of bridge services (HIP/HIU)
router.post("/bridge/services", M3AuthController.registerBridgeServices);

// GET Find Bridge Service By Service ID
router.get("/bridge-service/:serviceId", M3AuthController.findBridgeByServiceId);

// GET Find Services By Bridge ID
router.get("/bridge-services", M3AuthController.findServicesByBridgeId);

// GET certs
router.get("/certs", M3AuthController.getCertificates);

// GET openid-configuration
router.get("/openid-configuration", M3AuthController.getOpenIdConfiguration);

module.exports = router;
