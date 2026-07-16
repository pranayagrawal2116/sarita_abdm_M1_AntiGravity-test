/**
 * Header: M2DataTransferManager.js
 * Purpose: Complete workflow orchestrator for Milestone 2 data transfers.
 * Responsibility: Coordinate consent validation, request creation, FHIR building, encryption, data pushing, and callback tracking.
 * Methods:
 *   - initiateTransfer(consentId, patientId, recordType, clinicalData, receiverPublicKey, receiverNonce, dataPushUrl)
 *   - validateTransfer(consentId, patientId)
 *   - pushEncryptedBundle(tx, encryptedPayload, keyToShare, senderNonce, dataPushUrl)
 *   - finalizeTransfer(transactionId)
 *   - failTransfer(transactionId, error)
 *   - retryTransfer(transactionId)
 *   - getTransferStatus(transactionId)
 */

const axios = require("axios");
const crypto = require("crypto");
const Logger = require("../logging/logger");
const M2TokenManager = require("../tokens/M2TokenManager");
const M2ConsentManager = require("../consent/M2ConsentManager");
const M2HealthInformationRequestManager = require("../healthInformation/M2HealthInformationRequestManager");
const M2FHIRBuilder = require("../fhir/M2FHIRBuilder");
const M2EncryptionService = require("../encryption/M2EncryptionService");
const M2TransactionStore = require("../transactions/M2TransactionStore");
const M2CallbackManager = require("../callbacks/M2CallbackManager");
const config = require("../helpers/config");
const { getHeaders } = require("../../utils/headers");
const hospitalConfig = require("../../config/hospitalConfig");
const { firstText, extractTransactionIdFromLinkToken } = require("../helpers/identifierUtils");

class M2DataTransferManager {
  constructor() {
    if (M2DataTransferManager.instance) {
      return M2DataTransferManager.instance;
    }

    // Register callback handlers dynamically to avoid circular references
    M2CallbackManager.registerHandler("HIU On-Request", this.handleHealthInformationRequestCallback.bind(this));
    M2CallbackManager.registerHandler("Health Information Request", this.handleHealthInformationRequestCallback.bind(this));
    M2CallbackManager.registerHandler("Data Push Response", this.handleDataPushResponseCallback.bind(this));
    M2CallbackManager.registerHandler("Transfer Completion", this.handleTransferCompletionCallback.bind(this));

    this.maxRetries = 3;

    M2DataTransferManager.instance = this;
  }

  /**
   * Returns the central Singleton instance.
   * @returns {M2DataTransferManager} Singleton instance.
   */
  static getInstance() {
    if (!M2DataTransferManager.instance) {
      M2DataTransferManager.instance = new M2DataTransferManager();
    }
    return M2DataTransferManager.instance;
  }

