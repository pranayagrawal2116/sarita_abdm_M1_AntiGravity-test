/**
 * Header: m2ConsentRoutes.js
 * Purpose: Express router definition for patient consents.
 * Responsibility: Maps HTTP endpoints to M2ConsentController methods.
 * TODO: Integrate authentication/validation middleware in future prompts.
 */

const express = require("express");
const router = express.Router();
const M2ConsentController = require("../controllers/m2ConsentController");

// Patient-side consent requests
router.post("/sync", M2ConsentController.syncConsentWorkflow);
router.get("/requests", M2ConsentController.listConsentRequests);
router.post("/decision", M2ConsentController.submitConsentDecision);
router.post("/link/context", M2ConsentController.registerLinkedCareContext);

// M2 consent-manager and HI request workflow
router.post("/manager/init", M2ConsentController.initConsentRequest);
router.get("/manager/callbacks/on-init/:requestId", M2ConsentController.fetchConsentInitCallback);
router.get("/manager/callbacks/on-status/:consentId", M2ConsentController.fetchConsentStatusCallback);
router.post("/manager/health-information/request", M2ConsentController.requestHealthInformation);
router.get(
  "/manager/callbacks/health-information/on-request/:requestId",
  M2ConsentController.fetchHealthInformationOnRequest
);
router.get(
  "/manager/callbacks/health-information/notify/:transactionId",
  M2ConsentController.fetchHealthInformationNotify
);
router.post("/manager/health-information/notify", M2ConsentController.notifyHealthInformationTransfer);

module.exports = router;
