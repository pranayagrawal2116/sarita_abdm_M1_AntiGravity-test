/**
 * Header: m2DataTransferRoutes.js
 * Purpose: Express router definition for manual transfer triggers and status polling.
 * Responsibility: Maps HTTP endpoints to M2DataTransferController methods.
 * TODO: Integrate validation middleware.
 */

const express = require("express");
const router = express.Router();
const M2DataTransferController = require("../controllers/m2DataTransferController");

// Manual trigger for data transfer
router.post("/push", M2DataTransferController.transferHealthInformation);

// Persisted transfer audit history, newest first
router.get("/history", M2DataTransferController.listTransferHistory);

// Status check endpoint for console timeline polling
router.get("/status/:id", M2DataTransferController.getTransactionStatus);

module.exports = router;
