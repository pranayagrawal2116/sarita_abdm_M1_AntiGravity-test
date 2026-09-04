const crypto = require('crypto');
const axios = require('axios');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const LocalDataRegistry = require('../services/LocalDataRegistry');
const UserInitState = require('../services/UserInitState');
const M2TransactionStore = require('../../transactions/M2TransactionStore');
const M2AuthenticationManager = require('../../authentication/M2AuthenticationManager');
const M2TokenManager = require('../../tokens/M2TokenManager');
const Logger = require('../../logging/logger');

// Generate ISO string without milliseconds as expected by ABDM sometimes
function nowIso() {
  return new Date().toISOString();
}

// crypto.randomUUID is unavailable on older Node.js versions commonly used
// with iisnode on Windows Server 2016. uuid is already a backend dependency.
const newId = () => uuidv4();
const CALLBACK_TIMEOUT_MS = Number(process.env.USER_INIT_CALLBACK_TIMEOUT_MS || 12000);
const CALLBACK_ATTEMPTS = 2;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gatewayHttpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 8,
});

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
      abhaNumber: tx.abhaNumber || '',
      patientName: tx.patientName || '',
      hipId: process.env.HIP_ID || 'IN2410002480',
      careContexts,
      recordType: careContexts.map((context) => context.hiType),
      userInitiatedLinking: true,
      sourceStorageClass: tx.sourceStorageClass || '',
      sourcePatientFolder: tx.sourcePatientFolder || '',
      sourcePatientFolderName: tx.sourcePatientFolderName || '',
      nonAbhaPatientIdentity: tx.nonAbhaPatientIdentity || null,
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

  static isGatewayTokenRejection(error) {
    return error?.response?.status === 401 || error?.response?.status === 403;
  }

  /**
   * HIE-CM waits for these outbound callbacks after the inbound webhook has
   * already received its 202 acknowledgement.  Keep each delivery bounded
   * and reuse its request id on a transient retry so a slow gateway does not
   * turn a four-to-eight-record discovery into a mobile-app timeout.
   */
  static async sendGatewayCallback(url, data, callbackName, correlationRequestId = '') {
    // The response body already carries the original request id. Reuse it in
    // the callback header as well when it is available, so the HIE-CM can
    // associate the first Fetch record request with this response immediately.
    // A generated id remains available for callbacks without a correlation id.
    const callbackRequestId = String(correlationRequestId || '').trim() || newId();
    let lastError;
    for (let attempt = 1; attempt <= CALLBACK_ATTEMPTS; attempt += 1) {
      try {
        return await M2AuthenticationManager.callGatewayApi({
          method: "POST",
          url,
          data,
          timeout: CALLBACK_TIMEOUT_MS,
          httpsAgent: gatewayHttpsAgent,
          headers: {
            "X-CM-ID": process.env.ABDM_CM_ID || "sbx",
            "X-HIP-ID": process.env.HIP_ID || "IN2410002480",
            "REQUEST-ID": callbackRequestId,
            "TIMESTAMP": nowIso()
          }
        });
      } catch (error) {
        lastError = error;
        if (attempt === 1 && this.isGatewayTokenRejection(error)) {
          Logger.warn("USER_INIT", "Gateway rejected the warm token; refreshing it before retrying the callback.", {
            callbackName,
            status: error.response.status,
          });
          // User-init callbacks obtain their credentials through
          // M2AuthenticationManager/gatewayService.  Clear that helper's
          // cache too; otherwise an idle-but-rejected token is reused on the
          // retry and the mobile app needs to restart the whole flow.
          require('../../../services/gatewayService').clearCache();
          M2TokenManager.invalidate();
          continue;
        }
        if (!this.isRetryableCallbackError(error) || attempt === CALLBACK_ATTEMPTS) break;
        Logger.warn("USER_INIT", "Retrying transient gateway callback failure.", {
          callbackName,
          attempt,
          timeoutMs: CALLBACK_TIMEOUT_MS,
          status: error?.response?.status || 0
        });
        await wait(250);
      }
    }
    throw lastError;
  }

  static mobileFromDiscovery(patientDetails = {}, identifiers = []) {
    const candidates = [
      patientDetails.mobile,
      patientDetails.mobileNumber,
      patientDetails.phoneNumber,
      ...identifiers
        .filter((identifier) => /mobile|phone/i.test(String(identifier?.type || '')))
        .map((identifier) => identifier?.value),
    ];
    for (const candidate of candidates) {
      const digits = String(candidate || '').replace(/\D/g, '');
      if (digits.length === 10) return digits;
    }
    return '';
  }

  static abhaNumberFromDiscovery(identifiers = []) {
    for (const identifier of identifiers) {
      const value = String(identifier?.value || '').trim();
      // Gateways may return the ABHA number with or without separators. Store a
      // single display-safe form so downstream PDF builders never lose it.
      const digits = value.replace(/\D/g, '');
      if (digits.length === 14) {
        return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}-${digits.slice(10)}`;
      }
    }
    return '';
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
      const identifiers = [
        ...(Array.isArray(patientDetails.verifiedIdentifiers) ? patientDetails.verifiedIdentifiers : []),
        ...(Array.isArray(patientDetails.unverifiedIdentifiers) ? patientDetails.unverifiedIdentifiers : []),
        ...unverifiedIdentifiers,
      ];
      const discoveryResult = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
        abhaId: requestedAbhaAddress,
        yearOfBirth: patientDetails.yearOfBirth || patientDetails.year_of_birth,
        gender: patientDetails.gender,
        mobile: UserInitController.mobileFromDiscovery(patientDetails, identifiers),
      });
      const abhaNumber = UserInitController.abhaNumberFromDiscovery(identifiers);

      if (discoveryResult.storageFolderPath) {
        await LocalDataRegistry.persistPatientDocumentIdentity({
          folderPath: discoveryResult.storageFolderPath,
          folderName: discoveryResult.storageFolderName,
          storageClass: discoveryResult.storageClass,
          identity: discoveryResult.identity,
          patientName: patientDetails.name || requestedAbhaAddress,
          abhaAddress: requestedAbhaAddress,
          abhaNumber,
        });
      }
      const documents = discoveryResult.documents;
      
      if (documents.length > 0) {
        // A care context is a record, but the patient reference must identify
        // the one patient across every record. Sending a different patient
        // reference per document lets the mobile UI display the list, yet the
        // HIE-CM cannot reliably construct the subsequent link-init request.
        const patientReference = requestedAbhaAddress;
        const careContexts = documents.map(doc => {
          // Internal mapping: store UUID -> local file mapping in state later
          const ccRef = require('crypto').createHash("md5").update(doc.documentFileName).digest("hex").substring(0,8);
          
          let cleanName = doc.documentFileName.split('_91-')[0].replace(/_/g, ' ');
          if (!cleanName || cleanName === doc.documentFileName) cleanName = doc.documentType || "Health Document";

          return {
            referenceNumber: ccRef,
            display: cleanName, 
            hiType: doc.documentType,
            documentFileName: doc.documentFileName,
            patientReference,
            _localPath: doc.documentPath
          };
        });

        // The ABDM User Initiated Linking contract groups care contexts by
        // HI type but keeps the same patient reference in each group. The
        // app can still select every record individually, and its Link
        // records request remains associated with the correct patient.
        const careContextsByHiType = new Map();
        for (const careContext of careContexts) {
          const hiType = careContext.hiType || "OPConsultation";
          const group = careContextsByHiType.get(hiType) || [];
          group.push({
            referenceNumber: careContext.referenceNumber,
            display: careContext.display,
          });
          careContextsByHiType.set(hiType, group);
        }
        responsePayload.patient = [...careContextsByHiType.entries()].map(([hiType, contexts]) => ({
          referenceNumber: patientReference,
          display: patientDetails.name || requestedAbhaAddress,
          careContexts: contexts,
          hiType,
          count: contexts.length,
        }));
        responsePayload.matchedBy = ["HEALTH_ID"];

        // Save transaction state
        UserInitState.createTransaction({
          transactionId,
          discoveryRequestId: incomingRequestId,
          abhaAddress: requestedAbhaAddress,
          abhaNumber,
          patientName: patientDetails.name || requestedAbhaAddress,
          careContextsMap: careContexts, // Store internal mapping
          sourceStorageClass: discoveryResult.storageClass,
          sourcePatientFolder: discoveryResult.storageFolderPath,
          sourcePatientFolderName: discoveryResult.storageFolderName,
          nonAbhaPatientIdentity: discoveryResult.identity,
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
      await UserInitController.sendGatewayCallback(
        url,
        responsePayload,
        "on-discover",
        incomingRequestId,
      );
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
        // Overriding OTP to 123456 for sandbox ease
        const sandboxOtp = "123456";

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
      await UserInitController.sendGatewayCallback(
        url,
        responsePayload,
        "on-init",
        incomingRequestId,
      );
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
    let confirmedCareContexts = [];

    if (!tx) {
      responsePayload.error = { code: "ABDM-1086", message: "Invalid link reference number" };
    } else if (tx.otp !== token) {
      responsePayload.error = { code: "ABDM-1100", message: "Invalid or expired OTP" };
    } else {
      // Success
      UserInitState.updateTransaction(txId, { status: "LINK_COMPLETED" });
      await UserInitController.persistUserInitiatedTransferContext(tx, incomingRequestId);
      confirmedCareContexts = tx.selectedCareContexts || [];
      
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
      await UserInitController.sendGatewayCallback(
        url,
        responsePayload,
        "on-confirm",
        incomingRequestId,
      );
      if (confirmedCareContexts.length > 0) {
        await LocalDataRegistry.markDocumentsLinked(confirmedCareContexts);
        UserInitState.updateTransaction(txId, { localRecordsLinkedAt: new Date().toISOString() });
      }
      Logger.info("USER_INIT", "LINK_CONFIRM_RESPONSE_SENT", { linkRefNumber });
    } catch (e) {
      Logger.error("USER_INIT", "Failed to send on-confirm", e.response?.data || e.message);
    }
  }

}

module.exports = UserInitController;
