const fs = require('fs');

let file = 'backend/utils/scanShareTokenStore.js';
let content = fs.readFileSync(file, 'utf8');

const regexFind = /const existing = queue\.find\(\s*\(record\) =>\s*record\.patientFingerprint === fingerprint && isCoolingPeriodActive\(record\)\s*\);/;
const replaceFind = `const existing = queue.find((record) => record.requestId === payload.requestId);`;

content = content.replace(regexFind, replaceFind);
fs.writeFileSync(file, content, 'utf8');
console.log("Patched idempotency to use requestId");
