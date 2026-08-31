/**
 * Header: M2CallbackManager.js
 * Purpose: Centralized gateway callback logic coordinator for Milestone 2.
 * Responsibility: Parse, validate, classify, verify state transitions, deduplicate, and dispatch incoming callbacks.
 * Methods:
 *   - receiveCallback(payload)
 *   - validateCallback(payload)
 *   - classifyCallback(payload)
 *   - processCallback(payload)
 *   - detectDuplicate(tx, callbackRequestId)
 *   - dispatchCallback(type, payload, tx)
 *   - appendAudit(id, eventType, message, details)
 *   - getCallbackStatus(callbackRequestId)
 *   - registerHandler(type, handler)
 */

const Logger = require("../logging/logger");
const M2TransactionStore = require("../transactions/M2TransactionStore");
const { firstText, extractTransactionIdFromLinkToken } = require("../helpers/identifierUtils");

const TRANSITION_RULES = {
  "Consent Notification": {
    validFrom: [
      "Created",
      "LINKED",
      "WAITING_FOR_CONSENT",
      "CONSENT_GRANTED",
      "Authentication Ready",
      "Session Ready",
      "Submitted",
      "Consent Received",
      "HI Request Received",
      "FHIR Generated",
      "Encryption Started",
      "Encryption Completed",
      "Data Push Started",
      "Data Push Completed",
      "Notify Sent",
      "Completed",
      "Failed",
      "Retry Pending",
      "Acknowledged",
      "WaitingForData"
    ],
    nextState: "CONSENT_GRANTED"
  },
  "Consent Acknowledgement": {
    validFrom: ["Created", "Authentication Ready"],
    nextState: "Consent Received"
  },
  "Health Information Request": {
    validFrom: [
      "Created", 
      "Consent Received", 
      "CONSENT_GRANTED", 
      "HI Request Received", 
      "Acknowledged", 
      "FHIR Generated", 
      "Encryption Started", 
      "Encryption Completed", 
      "Data Push Started", 
      "Data Push Completed", 
      "Notify Sent", 
      "Completed", 
      "Failed",
      "Retry Pending"
    ],
    nextState: "HI Request Received"
  },
  "Health Information Notify": {
    validFrom: ["HI Request Received", "Acknowledged", "FHIR Generated", "Encryption Started", "Encryption Completed", "Data Push Started", "Data Push Completed"],
    nextState: "Notify Sent"
  },
  "Data Push Response": {
    validFrom: ["Encryption Completed", "Data Push Started"],
    nextState: "Data Push Completed"
  },
  "Transfer Completion": {
    validFrom: ["Data Push Completed", "Notify Sent"],
    nextState: "Completed"
  },
  "HIU On-Request": {
    validFrom: ["Submitted", "Created"],
    nextState: "Acknowledged"
  }
};

class M2CallbackManager {
  constructor() {
    if (M2CallbackManager.instance) {
      return M2CallbackManager.instance;
    }
    this.handlers = new Map();
    M2CallbackManager.instance = this;
  }

  /**
   * Returns the central Singleton instance.
   * @returns {M2CallbackManager} Singleton instance.
   */
  static getInstance() {
    if (!M2CallbackManager.instance) {
      M2CallbackManager.instance = new M2CallbackManager();
    }
    return M2CallbackManager.instance;
  }

  /**
   * Registers a dynamic business handler for a specific callback type.
   * @param {string} type - Callback classification name.
   * @param {Function} handler - Async callback function.
   */
  registerHandler(type, handler) {
    Logger.info("M2CallbackManager", `Registered business handler for type: ${type}`);
    this.handlers.set(type, handler);
  }

