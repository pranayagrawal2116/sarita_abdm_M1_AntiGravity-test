const fs = require('fs');
const file = 'backend/m2/controllers/m2CallbackController.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
  static async onConsentRequestStatus(req, res) {
    Logger.info("M2CallbackController", "onConsentRequestStatus callback triggered.");
    const payload = req.body || {};
    const headerRequestId = req.headers["request-id"] || req.headers["request_id"];
    
    const requestId = toText(payload.requestId || headerRequestId);
    const consentRequestId = toText(payload.notification?.consentRequestId);
    
    // In HIU notify, we get consentRequestId and consentArtefacts
    // We can map it to our local transaction by consentRequestId
    const consentId = toText(
      payload.consentId || 
      payload.notification?.consentId || 
      payload.consent?.id || 
      (payload.notification?.consentArtefacts && payload.notification.consentArtefacts[0]?.id) ||
      consentRequestId
    );

    if (!consentId && !consentRequestId) return res.status(400).json({ error: "consentId or consentRequestId is required." });
    if (!requestId) return res.status(400).json({ error: "requestId is required." });

    try {
      const normalizedPayload = {
        ...payload,
        requestId,
        notification: {
          ...(payload.notification || {}),
          consentId: consentId,
          consentRequestId: consentRequestId,
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
`;

code = code.replace(/static async onConsentRequestStatus\([\s\S]*?static async onHealthInformationOnRequest\(/, replacement + "\n  static async onHealthInformationOnRequest(");
fs.writeFileSync(file, code);
