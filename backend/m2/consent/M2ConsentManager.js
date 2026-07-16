/**
 * Header: M2ConsentManager.js
 * Purpose: Centralized manager responsible for the lifecycle of M2 consents.
 * Responsibility: Create, validate, track, expire, and revoke consents.
 * Methods:
 *   - createConsent(consentData)
 *   - getConsent(consentId)
 *   - validateConsent(consentId)
 *   - updateConsentStatus(consentId, nextStatus, metadata)
 *   - revokeConsent(consentId)
 *   - getConsentState(consentId)
 *   - registerConsentNotification(payload, tx)
 *   - registerConsentAcknowledgement(payload, tx)
 */

const Logger = require("../logging/logger");
const axios = require("axios");
const M2TokenManager = require("../tokens/M2TokenManager");
const M2TransactionStore = require("../transactions/M2TransactionStore");
const M2CallbackManager = require("../callbacks/M2CallbackManager");
const config = require("../helpers/config");
const { getHeaders } = require("../../utils/headers");
const hospitalConfig = require("../../config/hospitalConfig");
const { firstText, extractTransactionIdFromLinkToken } = require("../helpers/identifierUtils");

const VALID_CONSENT_TRANSITIONS = {
  "Requested": ["Active", "Rejected", "Expired"],
  "Active": ["Expired", "Revoked", "Completed"],
  "Rejected": [],
  "Expired": [],
  "Revoked": [],
  "Completed": []
};

class M2ConsentManager {
  constructor() {
    if (M2ConsentManager.instance) {
      return M2ConsentManager.instance;
    }

    // Register callback listeners dynamically to avoid circular dependencies
    M2CallbackManager.registerHandler("Consent Notification", this.registerConsentNotification.bind(this));
    M2CallbackManager.registerHandler("Consent Acknowledgement", this.registerConsentAcknowledgement.bind(this));

    M2ConsentManager.instance = this;
  }

  /**
   * Returns the central Singleton instance.
   * @returns {M2ConsentManager} Singleton instance.
   */
  static getInstance() {
    if (!M2ConsentManager.instance) {
      M2ConsentManager.instance = new M2ConsentManager();
    }
    return M2ConsentManager.instance;
  }

