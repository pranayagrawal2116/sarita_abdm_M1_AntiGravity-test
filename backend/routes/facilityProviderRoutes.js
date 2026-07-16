const express = require("express");
const controller = require("../controllers/facilityProviderController");

const router = express.Router();

router.get("/providers", controller.searchProviders);
router.get("/providers/:providerId", controller.getProviderById);

module.exports = router;
