const fs = require('fs');
const file = 'backend/m2/consent/M2ConsentManager.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix synchronizeConsentWorkflow
content = content.replace(
  /if \(tx\.consentDetails && tx\.currentState !== "CONSENT_GRANTED"\) \{/g,
  'if (tx.consentStatus === "GRANTED" && tx.currentState !== "CONSENT_GRANTED") {'
);
content = content.replace(
  /reason: "Consent Stored"/g,
  'reason: "Consent Granted"'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched M2ConsentManager.js');
