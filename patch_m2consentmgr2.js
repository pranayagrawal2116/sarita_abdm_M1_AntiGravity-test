const fs = require('fs');
let content = fs.readFileSync('backend/m2/consent/M2ConsentManager.js', 'utf8');

content = content.replace(
  /resp: \{\n\s*requestId\n\s*\}/g,
  `resp: { requestId }, response: { requestId }`
);

fs.writeFileSync('backend/m2/consent/M2ConsentManager.js', content);
console.log("Patched M2ConsentManager");