  /**
   * High-level entry point validating and initiating processing.
   * @param {Object} payload - Incoming gateway callback payload.
   * @returns {Promise<Object>} Structured result object.
   */
  async receiveCallback(payload) {
    const startTime = Date.now();
    const extractedRequestId = this.extractRequestId(payload);
    Logger.info("M2CallbackManager", "Callback received.", { requestId: extractedRequestId });

    try {
      // 1. Classification must happen before requestId validation because Consent HIP Notify
      // callbacks from ABDM do not always include requestId/response.requestId/resp.requestId.
      const type = this.classifyCallback(payload);
      if (type === "Unknown") {
        Logger.warn("M2CallbackManager", "Unknown callback type classified.");
        return { status: "error", error: "UNKNOWN_TYPE", message: "Unknown callback type classified." };
      }
      Logger.info("M2CallbackManager", "Callback classified.", { type });

      // 2. Basic Validation
      const validation = this.validateCallback(payload, type);
      if (!validation.isValid) {
        Logger.warn("M2CallbackManager", "Callback validation failed.", { reason: validation.reason });
        return { status: "error", error: "INVALID_PAYLOAD", message: validation.reason };
      }

      // 3. Process callback
      const result = await this.processCallback(type, payload);
      
      const duration = Date.now() - startTime;
      const logMeta = {
        type,
        durationMs: duration,
        status: result.status
      };
      if (result.status === "error") {
        Logger.warn("M2CallbackManager", "Callback processing completed with error.", logMeta);
      } else {
        Logger.info("M2CallbackManager", "Callback processed successfully.", logMeta);
      }

      return result;
    } catch (err) {
      Logger.error("M2CallbackManager", "Uncaught error while processing callback.", err);
      return { status: "error", error: "INTERNAL_ERROR", message: err.message };
    }
  }

  /**
   * Performs basic schema validation checks on the payload.
   * @param {Object} payload - Callback payload.
   * @returns {Object} Validation status and message.
   */
  validateCallback(payload, type = "") {
    if (!payload || typeof payload !== "object") {
      return { isValid: false, reason: "Payload must be a non-null object." };
    }
    if (type === "Consent Notification") {
      if (!payload.notification || typeof payload.notification !== "object") {
        return { isValid: false, reason: "Consent Notify payload must contain notification." };
      }
      if (!payload.notification.consentId && !payload.notification.consentDetail?.consentId) {
        return { isValid: false, reason: "Consent Notify payload must contain notification.consentId." };
      }
      return { isValid: true };
    }
    if (!this.extractRequestId(payload)) {
      return { isValid: false, reason: "Payload must contain requestId in requestId, response.requestId, or resp.requestId." };
    }
    return { isValid: true };
  }

  /**
   * Classifies the payload into one of the supported types based on schema signatures.
   * @param {Object} payload - Callback payload.
   * @returns {string} Callback type classification.
   */
  classifyCallback(payload) {
    if (!payload) return "Unknown";

    if (payload.acknowledgement && payload.response?.requestId) {
      return "Consent Acknowledgement";
    }

    if (payload.hiRequest?.transactionId && payload.response?.requestId) {
      return "HIU On-Request";
    }

    if (payload.notification?.statusNotification && payload.notification?.transactionId) {
      return "Health Information Notify";
    }

    if (payload.notification && (payload.notification.consentId || payload.notification.consentDetail)) {
      return "Consent Notification";
    }

    if (payload.hiRequest && (payload.hiRequest.consent || payload.hiRequest.dataPushUrl || payload.hiRequest.keyMaterial)) {
      return "Health Information Request";
    }

    // Consent Acknowledgement
    if (payload.resp && payload.consentId) {
      return "Consent Acknowledgement";
    }

    // HIU On-Request
    if (payload.hiRequest && payload.resp && !payload.transactionId) {
      return "HIU On-Request";
    }

    // Health Information Notify
    if (payload.notification && payload.notification.status && !payload.notification.consentId) {
      return "Health Information Notify";
    }

    // Data Push Response
    if (payload.transactionId && payload.transferStatus) {
      return "Data Push Response";
    }

    // Transfer Completion
    if (payload.transactionId && payload.status === "COMPLETED") {
      return "Transfer Completion";
    }

    return "Unknown";
  }

