const fs = require('fs');
let content = fs.readFileSync('backend/m2/transfer/M2DataTransferManager.js', 'utf8');

content = content.replace(
  /const baseHeaders = getHeaders\(token\);/,
  `const reqId = require("uuid").v4();\n    const ts = new Date().toISOString();\n    const baseHeaders = getHeaders(token, reqId, ts);`
);
content = content.replace(
  /requestId: require\("uuid"\)\.v4\(\),/,
  'requestId: reqId,'
);
content = content.replace(
  /timestamp: new Date\(\)\.toISOString\(\),/,
  'timestamp: ts,'
);

fs.writeFileSync('backend/m2/transfer/M2DataTransferManager.js', content);
console.log("Patched M2DataTransferManager");
