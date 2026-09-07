const fs = require('fs');
const file = 'backend/controllers/scanShareController.js';
let content = fs.readFileSync(file, 'utf8');

const targetTry = `  try {
    if (!requestId) {
      return res.status(400).json({
        accepted: false,
        error: "requestId is required for Scan and Share callback",
      });
    }

    const issued = recordIssuedToken({`;

const replacementTry = `  try {
    if (!requestId) {
      return res.status(400).json({
        accepted: false,
        error: "requestId is required for Scan and Share callback",
      });
    }

    if (!patient.abhaAddress && !patient.abhaNumber && !patient.mobile && !patient.name) {
      return res.status(400).json({
        accepted: false,
        error: "Patient demographic identifiers are required. Application safety limit.",
      });
    }

    const issued = recordIssuedToken({`;

const targetCatch = `  } catch (error) {
    return res.status(202).json({
      accepted: false,
      requestId,
      hipId,
      error:`;

const replacementCatch = `  } catch (error) {
    if (error.message && error.message.includes("SCAN_SHARE_QUEUE_FULL")) {
        return res.status(503).json({
            accepted: false,
            requestId,
            hipId,
            error: "Application resource protection limit reached. Queue is full."
        });
    }

    return res.status(202).json({
      accepted: false,
      requestId,
      hipId,
      error:`;

if (content.includes(targetTry) && content.includes(targetCatch)) {
    content = content.replace(targetTry, replacementTry);
    content = content.replace(targetCatch, replacementCatch);
    fs.writeFileSync(file, content);
    console.log("Patched scanShareController.js validation and catch");
} else {
    console.log("Targets not found.");
}
