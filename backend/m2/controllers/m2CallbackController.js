/**
 * Header: m2CallbackController.js
 * Purpose: Webhook callback route controller.
 * Responsibility: Parse inbound Gateway payloads, run request validation, and delegate to M2CallbackManager.
 */

const Logger = require("../logging/logger");
const M2CallbackManager = require("../callbacks/M2CallbackManager");
const M2TransactionStore = require("../transactions/M2TransactionStore");
const M2EncryptionService = require("../encryption/M2EncryptionService");
require("../consent/M2ConsentManager");
require("../transfer/M2DataTransferManager");

const toText = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text.length > 0 ? text : "";
};

class M2CallbackController {
  /**
   * Webhook: POST /v3/consent/request/hip/notify and /v3/consent/request/hip/on-notify
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async onHipConsentNotify(req, res) {
    const payload = req.body || {};
    const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
    if (headerRequestId && !payload.requestId) {
      payload.requestId = headerRequestId;
    }
    const requestId = toText(payload.requestId || payload.response?.requestId || payload.resp?.requestId);
    const consentId = payload.notification?.consentId || payload.notification?.consentDetail?.consentId;
    Logger.info("M2CallbackController", "M2 consent callback received.", {
      path: req.originalUrl,
      requestId,
      consentId
    });

    if (!consentId) {
      Logger.warn("M2CallbackController", "Missing consentId in notification payload.");
      const body = { error: "Missing consentId." };
      Logger.warn("M2CallbackController", "M2 consent callback response returned.", {
        path: req.originalUrl,
        statusCode: 400,
        requestId,
        consentId,
        body
      });
      return res.status(400).json(body);
    }

    try {
      const result = await M2CallbackManager.receiveCallback(payload);
      const statusCode = result.status === "error" ? 400 : 202;
      Logger.info("M2CallbackController", "M2 consent callback response returned.", {
        path: req.originalUrl,
        statusCode,
        requestId,
        consentId,
        transactionId: result.transactionId || "",
        status: result.status
      });
      return res.status(statusCode).json(result);
    } catch (err) {
      Logger.error("M2CallbackController", "Error processing consent notification.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Webhook: POST /v3/health-information/hip/on-request
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  static async handleHipRequest(req, res) {
    Logger.info("M2CallbackController", "handleHipRequest callback triggered.");

    const payload = req.body || {};
    const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
    if (headerRequestId && !payload.requestId) {
      payload.requestId = headerRequestId;
    }
    const requestId = payload.requestId || payload.response?.requestId || payload.resp?.requestId;
    const hasHiRequest = Boolean(payload.hiRequest);

    if (!requestId || !hasHiRequest) {
      Logger.warn("M2CallbackController", "Missing requestId or hiRequest in official HI request payload.");
      return res.status(400).json({ error: "Missing requestId or hiRequest." });
    }

    try {
      const result = await M2CallbackManager.receiveCallback(payload);
      return res.status(result.status === "error" ? 400 : 200).json(result);
    } catch (err) {
      Logger.error("M2CallbackController", "Error processing health information request.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async receive(req, res) {
    Logger.info("M2CallbackController", "generic M2 callback route triggered.", {
      callbackType: req.params?.type
    });

    try {
      const payload = req.body || {};
      const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
      if (headerRequestId && !payload.requestId) {
        payload.requestId = headerRequestId;
      }
      const result = await M2CallbackManager.receiveCallback(payload);
      return res.status(result.status === "error" ? 400 : 202).json(result);
    } catch (err) {
      Logger.error("M2CallbackController", "Error processing generic callback.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async onConsentRequestInit(req, res) {
    Logger.info("M2CallbackController", "onConsentRequestInit callback triggered.");
    const payload = req.body || {};
    const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
    if (headerRequestId && !payload.requestId) {
      payload.requestId = headerRequestId;
    }
    const requestId = toText(payload.requestId || payload.resp?.requestId);
    if (!requestId) return res.status(400).json({ error: "requestId is required." });

    try {
      const tx = M2TransactionStore.getTransaction(requestId);
      if (tx) {
        await M2TransactionStore.appendAuditEvent(tx.transactionId, "CONSENT_INIT_CALLBACK_RECEIVED", "Consent init callback processed by M2CallbackManager route.", {
          callbackRequestId: requestId,
          payload
        });
      }
      return res.status(202).json({ ok: true, requestId, transactionId: tx?.transactionId || "" });
    } catch (err) {
      Logger.error("M2CallbackController", "Error processing consent init callback.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async onConsentRequestStatus(req, res) {
    Logger.info("M2CallbackController", "onConsentRequestStatus callback triggered.");
    const payload = req.body || {};
    const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
    if (headerRequestId && !payload.requestId) {
      payload.requestId = headerRequestId;
    }
    const consentId = toText(payload.consentId || payload.notification?.consentId || payload.consent?.id);
    const requestId = toText(payload.requestId || payload.response?.requestId || payload.resp?.requestId);
    if (!consentId) return res.status(400).json({ error: "consentId is required." });
    if (!requestId) return res.status(400).json({ error: "requestId is required." });

    try {
      const normalizedPayload = {
        ...payload,
        requestId,
        notification: {
          ...(payload.notification || {}),
          consentId,
          status: payload.status || payload.notification?.status || "GRANTED"
        }
      };
      const result = await M2CallbackManager.receiveCallback(normalizedPayload);
      return res.status(result.status === "error" ? 400 : 202).json(result);
    } catch (err) {
      Logger.error("M2CallbackController", "Error processing consent status callback.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async onHealthInformationOnRequest(req, res) {
    Logger.info("M2CallbackController", "onHealthInformationOnRequest callback triggered.");
    const payload = req.body || {};
    const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
    if (headerRequestId && !payload.requestId) {
      payload.requestId = headerRequestId;
    }
    const requestId = toText(payload.requestId || payload.resp?.requestId);
    if (!requestId) return res.status(400).json({ error: "requestId is required." });

    try {
      const result = await M2CallbackManager.receiveCallback({
        ...payload,
        requestId,
      });
      return res.status(result.status === "error" ? 400 : 202).json(result);
      Logger.info("M2CallbackController", "onHealthInformationOnRequest exit.", { result });
      return res.status(result.status === "error" ? 400 : 202).json(result);
    } catch (err) {
      Logger.error("M2CallbackController", "onHealthInformationOnRequest exception.", err);
      return res.status(500).json({ error: err.message });
    }
  }

  static async onHealthInformationNotify(req, res) {
    Logger.info("M2CallbackController", "onHealthInformationNotify callback triggered.");
    const payload = req.body || {};
    const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
    if (headerRequestId && !payload.requestId) {
      payload.requestId = headerRequestId;
    }
    const transactionId = toText(payload.transactionId || payload.notification?.transactionId);
    if (!transactionId) return res.status(400).json({ error: "transactionId is required." });

    try {
      const tx = M2TransactionStore.getTransaction(transactionId);
      if (!tx) return res.status(404).json({ error: "Transaction not found." });

      await M2TransactionStore.transitionState(tx.transactionId, "Notify Sent", {
        callbackRequestId: toText(payload.requestId || payload.resp?.requestId),
        sourceCallback: "Health Information Notify"
      });
      
      const entries = payload.entries || payload.notification?.statusNotification?.statusResponses || [];
      const keyMaterial = payload.keyMaterial || payload.notification?.statusNotification?.keyMaterial || {};
      const bundles = {};

      if (entries.length > 0 && tx.receiverPrivateKey) {
        for (const entry of entries) {
          try {
            const ciphertext = entry.content || entry.link?.content;
            if (!ciphertext) continue;

            const senderPublicKey = keyMaterial.dhPublicKey?.keyValue;
            const senderNonce = keyMaterial.nonce;

            const decryptedStr = M2EncryptionService.decryptBundle(
              ciphertext,
              tx.receiverPrivateKey,
              senderPublicKey,
              senderNonce,
              tx.receiverNonce
            );
            
            const bundle = JSON.parse(decryptedStr);
            const careContext = entry.careContextReference || "default";
            bundles[careContext] = bundle;
          } catch (e) {
            Logger.error("M2CallbackController", "Failed to decrypt bundle entry.", e);
          }
        }
      }

      await M2TransactionStore.updateTransaction(tx.transactionId, {
        notifyCallback: payload,
        entries: entries,
        bundles: Object.keys(bundles).length > 0 ? bundles : tx.bundles
      });
      
      return res.status(202).json({ ok: true, transactionId: tx.transactionId });
    } catch (err) {
      Logger.error("M2CallbackController", "Error processing health information notify callback.", err);
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = M2CallbackController;
