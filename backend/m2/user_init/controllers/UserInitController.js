const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const LocalDataRegistry = require('../services/LocalDataRegistry');
const UserInitState = require('../services/UserInitState');
const M2TransactionStore = require('../../transactions/M2TransactionStore');
const M2AuthenticationManager = require('../../authentication/M2AuthenticationManager');
const Logger = require('../../logging/logger');

// Generate ISO string without milliseconds as expected by ABDM sometimes
function nowIso() {
  return new Date().toISOString();
}

// crypto.randomUUID is unavailable on older Node.js versions commonly used
// with iisnode on Windows Server 2016. uuid is already a backend dependency.
const newId = () => uuidv4();
const CALLBACK_TIMEOUT_MS = Number(process.env.USER_INIT_CALLBACK_TIMEOUT_MS || 5000);
const CALLBACK_ATTEMPTS = 2;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class UserInitController {
  /**
   * User-initiated linking has its own discovery/link callbacks, while the
   * later consent and HI-request callbacks use the M2 transaction store.
   * Persist the selected contexts in that store at confirmation time so the
   * data-transfer pipeline can match the exact linked documents.
   */
  static async persistUserInitiatedTransferContext(tx, requestId) {
    const transactionId = tx?.transactionId;
    const careContexts = (tx?.selectedCareContexts || [])
      .filter((context) => context?.referenceNumber)
      .map((context) => ({
        patientReference: context.patientReference || `PAT-${context.referenceNumber}`,
        careContextReference: context.referenceNumber,
        referenceNumber: context.referenceNumber,
        display: context.display || 'Linked Record',
        hiType: context.hiType || 'OPConsultation'
      }));

    if (!transactionId || careContexts.length === 0) {
      throw new Error('Cannot persist user-initiated transfer context without linked care contexts.');
    }

    const transferContext = {
      gatewayRequestId: requestId || '',
      patientId: tx.abhaAddress || '',
      abhaAddress: tx.abhaAddress || '',
      patientName: tx.patientName || '',
      hipId: process.env.HIP_ID || 'IN2410002480',
      careContexts,
      recordType: careContexts.map((context) => context.hiType),
      userInitiatedLinking: true
    };
    const existing = M2TransactionStore.getTransaction(transactionId);
    if (existing) {
      return M2TransactionStore.updateTransaction(transactionId, transferContext);
    }
    return M2TransactionStore.createTransaction({
      transactionId,
      requestId: requestId || transactionId,
      ...transferContext,
      currentState: 'WAITING_FOR_CONSENT'
    });
  }

  static isRetryableCallbackError(error) {
    const status = error?.response?.status;
    return !status || status === 408 || status === 429 || status >= 500;
  }

  /**
   * HIE-CM waits for these outbound callbacks after the inbound webhook has
   * already received its 202 acknowledgement.  Keep each delivery bounded
   * and reuse its request id on a transient retry so a slow gateway does not
   * turn a four-to-eight-record discovery into a mobile-app timeout.
   */
  static async sendGatewayCallback(url, data, callbackName) {
    const callbackRequestId = newId();
    let lastError;
    for (let attempt = 1; attempt <= CALLBACK_ATTEMPTS; attempt += 1) {
      try {
        return await M2AuthenticationManager.callGatewayApi({
          method: "POST",
          url,
          data,
          timeout: CALLBACK_TIMEOUT_MS,
          headers: {
            "X-CM-ID": process.env.ABDM_CM_ID || "sbx",
            "X-HIP-ID": process.env.HIP_ID || "IN2410002480",
            "REQUEST-ID": callbackRequestId,
            "TIMESTAMP": nowIso()
          }
        });
      } catch (error) {
        lastError = error;
        if (!this.isRetryableCallbackError(error) || attempt === CALLBACK_ATTEMPTS) break;
        Logger.warn("USER_INIT", "Retrying transient gateway callback failure.", {
          callbackName,
          attempt,
          timeoutMs: CALLBACK_TIMEOUT_MS,
          status: error?.response?.status || 0
        });
        await wait(150);
      }
    }
    throw lastError;
  }
  
  // Phase 6: HIE-CM callback to HIP - Discovery
  static async handleDiscover(req, res) {
    const payload = req.body || {};
    const requestId = req.headers["request-id"] || payload.requestId;
    const transactionId = payload.transactionId;

    Logger.info("USER_INIT", "DISCOVERY_STARTED", { requestId, transactionId });

    // ABDM expects immediate 202
    res.status(202).json({});

    // Process asynchronously
    setImmediate(async () => {
      try {
        await UserInitController.processDiscovery(payload, requestId);
      } catch (err) {
        Logger.error("USER_INIT", "Error processing discovery", err);
      }
    });
  }

  static async processDiscovery(payload, incomingRequestId) {
    const discoveryStartedAt = Date.now();
    const transactionId = payload.transactionId;
    const patientDetails = payload.patient || {};
    const unverifiedIdentifiers = payload.unverifiedIdentifiers || [];
    
    // Extract ABHA address or Mobile
    let requestedAbhaAddress = patientDetails.id;
    unverifiedIdentifiers.forEach(id => {
      if (id.type === "ABHA_ADDRESS" || id.type === "NDHM_HEALTH_NUMBER" || id.type === "HEALTH_ID") {
        requestedAbhaAddress = id.value;
      }
    });

    let responsePayload = {
      transactionId: transactionId,
      response: {
        requestId: incomingRequestId
      }
    };

    if (requestedAbhaAddress) {
      const documents = await LocalDataRegistry.getAvailableDocumentsForAbha(requestedAbhaAddress);
      
      if (documents.length > 0) {
        const careContexts = documents.map(doc => {
          // Internal mapping: store UUID -> local file mapping in state later
          const ccRef = require('crypto').createHash("md5").update(doc.documentFileName).digest("hex").substring(0,8);
          
          let cleanName = doc.documentFileName.split('_91-')[0].replace(/_/g, ' ');
          if (!cleanName || cleanName === doc.documentFileName) cleanName = doc.documentType || "Health Document";

          return {
            referenceNumber: ccRef,
            display: cleanName, 
            hiType: doc.documentType,
            // The hospital UI groups discovery results by the patient
            // reference. A distinct reference per document keeps each record
            // in its own card while retaining the stable care-context ID.
            patientReference: `PAT-${ccRef}`,
            _localPath: doc.documentPath
          };
        });

        // Send one patient block per document. The hospital record list uses
        // referenceNumber as its card grouping key, so do not reuse it here.
        responsePayload.patient = careContexts.map(cc => ({
          referenceNumber: cc.patientReference,
          display: patientDetails.name || requestedAbhaAddress,
          careContexts: [{ referenceNumber: cc.referenceNumber, display: cc.display }],
          hiType: cc.hiType || "OPConsultation",
          count: 1
        }));
        responsePayload.matchedBy = ["HEALTH_ID"];

        // Save transaction state
        UserInitState.createTransaction({
          transactionId,
          discoveryRequestId: incomingRequestId,
          abhaAddress: requestedAbhaAddress,
          patientName: patientDetails.name || requestedAbhaAddress,
          careContextsMap: careContexts // Store internal mapping
        });

        Logger.info("USER_INIT", "DISCOVERY_DOCUMENTS_READY", {
          transactionId,
          documentCount: careContexts.length,
          elapsedMs: Date.now() - discoveryStartedAt
        });

      } else {
        responsePayload.error = {
          code: "ABDM-1010",
          message: "Patient not found or no local documents available"
        };
      }
    } else {
      responsePayload.error = {
        code: "ABDM-1010",
        message: "Patient ABHA address not provided"
      };
    }

    try {
      const url = `${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in'}/api/hiecm/user-initiated-linking/v3/patient/care-context/on-discover`;
      await UserInitController.sendGatewayCallback(url, responsePayload, "on-discover");
      Logger.info("USER_INIT", "DISCOVERY_RESPONSE", {
        transactionId,
        documentCount: responsePayload.patient?.length || 0,
        elapsedMs: Date.now() - discoveryStartedAt
      });
    } catch (e) {
      const errorDetails = e.response && e.response.data ? JSON.stringify(e.response.data) : e.message;
      Logger.error("USER_INIT", "Failed to send on-discover", { error: errorDetails });
    }
  }

  // Phase 9: HIE-CM callback on health record link init
  static async handleLinkInit(req, res) {
    const payload = req.body || {};
    const requestId = req.headers["request-id"] || payload.requestId;
    const transactionId = payload.transactionId;

    Logger.info("USER_INIT", "LINK_INIT_STARTED", { requestId, transactionId });

    res.status(202).json({});

    setImmediate(async () => {
      try {
        await UserInitController.processLinkInit(payload, requestId);
      } catch (err) {
        Logger.error("USER_INIT", "Error processing link init", err);
      }
    });
  }

  static async processLinkInit(payload, incomingRequestId) {
    const transactionId = payload.transactionId;
    const patientDetails = payload.patient;

    const tx = UserInitState.getTransaction(transactionId);
    let responsePayload = {
      transactionId: transactionId,
      response: { requestId: incomingRequestId }
    };

    if (!tx) {
      responsePayload.error = { code: "ABDM-1086", message: "Transaction not found or expired" };
    } else {
      // Validate care contexts requested
      const requestedContexts = [];
      let valid = true;
      if (Array.isArray(patientDetails) && patientDetails.length > 0) {
        patientDetails.forEach(p => {
          if (p.careContexts) {
            p.careContexts.forEach(cc => requestedContexts.push(cc));
          }
        });
      }

      if (requestedContexts.length === 0) {
        valid = false;
        responsePayload.error = { code: "ABDM-1059", message: "Invalid Care Contexts count" };
      }

      if (valid) {
        const linkRefNumber = newId();
        // Generate a 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        // Overriding OTP to 122333 for sandbox ease
        const sandboxOtp = "122333";

        Logger.info("USER_INIT", `[MOCK SMS] OTP to link care contexts is: ${sandboxOtp}`);

        const expiryIso = new Date(Date.now() + 5 * 60000).toISOString();

        responsePayload.link = {
          referenceNumber: linkRefNumber,
          authenticationType: "DIRECT",
          meta: {
            communicationMedium: "MOBILE",
            communicationHint: "OTP",
            communicationExpiry: expiryIso
          }
        };

        const contextsByReference = new Map(
          (tx.careContextsMap || []).map((context) => [context.referenceNumber, context])
        );
        const mappedContexts = requestedContexts.map((cc) =>
          contextsByReference.get(cc.referenceNumber) || cc
        );

        UserInitState.updateTransaction(transactionId, {
          linkRefNumber,
          otp: sandboxOtp,
          selectedCareContexts: mappedContexts, // What HIU requested to link with real displays
          status: "LINK_INITIATED"
        });
        
        Logger.info("USER_INIT", "LINK_REFERENCE_RECEIVED", { linkRefNumber });
      }
    }

    try {
      const url = `${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in'}/api/hiecm/user-initiated-linking/v3/link/care-context/on-init`;
      await UserInitController.sendGatewayCallback(url, responsePayload, "on-init");
      Logger.info("USER_INIT", "LINK_INIT_RESPONSE_SENT", { transactionId });
    } catch (e) {
      Logger.error("USER_INIT", "Failed to send on-init", e.response?.data || e.message);
    }
  }

  // Phase 12: HIE-CM callback for health record confirmation
  static async handleLinkConfirm(req, res) {
    const payload = req.body || {};
    const requestId = req.headers["request-id"] || payload.requestId;
    
    Logger.info("USER_INIT", "CONFIRM_STARTED", { requestId, linkRefNumber: payload.confirmation?.linkRefNumber });

    res.status(202).json({});

    setImmediate(async () => {
      try {
        await UserInitController.processLinkConfirm(payload, requestId);
      } catch (err) {
        Logger.error("USER_INIT", "Error processing link confirm", err);
      }
    });
  }

  static async processLinkConfirm(payload, incomingRequestId) {
    const confirmation = payload.confirmation || {};
    const linkRefNumber = confirmation.linkRefNumber;
    const token = confirmation.token;

    // Find transaction by linkRefNumber
    const tx = UserInitState.findTransactionByLinkRefNumber(linkRefNumber);
    const txId = tx?.transactionId;

    let responsePayload = {
      response: { requestId: incomingRequestId }
    };

    if (!tx) {
      responsePayload.error = { code: "ABDM-1086", message: "Invalid link reference number" };
    } else if (tx.otp !== token) {
      responsePayload.error = { code: "ABDM-1100", message: "Invalid or expired OTP" };
    } else {
      // Success
      UserInitState.updateTransaction(txId, { status: "LINK_COMPLETED" });
      await UserInitController.persistUserInitiatedTransferContext(tx, incomingRequestId);
      
      // M2 expects patient array in response
      // Populate with exact care contexts that were successfully linked, mapping each to its own block
      responsePayload.patient = tx.selectedCareContexts.map(cc => ({
        referenceNumber: cc.patientReference || `PAT-${cc.referenceNumber}`,
        display: tx.patientName || tx.abhaAddress || "Linked Record",
        careContexts: [{
          referenceNumber: cc.referenceNumber,
          display: cc.display || "Linked Record"
        }],
        hiType: cc.hiType || "OPConsultation",
        count: 1
      }));
      
      Logger.info("USER_INIT", "LINK_COMPLETED", { transactionId: txId });
      
      // Do not trigger a transfer here. The consent and HI-request callbacks
      // start the normal M2 data-transfer flow after they match the context
      // persisted above.
      
      if (!global.careContextMap) global.careContextMap = {};
      tx.selectedCareContexts.forEach(cc => {
        // Find original mapped local file
        const internalCtx = tx.careContextsMap.find(c => c.referenceNumber === cc.referenceNumber);
        if (internalCtx) {
          global.careContextMap[cc.referenceNumber] = internalCtx.display; // filename
        }
      });
    }

    try {
      const url = `${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in'}/api/hiecm/user-initiated-linking/v3/link/care-context/on-confirm`;
      await UserInitController.sendGatewayCallback(url, responsePayload, "on-confirm");
      Logger.info("USER_INIT", "LINK_CONFIRM_RESPONSE_SENT", { linkRefNumber });
    } catch (e) {
      Logger.error("USER_INIT", "Failed to send on-confirm", e.response?.data || e.message);
    }
  }

}

module.exports = UserInitController;