  /**
   * Main pipeline runner coordinating data bundle formulation, encrypt, upload, and callback hook tracking.
   * @param {string} consentId - Consent identifier.
   * @param {string} patientId - Patient identifier.
   * @param {string} recordType - Category name (e.g. "OP Consultation").
   * @param {string} receiverPublicKey - Public key of receiver (Base64).
   * @param {string} receiverNonce - Nonce of receiver (Base64).
   * @param {string} dataPushUrl - HIU data push endpoint.
   * @returns {Promise<Object>} Final transaction state report.
   */
  async initiateTransfer(consentId, patientId, recordType, receiverPublicKey, receiverNonce, dataPushUrl) {
    const startTime = Date.now();
    Logger.info("M2DataTransferManager", "Initiating end-to-end data transfer workflow.", { consentId, patientId });

    let transactionId = null;

    try {
      // 1. Validate transfer details (consent status and scopes)
      const valReport = await this.validateTransfer(consentId, patientId);
      if (!valReport.isValid) {
        throw new Error(`Consent validation rejected data transfer: ${valReport.reason}`);
      }

      // 2. Retrieve valid gateway session/token
      const token = await M2TokenManager.getGatewayToken();
      if (!token) {
        throw new Error("Unable to fetch valid Gateway credentials.");
      }

      // 3. Create health information request inside database (HIU Request creation setup)
      const requestDetails = await M2HealthInformationRequestManager.createRequest(consentId, patientId);
      transactionId = requestDetails.transactionId;

      await M2TransactionStore.transitionState(transactionId, "Consent Received", {
        reason: "Consent verified, starting data transformation pipeline."
      });

      // 4. Load the requested FHIR Bundle from Registry
      console.log("================================================");
      console.log("MANUAL TRANSFER REQUEST RECEIVED");
      console.log("================================================");
      console.log(`Consent ID: ${consentId}`);
      console.log(`Patient ID: ${patientId}`);
      console.log(`Record Type (from params): ${recordType}`);
      console.log("================================================");

      const BundleRegistry = require("../fhir/BundleRegistry");
      const abhaMatch = patientId.match(/^(.+?@sbx)/);
      const searchId = abhaMatch ? abhaMatch[1] : patientId;
      const existingBundles = BundleRegistry.getBundlesForPatient(searchId, {
        abhaNumber: this.extractAbhaNumberFromTransaction(M2TransactionStore.getTransaction(transactionId) || {})
      });

      const bundlesToSend = [];
      if (existingBundles.length > 0) {
        bundlesToSend.push(...existingBundles);
      } else {
        throw new Error("No bundles available to send for this patient in local registry.");
      }

      const requestedTypes = Array.isArray(recordType) ? recordType : [recordType];
      const normalizedRequestedTypes = requestedTypes.map(r => this.normalizeHiType(r));
      const bundlePayloads = this.loadBundlePayloads(bundlesToSend);
      
      const selectedPayloads = bundlePayloads.filter((item) => 
         normalizedRequestedTypes.includes(this.normalizeHiType(item.meta?.hiType)) || 
         requestedTypes.includes(item.meta?.hiType)
      );

      // Fallback to first matched if strict match failed (shouldn't happen with updated normalizeHiType)
      if (selectedPayloads.length === 0) {
         selectedPayloads.push(this.selectTransferBundlePayload(bundlePayloads, requestedTypes));
      }

      await M2TransactionStore.transitionState(transactionId, "FHIR Generated", {
        reason: "FHIR R4 bundle compiled from existing files."
      });

      // 5. Encrypt the bundles
      await M2TransactionStore.transitionState(transactionId, "Encryption Started", {
        reason: "Starting GCM-128 Weierstrass ECDH key encryption."
      });

      console.log("Encryption Started");
      const keyMaterial = M2EncryptionService.generateKeyMaterial();
      const ourPrivateKey = keyMaterial.privateKey;
      const ourPublicKey = keyMaterial.publicKey; // keyToShare
      const ourNonce = keyMaterial.nonce; // senderNonce

      const encryptedEntries = [];
      let totalRecords = 0;
      let checksumStr = "";

      for (const payload of selectedPayloads) {
        const fhirBundle = payload.bundle;
        const serializedBundle = JSON.stringify(fhirBundle);
        totalRecords += Array.isArray(fhirBundle.entry) ? fhirBundle.entry.length : 0;
        
        const transferCareContextReference = this.resolveCareContextReferenceForBundle(
          M2TransactionStore.getTransaction(transactionId) || {},
          payload
        );
        
        const encryptionRes = M2EncryptionService.encryptBundle(
          serializedBundle,
          receiverPublicKey,
          receiverNonce,
          ourPrivateKey,
          ourNonce
        );
        
        checksumStr += encryptionRes.metadata.checksum;
        encryptedEntries.push({
          content: encryptionRes.encryptedPayload,
          media: "application/fhir+json",
          checksum: encryptionRes.metadata.checksum,
          careContextReference: transferCareContextReference
        });
      }
      
      const overallChecksum = crypto.createHash("sha256").update(checksumStr).digest("hex");
      console.log("Encryption Completed");

      await M2TransactionStore.transitionState(transactionId, "Encryption Completed", {
        reason: "FHIR packet encrypted successfully.",
        checksum: overallChecksum
      });

      // 6. Push encrypted bundle to the HIU
      await M2TransactionStore.transitionState(transactionId, "Data Push Started", {
        reason: "Pushing encrypted content packet to HIU dataPushUrl.",
        dataPushUrl
      });

      // Update local storage values before push
      await M2TransactionStore.updateTransaction(transactionId, {
        encryptedPayload: encryptedEntries,
        keyToShare: ourPublicKey,
        senderNonce: ourNonce,
        encryptionMetadata: { checksum: overallChecksum },
        receiverPublicKey,
        receiverNonce,
        dataPushUrl,
        recordType: requestedTypes,
        transferCareContextReference: encryptedEntries.map(e => e.careContextReference),
        clinicalData: {}
      });

      const dataPushResult = await this.pushEncryptedBundle(
        M2TransactionStore.getTransaction(transactionId),
        encryptedEntries,
        ourPublicKey,
        ourNonce,
        dataPushUrl,
        encryptedEntries[0]?.careContextReference || ""
      );

      // 7. Transition state to notify / complete mapping
      await M2TransactionStore.transitionState(transactionId, "Data Push Completed", {
        reason: "Data package acknowledged by HIU receiver.",
        statusCode: dataPushResult.statusCode
      });

      const currentTx = M2TransactionStore.getTransaction(transactionId);
      const notifyConsentId = this.resolveConsentArtifactId(currentTx, consentId);
      const notifyResult = await this.sendHealthInformationNotify(currentTx, {
        requestId: currentTx.gatewayRequestId || currentTx.requestId || requestDetails.requestId,
        consentId: notifyConsentId,
        transactionId,
        status: "TRANSFERRED",
        hiStatus: "OK",
        description: "Health information transferred"
      });

      const duration = Date.now() - startTime;
      await this.finalizeTransfer(transactionId);
      const completedAt = Date.now();
      const completedTx = M2TransactionStore.getTransaction(transactionId);
      const transferHistory = Array.isArray(completedTx.transferHistory)
        ? completedTx.transferHistory
        : [];
      const transferRecord = {
        id: `${transactionId}:${completedAt}`,
        transactionId,
        requestId: requestDetails.requestId,
        consentId: notifyConsentId,
        requestedConsentId: consentId,
        patientId,
        recordTypes: requestedTypes,
        recordsTransferred: totalRecords,
        startedAt: startTime,
        completedAt,
        durationMs: duration,
        status: "TRANSFER_COMPLETED",
        evidence: {
          dataPushUrl,
          dataPushStatusCode: dataPushResult.statusCode,
          consentManagerNotifyStatusCode: notifyResult.statusCode,
          checksum: overallChecksum,
          encrypted: true,
          gatewayNotified: true
        }
      };
      const result = await M2TransactionStore.updateTransaction(transactionId, {
        transferHistory: [...transferHistory, transferRecord],
        lastTransferRecord: transferRecord
      });
      Logger.info("M2DataTransferManager", "Data transfer workflow completed successfully.", {
        transactionId,
        durationMs: duration
      });

      return result;
    } catch (err) {
      Logger.error("M2DataTransferManager", "Data transfer workflow failed.", err);
      if (transactionId) {
        return this.handleTransferFailure(transactionId, err);
      }
      return { status: "Failed", error: err.message };
    }
  }

