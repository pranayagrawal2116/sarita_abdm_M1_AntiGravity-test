const fs = require('fs');
const file = 'backend/m2/controllers/m2ConsentController.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
  static async fetchConsentInitCallback(req, res) {
    const requestId = toText(req.params?.requestId);
    if (!requestId) return res.status(400).json({ error: "requestId is required" });

    const tx = M2TransactionStore.getTransaction(requestId);
    if (!tx || !tx.consentRequestId) {
      return res.status(404).json({ error: "Callback not received yet for this requestId" });
    }

    return res.json({
      success: true,
      requestId,
      consentId: tx.consentRequestId, // Use the REAL Gateway Consent Request ID
      consentRequest: { id: tx.consentRequestId },
      payload: tx.consentDetails || {},
      source: "M2TransactionStore"
    });
  }
`;

code = code.replace(/static async fetchConsentInitCallback\([\s\S]*?static async fetchConsentStatusCallback\(/, replacement + "\n  static async fetchConsentStatusCallback(");
fs.writeFileSync(file, code);
