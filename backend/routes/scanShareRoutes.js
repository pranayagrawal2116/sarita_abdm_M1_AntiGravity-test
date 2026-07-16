const express = require("express");
const controller = require("../controllers/scanShareController");

const router = express.Router();

router.get("/latest", controller.getLatestScanShareStatus);
router.get("/queue", controller.listScanShareQueue);
router.post("/queue/:tokenNumber/register", controller.markScanShareRegistered);
router.post("/queue/:tokenNumber/skip", controller.skipScanShareToken);

module.exports = router;