  /**
   * Asserts consent status and scoping validity.
   * @param {string} consentId - Consent ID.
   * @param {string} patientId - Patient ID.
   * @returns {Promise<Object>} Validity status.
   */
  async validateTransfer(consentId, patientId) {
    Logger.info("M2DataTransferManager", "Validating transfer pre-requisites.", { consentId, patientId });
    const consent = M2ConsentManager.getConsent(consentId);
    if (!consent) {
      return { isValid: false, reason: "Consent record not found." };
    }

    const consentVal = await M2ConsentManager.validateConsent(consentId);
    if (!consentVal.isValid) {
      return { isValid: false, reason: consentVal.reason };
    }

    if (consent.patientId !== patientId) {
      return { isValid: false, reason: "Consent scoping patient mismatch." };
    }

    return { isValid: true };
  }

  /**
   * Pushes the encrypted payload structure directly to the HIU dataPushUrl.
   * @param {Object} tx - Associated transaction.
   * @param {string|Array} encryptedEntries - Base64 cipher text or list of entries.
   * @param {string} keyToShare - Sender public key (Base64).
   * @param {string} senderNonce - Sender nonce (Base64).
   * @param {string} dataPushUrl - Target URL.
   */
  async pushEncryptedBundle(tx, encryptedEntries, keyToShare, senderNonce, dataPushUrl, careContextReference = "") {
    Logger.info("M2DataTransferManager", "Pushing encrypted packet data payload to HIU receiver.", { dataPushUrl });

    const payload = this.buildDataPushPayload(tx, encryptedEntries, keyToShare, senderNonce, careContextReference);

    await M2TransactionStore.updateTransaction(tx.transactionId, {
      dataPushPayload: payload
    });

    if (process.env.NODE_ENV === "test") {
      Logger.info("M2DataTransferManager", "Bypassing actual HTTP call (Test environment detected).");
      return { statusCode: 0, testBypass: true };
    }

    const fs = require('fs');
    const path = require('path');
    const apiLogPath = path.join(__dirname, '..', '..', 'data', 'api_responses.txt');

    const logEntryRequest = `[OUTBOUND REQUEST] POST ${dataPushUrl}\n${JSON.stringify({ headers: { "Content-Type": "application/json" }, data: payload }, null, 2)}\n\n`;
    try { fs.appendFileSync(apiLogPath, logEntryRequest); } catch (e) {}

    const configuredAttempts = Number(process.env.M2_DATA_PUSH_MAX_RETRIES || 0);
    const maxAttempts = Number.isFinite(configuredAttempts) && configuredAttempts > 0
      ? configuredAttempts
      : this.maxRetries + 1;
    const retryDelayMs = Number(process.env.M2_DATA_PUSH_RETRY_DELAY_MS || 250);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await axios.post(dataPushUrl, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: Number(process.env.M2_DATA_PUSH_TIMEOUT_MS || 30000)
        });

