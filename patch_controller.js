const fs = require('fs');
const file = 'backend/controllers/scanShareController.js';
let content = fs.readFileSync(file, 'utf8');

const target = `    if (!patient.abhaAddress && !patient.abhaNumber && !patient.mobile && !patient.name) {
      return res.status(400).json({
        accepted: false,
        error: "Patient demographic identifiers are required. Application safety limit.",
      });
    }`;

const replacement = `    if (!patient.abhaAddress && !patient.abhaNumber && !patient.mobile && !patient.name) {
      return res.status(400).json({
        accepted: false,
        error: "Patient demographic identifiers are required. Application safety limit.",
      });
    }

    const intentStr = toText(payload.intent).toUpperCase();
    if (!intentStr) {
      return res.status(400).json({ accepted: false, error: "intent is required by ABDM specification" });
    }
    const validIntents = ["PROFILE_SHARE", "RECORD_SHARE", "PAYMENT_SHARE", "OPEN_PAYMENT_ORDER"];
    if (!validIntents.includes(intentStr)) {
      return res.status(400).json({ accepted: false, error: "Unknown intent" });
    }

    if (intentStr === "RECORD_SHARE" && !payload.healthInfoBundle) {
      return res.status(400).json({ accepted: false, error: "healthInfoBundle is required for RECORD_SHARE" });
    }

    if (intentStr === "PAYMENT_SHARE" && !payload.paymentBundle) {
      return res.status(400).json({ accepted: false, error: "paymentBundle is required for PAYMENT_SHARE" });
    }`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content);
    console.log("Patched validation");
} else {
    console.log("Target not found");
}
