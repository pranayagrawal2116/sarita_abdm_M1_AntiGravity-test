const fs = require('fs');
let file = 'backend/m2/transfer/M2DataTransferManager.js';
let content = fs.readFileSync(file, 'utf8');

// Remove the suppression block
content = content.replace(
  /if \(currentTx\.unmatchedConsentContext\) \{[\s\S]*?return \{[\s\S]*?\};\s*\}/m,
  '/* suppression removed */'
);

fs.writeFileSync(file, content, 'utf8');

file = 'backend/m2/callbacks/M2CallbackManager.js';
content = fs.readFileSync(file, 'utf8');
content = content.replace(
  /unmatchedConsentContext: type === "Consent Notification" && \!matchMeta\?\.tx,/g,
  '// unmatchedConsentContext removed'
);
fs.writeFileSync(file, content, 'utf8');

console.log('Patched unmatched consent logic.');