        const logEntryResponse = `[OUTBOUND RESPONSE] POST ${dataPushUrl}\n${JSON.stringify({ status: response.status, data: response.data }, null, 2)}\n\n`;
        try { fs.appendFileSync(apiLogPath, logEntryResponse); } catch (e) {}

        const acknowledgement = {
          ok: true,
          statusCode: response.status,
          acknowledgedAt: Date.now(),
          response: response.data || {},
          attempts: attempt,
          retryCount: attempt - 1
        };
        await M2TransactionStore.updateTransaction(tx.transactionId, {
          retryCount: attempt - 1,
          dataPushAcknowledgement: acknowledgement,
          dataPushResult: acknowledgement
        });
        Logger.info("M2DataTransferManager", "Encrypted bundle pushed to HIU successfully.", {
          attempts: attempt
        });
        return acknowledgement;
      } catch (err) {
        const statusCode = err.response?.status || null;
        
        const logEntryError = `[OUTBOUND ERROR] POST ${dataPushUrl}\n${JSON.stringify({ status: statusCode, error: err.message, data: err.response?.data }, null, 2)}\n\n`;
        try { fs.appendFileSync(apiLogPath, logEntryError); } catch (e) {}

        const isRecoverable =
          err.code === "ECONNREFUSED" ||
          err.code === "ENOTFOUND" ||
          err.code === "ETIMEDOUT" ||
          String(err.message || "").includes("timeout") ||
          statusCode === 429 ||
          (statusCode >= 500 && statusCode <= 599);

        Logger.error("M2DataTransferManager", "Failed to push bundle to HIU.", {
          message: err.message,
          status: statusCode,
          response: err.response?.data,
          headers: err.response?.headers,
          attempt,
          maxAttempts,
          recoverable: isRecoverable
        });
        await M2TransactionStore.updateTransaction(tx.transactionId, {
          retryCount: attempt - 1,
          dataPushError: {
            message: err.message,
            statusCode,
            response: err.response?.data || null,
            failedAt: Date.now(),
            attempt,
            maxAttempts
          }
        });

        if (!isRecoverable || attempt >= maxAttempts) {
          throw err;
        }

        await M2TransactionStore.appendAuditEvent(
          tx.transactionId,
          "DATA_PUSH_RETRY",
          `Recoverable data push failure; retrying attempt ${attempt + 1} of ${maxAttempts}.`,
          { statusCode, dataPushUrl }
        );

        if (retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    throw new Error("Data push retry loop exited unexpectedly.");
  }

  buildDataPushPayload(tx, encryptedEntries, keyToShare, senderNonce, careContextReference = "") {
    let entriesToPush = [];
    if (Array.isArray(encryptedEntries)) {
      entriesToPush = encryptedEntries;
    } else {
      entriesToPush = [
        {
          content: encryptedEntries,
          media: "application/fhir+json",
          checksum: crypto.createHash("sha256").update(encryptedEntries).digest("hex"),
          careContextReference: careContextReference || this.getCareContextReference(tx)
        }
      ];
    }

    return {
      pageNumber: 1,
      pageCount: 1,
      transactionId: tx.transactionId,
      entries: entriesToPush,
      keyMaterial: {
        cryptoAlg: "ECDH",
        curve: "Curve25519",
        dhPublicKey: {
          expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          parameters: "Curve25519/32byte random key",
          keyValue: keyToShare
        },
        nonce: senderNonce
      }
    };
  }

  /**
   * Finalizes the data transfer transaction status mapping.
   * @param {string} transactionId - Transaction identifier.
   * @returns {Promise<Object>} Updated transaction object details.
   */
  async finalizeTransfer(transactionId) {
    Logger.info("M2DataTransferManager", "Finalizing data transfer transaction.", { transactionId });
    const tx = await M2TransactionStore.transitionState(transactionId, "Completed", {
      reason: "Complete transfer workflow completed and acknowledged."
    });
    return tx;
  }

  /**
   * Evaluates if a failure is recoverable, updating counts and retry states.
   */
  async handleTransferFailure(transactionId, error) {
    const tx = M2TransactionStore.getTransaction(transactionId);
    if (!tx) {
      return { status: "Failed", error: error.message };
    }

    // Recoverable check: Network errors or server errors (5xx/429)
    const isNetworkError = error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ETIMEDOUT" || error.message.includes("timeout");
    const isServerError = error.response && (error.response.status >= 500 || error.response.status === 429);

    const isRecoverable = isNetworkError || isServerError;

    if (isRecoverable && (tx.retryCount || 0) < this.maxRetries) {
      return this.retryTransfer(transactionId);
    }

    return this.failTransfer(transactionId, error);
  }

  /**
   * Transitions transaction state to Failed.
   * @param {string} transactionId - Transaction identifier.
   * @param {Error} error - Encountered error.
   * @returns {Promise<Object>} Updated details.
   */
  async failTransfer(transactionId, error) {
    Logger.warn("M2DataTransferManager", "Marking data transfer transaction as Failed.", { transactionId });
    const tx = await M2TransactionStore.transitionState(transactionId, "Failed", {
      reason: `Data transfer failed: ${error.message}`
    });
    return tx;
  }

  /**
   * Increments retry count and schedules/triggers re-delivery of the package.
   * @param {string} transactionId - Transaction identifier.
   * @returns {Promise<Object>} Updated details.
   */
  async retryTransfer(transactionId) {
    Logger.info("M2DataTransferManager", "Attempting recovery retry on data transfer.", { transactionId });
    const tx = M2TransactionStore.getTransaction(transactionId);
    const count = (tx.retryCount || 0) + 1;

    await M2TransactionStore.updateTransaction(transactionId, {
      retryCount: count
    });

    await M2TransactionStore.transitionState(transactionId, "Retry Pending", {
      reason: `Scheduling retry delivery attempt ${count} of ${this.maxRetries}`
    });

    try {
      // Re-trigger bundle push
      await this.pushEncryptedBundle(
        tx,
        tx.encryptedPayload,
        tx.keyToShare,
        tx.senderNonce,
        tx.dataPushUrl
      );

      // Re-verify transition on success
      await M2TransactionStore.transitionState(transactionId, "Data Push Completed", {
        reason: `Re-delivery attempt ${count} succeeded.`
      });

      await M2TransactionStore.transitionState(transactionId, "Notify Sent", {
        reason: "Gateway notify callback registered."
      });

      return this.finalizeTransfer(transactionId);
    } catch (err) {
      Logger.error("M2DataTransferManager", `Retry attempt ${count} failed.`, err);
      // Recursively evaluate next steps
      return this.handleTransferFailure(transactionId, err);
    }
  }

  /**
   * Retrieves transfer status logs.
   * @param {string} transactionId - Transaction identifier.
   * @returns {string} Status string.
   */
  getTransferStatus(transactionId) {
    const tx = M2TransactionStore.getTransaction(transactionId);
    return tx ? tx.currentState : "Unknown";
  }

  async handleHealthInformationRequestCallback(payload, tx) {
    const gatewayRequestId = payload.requestId || payload.response?.requestId || payload.resp?.requestId || tx.gatewayRequestId;
    const hiRequest = payload.hiRequest || {};
    const consentId = hiRequest.consent?.id || tx.consentId;
    const transactionId = firstText(
      hiRequest.transactionId,
      payload.transactionId,
      payload.response?.transactionId,
      payload.resp?.transactionId,
      tx.transactionId,
      extractTransactionIdFromLinkToken(tx.linkToken)
    );
    const receiverPublicKey = hiRequest.keyMaterial?.dhPublicKey?.keyValue || tx.receiverPublicKey;
    const receiverNonce = hiRequest.keyMaterial?.nonce || tx.receiverNonce;
    const dataPushUrl = hiRequest.dataPushUrl || tx.dataPushUrl;
    const recordType = tx.recordType || "OP Consultation";
    const patientId = tx.patientId || hiRequest.patient?.id || "";

    if (!transactionId) {
      throw new Error("Health Information Request callback did not contain an ABDM transactionId and no stored transactionId was available.");
    }

    await M2TransactionStore.updateTransaction(tx.transactionId || tx.requestId, {
      transactionId,
      consentId,
      healthInformationRequestId: gatewayRequestId,
      gatewayRequestId,
      dataPushUrl,
      receiverPublicKey,
      receiverNonce,
      keyMaterial: hiRequest.keyMaterial || tx.keyMaterial || {},
      hiRequestPayload: payload
    });

    const currentTx = M2TransactionStore.getTransaction(transactionId) || M2TransactionStore.getTransaction(gatewayRequestId);

    console.log("================================================");
    console.log("HI REQUEST RECEIVED");
    console.log("================================================");
    console.log(`Transaction ID: ${currentTx.transactionId}`);
    console.log(`Consent ID: ${consentId}`);
    console.log(`Patient ID: ${patientId}`);
    const requestedHiTypes = currentTx.consentDetails?.hiTypes || currentTx.hiTypes || ["OP Consultation"];
    console.log(`Requested HI Types: ${requestedHiTypes.join(", ")}`);
    console.log(`Date Range: ${JSON.stringify(currentTx.consentDetails?.dateRange || {})}`);
    console.log("================================================");

    await M2TransactionStore.transitionState(currentTx.transactionId, "HI Request Received", {
      reason: "Request verified and ready for manual push.",
    });

    // We only Acknowledge the request, and wait for the manual push from the Desktop UI
    const hiResponse = await this.sendHealthInformationOnRequestResponse({
      requestId: gatewayRequestId,
      transactionId: currentTx.transactionId
    });

    await M2TransactionStore.transitionState(currentTx.transactionId, "Acknowledged", {
      requestId: gatewayRequestId,
      source: "Official HIP Health Information Response"
    });

    // Automatically trigger data push in the background to prevent HIU timeouts
    setTimeout(async () => {
      try {
        Logger.info("M2DataTransferManager", "Initiating automatic data push to HIU.");
        await this.initiateTransfer(
          consentId,
          patientId,
          requestedHiTypes,
          receiverPublicKey,
          receiverNonce,
          dataPushUrl
        );
        Logger.info("M2DataTransferManager", "Automatic data push completed successfully.");
      } catch (err) {
        Logger.error("M2DataTransferManager", "Failed to perform automatic data push", err);
      }
    }, 1000);

    return {

      success: true,
      requestId: gatewayRequestId,
      transactionId: currentTx.transactionId,
      hiResponse
    };
  }

  async sendHealthInformationOnRequestResponse({ requestId, transactionId }) {
    if (!requestId) {
      throw new Error("Cannot send HIP health information response without original gateway requestId.");
    }
    const token = await M2TokenManager.getGatewayToken();
    const baseHeaders = getHeaders(token);
    const headers = {
      ...baseHeaders,
      "X-HIP-ID": process.env.HIP_ID || hospitalConfig.hipId
    };
    const body = {
      hiRequest: {
        transactionId,
        sessionStatus: "ACKNOWLEDGED"
      },
      response: {
        requestId
      }
    };

    const response = await axios.post(
      `${config.gatewayBaseUrl}${config.gatewayHiOnRequestPath}`,
      body,
      { headers }
    );

    await M2TransactionStore.updateTransaction(transactionId, {
      hiOnRequestPayload: body,
      hiOnRequestStatusCode: response.status
    });

    return { statusCode: response.status, body };
  }

  resolveConsentArtifactId(tx = {}, fallbackConsentId = "") {
    return firstText(
      tx.consentArtifactId,
      tx.consentDetails?.consentArtifactId,
      tx.consentNotifyPayload?.notification?.consentId,
      tx.consentNotifyPayload?.notification?.consentDetail?.consentId,
      tx.consentDetail?.consentId,
      tx.consentDetails?.rawNotification?.notification?.consentId,
      tx.consentDetails?.rawNotification?.notification?.consentDetail?.consentId,
      tx.consentId,
      fallbackConsentId
    );
  }

  extractAbhaNumberFromTransaction(tx = {}) {
    const haystack = [
      tx.abhaNumber,
      tx.AbhaNumber,
      tx.ABHANumber,
      tx.patient?.AbhaNumber,
      tx.patient?.ABHANumber,
      tx.patient?.abhaNumber,
      tx.linkPayload?.AbhaNumber,
      tx.linkPayload?.ABHANumber,
      tx.linkPayload?.abhaNumber,
      tx.linkResponse?.AbhaNumber,
      tx.linkResponse?.ABHANumber,
      tx.linkResponse?.abhaNumber,
      tx.consentDetails?.abhaNumber,
      JSON.stringify(tx.patient || {}),
      JSON.stringify(tx.linkPayload || {}),
      JSON.stringify(tx.linkResponse || {})
    ].join(" ");
    const match = haystack.match(/\b\d{2}-\d{4}-\d{4}-\d{4}\b/);
    return match ? match[0] : "";
  }
  normalizeHiType(raw) {
    const s = String(raw || "").replace(/\s+/g, "").toLowerCase();
    if (s === "diagnosticreport") return "diagnosticreport";
    if (s === "prescription" || s === "prescriptionrecord") return "prescription";
    if (s === "opconsultation" || s === "consultation") return "opconsultation";
    if (s === "dischargesummary" || s === "discharge") return "dischargesummary";
    if (s === "immunizationrecord" || s === "immunization") return "immunizationrecord";
    if (s === "healthdocumentrecord" || s === "healthdocument") return "healthdocumentrecord";
    if (s === "wellnessrecord" || s === "wellness") return "wellnessrecord";
    if (s === "invoice") return "invoice";
    return s;
  }
  loadBundlePayloads(bundleMetas = []) {
    const fs = require("fs");
    const payloads = [];

    console.log("================================================");
    console.log("BUNDLE DETAILS");
    console.log("================================================");
    bundleMetas.forEach((bundleMeta) => {
      if (!fs.existsSync(bundleMeta.bundlePath)) {
        console.log(`Missing bundle file: ${bundleMeta.bundlePath}`);
        return;
      }

      const bundleRaw = fs.readFileSync(bundleMeta.bundlePath, "utf8");
      const parsed = JSON.parse(bundleRaw);
      payloads.push({ meta: bundleMeta, bundle: parsed, rawSize: bundleRaw.length });
      console.log(`Bundle Name: ${bundleMeta.bundleFileName}`);
      console.log(`HI Type: ${bundleMeta.hiType}`);
      console.log(`Patient: ${bundleMeta.patientId}`);
      console.log(`Record Count: ${parsed.entry?.length || 0}`);
      console.log(`Bundle Size: ${bundleRaw.length} bytes`);
      console.log(`Bundle Path: ${bundleMeta.bundlePath}`);
      console.log("---");
    });
    console.log("================================================");

    if (payloads.length === 0) {
      throw new Error("No readable FHIR bundle files were available for transfer.");
    }
    return payloads;
  }

  selectTransferBundlePayload(bundlePayloads = [], preferredHiTypes = []) {
    const preferred = preferredHiTypes.map((item) => this.normalizeHiType(item)).filter(Boolean);
    const selected = preferred.length > 0
      ? bundlePayloads.find((item) => preferred.includes(this.normalizeHiType(item.meta?.hiType))) || bundlePayloads[0]
      : bundlePayloads[0];
    const bundle = selected?.bundle;

    if (!bundle || bundle.resourceType !== "Bundle" || !Array.isArray(bundle.entry) || bundle.entry.length === 0) {
      throw new Error("Selected FHIR bundle is invalid or empty.");
    }
    if (bundle.entry[0]?.resource?.resourceType !== "Composition") {
      throw new Error("Selected FHIR bundle is not SOP-compliant: first entry must be Composition.");
    }
    return selected;
  }

  selectTransferBundle(bundlePayloads = [], preferredHiTypes = []) {
    return this.selectTransferBundlePayload(bundlePayloads, preferredHiTypes).bundle;
  }

  async sendHealthInformationNotify(tx, { requestId, consentId, transactionId, status, hiStatus, description }) {
    if (!requestId) {
      throw new Error("Cannot send health information notify without original gateway requestId.");
    }
    const token = await M2TokenManager.getGatewayToken();
    const baseHeaders = getHeaders(token);
    const headers = {
      ...baseHeaders,
      "X-HIP-ID": process.env.HIP_ID || hospitalConfig.hipId
    };
    let rawContexts = Array.isArray(tx.transferCareContextReference) 
      ? tx.transferCareContextReference 
      : [this.getCareContextReference(tx)];
    // Flatten the array infinitely to handle previously nested states
    const careContexts = rawContexts.flat(Infinity);

    const statusResponses = careContexts.map(ref => ({
      careContextReference: ref,
      hiStatus,
      description
    }));

    const body = {
      requestId: require("crypto").randomUUID(),
      timestamp: new Date().toISOString(),
      notification: {
        consentId,
        transactionId,
        doneAt: new Date().toISOString(),
        notifier: {
          type: "HIP",
          id: process.env.HIP_ID || hospitalConfig.hipId
        },
        statusNotification: {
          sessionStatus: status,
          hipId: process.env.HIP_ID || hospitalConfig.hipId,
          statusResponses
        }
      }
    };

    const response = await axios.post(
      `${config.gatewayBaseUrl}${config.gatewayHiNotifyPath}`,
      body,
      { headers }
    );

    await M2TransactionStore.transitionState(transactionId, "Notify Sent", {
      requestId,
      source: "Official HIP Data Flow Notification Request"
    });
    await M2TransactionStore.updateTransaction(transactionId, {
      healthInformationNotifyPayload: body,
      healthInformationNotifyStatusCode: response.status
    });

    return { statusCode: response.status, body };
  }

  getCareContextReference(tx) {
    if (Array.isArray(tx.transferCareContextReference) && tx.transferCareContextReference.length > 0) {
      return tx.transferCareContextReference[0];
    }
    if (typeof tx.transferCareContextReference === "string" && tx.transferCareContextReference) {
      return tx.transferCareContextReference;
    }
    if (Array.isArray(tx.careContextReference) && tx.careContextReference.length > 0) {
      return tx.careContextReference[0];
    }
    if (typeof tx.careContextReference === "string" && tx.careContextReference) {
      return tx.careContextReference;
    }
    const first = Array.isArray(tx.careContexts) ? tx.careContexts[0] : null;
    return first?.careContextReference || first?.referenceNumber || first?.id || "";
  }

  resolveCareContextReferenceForBundle(tx = {}, selectedPayload = {}) {
    if (selectedPayload.meta?.careContextReference) return selectedPayload.meta.careContextReference;

    const selectedBundle = selectedPayload.bundle || {};
    const selectedId = selectedBundle.id || "";
    const selectedIdentifier = selectedBundle.identifier?.value || "";
    const bundleEntries = tx.bundles && typeof tx.bundles === "object" ? Object.entries(tx.bundles) : [];

    for (const [careContextReference, bundle] of bundleEntries) {
      if (!bundle || typeof bundle !== "object") continue;
      if (selectedId && bundle.id === selectedId) return careContextReference;
      if (selectedIdentifier && bundle.identifier?.value === selectedIdentifier) return careContextReference;
    }

    return this.getCareContextReference(tx);
  }

  buildClinicalData(tx, patientId) {
    return {
      patientName: tx.patientName || "Patient",
      abhaAddress: patientId || tx.patientId || "",
      gender: tx.gender || "unknown",
      birthDate: tx.birthDate || "2000-01-01",
      timestamp: new Date().toISOString(),
      complaints: tx.clinicalData?.complaints || [],
      vitals: tx.clinicalData?.vitals || [],
      measurements: tx.clinicalData?.measurements || [],
      allergies: tx.clinicalData?.allergies || [],
      history: tx.clinicalData?.history || [],
      investigations: tx.clinicalData?.investigations || [],
      treatments: tx.clinicalData?.treatments || [],
      medications: tx.clinicalData?.medications || []
    };
  }

  /**
   * Processes dynamic "Data Push Response" callback webhooks.
   */
  async handleDataPushResponseCallback(payload, tx) {
    Logger.info("M2DataTransferManager", "handleDataPushResponseCallback handler triggered.", {
      transactionId: tx.transactionId
    });
    return { success: true };
  }

  /**
   * Processes dynamic "Transfer Completion" callback webhooks.
   */
  async handleTransferCompletionCallback(payload, tx) {
    Logger.info("M2DataTransferManager", "handleTransferCompletionCallback handler triggered.", {
      transactionId: tx.transactionId
    });
    return { success: true };
  }
}

module.exports = M2DataTransferManager.getInstance();
