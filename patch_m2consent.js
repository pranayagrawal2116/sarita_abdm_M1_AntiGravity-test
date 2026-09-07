const fs = require('fs');
let content = fs.readFileSync('backend/m2/controllers/m2ConsentController.js', 'utf8');

content = content.replace(
  /const headers = \{\n\s*\.\.\.getHeaders\(token\),/g,
  `const headers = {\n    ...getHeaders(token, requestId, payload.timestamp),`
);

fs.writeFileSync('backend/m2/controllers/m2ConsentController.js', content);
console.log("Patched M2ConsentController");
