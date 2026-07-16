/**
 * Header: M2HealthInformationRequestManager.js
 * Purpose: Centralized coordinator for the Health Information Request lifecycle on the HIU side.
 * Responsibility: Create, validate, track, cancel, and expire HI Requests, integrating with TokenManager and TransactionStore.
 * Methods:
 *   - createRequest(consentId, patientId, dateRange)
 *   - validateRequest(requestId)
 *   - getRequestStatus(requestId)
 *   - cancelRequest(requestId)
 *   - expireRequest(requestId)
 *   - registerExpectedCallback(callbackRequestId, transactionId)
 *   - handleOnRequestCallback(payload, tx)
 */

const { v4: uuidv4 } = require("uuid");
const Logger = require("../logging/logger");
const M2TokenManager = require("../tokens/M2TokenManager");
const M2TransactionStore = require("../transactions/M2TransactionStore");
const M2ConsentManager = require("../consent/M2ConsentManager");
const M2CallbackManager = require("../callbacks/M2CallbackManager");
const { firstText, extractTransactionIdFromLinkToken } = require("../helpers/identifierUtils");

const VALID_REQUEST_TRANSITIONS = {
  "Created": ["Submitted", "Cancelled"],
  "Submitted": ["Acknowledged", "Failed", "Cancelled"],
  "Acknowledged": ["WaitingForData", "Completed", "Failed", "Cancelled", "Expired"],
  "WaitingForData": ["Completed", "Failed", "Cancelled", "Expired"],
  "Completed": [],
  "Failed": [],
  "Cancelled": [],
  "Expired": []
};

class M2HealthInformationRequestManager {
  constructor() {
    if (M2HealthInformationRequestManager.instance) {
      return M2HealthInformationRequestManager.instance;
    }

    // Register callback dynamically to avoid circular references
    M2CallbackManager.registerHandler("HIU On-Request", this.handleOnRequestCallback.bind(this));

    M2HealthInformationRequestManager.instance = this;
  }

  /**
   * Returns the central Singleton instance.
   * @returns {M2HealthInformationRequestManager} Singleton instance.
   */
  static getInstance() {
    if (!M2HealthInformationRequestManager.instance) {
      M2HealthInformationRequestManager.instance = new M2HealthInformationRequestManager();
    }
    return M2HealthInformationRequestManager.instance;
  }

