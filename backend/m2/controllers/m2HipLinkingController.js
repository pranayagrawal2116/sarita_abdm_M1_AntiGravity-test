/**
 * Header: m2HipLinkingController.js
 * Purpose: Handles ABDM User Initiated Linking logic (HIP role).
 * Responsibility: Processing Discovery, Link Init, and Link Confirm requests, then replying to Gateway asynchronously.
 */

const Logger = require("../logging/logger");
const M2AuthenticationManager = require("../authentication/M2AuthenticationManager");
const { nowIso } = require("../../utils/dateUtils");
const otpStore = require("../../utils/otpStore");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

class M2HipLinkingController {
  
  static _getPatientData() {
    try {
      const dbPath = path.join(__dirname, "../../data/m2_patients.json");
      if (fs.existsSync(dbPath)) {
        return JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      }
    } catch (e) {
      Logger.error("M2HipLinkingController", "Failed to read patient DB", e);
    }
    return {};
  }

  static _getTransactionData() {
    try {
      const dbPath = path.join(__dirname, "../../data/m2_transactions.json");
      if (fs.existsSync(dbPath)) {
        return JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      }
    } catch (e) {
      Logger.error("M2HipLinkingController", "Failed to read transaction DB", e);
    }
    return {};
  }

  /**
   * Process Discovery Request asynchronously.
   * @param {Object} payload 
   */
  static async processDiscovery(payload) {
    const requestId = payload.requestId || payload.transactionId || uuidv4();
    Logger.info("M2HipLinkingController", "Processing discovery for request:", { requestId });

    const patientDetails = payload.patient || {};
    const identifiers = patientDetails.verifiedIdentifiers || [];
    
    // Extract ABHA address or Mobile number
    let requestedAbhaAddress = patientDetails.id;
    identifiers.forEach(id => {
      if (id.type === "NDHM_HEALTH_NUMBER" || id.type === "HEALTH_ID") {
        requestedAbhaAddress = id.value;
      }
    });

    if (!requestedAbhaAddress) {
      requestedAbhaAddress = patientDetails.id;
    }

    // Find patient and their care contexts
    const patients = this._getPatientData();
    const transactions = this._getTransactionData();
    let matchedPatient = null;
    
    if (requestedAbhaAddress) {
       for (const [hipId, p] of Object.entries(patients)) {
         if (p.abhaAddress === requestedAbhaAddress || p.id === requestedAbhaAddress) {
           matchedPatient = p;
           matchedPatient.hipId = hipId;
           break;
         }
       }
    }

    const careContexts = [];
    if (matchedPatient) {
      // Find encounters/records for this patient
      for (const [txId, tx] of Object.entries(transactions)) {
        if (tx.patientId === matchedPatient.id || tx.abhaAddress === requestedAbhaAddress) {
           if (tx.hiTypes && Array.isArray(tx.hiTypes)) {
              tx.hiTypes.forEach((hiType, index) => {
                 careContexts.push({
                   referenceNumber: `${txId}-${index}`,
                   display: `${hiType} record for ${matchedPatient.name}`
                 });
              });
           } else {
              careContexts.push({
                 referenceNumber: txId,
                 display: `Health Record for ${matchedPatient.name}`
              });
           }
        }
      }
    }

    const responsePayload = {
      requestId: uuidv4(),
      timestamp: nowIso(),
      transactionId: payload.transactionId || uuidv4(),
      patient: matchedPatient && careContexts.length > 0 ? {
        referenceNumber: matchedPatient.id,
        display: matchedPatient.name,
        careContexts: careContexts,
        matchedBy: ["NDHM_HEALTH_NUMBER"]
      } : null,
      resp: {
        requestId: requestId
      }
    };

    if (!matchedPatient || careContexts.length === 0) {
      responsePayload.error = {
        code: 1000,
        message: "No patient or care contexts discovered"
      };
      delete responsePayload.patient;
    }

    try {
      await M2AuthenticationManager.callGatewayApi({
        method: "POST",
        url: `${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in/gateway'}/v0.5/care-contexts/on-discover`,
        data: responsePayload,
        headers: {
          "X-CM-ID": process.env.ABDM_CM_ID || "sbx"
        }
      });
      Logger.info("M2HipLinkingController", "Successfully sent on-discover response.");
    } catch (e) {
      Logger.error("M2HipLinkingController", "Failed to send on-discover response.", e);
    }
  }

