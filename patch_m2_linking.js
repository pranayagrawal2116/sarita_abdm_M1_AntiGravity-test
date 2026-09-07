const fs = require('fs');

const file1 = 'backend/m2/controllers/m2HipLinkingController.js';
let content1 = fs.readFileSync(file1, 'utf8');

// Patch on-discover
content1 = content1.replace(/let responsePayload = \{\n\s*transactionId: transactionId,\n\s*response: \{\n\s*requestId: requestId\n\s*\}\n\s*\};/, `let responsePayload = {\n      requestId: require("uuid").v4(),\n      timestamp: require("../../utils/dateUtils").nowIso(),\n      transactionId: transactionId,\n      resp: {\n        requestId: requestId\n      }\n    };`);

// Patch on-init
content1 = content1.replace(/const responsePayload = \{\n\s*transactionId: transactionId,\n\s*link: \{\n\s*referenceNumber: referenceNumber,\n\s*authenticationType: "MEDIATE",\n\s*meta: \{\n\s*communicationMedium: "MOBILE",\n\s*communicationHint: "OTP",\n\s*communicationExpiry: nowIso\(new Date\(Date.now\(\) \+ 5 \* 60000\)\)\n\s*\}\n\s*\},\n\s*response: \{\n\s*requestId: requestId\n\s*\}\n\s*\};/, `const responsePayload = {\n      requestId: require("uuid").v4(),\n      timestamp: nowIso(),\n      transactionId: transactionId,\n      link: {\n        referenceNumber: referenceNumber,\n        authenticationType: "MEDIATE",\n        meta: {\n          communicationMedium: "MOBILE",\n          communicationHint: "OTP",\n          communicationExpiry: nowIso(new Date(Date.now() + 5 * 60000))\n        }\n      },\n      resp: {\n        requestId: requestId\n      }\n    };`);

// Patch on-confirm
content1 = content1.replace(/let responsePayload = \{\n\s*response: \{\n\s*requestId: requestId\n\s*\}\n\s*\};/, `let responsePayload = {\n      requestId: require("uuid").v4(),\n      timestamp: nowIso(),\n      resp: {\n        requestId: requestId\n      }\n    };`);

fs.writeFileSync(file1, content1);

console.log("Patched M2 Linking Controller.");
