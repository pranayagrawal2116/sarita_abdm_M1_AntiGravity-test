const express = require("express");
const controller = require("../controllers/hipLinkingController");

const router = express.Router();

router.post("/token/generate", controller.generateToken);
router.get("/token/callback/:requestId", controller.getTokenCallback);
router.post("/carecontext", controller.linkCareContext);
router.post("/context/notify", controller.notifyContext);
router.get("/context/notify/callback/:requestId", controller.getContextNotifyCallback);
router.post("/patient/links/sms/notify2", controller.notifyMobile);
router.post("/sms/notify", controller.notifyMobile);

module.exports = router;