  /**
   * Creates a new consent request structure, gets gateway tokens, and persists transaction state.
   * @param {Object} consentData - Consent setup coordinates.
   * @returns {Promise<Object>} Created consent details model.
   */
  async createConsent(consentData) {
    Logger.info("M2ConsentManager", "Creating consent record.", { patientId: consentData?.patientId });

    try {
      // 1. Obtain gateway credentials through TokenManager ONLY
      const token = await M2TokenManager.getGatewayToken();
      if (!token) {
        throw new Error("Failed to retrieve valid B2B gateway token.");
      }

      // 2. Establish transaction record in Store
      const tempId = consentData.transactionId || `tx_${Date.now()}`;
      const tx = await M2TransactionStore.createTransaction({
        transactionId: tempId,
        requestId: consentData.requestId || `req_${Date.now()}`,
        consentId: consentData.consentId || `consent_${Date.now()}`,
        patientId: consentData.patientId || "",
        currentState: "Created",
        careContexts: consentData.careContexts || []
      });

      // 3. Assemble structured consent details object
      const consentObj = {
        consentId: tx.consentId,
        status: "Requested",
        patientId: tx.patientId,
        hiTypes: consentData.hiTypes || [],
        purpose: consentData.purpose || {},
        dateRange: consentData.dateRange || {},
        expiry: consentData.expiry || (Date.now() + 30 * 24 * 60 * 60 * 1000), // default 30 days
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // 4. Update transaction & append audit trail
      await M2TransactionStore.updateTransaction(tx.transactionId, {
        consentDetails: consentObj
      });

      await M2TransactionStore.appendAuditEvent(tx.transactionId, "CONSENT_CREATED", "Consent request initialized and persisted.", {
        consentId: tx.consentId,
        status: "Requested"
      });

      Logger.info("M2ConsentManager", "Consent record created successfully.", { consentId: tx.consentId });
      return consentObj;
    } catch (err) {
      Logger.error("M2ConsentManager", "Failed to create consent.", err);
      return { status: "error", error: "CREATION_FAILED", message: err.message };
    }
  }

  listConsentRequests() {
    Logger.info("M2ConsentManager", "Listing consent records from M2TransactionStore.");
    return M2TransactionStore.listTransactions()
      .filter((tx) => tx.consentDetails && ["Active", "Requested"].includes(tx.consentDetails.status))
      .map((tx) => ({
        ...tx.consentDetails,
        transactionId: tx.transactionId,
        requestId: tx.requestId,
        consentRequestId: tx.consentRequestId || tx.consentId,
        currentState: tx.currentState
      }));
  }

  async registerHipLinkContext(linkData = {}) {
    const requestId = String(linkData.requestId || linkData.response?.requestId || "").trim();
    if (!requestId) {
      throw new Error("requestId is required to register linked M2 context.");
    }

    const patientEntries = Array.isArray(linkData.patient) ? linkData.patient : [];
    const firstPatient = patientEntries[0] && typeof patientEntries[0] === "object" ? patientEntries[0] : {};
    const firstCareContext = Array.isArray(firstPatient.careContexts) && firstPatient.careContexts[0]
      ? firstPatient.careContexts[0]
      : {};
    const careContextReference = String(
      linkData.careContextReference ||
      firstCareContext.careContextReference ||
      firstCareContext.referenceNumber ||
      ""
    ).trim();
    const abhaAddress = String(linkData.abhaAddress || linkData.AbhaAddress || "").trim();
    const abhaNumber = String(linkData.abhaNumber || linkData.AbhaNumber || linkData.ABHANumber || "").trim();
    const createdTime = linkData.createdTime || new Date().toISOString();
    const linkToken = String(linkData.linkToken || "").trim();
    const tokenTransactionId = extractTransactionIdFromLinkToken(linkToken);

    Logger.info("M2ConsentManager", "HIP Link Created.", {
      requestId,
      abhaAddress,
      careContextReference
    });

    const existing = M2TransactionStore.getTransaction(requestId);
    let tx;
    if (existing) {
      tx = await M2TransactionStore.updateTransaction(requestId, {
        requestId,
        transactionId: firstText(existing.transactionId, tokenTransactionId),
        gatewayRequestId: existing.gatewayRequestId || requestId,
        healthInformationRequestId: existing.healthInformationRequestId || "",
        patient: linkData.patient || existing.patient || {},
        patientId: existing.patientId || abhaAddress,
        abhaAddress: abhaAddress || existing.abhaAddress || "",
        abhaNumber: abhaNumber || existing.abhaNumber || "",
        hipId: linkData.hipId || existing.hipId || "",
        linkToken: linkToken || existing.linkToken || "",
        careContextReference: careContextReference || existing.careContextReference || "",
        careContexts: existing.careContexts?.length ? existing.careContexts : (firstPatient.careContexts || []),
        linkedAt: existing.linkedAt || createdTime,
        createdTime: existing.createdTime || createdTime,
        currentState: existing.currentState || "LINKED",
        linkResponse: linkData.linkResponse || existing.linkResponse || {},
        linkPayload: linkData.linkPayload || existing.linkPayload || {}
      });
    } else {
      tx = await M2TransactionStore.createTransaction({
        requestId,
        transactionId: tokenTransactionId,
        gatewayRequestId: requestId,
        patient: linkData.patient || {},
        patientId: abhaAddress,
        abhaAddress,
        abhaNumber,
        hipId: linkData.hipId || "",
        linkToken,
        careContextReference,
        careContexts: firstPatient.careContexts || [],
        linkedAt: createdTime,
        createdTime,
        currentState: "LINKED",
        linkResponse: linkData.linkResponse || {},
        linkPayload: linkData.linkPayload || {}
      });
    }

    await M2TransactionStore.appendAuditEvent(tx.requestId, "HIP_LINK_CREATED", "HIP Link Created.", {
      requestId,
      careContextReference,
      abhaAddress
    });

    if (["Created", "LINKED"].includes(tx.currentState)) {
      tx = await M2TransactionStore.transitionState(tx.requestId, "WAITING_FOR_CONSENT", {
        requestId,
        reason: "Waiting For Consent"
      });
    }

    Logger.info("M2ConsentManager", "Waiting For Consent.", {
      requestId,
      careContextReference
    });

    return tx || M2TransactionStore.getTransaction(requestId);
  }

  async synchronizeConsentWorkflow() {
    Logger.info("M2ConsentManager", "Starting M2 consent workflow synchronization.");
    const transactions = M2TransactionStore.listTransactions();
    const pendingStates = new Set(["LINKED", "WAITING_FOR_CONSENT", "Created", "CONSENT_GRANTED", "Consent Received"]);
    const results = [];

    for (const tx of transactions) {
      const txKey = tx.requestId || tx.transactionId || tx.consentId;
      if (!txKey || !pendingStates.has(tx.currentState)) continue;

      Logger.info("M2ConsentManager", "Synchronizing pending requestId.", {
        requestId: tx.requestId,
        consentId: tx.consentId,
        currentState: tx.currentState
      });

      if (tx.consentDetails && tx.currentState !== "CONSENT_GRANTED") {
        await M2TransactionStore.transitionState(txKey, "CONSENT_GRANTED", {
          requestId: tx.requestId,
          consentId: tx.consentId,
          reason: "Consent Stored"
        });
      } else if (!tx.consentDetails && tx.currentState === "LINKED") {
        await M2TransactionStore.transitionState(txKey, "WAITING_FOR_CONSENT", {
          requestId: tx.requestId,
          reason: "Waiting For Consent"
        });
      }

      const updated = M2TransactionStore.getTransaction(txKey);
      results.push({
        requestId: updated?.requestId || tx.requestId,
        consentId: updated?.consentId || "",
        currentState: updated?.currentState || tx.currentState,
        hasConsent: Boolean(updated?.consentDetails)
      });
    }

    const consents = this.listConsentRequests();
    Logger.info("M2ConsentManager", "Consent Inbox Updated.", {
      pendingChecked: results.length,
      consentCount: consents.length
    });

    return {
      success: true,
      checked: results.length,
      pending: results,
      consents,
      source: "M2ConsentManager"
    };
  }

  async submitConsentDecision(consentId, decision, metadata = {}) {
    Logger.info("M2ConsentManager", "Submitting consent decision through manager.", { consentId, decision });
    const normalized = String(decision || "").toLowerCase();
    const nextStatus = normalized === "approve" || normalized === "approved" || normalized === "grant" || normalized === "granted"
      ? "Active"
      : "Rejected";
    return this.updateConsentStatus(consentId, nextStatus, {
      ...metadata,
      source: "M2ConsentController"
    });
  }

  /**
   * Retrieves a structured consent details model from the transaction store.
   * @param {string} consentId - Consent identifier.
   * @returns {Object|null} Consent object or null if not found.
   */
  getConsent(consentId) {
    Logger.info("M2ConsentManager", "Querying consent details.", { consentId });
    const tx = M2TransactionStore.getTransaction(consentId);
    return tx?.consentDetails || null;
  }

  /**
   * Asserts structural status and validates expiry schedules.
   * @param {string} consentId - Consent identifier.
   * @returns {Promise<Object>} Validity status.
   */
  async validateConsent(consentId) {
    Logger.info("M2ConsentManager", "Validating consent.", { consentId });
    const consent = this.getConsent(consentId);
    
    if (!consent) {
      return { isValid: false, reason: "Consent record not found." };
    }

    // Auto-expiry check
    if (Date.now() > consent.expiry) {
      Logger.info("M2ConsentManager", "Consent has expired. Transitioning status.", { consentId });
      await this.updateConsentStatus(consentId, "Expired", { reason: "Automated expiry check validation." });
      return { isValid: false, reason: "Consent has expired." };
    }

    if (consent.status !== "Active") {
      return { isValid: false, reason: `Consent is not active. Current status: ${consent.status}` };
    }

    return { isValid: true };
  }

  /**
   * Transitions consent states under validation rule controls.
   * Maps consent status changes to appropriate transaction state changes.
   * @param {string} consentId - Consent identifier.
   * @param {string} nextStatus - Targeted status name.
   * @param {Object} [metadata] - Context log entries.
   * @returns {Promise<Object>} Updated consent details.
   */
  async updateConsentStatus(consentId, nextStatus, metadata = {}) {
    Logger.info("M2ConsentManager", "Updating consent status.", { consentId, nextStatus });
    const tx = M2TransactionStore.getTransaction(consentId);

    if (!tx || !tx.consentDetails) {
      throw new Error(`Consent record with ID ${consentId} not found.`);
    }

    const consent = tx.consentDetails;
    const currentStatus = consent.status;
    if (currentStatus === nextStatus) {
      Logger.info("M2ConsentManager", "Consent status already at requested state.", {
        consentId,
        status: nextStatus
      });
      await M2TransactionStore.appendAuditEvent(tx.transactionId || tx.requestId || consentId, "CONSENT_STATUS_UNCHANGED", `Consent status already "${nextStatus}".`, {
        consentId,
        status: nextStatus,
        metadata
      });
      return consent;
    }

    // Validate state transition rule
    const allowed = VALID_CONSENT_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(nextStatus)) {
      const errorMsg = `Invalid consent state transition from "${currentStatus}" to "${nextStatus}".`;
      Logger.error("M2ConsentManager", errorMsg);
      throw new Error(errorMsg);
    }

    // Apply updates
    consent.status = nextStatus;
    consent.updatedAt = Date.now();

    // Map consent status to transaction state machine where appropriate
    let targetTxState = null;
    if (nextStatus === "Active") {
      targetTxState = "CONSENT_GRANTED";
    } else if (nextStatus === "Rejected") {
      targetTxState = "CONSENT_DENIED";
    } else if (nextStatus === "Expired" || nextStatus === "Revoked") {
      targetTxState = "Failed";
    }

    const transactionKey = tx.transactionId || tx.requestId || consentId;

    await M2TransactionStore.updateTransaction(transactionKey, {
      consentDetails: consent
    });

    if (targetTxState) {
      await M2TransactionStore.transitionState(transactionKey, targetTxState, {
        reason: `Consent status transitioned to ${nextStatus}`,
        metadata
      });
    }

    await M2TransactionStore.appendAuditEvent(transactionKey, "CONSENT_STATUS_UPDATED", `Consent status changed to "${nextStatus}".`, {
      consentId,
      from: currentStatus,
      to: nextStatus,
      metadata
    });

    return consent;
  }