  /**
   * Resolves transaction context, performs duplicate checks, state matching, and persistence update.
   * @param {string} type - Callback classification.
   * @param {Object} payload - Gateway payload.
   * @returns {Promise<Object>} Processing result coordinates.
   */
  async processCallback(type, payload) {
    const callbackRequestId = this.extractRequestId(payload);
    let lookupId = this._extractIdentifier(type, payload);
    let matchMeta = null;

    if (type === "Consent Notification") {
      const match = this.findConsentNotificationTransaction(payload);
      if (!match.tx) {
        Logger.warn("M2CallbackManager", "Consent Notify callback could not be matched to a waiting M2 transaction.", {
          consentId: payload.notification?.consentId || payload.notification?.consentDetail?.consentId || "",
          patientId: this.extractNotificationPatientId(payload),
          hipId: this.extractNotificationHipId(payload),
          careContextReferences: this.extractNotificationCareContextReferences(payload)
        });
        lookupId = payload.notification?.consentId || payload.notification?.consentDetail?.consentId || callbackRequestId;
        matchMeta = match;
      } else {
        lookupId = match.tx.requestId || match.tx.transactionId || match.tx.consentId;
        matchMeta = match;
      }
      Logger.info("M2CallbackManager", match.reason, {
        requestId: match.tx?.requestId || lookupId,
        consentId: payload.notification?.consentId || payload.notification?.consentDetail?.consentId || "",
        careContextReferences: match.careContextReferences,
        patientId: match.patientId,
        hipId: match.hipId
      });
      Logger.info("M2CallbackManager", "Matched Transaction.", {
        requestId: match.tx?.requestId || lookupId,
        currentState: match.tx?.currentState || "Created"
      });
    }

    if (!lookupId) {
      return { status: "error", error: "MISSING_IDENTIFIER", message: "No lookup identifier found in callback." };
    }

    // 1. Transaction Retrieval or Creation
    let tx = M2TransactionStore.getTransaction(lookupId);
    if (!tx && matchMeta?.tx) {
      tx = matchMeta.tx;
    }

    if (!tx) {
      Logger.info("M2CallbackManager", "Transaction not found. Initializing new record.", { lookupId });
      
      // Auto-create transaction for initial consent notification
      tx = await M2TransactionStore.createTransaction({
        transactionId: this.extractTransactionId(payload, {}),
        requestId: callbackRequestId || lookupId,
        gatewayRequestId: callbackRequestId || lookupId,
        consentId: payload.notification?.consentId || payload.notification?.consentDetail?.consentId || payload.hiRequest?.consent?.id || payload.consentId || "",
        consentRequestId: payload.notification?.consentRequestId || payload.notification?.consentDetail?.consentId || "",
        patientId: this.extractNotificationPatientId(payload),
        abhaAddress: this.extractNotificationPatientId(payload),
        hipId: this.extractNotificationHipId(payload),
        healthInformationRequestId: type === "Health Information Request" ? callbackRequestId : "",
        dataPushUrl: payload.hiRequest?.dataPushUrl || "",
        receiverPublicKey: payload.hiRequest?.keyMaterial?.dhPublicKey?.keyValue || "",
        receiverNonce: payload.hiRequest?.keyMaterial?.nonce || "",
        careContexts: payload.notification?.consentDetail?.careContexts || payload.notification?.careContexts || [],
        currentState: "Created"
      });
    } else {
      const incomingTransactionId = this.extractTransactionId(payload, tx);
      const incomingConsentId = payload.notification?.consentId || payload.notification?.consentDetail?.consentId || payload.hiRequest?.consent?.id || payload.consentId || "";
      const incomingPatientId = this.extractNotificationPatientId(payload);
      
      const updatePayload = {
        transactionId: incomingTransactionId,
        gatewayRequestId: callbackRequestId || tx.gatewayRequestId,
        consentId: type === "Consent Notification" ? (incomingConsentId || tx.consentId || "") : (tx.consentId || incomingConsentId),
        consentRequestId: tx.consentRequestId || payload.notification?.consentRequestId || payload.notification?.consentDetail?.consentId || "",
        patientId: type === "Consent Notification" ? (incomingPatientId || tx.patientId || "") : tx.patientId,
        abhaAddress: type === "Consent Notification" ? (incomingPatientId || tx.abhaAddress || "") : tx.abhaAddress,
        healthInformationRequestId: type === "Health Information Request" ? callbackRequestId : tx.healthInformationRequestId,
        dataPushUrl: payload.hiRequest?.dataPushUrl || tx.dataPushUrl || "",
        receiverPublicKey: payload.hiRequest?.keyMaterial?.dhPublicKey?.keyValue || tx.receiverPublicKey || "",
        receiverNonce: payload.hiRequest?.keyMaterial?.nonce || tx.receiverNonce || "",
        careContexts: payload.notification?.consentDetail?.careContexts || payload.notification?.careContexts || tx.careContexts || []
      };

      if (type === "Health Information Request" && incomingTransactionId && tx.transactionId && incomingTransactionId !== tx.transactionId) {
        // Prevent concurrent data transfer flows from overwriting each other's transactionId
        // by creating a cloned child transaction for the new HI Request.
        Logger.info("M2CallbackManager", "Spawning new transaction record for concurrent HI Request.", { incomingTransactionId, existingTransactionId: tx.transactionId });
        tx = await M2TransactionStore.createTransaction({
          ...tx,
          ...updatePayload,
          dataPushAcknowledgement: null,
          dataPushError: null,
          dataPushResult: null,
          dataPushPayload: null,
          auditHistory: [],
          callbackHistory: [],
          currentState: "Created"
        });
      } else {
        tx = await M2TransactionStore.updateTransaction(tx.transactionId || tx.requestId, updatePayload);
      }
    }

    const transactionId = tx.transactionId || tx.requestId;
    Logger.info("M2CallbackManager", "Transaction located.", { transactionId });

    // 2. Duplicate Callback Detection (Idempotency check)
    const isDuplicate = this.detectDuplicate(tx, callbackRequestId || `${type}:${payload.notification?.consentId || ""}`);
    if (isDuplicate) {
      Logger.warn("M2CallbackManager", "Duplicate callback request detected. Avoiding redundant transitions.", {
        callbackRequestId
      });

      await this.appendAudit(transactionId, "DUPLICATE_CALLBACK_RECEIVED", `Duplicate callback "${type}" rejected.`, {
        callbackRequestId,
        consentId: payload.notification?.consentId || payload.notification?.consentDetail?.consentId || ""
      });

      return { status: "success", duplicate: true, transactionId, currentState: tx.currentState };
    }

    // 3. State Transition Rule Validation
    const rule = TRANSITION_RULES[type];
    if (rule) {
      const allowedFrom = new Set(rule.validFrom);
      if (!allowedFrom.has(tx.currentState)) {
        const errorMsg = `Transition to state "${rule.nextState}" from "${tx.currentState}" is invalid for callback "${type}".`;
        Logger.warn("M2CallbackManager", errorMsg, { transactionId });

        await this.appendAudit(transactionId, "INVALID_STATE_TRANSITION_ATTEMPTED", errorMsg, {
          callbackRequestId,
          targetState: rule.nextState,
          currentState: tx.currentState
        });

        return {
          status: "error",
          error: "INVALID_STATE_TRANSITION",
          message: errorMsg,
          transactionId,
          currentState: tx.currentState
        };
      }
    }

    // 4. Audit callback reception
    await this.appendAudit(transactionId, "CALLBACK_RECEIVED", `Callback "${type}" processed.`, {
      callbackRequestId,
      type,
      consentId: payload.notification?.consentId || payload.notification?.consentDetail?.consentId || "",
      matchReason: matchMeta?.reason || ""
    });

    // 5. Update state transition
    let updatedTx = tx;
    if (rule) {
      updatedTx = await M2TransactionStore.transitionState(transactionId, rule.nextState, {
        callbackRequestId,
        sourceCallback: type
      });
    }

    // 6. Dispatch to Registered Handler
    const dispatchResult = await this.dispatchCallback(type, payload, updatedTx);
    if (dispatchResult.error) {
      return {
        status: "error",
        error: "HANDLER_FAILED",
        message: dispatchResult.error,
        transactionId,
        currentState: updatedTx.currentState,
        dispatchResult
      };
    }

    return {
      status: "success",
      duplicate: false,
      transactionId,
      currentState: updatedTx.currentState,
      dispatched: dispatchResult.dispatched !== false,
      dispatchResult
    };
  }

