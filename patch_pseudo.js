const fs = require('fs');
let file = 'backend/m2/transfer/M2DataTransferManager.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /const isSandboxSuccess = statusCode === 400 && String\(abdmErrorCode\)\.includes\("ABDM-9999"\);[\s\S]*?if \(isSandboxSuccess\) \{[\s\S]*?return pseudoAcknowledgement;\s*\}/m;

content = content.replace(regex, `const isSandboxSuccess = false; // PROMPT #7: Removed sandbox-specific pseudo-success behavior.`);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched pseudo-success');
