const fs = require('fs');
let content = fs.readFileSync('backend/controllers/scanShareController.js', 'utf8');

content = content.replace(
  /headers: getHeaders\(gatewayToken\),/g,
  'headers: getHeaders(gatewayToken, payload.requestId, payload.timestamp),'
);

fs.writeFileSync('backend/controllers/scanShareController.js', content);
console.log("Patched scanShareController.js");