  /**
   * Verifies if callbackRequestId is recorded in the transaction's audit logs.
   * @param {Object} tx - Transaction record.
   * @param {string} callbackRequestId - Unique callback message identifier.
   * @returns {boolean} Status.
   */
  detectDuplicate(tx, callbackRequestId) {
    if (!tx || !callbackRequestId) return false;
    const auditHistory = Array.isArray(tx.auditHistory) ? tx.auditHistory : [];
    const callbackHistory = Array.isArray(tx.callbackHistory) ? tx.callbackHistory : [];
    return [...auditHistory, ...callbackHistory].some(event => event.details?.callbackRequestId === callbackRequestId);
  }

  /**
   * Invokes dynamically registered handlers for callback processing.
   * @param {string} type - Callback classification.
   * @param {Object} payload - Callback payload.
   * @param {Object} tx - Current transaction state model.
   * @returns {Promise<Object>} Dispatch processing status.
   */
  async dispatchCallback(type, payload, tx) {
    if (this.handlers.has(type)) {
      const handler = this.handlers.get(type);
      Logger.info("M2CallbackManager", "Dispatching callback to dynamic business handler.", { type });
      try {
        const res = await handler(payload, tx);
        return { dispatched: true, result: res };
      } catch (err) {
        Logger.error("M2CallbackManager", `Error executing handler for type: ${type}`, err);
        return { dispatched: true, error: err.message };
      }
    }

    Logger.info("M2CallbackManager", "No handler registered for callback classification target.", { type });
    return { dispatched: false, reason: "No handler registered." };
  }

