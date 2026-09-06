const fs = require('fs');

let file = 'backend/m2/transfer/M2DataTransferManager.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /selectedPayload\.meta\?\.careContextReference,/g,
  `selectedPayload.meta?.careContextReference, selectedPayload.bundle?.meta?.careContextReference,`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched care context reference extraction');
