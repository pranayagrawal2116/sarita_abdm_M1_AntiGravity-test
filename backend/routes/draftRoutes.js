const express = require("express");
const router = express.Router();
const controller = require("../controllers/draftController");

router.post("/save", controller.saveDraft);

module.exports = router;