  /**
   * Revokes an active consent structure.
   * @param {string} consentId - Consent identifier.
   * @returns {Promise<Object>} Updated consent details.
   */
  async revokeConsent(consentId) {
    Logger.warn("M2ConsentManager", "Revoking consent.", { consentId });
    return this.updateConsentStatus(consentId, "Revoked", { reason: "User request revocation." });
  }

  /**
   * Retrieves the current status string of the consent object.
   * @param {string} consentId - Consent identifier.
   * @returns {string} Status string.
   */
  getConsentState(consentId) {
    const consent = this.getConsent(consentId);
    return consent ? consent.status : "Unknown";
  }

  /**
   * Callback receiver: registered for "Consent Notification" webhook.
   * @param {Object} payload - Inbound gateway notification structure.
   * @param {Object} tx - Associated transaction context.
   * @returns {Promise<Object>} Result coordinates.
   */
  async registerConsentNotification(payload, tx) {
    Logger.info("M2ConsentManager", "registerConsentNotification callback handler triggered.", {
      consentId: tx.consentId
    });

    const incomingRequestId = payload.requestId || payload.response?.requestId || payload.resp?.requestId || "";
    const workflowRequestId = tx.requestId || tx.gatewayRequestId || "";
    const consentDetail = payload.notification?.consentDetail || payload.notification || {};
    const incomingConsentId = firstText(
      payload.notification?.consentId,
      consentDetail.consentId
    );
    const consentId = incomingConsentId || tx.consentId;
    const patientId = firstText(
      consentDetail.patient?.id,
      payload.notification?.patient?.id,
      tx.patientId,
      tx.abhaAddress
    );
    const careContexts = consentDetail.careContexts || payload.notification?.careContexts || tx.careContexts || [];
    const notificationStatus = payload.notification?.status || "GRANTED";
    const statusMapping = notificationStatus === "DENIED" || notificationStatus === "REVOKED" ? "Rejected" : "Active";
    const permission = consentDetail.permission || payload.notification?.permission || {};
    const hiTypes = consentDetail.hiTypes || payload.notification?.hiTypes || [];
    const receivedTime = new Date().toISOString();
    const signature = payload.notification?.signature || consentDetail.signature || "";
    const transactionKey = tx.transactionId || tx.requestId || tx.consentId;
    const callbackTransactionId = firstText(
      payload.transactionId,
      payload.notification?.transactionId,
      consentDetail.transactionId,
      tx.transactionId,
      extractTransactionIdFromLinkToken(tx.linkToken)
    );

    Logger.info("M2ConsentManager", "Consent Notify Received.", {
      requestId: workflowRequestId,
      incomingRequestId,
      transactionId: callbackTransactionId,
      consentId,
      consentRequestId: tx.consentRequestId || tx.consentId || "",
      consentArtifactId: incomingConsentId || tx.consentArtifactId || "",
      patientId,
      status: notificationStatus
    });

    await M2TransactionStore.updateTransaction(transactionKey, {
      transactionId: callbackTransactionId,
      consentId,
      patientId,
      patient: consentDetail.patient || payload.notification?.patient || tx.patient || {},
      hipId: tx.hipId || consentDetail.hip?.id || payload.notification?.hip?.id || "",
      careContexts,
      consentStatus: notificationStatus,
      permission,
      hiTypes,
      consentDetail,
      consentReceivedAt: receivedTime,
      consentSignature: signature,
      consentNotifyPayload: payload,
      gatewayRequestId: incomingRequestId || tx.gatewayRequestId || tx.requestId,
      consentDetails: {
        ...(tx.consentDetails || {}),
        consentId,
        consentRequestId: tx.consentRequestId || tx.consentId || "",
        consentArtifactId: incomingConsentId || tx.consentDetails?.consentArtifactId || "",
        status: "Requested",
        patientId,
        patient: consentDetail.patient || payload.notification?.patient || {},
        hip: consentDetail.hip || payload.notification?.hip || {},
        hiTypes,
        permission,
        purpose: consentDetail.purpose || payload.notification?.purpose || {},
        dateRange: permission.dateRange || consentDetail.dateRange || {},
        expiry: permission.dataEraseAt
          ? new Date(permission.dataEraseAt).getTime()
          : Date.now() + 30 * 24 * 60 * 60 * 1000,
        receivedTime,
        signature,
        createdAt: tx.consentDetails?.createdAt || Date.now(),
        updatedAt: Date.now(),
        rawNotification: payload
      }
    });

    Logger.info("M2ConsentManager", "Consent Stored.", {
      requestId: workflowRequestId,
      consentId,
      receivedTime
    });

    const consent = await this.updateConsentStatus(consentId, statusMapping, {
      source: "Gateway Notification Callback",
      requestId: workflowRequestId,
      incomingRequestId
    });

    let acknowledgement = null;
    if (incomingRequestId) {
      acknowledgement = await this.sendConsentOnNotifyAcknowledgement({
        requestId: incomingRequestId,
        consentId,
        status: "ok"
      });
    } else {
      Logger.info("M2ConsentManager", "Consent Notify acknowledgement skipped because ABDM callback did not include requestId.", {
        requestId: workflowRequestId,
        consentId
      });
    }

    Logger.info("M2ConsentManager", "Consent notification persisted and acknowledged.", {
      requestId: workflowRequestId,
      consentId,
      transactionId: tx.transactionId || tx.requestId,
      status: consent.status
    });

    Logger.info("M2ConsentManager", "Consent Inbox Updated.", {
      requestId: workflowRequestId,
      consentId
    });

    return { success: true, consentId, status: consent.status, acknowledgement };
  }

