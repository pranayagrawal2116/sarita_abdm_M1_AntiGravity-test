/**
 * Header: M2TransactionStore.js
 * Purpose: Storage interface abstraction representing M2 transactional records.
 * Responsibility: Provide concurrency-safe getter, setter, and status transitions for transaction states.
 * Methods:
 *   - createTransaction(data)
 *   - getTransaction(id)
 *   - updateTransaction(id, updates)
 *   - transitionState(id, nextState, metadata)
 *   - appendAuditEvent(id, eventType, message, details)
 *   - listTransactions()
 *   - deleteTransaction(id)
 *   - validateTransaction(tx)
 */

const Logger = require("../logging/logger");
const TransactionModel = require("../models/transactionModel");
const JSONTransactionStorage = require("./JSONTransactionStorage");
const { log } = require("../../utils/InstrumentationLogger");
const { toText } = require("../helpers/identifierUtils");

const PROTECTED_IDENTIFIER_FIELDS = new Set([
  "transactionId",
  "requestId",
  "consentId",
  "consentRequestId",
  "consentArtifactId",
  "healthInformationRequestId",
  "gatewayRequestId",
  "hiRequestId",
  "careContextReference",
  "patientId",
  "abhaAddress",
  "hipId",
  "hiuId",
  "bridgeId",
  "linkToken",
  "subscriptionId",
  "sessionId",
  "xRequestId",
  "correlationId"
]);

const VALID_STATES = new Set([
  "Created",
  "LINKED",
  "WAITING_FOR_CONSENT",
  "CONSENT_GRANTED",
  "CONSENT_DENIED",
  "Authentication Ready",
  "Session Ready",
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
  "Cancelled",
  "Submitted",
  "Acknowledged",
  "WaitingForData",
  "Expired"
]);

class M2TransactionStore {
  /**
   * Singleton constructor.
   * Accepts a pluggable storage provider (defaulting to JSONTransactionStorage).
   * @param {Object} [storageProvider] - Persistence provider implementation.
   */
  constructor(storageProvider = new JSONTransactionStorage()) {
    if (M2TransactionStore.instance) {
      return M2TransactionStore.instance;
    }

    this.storageProvider = storageProvider;
    this.activeLocks = new Map(); // Concurrency serialization queue

    M2TransactionStore.instance = this;
  }

  /**
   * Returns the central Singleton instance.
   * @returns {M2TransactionStore} Singleton instance.
   */
  static getInstance() {
    if (!M2TransactionStore.instance) {
      M2TransactionStore.instance = new M2TransactionStore();
    }
    return M2TransactionStore.instance;
  }

  /**
   * Async lock to serialize concurrent read-modify-write operations on the same ID.
   * @param {string} id - Lock identifier key.
   * @returns {Promise<Function>} Unlock callback function.
   */
  async acquireLock(id) {
    if (!id) return () => {};
    while (this.activeLocks.has(id)) {
      await this.activeLocks.get(id);
    }
    let resolveLock;
    const promise = new Promise((resolve) => {
      resolveLock = resolve;
    });
    this.activeLocks.set(id, promise);
    return () => {
      this.activeLocks.delete(id);
      resolveLock();
    };
  }

  /**
   * Resolves target lookup identifier (alias) to a canonical transaction key.
   * @param {string} id - Consent ID, request ID, or transaction ID.
   * @param {Object} allTransactions - Dictionary of all transactions.
   * @returns {string} Canonical ID key.
   */
  _findCanonicalId(id, allTransactions) {
    const normalizedId = toText(id);
    if (!normalizedId) return "";
    for (const key of Object.keys(allTransactions)) {
      const tx = allTransactions[key];
      if (
        toText(tx.transactionId) === normalizedId ||
        toText(tx.requestId) === normalizedId ||
        toText(tx.consentId) === normalizedId ||
        toText(tx.consentRequestId) === normalizedId ||
        toText(tx.consentArtifactId) === normalizedId ||
        toText(tx.healthInformationRequestId) === normalizedId ||
        toText(tx.gatewayRequestId) === normalizedId ||
        toText(tx.hiRequestId) === normalizedId ||
        toText(tx.careContextReference) === normalizedId ||
        toText(tx.linkToken) === normalizedId ||
        toText(tx.subscriptionId) === normalizedId ||
        toText(tx.sessionId) === normalizedId ||
        key === normalizedId
      ) {
        return key;
      }
    }
    return normalizedId;
  }

  _applySafeUpdates(tx, updates = {}) {
    const readOnly = new Set(["createdTimestamp", "auditHistory"]);
    const skippedEmptyIdentifiers = [];

    for (const key of Object.keys(updates || {})) {
      if (readOnly.has(key)) continue;
      const value = updates[key];
      if (PROTECTED_IDENTIFIER_FIELDS.has(key) && !toText(value)) {
        skippedEmptyIdentifiers.push(key);
        continue;
      }
      tx[key] = value;
    }

    if (skippedEmptyIdentifiers.length > 0) {
      tx.identifierProtectionHistory = Array.isArray(tx.identifierProtectionHistory)
        ? tx.identifierProtectionHistory
        : [];
      tx.identifierProtectionHistory.push({
        timestamp: Date.now(),
        skippedFields: skippedEmptyIdentifiers,
        reason: "Ignored empty identifier update to preserve ABDM identifier propagation."
      });
      Logger.warn("M2TransactionStore", "Ignored empty identifier update.", {
        skippedFields: skippedEmptyIdentifiers,
        transactionId: tx.transactionId,
        requestId: tx.requestId,
        consentId: tx.consentId
      });
    }

    return tx;
  }

