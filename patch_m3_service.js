const fs = require('fs');

const file1 = 'backend/m3/services/m3ConsentService.js';
let content1 = fs.readFileSync(file1, 'utf8');

// Patch checkConsentStatus
content1 = content1.replace(/const abdmPayload = \{\n\s*consentRequestId: consentRequestId\n\s*\};/, `const abdmPayload = {\n        requestId: requestId,\n        timestamp: timestamp,\n        consentRequestId: consentRequestId\n      };`);

// Patch fetchConsentArtefact
content1 = content1.replace(/const abdmPayload = \{\n\s*consentId: consentId\n\s*\};/, `const abdmPayload = {\n        requestId: requestId,\n        timestamp: timestamp,\n        consentId: consentId\n      };`);

// Patch requestHealthInformation
content1 = content1.replace(/const abdmPayload = \{\n\s*hiRequest: \{/g, `const abdmPayload = {\n        requestId: requestId,\n        timestamp: timestamp,\n        hiRequest: {`);

// Patch notifyHealthInformationStatus
content1 = content1.replace(/const abdmPayload = \{\n\s*notification: \{/g, `const abdmPayload = {\n        requestId: requestId,\n        timestamp: timestamp,\n        notification: {`);

fs.writeFileSync(file1, content1);

console.log("Patched M3 Consent Service.");
