const fs = require('fs');
let content = fs.readFileSync('backend/m2/controllers/m2CallbackController.js', 'utf8');

content = content.replace(
  /const notifyPayload = \{\n\s*requestId: require\("crypto"\)\.randomUUID\(\),\n\s*timestamp: new Date\(\)\.toISOString\(\),/g,
  `const reqId = require("crypto").randomUUID();\n          const ts = new Date().toISOString();\n          const notifyPayload = {\n            requestId: reqId,\n            timestamp: ts,`
);
content = content.replace(
  /\{ headers: \{ \.\.\.getHeaders\(token\), "X-HIU-ID": hiuId \} \}/g,
  `{ headers: { ...getHeaders(token, reqId, ts), "X-HIU-ID": hiuId } }`
);

fs.writeFileSync('backend/m2/controllers/m2CallbackController.js', content);
console.log("Patched M2CallbackController");
