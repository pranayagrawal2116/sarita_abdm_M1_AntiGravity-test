/**
 * Header: m2ConsentController.js
 * Purpose: Handles patient consent list and decision requests.
 * Responsibility: Forward requests to ABDM Gateway using TokenManager credentials.
 */

const axios = require("axios");
const Logger = require("../logging/logger");
const M2ConsentManager = require("../consent/M2ConsentManager");
const M2HealthInformationRequestManager = require("../healthInformation/M2HealthInformationRequestManager");
const M2EncryptionService = require("../encryption/M2EncryptionService");
const M2TokenManager = require("../tokens/M2TokenManager");
const M2TransactionStore = require("../transactions/M2TransactionStore");
const hospitalConfig = require("../../config/hospitalConfig");
const { getHeaders } = require("../../utils/headers");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

const toObject = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const getByPath = (source, path) => {
  let current = source;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") {
      current = current[key];
      continue;
    }
    if (current && typeof current === "object" && key in current) {
      current = current[key];
      continue;
    }
    return undefined;
  }
  return current;
};

const findFirstString = (source, paths) => {
  for (const path of paths) {
    const value = toText(getByPath(source, path));
    if (value) return value;
  }
  return "";
};

const normalizeDateRange = (consent) =>
  toObject(toObject(consent.permission).dateRange || consent.dateRange);

const buildPublicBaseUrl = (req) => {
  const configured = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").trim();
  const proto = forwardedProto || req.protocol || "http";
  const host = String(req.headers.host || `localhost:${process.env.PORT || 3000}`).trim();
  return `${proto}://${host}`;
};

const buildDefaultKeyMaterial = () => ({
  cryptoAlg: "ECDH",
  curve: "Curve25519",
  dhPublicKey: {
    expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    parameters: "Curve25519/32byte random key",
    keyValue:
      "BDdwiDc0OE6GTml90tcDcfQpDuVyEeciwBGYkB5v08yWRBc3sIKm9e5ygVktMAXVFdNLai4wfqUeEWHe3AK3X+Q=",
    x509PublicKey:
      "MIIBMTCB6gYHKoZIzj0CATCB3gIBATArBgcqhkjOPQEBAiB/////////////////////////////////////////7TBEBCAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqYSRShRAQge0Je0Je0Je0Je0Je0Je0Je0Je0Je0Je0JgtenHcQyGQEQQQqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq0kWiCuGaG4oIa04B7dLHdI0UySPU1+bXxhsinpxaJ+ztPZAiAQAAAAAAAAAAAAAAAAAAAAFN753qL3nNZYEmMaXPXT7QIBCANCAARzDxcCe7FZtrb+gvbjb/FJnS/zc7Ooq9A+1bTW3uHSdF33GViSWumNHfFbkuLf85ksgoGCjQVa+5CHPeV4PGOP",
  },
  nonce: "eFwkEMkx/0VmOoVjmf3j8lf3ef/ESqgudybfL0/D/a8=",
});

const postHealthInformationRequestToAbdm = async ({ requestId, transactionId, hiRequest, req }) => {
  const token = await M2TokenManager.getGatewayToken();
  if (!token) {
    throw new Error("Gateway authentication failed. Token not available.");
  }

  const publicBaseUrl = buildPublicBaseUrl(req);
  const dataPushUrl =
    toText(hiRequest?.dataPushUrl) ||
    `${publicBaseUrl}/api/v3/health-information/notify`;

  const keyMaterial = toObject(hiRequest?.keyMaterial);
  const normalizedKeyMaterial =
    Object.keys(keyMaterial).length > 0 ? keyMaterial : buildDefaultKeyMaterial();

  const payload = {
    requestId,
    timestamp: new Date().toISOString(),
    transactionId,
    hiRequest: {
      consent: {
        id: toText(hiRequest?.consent?.id),
      },
      dateRange: toObject(hiRequest?.dateRange),
      dataPushUrl,
      keyMaterial: normalizedKeyMaterial,
    },
  };

  const headers = {
    ...getHeaders(token),
    "X-HIU-ID": toText(process.env.HIU_ID) || toText(hospitalConfig.hiuId),
  };

  const response = await axios.post(
    `${process.env.GATEWAY_BASE}/api/hiecm/data-flow/v3/health-information/request`,
    payload,
    { headers }
  );

  return {
    payload,
    response,
    dataPushUrl,
    keyMaterial: normalizedKeyMaterial,
  };
};

