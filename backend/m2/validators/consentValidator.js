/**
 * Header: consentValidator.js
 * Purpose: Placeholder validator for consent requests.
 * Responsibility: Provide interfaces for checking consent notification schema models.
 * Public Methods:
 *   - validateNotification(payload)
 * TODO: Implement ABDM Gateway consent notification validation.
 */

const Logger = require("../logging/logger");

class ConsentValidator {
  /**
   * Validates inbound consent notify callback parameters.
   * @param {Object} payload - Callback payload.
   * @returns {string|null} Error message or null.
   */
  static validateNotification(payload) {
    Logger.info("ConsentValidator", "validateNotification stub called.");
    // TODO: Verify requestId and consentId are present
    return null;
  }
}

module.exports = ConsentValidator;
