const express = require("express");
const M3ConsentController = require("../controllers/m3ConsentController");

const router = express.Router();

router.post("/init", M3ConsentController.initConsentRequest);
router.get("/requests", M3ConsentController.getConsentRequests);
router.post("/fetch", M3ConsentController.fetchConsentArtefact);
router.post("/data/request", M3ConsentController.requestHealthData);
router.post("/status", M3ConsentController.checkConsentStatus);
router.post("/data/notify", M3ConsentController.dataFlowNotify);
router.get("/documents", M3ConsentController.getHealthDocuments);
router.get("/documents/:docId/pdf", M3ConsentController.getHealthDocumentPdf);

module.exports = router;
