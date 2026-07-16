const express = require("express");
const controller = require("../controllers/hipSetupController");

const router = express.Router();

router.post("/session/check", controller.checkSession);
router.post("/scan-share/run", controller.runScanShareSetup);
router.patch("/bridge/url", controller.updateBridgeUrl);
router.post("/bridge/services/register", controller.registerBridgeServices);
router.get("/bridge-service/:serviceId", controller.findBridgeServiceByServiceId);
router.get("/bridge-services/:bridgeId", controller.findServicesByBridgeId);
router.get("/certs", controller.fetchGatewayCerts);
router.get("/openid-configuration", controller.fetchOpenIdConfiguration);

module.exports = router;
