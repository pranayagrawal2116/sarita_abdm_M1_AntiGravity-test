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

    let requestedMobile = null;

    if (patientDetails.verifiedIdentifiers && Array.isArray(patientDetails.verifiedIdentifiers)) {
      const mobileId = patientDetails.verifiedIdentifiers.find(id => id.type === "MOBILE");
      if (mobileId) {
        requestedMobile = mobileId.value;
      }
    }

    const transactions = this._getTransactionData();
    let matchedPatient = null;
    let careContexts = [];
    
    // Instead of relying on m2_patients.json, we can infer patient details from m2_transactions
    if (requestedAbhaAddress || requestedMobile) {
      for (const [txId, tx] of Object.entries(transactions)) {
        const txMobile = tx.patientMobile || tx.mobileNumber || tx.mobile || (tx.patient && tx.patient.mobile);
        const matchByAbha = requestedAbhaAddress && (tx.abhaAddress === requestedAbhaAddress || tx.patientId === requestedAbhaAddress);
        const matchByMobile = requestedMobile && (txMobile === requestedMobile || JSON.stringify(tx).includes(requestedMobile));

        if (matchByAbha || matchByMobile) {
          if (!matchedPatient) {
             matchedPatient = {
               id: requestedAbhaAddress || `PAT-${uuidv4().substring(0,8)}`,
               name: tx.patientName || patientDetails.name || "Patient Record"
             };
          }
          if (tx.hiTypes && Array.isArray(tx.hiTypes)) {
             const validHiTypes = ["Prescription", "DiagnosticReport", "OPConsultation", "DischargeSummary", "ImmunizationRecord", "HealthDocumentRecord", "WellnessRecord", "Invoice"];
             const filteredHiTypes = tx.hiTypes.filter(type => validHiTypes.includes(type));
             
             if (filteredHiTypes.length > 0) {
               filteredHiTypes.forEach((hiType, index) => {
                  careContexts.push({
                    referenceNumber: `${txId}-${index}`,
                    display: `${hiType} record`,
                    hiType: hiType
                  });
               });
             } else {
               careContexts.push({
                  referenceNumber: txId,
                  display: `Health Record`,
                  hiType: "OPConsultation" // fallback default
               });
             }
          } else {
             careContexts.push({
                referenceNumber: txId,
                display: `Health Record`,
                hiType: "OPConsultation" // fallback default
             });
          }
          break; // Stop after first match to prevent returning hundreds of duplicate care contexts
        }
      }
    }

    let responsePayload = {
      transactionId: payload.transactionId || uuidv4(),
      response: {
        requestId: requestId
      }
    };

    if (matchedPatient && careContexts.length > 0) {
      // According to official ABDM V3 Sandbox Documentation (Section 5.3.3):
      // - patient is an ARRAY of objects.
      // - matchedBy is OUTSIDE the patient array.
      // - hiType and count are at the patient array element level, NOT inside careContexts.
      // We must group care contexts by hiType and return one patient array element per hiType.

      const careContextsByHiType = {};
      careContexts.forEach(cc => {
        const type = cc.hiType || "OPConsultation";
        if (!careContextsByHiType[type]) {
          careContextsByHiType[type] = [];
        }
        careContextsByHiType[type].push({
          referenceNumber: cc.referenceNumber,
          display: cc.display
        });
      });

      responsePayload.patient = Object.keys(careContextsByHiType).map(type => {
        return {
          referenceNumber: matchedPatient.id,
          display: matchedPatient.name,
          careContexts: careContextsByHiType[type],
          hiType: type,
          count: careContextsByHiType[type].length
        };
      });

      responsePayload.matchedBy = ["HEALTH_ID"];
    } else {
      responsePayload.error = {
        code: "ABDM-1010",
        message: "Patient not found"
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
          "REQUEST-ID": uuidv4(),
          "TIMESTAMP": nowIso()
        }
      });
      Logger.info("M2HipLinkingController", "Successfully sent on-discover response to " + url);
    } catch (e) {
      Logger.error("M2HipLinkingController", "Failed to send on-discover response.", e.response?.data || e.message);
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
      transactionId: transactionId,
      link: {
        referenceNumber: referenceNumber,
        authenticationType: "MEDIATE",
        meta: {
          communicationMedium: "MOBILE",
          communicationHint: "OTP",
          communicationExpiry: nowIso(new Date(Date.now() + 5 * 60000))
        }
      },
      response: {
        requestId: requestId
      }
    };

    try {
      const url = `${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in'}/api/hiecm/user-initiated-linking/v3/link/care-context/on-init`;
      await M2AuthenticationManager.callGatewayApi({
        method: "POST",
        url: url,
        data: responsePayload,
        headers: {
          "X-CM-ID": process.env.ABDM_CM_ID || "sbx",
          "X-HIP-ID": process.env.HIP_ID || "IN2410002480",
          "REQUEST-ID": uuidv4(),
          "TIMESTAMP": nowIso()
        }
      });
      Logger.info("M2HipLinkingController", "Successfully sent on-init response to " + url);
    } catch (e) {
      Logger.error("M2HipLinkingController", "Failed to send on-init response.", e.response?.data || e.message);
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

    // Validate the OTP against our store (which is hardcoded to 122333 for sandbox)
    const isValid = otpStore.verifyOTP(referenceNumber, submittedOtp);

    let responsePayload = {
      response: {
        requestId: requestId
      }
    };

    if (isValid) {
      responsePayload.patient = [
        {
          referenceNumber: confirmationDetails.linkRefNumber || uuidv4(),
          display: "Linked Record",
          careContexts: [
            {
              referenceNumber: "linked-ctx",
              display: "Successfully Linked Care Context"
            }
          ],
          hiType: "OPConsultation",
          count: 1
        }
      ];
      Logger.info("M2HipLinkingController", "OTP verification successful, patient care contexts linked.");
    } else {
      responsePayload.error = {
        code: "ABDM-1100",
        message: "Invalid or expired OTP"
      };
      Logger.warn("M2HipLinkingController", "OTP verification failed or expired.");
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
          "REQUEST-ID": uuidv4(),
          "TIMESTAMP": nowIso()
        }
      });
      Logger.info("M2HipLinkingController", "Successfully sent on-confirm response to " + url);
    } catch (e) {
      Logger.error("M2HipLinkingController", "Failed to send on-confirm response.", e.response?.data || e.message);
    }
  }

}

module.exports = M2HipLinkingController;