  /**
   * Initiates a new health information flow request on the HIU side.
   * @param {string} consentId - Consent identifier.
   * @param {string} patientId - Patient identifier.
   * @param {Object} [dateRange] - Specific request date range (optional).
   * @returns {Promise<Object>} Assembled request details.
   */
  async createRequest(consentId, patientId, dateRange = null) {
    Logger.info("M2HealthInformationRequestManager", "Initializing health information request.", { consentId, patientId });

    try {
      // 1. Retrieve and validate consent using ConsentManager
      const consent = M2ConsentManager.getConsent(consentId);
      if (!consent) {
        throw new Error("Consent record not found.");
      }

      // Check active and expiry constraints
      const validation = await M2ConsentManager.validateConsent(consentId);
      if (!validation.isValid) {
        throw new Error(`Consent is invalid: ${validation.reason}`);
      }

      // Check patient match
      if (consent.patientId !== patientId) {
        throw new Error("Consent patientScope mismatch for the requested patient.");
      }

      // 2. Resolve the ABDM transaction before any outbound gateway work.
      const requestId = `req_${uuidv4()}`;
      
      const existingTx = M2TransactionStore.getTransaction(consentId);
      if (!existingTx) {
        throw new Error("Parent consent transaction not found for HI Request.");
      }
      
      let transactionId = firstText(
        existingTx.transactionId,
        extractTransactionIdFromLinkToken(existingTx.linkToken)
      );
      if (!transactionId) {
        throw new Error(
          "Parent consent transaction is missing the ABDM transactionId. Re-sync/re-link the care context so the link token transactionId is persisted; refusing to fabricate a transactionId."
        );
      }

      // 3. Obtain gateway credentials using TokenManager ONLY
      const token = await M2TokenManager.getGatewayToken();
      if (!token) {
        throw new Error("Gateway authentication failed. Token not available.");
      }

      await M2TransactionStore.updateTransaction(transactionId, {
        transactionId,
        hiRequestId: requestId,
        patientId,
        currentState: "Created"
      });

      const requestDetails = {
        requestId,
        transactionId,
        consentId,
        patientId,
        status: "Created",
        dateRange: dateRange || consent.dateRange,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      await M2TransactionStore.updateTransaction(transactionId, {
        hiRequestDetails: requestDetails
      });

      await M2TransactionStore.appendAuditEvent(transactionId, "HI_REQUEST_CREATED", "Health Information Request initialized in database.", {
        requestId,
        consentId
      });

      // 4. Update request to Submitted
      await M2TransactionStore.transitionState(transactionId, "Submitted", {
        reason: "Request submitted to ABDM Gateway"
      });

      requestDetails.status = "Submitted";
      requestDetails.updatedAt = Date.now();

      await M2TransactionStore.updateTransaction(transactionId, {
        hiRequestDetails: requestDetails
      });

      await M2TransactionStore.appendAuditEvent(transactionId, "HI_REQUEST_SUBMITTED", "Health Information Request submitted to Gateway.", {
        requestId
      });

      Logger.info("M2HealthInformationRequestManager", "Health information request submitted.", { requestId });
      return requestDetails;
    } catch (err) {
      Logger.error("M2HealthInformationRequestManager", "Failed to create health information request.", err);
      throw err;
    }
  }

  /**
   * Asserts request existence and integrity.
   * @param {string} requestId - Request identifier.
   * @returns {Promise<Object>} Validation report.
   */
  async validateRequest(requestId) {
    Logger.info("M2HealthInformationRequestManager", "Validating health information request.", { requestId });
    const tx = M2TransactionStore.getTransaction(requestId);

    if (!tx || !tx.hiRequestDetails) {
      return { isValid: false, reason: "Request not found." };
    }

    const details = tx.hiRequestDetails;
    if (details.status === "Cancelled" || details.status === "Failed" || details.status === "Expired") {
      return { isValid: false, reason: `Request is in terminal state: ${details.status}` };
    }

    return { isValid: true };
  }

  /**
   * Retrieves current request status.
   * @param {string} requestId - Request identifier.
   * @returns {string} Status string.
   */
  getRequestStatus(requestId) {
    const tx = M2TransactionStore.getTransaction(requestId);
    return tx ? tx.currentState : "Unknown";
  }

  /**
   * Transitions request state to Cancelled.
   * @param {string} requestId - Request identifier.
   * @returns {Promise<Object>} Request details.
   */
  async cancelRequest(requestId) {
    Logger.warn("M2HealthInformationRequestManager", "Cancelling health information request.", { requestId });
    const tx = M2TransactionStore.getTransaction(requestId);
    if (!tx || !tx.hiRequestDetails) {
      throw new Error("Request not found.");
    }

    await M2TransactionStore.transitionState(tx.transactionId, "Cancelled", {
      reason: "User initiated cancellation."
    });

    const details = tx.hiRequestDetails;
    details.status = "Cancelled";
    details.updatedAt = Date.now();

    await M2TransactionStore.updateTransaction(tx.transactionId, {
      hiRequestDetails: details
    });

    await M2TransactionStore.appendAuditEvent(tx.transactionId, "HI_REQUEST_CANCELLED", "Request cancelled by user.", {
      requestId
    });

    return details;
  }

  /**
   * Transitions request state to Expired.
   * @param {string} requestId - Request identifier.
   * @returns {Promise<Object>} Request details.
   */
  async expireRequest(requestId) {
    Logger.warn("M2HealthInformationRequestManager", "Expiring health information request.", { requestId });
    const tx = M2TransactionStore.getTransaction(requestId);
    if (!tx || !tx.hiRequestDetails) {
      throw new Error("Request not found.");
    }

    await M2TransactionStore.transitionState(tx.transactionId, "Expired", {
      reason: "Request lifespan expired."
    });

    const details = tx.hiRequestDetails;
    details.status = "Expired";
    details.updatedAt = Date.now();

    await M2TransactionStore.updateTransaction(tx.transactionId, {
      hiRequestDetails: details
    });

    await M2TransactionStore.appendAuditEvent(tx.transactionId, "HI_REQUEST_EXPIRED", "Request marked as expired.", {
      requestId
    });

    return details;
  }

  /**
   * Registers a expected callback log for tracking.
   * @param {string} callbackRequestId - Expected callback ID.
   * @param {string} transactionId - Transaction identifier.
   * @returns {Promise<void>}
   */
  async registerExpectedCallback(callbackRequestId, transactionId) {
    Logger.info("M2HealthInformationRequestManager", "Registering expected callback tracker.", {
      callbackRequestId,
      transactionId
    });
    await M2TransactionStore.appendAuditEvent(transactionId, "EXPECTED_CALLBACK_REGISTERED", "Registered expected callback token.", {
      callbackRequestId
    });
  }

  /**
   * Handles incoming acknowledgements from the Gateway.
   * @param {Object} payload - Callback body.
   * @param {Object} tx - Associated transaction.
   * @returns {Promise<Object>} Processing result.
   */
  async handleOnRequestCallback(payload, tx) {
    Logger.info("M2HealthInformationRequestManager", "Processing gateway acknowledgment callback.", {
      requestId: tx.requestId
    });

    try {
      const details = tx.hiRequestDetails || {};
      
      if (payload.error) {
        Logger.error("M2HealthInformationRequestManager", "Gateway returned error acknowledgment.", payload.error);
        
        await M2TransactionStore.transitionState(tx.transactionId, "Failed", {
          reason: `Gateway Error: ${payload.error.message}`
        });

        details.status = "Failed";
        details.error = payload.error;
        details.updatedAt = Date.now();

        await M2TransactionStore.updateTransaction(tx.transactionId, {
          hiRequestDetails: details
        });

        return { success: false, status: "Failed", error: payload.error };
      }

      // If callback classification transitioned state to Acknowledged, update local payload details
      details.status = "Acknowledged";
      details.updatedAt = Date.now();

      await M2TransactionStore.updateTransaction(tx.transactionId, {
        hiRequestDetails: details
      });

      return { success: true, status: "Acknowledged" };
    } catch (err) {
      Logger.error("M2HealthInformationRequestManager", "Error handling onRequest callback.", err);
      throw err;
    }
  }

  // --- Static wrappers for singleton calls ---

  static async createRequest(consentId, patientId, dateRange) {
    return this.getInstance().createRequest(consentId, patientId, dateRange);
  }

  static async validateRequest(requestId) {
    return this.getInstance().validateRequest(requestId);
  }

  static getRequestStatus(requestId) {
    return this.getInstance().getRequestStatus(requestId);
  }

  static async cancelRequest(requestId) {
    return this.getInstance().cancelRequest(requestId);
  }

  static async expireRequest(requestId) {
    return this.getInstance().expireRequest(requestId);
  }

  static async registerExpectedCallback(callbackRequestId, transactionId) {
    return this.getInstance().registerExpectedCallback(callbackRequestId, transactionId);
  }
}

module.exports = M2HealthInformationRequestManager.getInstance();
