const fs = require('fs');

let file = 'backend/m2/transfer/M2DataTransferManager.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /\/\/ Older automated-link registrations did not retain a document-to-care[\s\S]*?if \(fallback && requestedRef\) \{[\s\S]*?\}[\s\S]*?\}/m;

content = content.replace(regex, `// PROMPT #8: Removed arbitrary bundle fallback. Lookups must be deterministic and return explicit not-found if no exact match exists.`);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched fallback');
