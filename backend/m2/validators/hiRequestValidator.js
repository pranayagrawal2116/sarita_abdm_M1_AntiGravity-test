/**
 * Header: hiRequestValidator.js
 * Purpose: Placeholder validator for health information requests.
 * Responsibility: Provide interfaces for checking HIRequest structures.
 * Public Methods:
 *   - validateRequest(payload)
 * TODO: Implement HI request keys and nonce format checking.
 */

const Logger = require("../logging/logger");

class HiRequestValidator {
  /**
   * Validates Gateway HIRequest payload fields.
   * @param {Object} payload - request payload from Gateway.
   * @returns {string|null} Error description or null.
   */
  static validateRequest(payload) {
    Logger.info("HiRequestValidator", "validateRequest stub called.");
    // TODO: Verify keyMaterial, transactionId, consentId and dataPushUrl are present
    return null;
  }
}

module.exports = HiRequestValidator;
