const express = require("express");
const router = express.Router();
const controller = require("../controllers/fileController");

router.post("/write", controller.writeFile);
router.post("/read", controller.readFile);

module.exports = router;
