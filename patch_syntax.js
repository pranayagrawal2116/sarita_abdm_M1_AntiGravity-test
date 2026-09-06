const fs = require('fs');

let file = 'backend/m2/transfer/M2DataTransferManager.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /\/\/ PROMPT #8: Removed arbitrary bundle fallback\. Lookups must be deterministic and return explicit not-found if no exact match exists\.\n      \}/m,
  `// PROMPT #8: Removed arbitrary bundle fallback. Lookups must be deterministic and return explicit not-found if no exact match exists.`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched syntax');
