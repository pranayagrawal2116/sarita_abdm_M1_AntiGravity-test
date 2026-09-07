const fs = require('fs');
let content = fs.readFileSync('backend/controllers/scanShareController.js', 'utf8');

// Replace `toText(payload.intent)` with a function that extracts the type
content = content.replace(
  /const intentStr = toText\(payload\.intent\)\.toUpperCase\(\);/g,
  `const rawIntent = payload.intent || {};\n    const intentStr = toText(typeof rawIntent === 'object' ? rawIntent.type : rawIntent).toUpperCase();`
);

content = content.replace(
  /intent: toText\(payload\.intent\)\.toUpperCase\(\)/g,
  `intent: intentStr`
);

content = content.replace(
  /toText\(payload\.intent\)\.toUpperCase\(\) === "OPEN_PAYMENT_ORDER"/g,
  `(toText(typeof (payload.intent || {}) === 'object' ? (payload.intent || {}).type : payload.intent).toUpperCase() === "OPEN_PAYMENT_ORDER")`
);

fs.writeFileSync('backend/controllers/scanShareController.js', content);
console.log("Fixed intent parsing");
