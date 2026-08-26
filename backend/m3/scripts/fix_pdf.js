const fs = require('fs');
let code = fs.readFileSync('backend/m3/controllers/m3ConsentController.js', 'utf8');
code = code.replace(
  /const consentReq = M3ConsentStore\.consents\.find\(c => c\.artefactDetails && c\.artefactDetails\[hipId \|\| docIdVar\]\);/g,
  `const consentReq = typeof hipId !== 'undefined' ? M3ConsentStore.getConsents().find(c => c.artefactDetails && c.artefactDetails[hipId]) : null;`
);
fs.writeFileSync('backend/m3/controllers/m3ConsentController.js', code, 'utf8');
console.log("Fixed ReferenceError");
