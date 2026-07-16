/**
 * Header: m2AuthController.js
 * Purpose: Handles express requests for TokenManager initialization.
 * Responsibility: Delegate to M2TokenManager to check local storage and auto-authenticate/session setup.
 */

const M2TokenManager = require("../tokens/M2TokenManager");
const Logger = require("../logging/logger");

class M2AuthController {
  /**
   * Initializes the central TokenManager session.
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async initialize(req, res) {
    Logger.info("M2AuthController", "initialize TokenManager route handler triggered.");
    try {
      await M2TokenManager.initialize();
      return res.json({ success: true, message: "M2TokenManager initialized successfully." });
    } catch (err) {
      Logger.error("M2AuthController", "Failed to initialize TokenManager.", err);
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = M2AuthController;
