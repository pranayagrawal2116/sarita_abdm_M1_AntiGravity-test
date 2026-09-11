const express = require("express");
const M3CallbackController = require("../controllers/m3CallbackController");

const router = express.Router();

router.post([
  "/api/v3/hiu/consent/request/on-init", 
  "/v3/hiu/consent/request/on-init",
  "/v3/consent/requests/on-init",
  "/api/v3/consent/requests/on-init"
], M3CallbackController.onConsentInit);

router.post([
  "/api/v3/hiu/consent/request/on-status", 
  "/v3/hiu/consent/request/on-status",
  "/v3/consent/requests/on-status",
  "/api/v3/consent/requests/on-status"
], M3CallbackController.onConsentStatus);

router.post([
  "/api/v3/hiu/consent/request/notify", 
  "/v3/hiu/consent/request/notify",
  "/v3/consents/hiu/notify",
  "/api/v3/consents/hiu/notify"
], M3CallbackController.hiuNotify);

router.post([
  "/api/v3/hiu/consent/on-fetch", 
  "/v3/hiu/consent/on-fetch",
  "/v3/consents/on-fetch",
  "/api/v3/consents/on-fetch"
], M3CallbackController.onConsentFetch);

router.post([
  "/api/v3/hiu/health-information/on-request", 
  "/v3/hiu/health-information/on-request",
  "/v3/health-information/cm/on-request",
  "/api/v3/health-information/cm/on-request"
], M3CallbackController.onHealthInfoRequest);

router.post([
  "/api/m3/callbacks/v3/health-information/transfer", 
  "/v3/health-information/transfer",
  "/v3/health-information/hiu/on-request",
  "/api/v3/health-information/hiu/on-request"
], M3CallbackController.healthInfoTransfer);

// Subscription Callbacks
router.post(["/api/v3/hiu/hiecm/subscription-requests/on-init", "/api/v3/hiu/subscription-requests/on-init"], M3CallbackController.onSubscriptionInit);
router.post(["/api/v3/hiu/subscription-requests/hiu/notify", "/api/v3/hiu/subscription-requests/notify"], M3CallbackController.subscriptionNotify);
router.post(["/api/v3/hiu/care-context/on-notify", "/api/v3/hiu/subscription/notify"], M3CallbackController.subscriptionContextNotify);

module.exports = router;
