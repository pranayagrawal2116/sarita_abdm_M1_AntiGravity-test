const fs = require('fs');
const file = 'backend/m2/controllers/m2CallbackController.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
  static async onConsentRequestInit(req, res) {
    Logger.info("M2CallbackController", "onConsentRequestInit callback triggered.");
    const payload = req.body || {};
    const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
    
    // The requestId is usually in response.requestId or resp.requestId linking back to the original request
    const originalRequestId = toText(payload.resp?.requestId || payload.response?.requestId);
    if (!originalRequestId) {
      return res.status(400).json({ error: "Missing response.requestId linking to original request." });
    }

    try {
      const tx = M2TransactionStore.getTransaction(originalRequestId);
      if (tx) {
        const consentRequestId = payload.consentRequest?.id;
        
        const updateData = {};
        if (consentRequestId) updateData.consentRequestId = consentRequestId;
        if (payload.error) {
          updateData.currentState = "Failed";
          updateData.error = payload.error;
        } else {
          updateData.currentState = "GatewayAcknowledged";
        }
        
        await M2TransactionStore.updateTransaction(tx.transactionId, updateData);

        await M2TransactionStore.appendAuditEvent(tx.transactionId, "CONSENT_INIT_CALLBACK_RECEIVED", "Consent init callback processed.", {
          callbackRequestId: originalRequestId,
          consentRequestId,
          payload
        });
      }
      return res.status(202).json({ ok: true });
    } catch (err) {
      Logger.error("M2CallbackController", "Error processing consent init callback.", err);
      return res.status(500).json({ error: err.message });
    }
  }
`;

code = code.replace(/static async onConsentRequestInit\([\s\S]*?static async onConsentRequestStatus\(/, replacement + "\n  static async onConsentRequestStatus(");
fs.writeFileSync(file, code);