  async sendConsentOnNotifyAcknowledgement({ requestId, consentId, status }) {
    if (!requestId) {
      throw new Error("Cannot send consent on-notify acknowledgement without original gateway requestId.");
    }
    const token = await M2TokenManager.getGatewayToken();
    const baseHeaders = getHeaders(token);
    const headers = {
      ...baseHeaders,
      "X-HIP-ID": process.env.HIP_ID || hospitalConfig.hipId
    };
    const body = {
      acknowledgement: {
        status,
        consentId
      },
      response: {
        requestId
      }
    };

    Logger.info("M2ConsentManager", "Sending Consent HIP on-notify acknowledgement.", {
      endpoint: `${config.gatewayBaseUrl}${config.gatewayConsentOnNotifyPath}`,
      requestId,
      consentId,
      body
    });

    const response = await axios.post(
      `${config.gatewayBaseUrl}${config.gatewayConsentOnNotifyPath}`,
      body,
      { headers }
    );

    return {
      statusCode: response.status,
      requestId,
      body
    };
  }

  /**
   * Callback receiver: registered for "Consent Acknowledgement".
   * @param {Object} payload - Inbound gateway acknowledgement structure.
   * @param {Object} tx - Associated transaction context.
   * @returns {Promise<Object>} Result coordinates.
   */
  async registerConsentAcknowledgement(payload, tx) {
    Logger.info("M2ConsentManager", "registerConsentAcknowledgement callback handler triggered.", {
      consentId: tx.consentId
    });

    const consent = await this.updateConsentStatus(tx.consentId, "Active", {
      source: "Gateway Acknowledgement Callback",
      requestId: payload.requestId
    });

    return { success: true, consentId: tx.consentId, status: consent.status };
  }

