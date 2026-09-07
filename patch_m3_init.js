const fs = require('fs');
let content = fs.readFileSync('backend/m3/services/m3ConsentService.js', 'utf8');

content = content.replace(
  /const abdmPayload = \{\n\s*consent: \{/g,
  `const abdmPayload = {\n        requestId: requestId,\n        timestamp: timestamp,\n        consent: {`
);

fs.writeFileSync('backend/m3/services/m3ConsentService.js', content);
console.log("Patched M3 init");