  /**
   * Process Link Init Request asynchronously.
   * @param {Object} payload 
   */
  static async processLinkInit(payload) {
    const requestId = payload.requestId || uuidv4();
    const transactionId = payload.transactionId;
    const patientDetails = payload.patient || {};
    
    Logger.info("M2HipLinkingController", "Processing Link Init for request:", { requestId, transactionId });

    // Generate reference number and OTP
    const referenceNumber = uuidv4();
    const otp = otpStore.createOTP(patientDetails.id || "Unknown", referenceNumber);
    
    // Simulated SMS delivery
    Logger.info("M2HipLinkingController", `[MOCK SMS] -> OTP to link care contexts is: ${otp}`);
    
    const responsePayload = {
      requestId: uuidv4(),
      timestamp: nowIso(),
      transactionId: transactionId,
      link: {
        referenceNumber: referenceNumber,
        authenticationType: "DIRECT",
        meta: {
          communicationHint: "SMS dispatched to registered mobile number",
          communicationExpiry: nowIso(new Date(Date.now() + 5 * 60000))
        }
      },
      resp: {
        requestId: requestId
      }
    };

    try {
      await M2AuthenticationManager.callGatewayApi({
        method: "POST",
        url: `${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in/gateway'}/v0.5/links/link/on-init`,
        data: responsePayload,
        headers: {
          "X-CM-ID": process.env.ABDM_CM_ID || "sbx"
        }
      });
      Logger.info("M2HipLinkingController", "Successfully sent on-init response.");
    } catch (e) {
      Logger.error("M2HipLinkingController", "Failed to send on-init response.", e);
    }
  }

  /**
   * Process Link Confirm Request asynchronously.
   * @param {Object} payload 
   */
  static async processLinkConfirm(payload) {
    const requestId = payload.requestId || uuidv4();
    const confirmationDetails = payload.confirmation || {};
    const referenceNumber = confirmationDetails.linkRefNumber;
    const submittedOtp = confirmationDetails.token;
    
    Logger.info("M2HipLinkingController", "Processing Link Confirm for request:", { requestId });

    const isValid = otpStore.verifyOTP(referenceNumber, submittedOtp);

    const responsePayload = {
      requestId: uuidv4(),
      timestamp: nowIso(),
      resp: {
        requestId: requestId
      }
    };

    if (isValid) {
      // Create permanent link (in a real DB you'd mark the care contexts as linked to this ABHA address)
      responsePayload.patient = {
        referenceNumber: `PAT-${uuidv4().substring(0, 8)}`,
        display: "Patient Linked Successfully",
        careContexts: [
           // We would echo back the linked care contexts here
           { referenceNumber: "linked-ctx", display: "Linked Care Context" }
        ]
      };
      Logger.info("M2HipLinkingController", "OTP verification successful, patient care contexts linked.");
    } else {
      responsePayload.error = {
        code: 1000,
        message: "Invalid or expired OTP"
      };
      Logger.warn("M2HipLinkingController", "OTP verification failed or expired.");
    }

    try {
      await M2AuthenticationManager.callGatewayApi({
        method: "POST",
        url: `${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in/gateway'}/v0.5/links/link/on-confirm`,
        data: responsePayload,
        headers: {
          "X-CM-ID": process.env.ABDM_CM_ID || "sbx"
        }
      });
      Logger.info("M2HipLinkingController", "Successfully sent on-confirm response.");
    } catch (e) {
      Logger.error("M2HipLinkingController", "Failed to send on-confirm response.", e);
    }
  }

}

module.exports = M2HipLinkingController;