  // --- Static wrappers to preserve class-level calls for backward compatibility ---

  static async createConsent(consentData) {
    return this.getInstance().createConsent(consentData);
  }

  static getConsent(consentId) {
    return this.getInstance().getConsent(consentId);
  }

  static listConsentRequests() {
    return this.getInstance().listConsentRequests();
  }

  static async submitConsentDecision(consentId, decision, metadata) {
    return this.getInstance().submitConsentDecision(consentId, decision, metadata);
  }

  static async registerHipLinkContext(linkData) {
    return this.getInstance().registerHipLinkContext(linkData);
  }

  static async synchronizeConsentWorkflow() {
    return this.getInstance().synchronizeConsentWorkflow();
  }

  static async validateConsent(consentId) {
    return this.getInstance().validateConsent(consentId);
  }

  static async updateConsentStatus(consentId, nextStatus, metadata) {
    return this.getInstance().updateConsentStatus(consentId, nextStatus, metadata);
  }

  static async revokeConsent(consentId) {
    return this.getInstance().revokeConsent(consentId);
  }

  static getConsentState(consentId) {
    return this.getInstance().getConsentState(consentId);
  }

  static async registerConsentNotification(payload, tx) {
    // If called statically, get instance and run
    // Since callback manager invokes the resolved method, it will bind properly
    const txContext = tx || M2TransactionStore.getTransaction(payload.notification?.consentId || payload.consentId);
    return this.getInstance().registerConsentNotification(payload, txContext);
  }

  static async acknowledgeConsent(consentId) {
    // Legacy mapping support: updates status to Active (Consent Received)
    return this.getInstance().updateConsentStatus(consentId, "Active", { reason: "Legacy acknowledgeConsent call" });
  }
}

// Export singleton instance
module.exports = M2ConsentManager.getInstance();
