const fs = require('fs');
let content = fs.readFileSync('backend/utils/headers.js', 'utf8');
content = content.replace(
  /exports\.getHeaders = \(token = null\) => \{/,
  'exports.getHeaders = (token = null, customRequestId = null, customTimestamp = null) => {'
);
content = content.replace(
  /"REQUEST-ID": uuidv4\(\),/,
  '"REQUEST-ID": customRequestId || uuidv4(),'
);
content = content.replace(
  /"TIMESTAMP": nowIso\(\),/,
  '"TIMESTAMP": customTimestamp || nowIso(),'
);
fs.writeFileSync('backend/utils/headers.js', content);
console.log("Patched headers.js");