  /**
   * Creates and registers a new transaction model on disk.
   * @param {Object} data - Initial transaction coordinates.
   * @returns {Promise<Object>} Created transaction model structure.
   */
  async createTransaction(data) {
    const tempId = data?.transactionId || data?.requestId || "TEMP";
    const unlock = await this.acquireLock(tempId);

    try {
      Logger.info("M2TransactionStore", "Creating new transaction.", { tempId });
      log('createTransaction', { tempId, data });
      const db = this.storageProvider.read();
      
      const canonicalId = this._findCanonicalId(tempId, db);
      if (db[canonicalId]) {
        Logger.warn("M2TransactionStore", "Transaction already exists. Skipping creation.", { canonicalId });
        return new TransactionModel(db[canonicalId]);
      }

      const txModel = new TransactionModel(data);
      if (!txModel.transactionId && !txModel.requestId) {
        throw new Error("Transaction must contain at least a transactionId or requestId.");
      }

      const key = txModel.transactionId || txModel.requestId;
      
      // Setup initial audit event
      txModel.auditHistory.push({
        timestamp: Date.now(),
        eventType: "CREATED",
        message: "Transaction record initialized.",
        details: {}
      });

      db[key] = txModel;
      this.storageProvider.write(db);
      
      Logger.info("M2TransactionStore", "Transaction stored and persisted successfully.", {
        key,
        requestId: txModel.requestId,
        consentId: txModel.consentId,
        transactionId: txModel.transactionId
      });
      log('createTransactionSuccess', { transactionId: txModel.transactionId, requestId: txModel.requestId });
      return txModel;
    } finally {
      unlock();
    }
  }

  /**
   * Loads a transaction record by any of its identifiers.
   * @param {string} id - Transaction ID, consent ID, or request ID.
   * @returns {Object|null} TransactionModel instance or null if not found.
   */
  getTransaction(id) {
    Logger.info("M2TransactionStore", "Querying transaction record.", { id });
    const db = this.storageProvider.read();
    const canonicalId = this._findCanonicalId(id, db);

    if (db[canonicalId]) {
      return new TransactionModel(db[canonicalId]);
    }
    return null;
  }

  /**
   * Performs properties update under lock serialization.
   * @param {string} id - Identifiers lookup.
   * @param {Object} updates - Fields mapping to update.
   * @returns {Promise<Object>} Updated transaction model.
   */
  async updateTransaction(id, updates) {
    const dbBefore = this.storageProvider.read();
    const canonicalId = this._findCanonicalId(id, dbBefore);
    if (!canonicalId) {
      throw new Error("Cannot update transaction without a non-empty lookup identifier.");
    }
    const unlock = await this.acquireLock(canonicalId);

    try {
      Logger.info("M2TransactionStore", "Updating transaction properties.", { id, canonicalId });
      log('updateTransaction', { id, updates });
      const db = this.storageProvider.read();
      
      if (!db[canonicalId]) {
        throw new Error(`Transaction with ID ${id} (canonical: ${canonicalId}) not found.`);
      }

      const tx = this._applySafeUpdates(db[canonicalId], updates);

      tx.updatedTimestamp = Date.now();
      db[canonicalId] = tx;
      this.storageProvider.write(db);

      Logger.info("M2TransactionStore", "Transaction properties updated successfully.", { canonicalId });
      log('updateTransactionSuccess', { id: tx.transactionId || tx.requestId, updates });
      return new TransactionModel(tx);
    } finally {
      unlock();
    }
  }

  /**
   * Transitions the state machine with sequential logging and audit trails.
   * @param {string} id - Identifier lookup.
   * @param {string} nextState - State name to transition to.
   * @param {Object} [metadata] - Context log entries.
   * @returns {Promise<Object>} Updated transaction record.
   */
  async transitionState(id, nextState, metadata = {}) {
    if (!VALID_STATES.has(nextState)) {
      Logger.error("M2TransactionStore", `Invalid target state transition attempted: ${nextState}`);
      throw new Error(`Invalid transition state name: ${nextState}`);
    }

    const dbBefore = this.storageProvider.read();
    const canonicalId = this._findCanonicalId(id, dbBefore);
    const unlock = await this.acquireLock(canonicalId);

    try {
      Logger.info("M2TransactionStore", "Transitioning state.", { id, nextState });
      const db = this.storageProvider.read();

      if (!db[canonicalId]) {
        throw new Error(`Transaction with ID ${id} (canonical: ${canonicalId}) not found.`);
      }

      const tx = db[canonicalId];
      const previousState = tx.currentState;
      tx.previousState = previousState;
      tx.currentState = nextState;
      tx.updatedTimestamp = Date.now();

      // Adjust retry/failure counters if reported in metadata
      if (metadata.error) {
        tx.errorDetails = String(metadata.error);
        tx.failureCount = (tx.failureCount || 0) + 1;
      }
      if (metadata.retryPending) {
        tx.retryCount = (tx.retryCount || 0) + 1;
      }

      // Add audit history log entry
      tx.statusHistory = Array.isArray(tx.statusHistory) ? tx.statusHistory : [];
      tx.statusHistory.push({
        timestamp: Date.now(),
        from: previousState,
        to: nextState,
        metadata
      });

      tx.auditHistory.push({
        timestamp: Date.now(),
        eventType: "STATE_TRANSITION",
        message: `State changed from "${previousState}" to "${nextState}".`,
        details: metadata
      });

      db[canonicalId] = tx;
      this.storageProvider.write(db);

      Logger.info("M2TransactionStore", "State transitioned successfully.", {
        canonicalId,
        from: previousState,
        to: nextState
      });

      return new TransactionModel(tx);
    } finally {
      unlock();
    }
  }

