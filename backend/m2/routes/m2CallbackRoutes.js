/**
 * Header: m2CallbackRoutes.js
 * Purpose: Express router definition for incoming gateway callback webhooks.
 * Responsibility: Maps gateway webhook paths to M2CallbackController handlers.
 * TODO: Add gateway IP whitelist and signature check middleware.
 */

const express = require("express");
const router = express.Router();
const M2CallbackController = require("../controllers/m2CallbackController");

// Consent notifications callback
router.post(
  [
    "/api/v3/consent/request/hip/notify",
    "/v3/consent/request/hip/notify",
    "/api/v3/consent/request/hip/on-notify",
    "/v3/consent/request/hip/on-notify"
  ],
  M2CallbackController.onHipConsentNotify
);

router.post(
  ["/api/v3/consent/request/on-init", "/v3/consent/request/on-init"],
  M2CallbackController.onConsentRequestInit
);

router.post(
  ["/api/v3/consent/request/on-status", "/v3/consent/request/on-status"],
  M2CallbackController.onConsentRequestStatus
);

// Health information HIP request callbacks
router.post(
  [
    "/api/v3/health-information/hip/request",
    "/v3/health-information/hip/request",
    "/api/v3/hip/health-information/request",
    "/v3/hip/health-information/request",
    "/api/v3/health-information/hip/on-request",
    "/v3/health-information/hip/on-request"
  ],
  M2CallbackController.handleHipRequest
);
router.post(
  [
    "/api/v3/health-information/on-request",
    "/v3/health-information/on-request",
    "/api/v3/hiu/health-information/on-request",
    "/v3/hiu/health-information/on-request"
  ],
  M2CallbackController.onHealthInformationOnRequest
);

router.post(
  [
    "/api/v3/health-information/notify",
    "/v3/health-information/notify",
    "/api/v3/hiu/health-information/notify",
    "/v3/hiu/health-information/notify"
  ],
  M2CallbackController.onHealthInformationNotify
);

router.post("/api/m2/callbacks/:type", M2CallbackController.receive);
router.post("/api/m2/callbacks", M2CallbackController.receive);

module.exports = router;
