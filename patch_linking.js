const fs = require('fs');
let content = fs.readFileSync('backend/m2/controllers/m2HipLinkingController.js', 'utf8');

// The file has three places where it does this.
content = content.replace(
  /let responsePayload = \{\n      requestId: require\("uuid"\)\.v4\(\),\n      timestamp: require\("\.\.\/\.\.\/utils\/dateUtils"\)\.nowIso\(\),/g,
  `const reqId = require("uuid").v4();\n    const ts = require("../../utils/dateUtils").nowIso();\n    let responsePayload = {\n      requestId: reqId,\n      timestamp: ts,`
);

content = content.replace(
  /const responsePayload = \{\n      requestId: require\("uuid"\)\.v4\(\),\n      timestamp: nowIso\(\),/g,
  `const reqId = require("uuid").v4();\n    const ts = nowIso();\n    const responsePayload = {\n      requestId: reqId,\n      timestamp: ts,`
);

content = content.replace(
  /let responsePayload = \{\n      requestId: require\("uuid"\)\.v4\(\),\n      timestamp: nowIso\(\),/g,
  `const reqId = require("uuid").v4();\n    const ts = nowIso();\n    let responsePayload = {\n      requestId: reqId,\n      timestamp: ts,`
);

content = content.replace(/"REQUEST-ID": uuidv4\(\),\n          "TIMESTAMP": nowIso\(\)/g, `"REQUEST-ID": reqId,\n          "TIMESTAMP": ts`);

fs.writeFileSync('backend/m2/controllers/m2HipLinkingController.js', content);
console.log("Patched M2HipLinkingController");
