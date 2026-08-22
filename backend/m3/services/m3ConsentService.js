const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const config = require("../helpers/config");
const Logger = require("../logging/logger");
const M3TokenManager = require("../tokens/M3TokenManager");
const M3ConsentStore = require("../store/M3ConsentStore");
const hospitalConfig = require("../../config/hospitalConfig");

class M3ConsentService {
  /**
   * Initiates a consent request by calling ABDM Gateway
   * POST /api/hiecm/consent/v3/request/init
   */
  static async initConsentRequest(payload) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();

      // ABDM requires X-CM-ID to be passed in header
      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "REQUEST-ID": requestId,
        "TIMESTAMP": timestamp,
        "X-CM-ID": config.cmId || "sbx", // usually sbx for sandbox
      };

      const abdmPayload = {
        consent: {
          purpose: {
            text: payload.purpose,
            code: "CAREMGT", // Map as needed based on ABDM codes
            refUri: "http://example.com/purpose"
          },
          patient: {
            id: payload.patientId
          },
          hiu: {
            id: hospitalConfig.hiuId || config.clientId
          },
          requester: {
            name: payload.requesterName,
            identifier: {
              type: "REGNO",
              value: "MH1001",
              system: "https://www.mciindia.org"
            }
          },
          hiTypes: payload.hiTypes,
          permission: {
            accessMode: "VIEW",
            dateRange: {
              from: new Date(payload.dateFrom).toISOString(),
              to: new Date(payload.dateTo).toISOString()
            },
            dataEraseAt: new Date(payload.dateEraseAt).toISOString(),
            frequency: {
              unit: "HOUR",
              value: 0,
              repeats: 0
            }
          }
        }
      };


      // Save to store locally as PENDING
      M3ConsentStore.addConsentRequest({
        requestId: requestId,
        status: "REQUESTED", // INITIAL STATE
        patientId: payload.patientId,
        purpose: payload.purpose,
        hiTypes: payload.hiTypes,
        dateFrom: payload.dateFrom,
        dateTo: payload.dateTo,
        dateEraseAt: payload.dateEraseAt,
      });

      const response = await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/consent/v3/request/init`,
        abdmPayload,
        { headers }
      );

      return { requestId };

    } catch (error) {
      Logger.error("M3ConsentService", "Failed to init consent request", { error: error.message });
      if (error.response) {
         Logger.error("M3ConsentService", "ABDM Error Response", error.response.data);
         throw new Error(JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Fetches consent status manually if needed
   * POST /api/hiecm/consent/v3/request/status
   */
  static async checkConsentStatus(consentRequestId) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "REQUEST-ID": requestId,
        "TIMESTAMP": timestamp,
        "X-CM-ID": config.cmId || "sbx",
        "X-HIU-ID": hospitalConfig.hiuId || config.clientId,
      };

      const abdmPayload = {
        consentRequestId: consentRequestId
      };

      Logger.info("M3ConsentService", "Checking consent status", { consentRequestId });

      await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/consent/v3/request/status`,
        abdmPayload,
        { headers }
      );

      return { message: "Status request submitted successfully" };
    } catch (error) {
      Logger.error("M3ConsentService", "Failed to check consent status", { error: error.message });
      throw error;
    }
  }

  /**
   * Fetches consent artefact using consentId
   * POST /api/hiecm/consent/v3/fetch
   */
  static async fetchConsentArtefact(consentId) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "REQUEST-ID": requestId,
        "TIMESTAMP": timestamp,
        "X-CM-ID": config.cmId || "sbx",
        "X-HIU-ID": hospitalConfig.hiuId || config.clientId,
      };

      const abdmPayload = {
        consentId: consentId
      };

      Logger.info("M3ConsentService", "Fetching consent artefact", { consentId });

      await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/consent/v3/fetch`,
        abdmPayload,
        { headers }
      );

      return { message: "Fetch request submitted successfully" };
    } catch (error) {
      Logger.error("M3ConsentService", "Failed to fetch consent artefact", { error: error.message });
      throw error;
    }
  }

  /**
   * Request Health Information from HIP
   * POST /api/hiecm/dataflow/v3/health-information/request
   */
  static async requestHealthInformation(consentId, patientId, dateFrom, dateTo, dataEraseAt) {
    try {
      const consentReq = M3ConsentStore.consents.find(c => c.artefactDetails && c.artefactDetails[consentId]);
      if (consentReq && consentReq.artefactDetails[consentId] && consentReq.artefactDetails[consentId].permission) {
         const perm = consentReq.artefactDetails[consentId].permission;
         if (!dateFrom && perm.dateRange && perm.dateRange.from) dateFrom = perm.dateRange.from;
         if (!dateTo && perm.dateRange && perm.dateRange.to) dateTo = perm.dateRange.to;
         if (!dataEraseAt && perm.dataEraseAt) dataEraseAt = perm.dataEraseAt;
      }

      const fixDate = (dateStr) => {
        if (!dateStr) return new Date().toISOString();
        return new Date(dateStr).toISOString();
      };
      dateFrom = fixDate(dateFrom);
      dateTo = fixDate(dateTo);
      
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      // ABDM-1016 Invalid Timestamp fix: subtract 30 seconds to prevent "future time" clock drift errors
      const timestamp = new Date(Date.now() - 30 * 1000).toISOString();

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "REQUEST-ID": requestId,
        "TIMESTAMP": timestamp,
        "X-CM-ID": config.cmId || "sbx",
        "X-HIU-ID": hospitalConfig.hiuId || config.clientId,
      };

      const transactionId = uuidv4();
      
      // Look up HIP ID from the consent artefact details
      let hipId = "unknown";
      let hipName = "unknown";
      if (consentReq && consentReq.artefactDetails[consentId].hip) {
         hipId = consentReq.artefactDetails[consentId].hip.id;
         hipName = consentReq.artefactDetails[consentId].hip.name || hipId;
      }

      // Generate real ECDH keypair for ABDM data transfer
      require("../../services/fhirEncryptionService"); // Ensures wei25519 is registered
      const elliptic = require("elliptic");
      const crypto = require("crypto");
      const ec = new elliptic.ec("wei25519");
      const keyPair = ec.genKeyPair();
      const privateKeyBase64 = Buffer.from(keyPair.getPrivate().toArray("be", 32)).toString("base64");
      const publicKeyBase64 = Buffer.from(keyPair.getPublic().encode("array", false)).toString("base64");
      const nonceBase64 = crypto.randomBytes(32).toString("base64");

      M3ConsentStore.addTransaction(transactionId, {
        consentId: consentId,
        hipId: hipId,
        hipName: hipName,
        privateKeyBase64: privateKeyBase64,
        nonceBase64: nonceBase64,
        timestamp: new Date().toISOString(),
        requestId: requestId
      });

      const abdmPayload = {
        hiRequest: {
          consent: {
            id: consentId
          },
          dateRange: {
            from: dateFrom,
            to: dateTo
          },
          dataPushUrl: `${config.baseHost}/api/m3/callbacks/v3/health-information/transfer`,
          keyMaterial: {
            cryptoAlg: "ECDH",
            curve: "Curve25519",
            dhPublicKey: {
              expiry: dataEraseAt ? new Date(dataEraseAt).toISOString() : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              parameters: "Curve25519/32byte random key",
              keyValue: publicKeyBase64
            },
            nonce: nonceBase64
          }
        }
      };

      Logger.info("M3ConsentService", "Requesting Health Information", { consentId, transactionId });

      await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/data-flow/v3/health-information/request`,
        abdmPayload,
        { headers }
      );

      return { transactionId: transactionId, message: "HI Request submitted successfully" };
    } catch (error) {
      Logger.error("M3ConsentService", "Failed to request Health Information", { error: error.message });
      throw error;
    }
  }

  /**
   * Notify Health Information Transfer Status
   * POST /api/hiecm/data-flow/v3/health-information/notify
   */
  static async notifyHealthInformationStatus(payload) {
    try {
      const token = await M3TokenManager.getGatewayToken();
      const requestId = uuidv4();
      const timestamp = new Date().toISOString();

      const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "REQUEST-ID": requestId,
        "TIMESTAMP": timestamp,
        "X-CM-ID": config.cmId || "sbx",
      };

      const abdmPayload = {
        notification: {
          consentId: payload.consentId,
          transactionId: payload.transactionId,
          doneAt: new Date().toISOString(),
          notifier: {
            type: "HIU",
            id: hospitalConfig.hiuId || config.clientId || "HIU_ID"
          },
          statusNotification: {
            sessionStatus: payload.sessionStatus, // RECEIVED, FAILED, TRANSFERRED
            hipId: payload.hipId,
            statusResponses: payload.statusResponses || []
          }
        }
      };

      Logger.info("M3ConsentService", "Notifying Health Information Transfer Status", { transactionId: payload.transactionId });

      await axios.post(
        `${config.gatewayBaseUrl}/api/hiecm/data-flow/v3/health-information/notify`,
        abdmPayload,
        { headers }
      );

      return { message: "Notify submitted successfully" };
    } catch (error) {
      Logger.error("M3ConsentService", "Failed to notify Health Information status", { error: error.message });
      throw error;
    }
  }
}

module.exports = M3ConsentService;
