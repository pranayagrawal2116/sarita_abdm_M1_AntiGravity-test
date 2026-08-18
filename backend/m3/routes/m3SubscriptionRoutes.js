const express = require("express");
const M3SubscriptionController = require("../controllers/m3SubscriptionController");

const router = express.Router();

router.get("/requests", M3SubscriptionController.getSubscriptionRequests);
router.post("/init", M3SubscriptionController.initSubscription);
router.post("/:id/approve", M3SubscriptionController.approveSubscription);
router.post("/:id/deny", M3SubscriptionController.denySubscription);
router.put("/patients/:id", M3SubscriptionController.editSubscription);

module.exports = router;
