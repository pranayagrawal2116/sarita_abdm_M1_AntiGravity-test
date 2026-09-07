const fs = require('fs');
let content = fs.readFileSync('backend/m2/transfer/M2DataTransferManager.js', 'utf8');

content = content.replace(/\/\* checksum removed \*\//g, 'checksum: undefined');

fs.writeFileSync('backend/m2/transfer/M2DataTransferManager.js', content);
console.log("Fixed syntax error");
