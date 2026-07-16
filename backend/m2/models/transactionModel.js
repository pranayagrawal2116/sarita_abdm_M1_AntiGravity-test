/**
 * Header: transactionModel.js
 * Purpose: Structure defining transaction log state values for Milestone 2.
 * Responsibility: Track M2 lifecycle states, previous states, and audit trails.
 */

class TransactionModel {
  /**
   * Constructs a transaction model instance.
   * @param {Object} [data] - Optional initial properties.
   */
  constructor(data = {}) {
    this.transactionId = data.transactionId || "";
    this.requestId = data.requestId || "";
    this.consentId = data.consentId || "";
    this.consentRequestId = data.consentRequestId || "";
    this.healthInformationRequestId = data.healthInformationRequestId || "";
    this.gatewayRequestId = data.gatewayRequestId || "";
    this.hiRequestId = data.hiRequestId || "";
    this.patientId = data.patientId || "";
    this.patient = data.patient || {};
    this.abhaAddress = data.abhaAddress || "";
    this.hipId = data.hipId || "";
    this.linkToken = data.linkToken || "";
    this.linkedAt = data.linkedAt || data.createdTime || "";
    this.createdTime = data.createdTime || "";
    this.careContexts = data.careContexts || [];
    this.careContextReference = data.careContextReference || "";
    this.dataPushUrl = data.dataPushUrl || "";
    this.receiverPublicKey = data.receiverPublicKey || "";
    this.receiverNonce = data.receiverNonce || "";
    this.senderNonce = data.senderNonce || "";
    this.encryptionMetadata = data.encryptionMetadata || {};
    this.callbackHistory = data.callbackHistory || [];
    this.retryHistory = data.retryHistory || [];
    this.statusHistory = data.statusHistory || [];
    this.currentState = data.currentState || "Created";
    this.previousState = data.previousState || "";
    this.createdTimestamp = data.createdTimestamp || Date.now();
    this.updatedTimestamp = data.updatedTimestamp || Date.now();
    this.retryCount = data.retryCount || 0;
    this.failureCount = data.failureCount || 0;
    this.errorDetails = data.errorDetails || "";
    this.auditHistory = data.auditHistory || [];

    // Preserve any dynamically added storage properties (e.g. consentDetails)
    Object.assign(this, data);
  }
}

module.exports = TransactionModel;