  /**
   * Appends an audit event to a transaction log via store interfaces.
   * @param {string} id - Transaction key lookup.
   * @param {string} eventType - Audit event type name.
   * @param {string} message - Descriptive log line.
   * @param {Object} details - Metadata parameters.
   * @returns {Promise<Object>}
   */
  async appendAudit(id, eventType, message, details) {
    return M2TransactionStore.appendAuditEvent(id, eventType, message, details);
  }

  /**
   * Scans store transaction models to locate the current callback status mapping.
   * @param {string} callbackRequestId - Callback request key lookup.
   * @returns {Object|null} Matching transaction state details or null.
   */
  getCallbackStatus(callbackRequestId) {
    Logger.info("M2CallbackManager", "Searching for callback request status.", { callbackRequestId });
    const transactions = M2TransactionStore.listTransactions();
    
    for (const tx of transactions) {
      const matchEvent = tx.auditHistory.find(event => event.details?.callbackRequestId === callbackRequestId);
      if (matchEvent) {
        return {
          callbackRequestId,
          transactionId: tx.transactionId,
          processedAt: matchEvent.timestamp,
          eventType: matchEvent.eventType,
          transactionState: tx.currentState
        };
      }
    }

    return null;
  }

  /**
   * Helper extracting primary transaction or consent ID lookup.
   */
  _extractIdentifier(type, payload) {
    const requestId = this.extractRequestId(payload);
    if (type === "Consent Notification") {
      return requestId || payload.notification?.consentId || payload.notification?.consentDetail?.consentId || payload.consentId;
    }
    if (type === "Health Information Request") {
      return payload.hiRequest?.consent?.id || payload.transactionId || payload.hiRequest?.transactionId || requestId;
    }
    if (type === "HIU On-Request") {
      return payload.response?.requestId || payload.resp?.requestId || payload.hiRequest?.transactionId;
    }
    return payload.notification?.transactionId || payload.transactionId || payload.consentId || requestId;
  }

  extractRequestId(payload) {
    return (
      payload?.requestId ||
      payload?.response?.requestId ||
      payload?.resp?.requestId ||
      payload?.acknowledgement?.requestId ||
      ""
    );
  }

