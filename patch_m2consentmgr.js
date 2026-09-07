const fs = require('fs');
let content = fs.readFileSync('backend/m2/consent/M2ConsentManager.js', 'utf8');

content = content.replace(
  /const baseHeaders = getHeaders\(token\);/,
  `const reqId = require("uuid").v4();\n    const ts = new Date().toISOString();\n    const baseHeaders = getHeaders(token, reqId, ts);`
);
content = content.replace(
  /const body = \{\n\s*acknowledgement: \{\n\s*status,\n\s*consentId\n\s*\},\n\s*response: \{\n\s*requestId\n\s*\}\n\s*\};/,
  `const body = {\n      requestId: reqId,\n      timestamp: ts,\n      acknowledgement: {\n        status,\n        consentId\n      },\n      resp: {\n        requestId\n      }\n    };`
);

fs.writeFileSync('backend/m2/consent/M2ConsentManager.js', content);
console.log("Patched M2ConsentManager");
