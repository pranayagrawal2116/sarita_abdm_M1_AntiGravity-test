const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const LocalDataRegistry = require('../services/LocalDataRegistry');
const UserInitState = require('../services/UserInitState');
const M2AuthenticationManager = require('../../authentication/M2AuthenticationManager');
const Logger = require('../../logging/logger');

// Generate ISO string without milliseconds as expected by ABDM sometimes
function nowIso() {
  return new Date().toISOString();
}

// crypto.randomUUID is unavailable on older Node.js versions commonly used
// with iisnode on Windows Server 2016. uuid is already a backend dependency.
const newId = () => uuidv4();

class UserInitController {
  
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
      const documents = LocalDataRegistry.getAvailableDocumentsForAbha(requestedAbhaAddress);
      
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
      await M2AuthenticationManager.callGatewayApi({
        method: "POST",
        url: url,
        data: responsePayload,
        headers: {
          "X-CM-ID": process.env.ABDM_CM_ID || "sbx",
          "X-HIP-ID": process.env.HIP_ID || "IN2410002480",
          "REQUEST-ID": newId(),
          "TIMESTAMP": nowIso()
        }
      });
      Logger.info("USER_INIT", "DISCOVERY_RESPONSE", { transactionId });
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

        const mappedContexts = requestedContexts.map(cc => {
          const original = (tx.careContextsMap || []).find(m => m.referenceNumber === cc.referenceNumber);
          return original ? original : cc;
        });

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
      await M2AuthenticationManager.callGatewayApi({
        method: "POST",
        url: url,
        data: responsePayload,
        headers: {
          "X-CM-ID": process.env.ABDM_CM_ID || "sbx",
          "X-HIP-ID": process.env.HIP_ID || "IN2410002480",
          "REQUEST-ID": newId(),
          "TIMESTAMP": nowIso()
        }
      });
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
      
      // IMPORTANT: Phase 14 - DO NOT Auto-trigger Data Transfer here!
      // Data transfer will happen via Consent flow separately.
      // We must just map the linked UUIDs into global.careContextMap so Consent flow can find them.
      
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
      await M2AuthenticationManager.callGatewayApi({
        method: "POST",
        url: url,
        data: responsePayload,
        headers: {
          "X-CM-ID": process.env.ABDM_CM_ID || "sbx",
          "X-HIP-ID": process.env.HIP_ID || "IN2410002480",
          "REQUEST-ID": newId(),
          "TIMESTAMP": nowIso()
        }
      });
      Logger.info("USER_INIT", "LINK_CONFIRM_RESPONSE_SENT", { linkRefNumber });
    } catch (e) {
      Logger.error("USER_INIT", "Failed to send on-confirm", e.response?.data || e.message);
    }
  }

}

module.exports = UserInitController;