  extractTransactionId(payload, tx = {}) {
    return firstText(
      payload?.transactionId,
      payload?.hiRequest?.transactionId,
      payload?.response?.transactionId,
      payload?.resp?.transactionId,
      payload?.notification?.transactionId,
      payload?.notification?.statusNotification?.transactionId,
      tx?.transactionId,
      extractTransactionIdFromLinkToken(tx?.linkToken)
    );
  }

  findConsentNotificationTransaction(payload) {
    const transactions = M2TransactionStore.listTransactions();
    const careContextReferences = this.extractNotificationCareContextReferences(payload);
    const patientId = this.extractNotificationPatientId(payload);
    const hipId = this.extractNotificationHipId(payload);
    
    // 1. Try exact match by consentId (for status updates)
    const consentId = payload.notification?.consentId || payload.notification?.consentDetail?.consentId;
    if (consentId) {
      const tx = transactions.find(t => t.consentId === consentId || t.consentDetails?.consentId === consentId);
      if (tx) {
        return { tx, reason: "Matched by exact consentId", careContextReferences, patientId, hipId };
      }
    }

    // 2. Only look at transactions waiting for consent
    const waiting = transactions.filter((item) => item.currentState === "WAITING_FOR_CONSENT");

    if (careContextReferences.length > 0) {
      const tx = waiting.find((item) => this.transactionCareContextReferences(item)
        .some((ref) => careContextReferences.some((callbackRef) =>
          this.sameCareContextReference(ref, callbackRef)
        )));
      if (tx) {
        return { tx, reason: "Matched WAITING_FOR_CONSENT by CareContextReference", careContextReferences, patientId, hipId };
      }
    }

    if (patientId && hipId) {
      const tx = waiting.find((item) =>
        this.sameText(item.patientId || item.abhaAddress, patientId) &&
        this.sameText(item.hipId, hipId)
      );
      if (tx) {
        return { tx, reason: "Matched WAITING_FOR_CONSENT by PatientAndHIP", careContextReferences, patientId, hipId };
      }
    }

    if (waiting.length === 1) {
      const item = waiting[0];
      const patientMatches = patientId ? this.sameText(item.patientId || item.abhaAddress, patientId) : true;
      const hipMatches = hipId ? this.sameText(item.hipId, hipId) : true;
      if (patientMatches && hipMatches) {
        return {
          tx: item,
          reason: "Matched by SingleWaitingPatientHIP",
          careContextReferences,
          patientId,
          hipId
        };
      }
    }

    return { tx: null, reason: "NoMatch", careContextReferences, patientId, hipId };
  }

  extractNotificationCareContextReferences(payload) {
    const detail = payload?.notification?.consentDetail || payload?.notification || {};
    const contexts = [
      ...(Array.isArray(detail.careContexts) ? detail.careContexts : []),
      ...(Array.isArray(payload?.notification?.careContexts) ? payload.notification.careContexts : [])
    ];
    return contexts
      .map((item) => String(item?.careContextReference || item?.referenceNumber || item?.id || "").trim())
      .filter(Boolean);
  }

  extractNotificationPatientId(payload) {
    const detail = payload?.notification?.consentDetail || {};
    return String(
      payload?.notification?.patient?.id ||
      detail?.patient?.id ||
      ""
    ).trim();
  }

  extractNotificationHipId(payload) {
    const detail = payload?.notification?.consentDetail || {};
    return String(
      payload?.notification?.hip?.id ||
      detail?.hip?.id ||
      ""
    ).trim();
  }

  transactionCareContextReferences(tx) {
    const contexts = Array.isArray(tx?.careContexts) ? tx.careContexts : [];
    return [
      tx?.careContextReference,
      ...contexts.map((item) => item?.careContextReference || item?.referenceNumber || item?.id)
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  sameText(left, right) {
    return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
  }

  sameCareContextReference(left, right) {
    const normalize = (value) => String(value || "")
      .trim()
      .toLowerCase()
      .replace(/-(opconsultation|ipddischargesummary|diagnosticreport|prescription|wellnessrecord|immunizationrecord|healthdocumentrecord)$/i, "");
    return normalize(left) === normalize(right);
  }
}

module.exports = M2CallbackManager.getInstance();