  /**
   * Appends an audit event to a transaction history log.
   * @param {string} id - Identifier lookup.
   * @param {string} eventType - Audit event type name.
   * @param {string} message - Human descriptive message.
   * @param {Object} [details] - Meta parameters details.
   * @returns {Promise<Object>} Updated transaction record.
   */
  async appendAuditEvent(id, eventType, message, details = {}) {
    const dbBefore = this.storageProvider.read();
    const canonicalId = this._findCanonicalId(id, dbBefore);
    const unlock = await this.acquireLock(canonicalId);

    try {
      Logger.info("M2TransactionStore", "Appending audit event.", { id, eventType });
      const db = this.storageProvider.read();

      if (!db[canonicalId]) {
        throw new Error(`Transaction with ID ${id} not found.`);
      }

      const tx = db[canonicalId];
      tx.callbackHistory = Array.isArray(tx.callbackHistory) ? tx.callbackHistory : [];
      if (String(eventType || "").includes("CALLBACK")) {
        tx.callbackHistory.push({
          timestamp: Date.now(),
          eventType,
          message,
          details
        });
      }

      tx.retryHistory = Array.isArray(tx.retryHistory) ? tx.retryHistory : [];
      if (String(eventType || "").includes("RETRY")) {
        tx.retryHistory.push({
          timestamp: Date.now(),
          eventType,
          message,
          details
        });
      }

      tx.auditHistory.push({
        timestamp: Date.now(),
        eventType,
        message,
        details
      });

      tx.updatedTimestamp = Date.now();
      db[canonicalId] = tx;
      this.storageProvider.write(db);

      return new TransactionModel(tx);
    } finally {
      unlock();
    }
  }

  /**
   * Retrieves all registered transaction records.
   * @returns {Array<Object>} List of TransactionModel instances.
   */
  listTransactions() {
    Logger.info("M2TransactionStore", "Listing all transactions.");
    const db = this.storageProvider.read();
    return Object.values(db).map(data => new TransactionModel(data));
  }

  /**
   * Deletes a transaction record by lookup ID.
   * @param {string} id - Identifier lookup.
   * @returns {Promise<boolean>} Success status.
   */
  async deleteTransaction(id) {
    const dbBefore = this.storageProvider.read();
    const canonicalId = this._findCanonicalId(id, dbBefore);
    const unlock = await this.acquireLock(canonicalId);

    try {
      Logger.warn("M2TransactionStore", "Deleting transaction.", { id, canonicalId });
      const db = this.storageProvider.read();

      if (!db[canonicalId]) {
        Logger.warn("M2TransactionStore", "Transaction not found for deletion.", { canonicalId });
        return false;
      }

      delete db[canonicalId];
      this.storageProvider.write(db);
      return true;
    } finally {
      unlock();
    }
  }

  /**
   * Validates if a transaction model contains required fields and valid state definitions.
   * @param {Object} tx - Transaction record object.
   * @returns {boolean} Validity status.
   */
  validateTransaction(tx) {
    if (!tx || (!tx.transactionId && !tx.requestId)) {
      return false;
    }
    return VALID_STATES.has(tx.currentState);
  }

  // --- Static wrappers to preserve class-level calls for backward compatibility ---

  static async createTransaction(data) {
    return this.getInstance().createTransaction(data);
  }

  static getTransaction(id) {
    return this.getInstance().getTransaction(id);
  }

  static async updateTransaction(id, updates) {
    return this.getInstance().updateTransaction(id, updates);
  }

  static async transitionState(id, nextState, metadata) {
    return this.getInstance().transitionState(id, nextState, metadata);
  }

  static async appendAuditEvent(id, eventType, message, details) {
    return this.getInstance().appendAuditEvent(id, eventType, message, details);
  }

  static listTransactions() {
    return this.getInstance().listTransactions();
  }

  static async deleteTransaction(id) {
    return this.getInstance().deleteTransaction(id);
  }

  static validateTransaction(tx) {
    return this.getInstance().validateTransaction(tx);
  }
}

// Export the singleton instance
module.exports = M2TransactionStore.getInstance();
