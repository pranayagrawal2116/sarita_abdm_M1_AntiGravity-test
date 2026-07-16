/**
 * Header: M2HealthInformationManager.js
 * Purpose: Manages inbound Gateway health information request calls.
 * Responsibility: Parse incoming HIRequest parameters and post on-request response metadata.
 * Public Methods:
 *   - registerHIRequest(payload)
 *   - acknowledgeHIRequest(consentId)
 * TODO: Implement HI request validations and gateway POST /on-request call.
 */

const Logger = require("../logging/logger");

class M2HealthInformationManager {
  /**
   * Validates and registers an incoming Gateway HIRequest call.
   * @param {Object} payload - request body from gateway.
   * @returns {Promise<Object>} Updated transaction object stub.
   */
  static async registerHIRequest(payload) {
    Logger.info("M2HealthInformationManager", "registerHIRequest method stub called.", {
      transactionId: payload?.transactionId,
      consentId: payload?.hiRequest?.consent?.id
    });
    // TODO: Extract keys, validate formats, update state to HI_REQUEST_RECEIVED
    return { status: "HI_REQUEST_RECEIVED" };
  }

  /**
   * Dispatches session status acknowledgement back to the Gateway.
   * @param {string} consentId - Consent ID.
   * @returns {Promise<void>}
   */
  static async acknowledgeHIRequest(consentId) {
    Logger.info("M2HealthInformationManager", "acknowledgeHIRequest method stub called.", { consentId });
    // TODO: Dispatch on-request response and update state to HI_REQUEST_ACKNOWLEDGED
  }
}

module.exports = M2HealthInformationManager;