class M2ConsentController {
  /**
   * Retrieves active, granted, or requested consents from Gateway.
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async listConsentRequests(req, res) {
    Logger.info("M2ConsentController", "listConsentRequests route handler triggered.");

    try {
      const consents = M2ConsentManager.listConsentRequests();
      return res.json({ consents, source: "M2ConsentManager" });
    } catch (err) {
      Logger.error("M2ConsentController", "Failed to retrieve consent requests from M2ConsentManager.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async registerLinkedCareContext(req, res) {
    Logger.info("M2ConsentController", "registerLinkedCareContext route handler triggered.");

    try {
      const body = toObject(req.body);
      const linkResponse = toObject(body.linkResponse || body.response);
      const linkPayload = toObject(body.linkPayload || body.payload);
      const requestId = toText(
        body.requestId ||
        body.linkResponse?.requestId ||
        body.response?.requestId ||
        linkResponse.requestId
      );
      if (!requestId) {
        return res.status(400).json({ error: "requestId is required." });
      }

      const tx = await M2ConsentManager.registerHipLinkContext({
        requestId,
        hipId: toText(body.hipId || linkPayload.hipId),
        linkToken: toText(body.linkToken || linkPayload.linkToken || linkPayload.linkingToken),
        abhaAddress: toText(body.abhaAddress || body.AbhaAddress || linkPayload.abhaAddress || linkPayload.AbhaAddress),
        careContextReference: toText(body.careContextReference),
        patient: Array.isArray(body.patient) ? body.patient : linkPayload.patient,
        createdTime: toText(body.createdTime) || new Date().toISOString(),
        linkResponse,
        linkPayload
      });

      return res.status(202).json({
        success: true,
        requestId: tx.requestId,
        currentState: tx.currentState,
        source: "M2TransactionStore"
      });
    } catch (err) {
      Logger.error("M2ConsentController", "Failed to register linked care context in M2.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async syncConsentWorkflow(req, res) {
    Logger.info("M2ConsentController", "syncConsentWorkflow route handler triggered.");

    try {
      const result = await M2ConsentManager.synchronizeConsentWorkflow();
      return res.json(result);
    } catch (err) {
      Logger.error("M2ConsentController", "Failed to synchronize M2 consent workflow.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Approves or denies consent.
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async submitConsentDecision(req, res) {
    Logger.info("M2ConsentController", "submitConsentDecision route handler triggered.");

    const { consentId, decision } = req.body;
    if (!consentId || !decision) {
      Logger.warn("M2ConsentController", "Missing consentId or decision in body.");
      return res.status(400).json({ error: "Missing consentId or decision." });
    }

    try {
      const consent = await M2ConsentManager.submitConsentDecision(consentId, decision, {
        raw: req.body?.raw || {}
      });

      return res.json({
        success: true,
        status: consent.status,
        consentId,
        consentArtefactId: consent.consentId || consentId
      });
    } catch (err) {
      Logger.error("M2ConsentController", "Failed to submit consent decision through M2ConsentManager.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async initConsentRequest(req, res) {
    Logger.info("M2ConsentController", "initConsentRequest route handler triggered.");
    try {
      const consent = toObject(req.body?.consent);
      const patientId = toText(consent?.patient?.id || req.body?.patientId);
      if (!patientId) {
        return res.status(400).json({ error: "consent.patient.id is required" });
      }

      const consentObj = await M2ConsentManager.createConsent({
        requestId: toText(req.body?.requestId),
        consentId: toText(consent?.id || req.body?.consentId),
        patientId,
        hiTypes: Array.isArray(consent?.hiTypes) ? consent.hiTypes : [],
        purpose: toObject(consent?.purpose),
        dateRange: normalizeDateRange(consent),
        expiry: consent?.permission?.dataEraseAt
          ? new Date(consent.permission.dataEraseAt).getTime()
          : undefined,
        careContexts: Array.isArray(consent?.careContexts) ? consent.careContexts : []
      });

      if (consentObj.status === "error") {
        return res.status(500).json(consentObj);
      }

      const tx = M2TransactionStore.getTransaction(consentObj.consentId);
      return res.json({
        requestId: tx?.requestId,
        consentId: consentObj.consentId,
        timestamp: new Date().toISOString(),
        response: { status: "REQUESTED", source: "M2ConsentManager" }
      });
    } catch (err) {
      Logger.error("M2ConsentController", "Failed to initialize consent through M2ConsentManager.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async fetchConsentInitCallback(req, res) {
    const requestId = toText(req.params?.requestId);
    if (!requestId) return res.status(400).json({ error: "requestId is required" });

    const tx = M2TransactionStore.getTransaction(requestId);
    if (!tx) return res.status(404).json({ error: "Callback not received yet for this requestId" });

    return res.json({
      success: true,
      requestId,
      consentId: tx.consentId,
      consentRequest: { id: tx.consentId },
      payload: tx.consentDetails || {},
      source: "M2TransactionStore"
    });
  }

  static async fetchConsentStatusCallback(req, res) {
    const consentId = toText(req.params?.consentId);
    if (!consentId) return res.status(400).json({ error: "consentId is required" });

    const consent = M2ConsentManager.getConsent(consentId);
    if (!consent) return res.status(404).json({ error: "Status callback not received yet for this consentId" });

    return res.json({
      success: true,
      consentId,
      status: consent.status,
      payload: consent,
      source: "M2ConsentManager"
    });
  }

  static async requestHealthInformation(req, res) {
    Logger.info("M2ConsentController", "requestHealthInformation route handler triggered.");
    let requestDetails = null;
    try {
      const hiRequest = toObject(req.body?.hiRequest);
      const consentId = toText(hiRequest?.consent?.id || req.body?.consentId);
      if (!consentId) {
        return res.status(400).json({ error: "hiRequest.consent.id is required" });
      }

      const consent = M2ConsentManager.getConsent(consentId);
      if (!consent) return res.status(404).json({ error: "Consent record not found." });

      requestDetails = await M2HealthInformationRequestManager.createRequest(
        consentId,
        consent.patientId,
        toObject(hiRequest?.dateRange)
      );

      const normalizedDataPushUrl =
        toText(hiRequest?.dataPushUrl) ||
        `${buildPublicBaseUrl(req)}/api/v3/health-information/notify`;
      let normalizedKeyMaterial;
      let receiverPrivateKey = null;

      if (Object.keys(toObject(hiRequest?.keyMaterial)).length > 0) {
        normalizedKeyMaterial = hiRequest.keyMaterial;
      } else {
        const keys = M2EncryptionService.generateKeyMaterial();
        receiverPrivateKey = keys.privateKey;
        normalizedKeyMaterial = {
          cryptoAlg: "ECDH",
          curve: "Curve25519",
          dhPublicKey: {
            expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            parameters: "Curve25519/32byte random key",
            keyValue: keys.publicKey
          },
          nonce: keys.nonce
        };
      }

      const trackingId = requestDetails.transactionId || requestDetails.requestId || consentId;
      const tx = await M2TransactionStore.updateTransaction(trackingId, {
        dataPushUrl: normalizedDataPushUrl,
        keyMaterial: normalizedKeyMaterial,
        receiverPrivateKey,
        receiverPublicKey: findFirstString(normalizedKeyMaterial || {}, [["dhPublicKey", "keyValue"]]),
        receiverNonce: findFirstString(normalizedKeyMaterial || {}, [["nonce"]])
      });

      const outbound = await postHealthInformationRequestToAbdm({
        requestId: requestDetails.requestId,
        transactionId: requestDetails.transactionId,
        hiRequest: {
          ...hiRequest,
          consent: { id: consentId },
          dateRange: toObject(hiRequest?.dateRange),
          dataPushUrl: normalizedDataPushUrl,
          keyMaterial: normalizedKeyMaterial,
        },
        req,
      });

      await M2TransactionStore.appendAuditEvent(trackingId, "HI_REQUEST_DISPATCHED", "Health Information Request sent to ABDM Gateway.", {
        requestId: requestDetails.requestId,
        dataPushUrl: outbound.dataPushUrl,
      });

      return res.json({
        requestId: requestDetails.requestId,
        transactionId: tx.transactionId,
        consentId,
        dataPushUrl: outbound.dataPushUrl,
        response: {
          status: "SUBMITTED",
          source: "M2HealthInformationRequestManager",
          outboundResponse: outbound.response.data || {},
        }
      });
    } catch (err) {
      try {
        if (requestDetails?.transactionId) {
          const tx = M2TransactionStore.getTransaction(requestDetails.transactionId);
          if (tx) {
            await M2TransactionStore.transitionState(tx.transactionId, "Failed", {
              reason: err.message,
            });
          }
        }
      } catch (_) { }
      Logger.error("M2ConsentController", "Failed to request health information through M2HealthInformationRequestManager.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async fetchHealthInformationOnRequest(req, res) {
    const requestId = toText(req.params?.requestId);
    if (!requestId) return res.status(400).json({ error: "requestId is required" });

    const tx = M2TransactionStore.getTransaction(requestId);
    if (!tx) return res.status(404).json({ success: false, pending: true });

    return res.json({
      success: true,
      requestId,
      transactionId: tx.transactionId,
      payload: tx.hiRequestDetails || {},
      source: "M2TransactionStore"
    });
  }

  static async fetchHealthInformationNotify(req, res) {
    const transactionId = toText(req.params?.transactionId);
    if (!transactionId) return res.status(400).json({ error: "transactionId is required" });

    const tx = M2TransactionStore.getTransaction(transactionId);
    if (!tx || !["Notify Sent", "Completed"].includes(tx.currentState)) {
      return res.status(404).json({ success: false, pending: true });
    }

    return res.json({
      success: true,
      transactionId,
      status: tx.currentState,
      entriesCount: Array.isArray(tx.entries) ? tx.entries.length : 0,
      payload: tx,
      source: "M2TransactionStore"
    });
  }

  static async notifyHealthInformationTransfer(req, res) {
    Logger.info("M2ConsentController", "notifyHealthInformationTransfer route handler triggered.");
    try {
      const notification = toObject(req.body?.notification);
      const transactionId = toText(notification?.transactionId || req.body?.transactionId);
      const consentId = toText(notification?.consentId || req.body?.consentId);
      if (!transactionId) return res.status(400).json({ error: "notification.transactionId is required" });

      const tx = M2TransactionStore.getTransaction(transactionId);
      if (!tx) return res.status(404).json({ error: "Transaction not found." });

      await M2TransactionStore.transitionState(transactionId, "Notify Sent", {
        reason: "Health information transfer notification received by M2 endpoint.",
        consentId
      });

      return res.json({
        requestId: toText(req.body?.requestId),
        timestamp: new Date().toISOString(),
        consentId,
        transactionId,
        response: { status: "NOTIFIED", source: "M2TransactionStore" }
      });
    } catch (err) {
      Logger.error("M2ConsentController", "Failed to notify health information transfer through M2TransactionStore.", err);
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = M2ConsentController;
