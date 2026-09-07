const fs = require('fs');

const file3 = 'backend/services/fhirEncryptionService.js';
let content3 = fs.readFileSync(file3, 'utf8');
content3 = content3.replace(/const checksum = crypto\.createHash\("sha256"\)\.update\(encryptedContent\)\.digest\("hex"\);/g, '');
content3 = content3.replace(/checksum,/g, '');
fs.writeFileSync(file3, content3);

const file4 = 'backend/m3/controllers/m3CallbackController.js';
let content4 = fs.readFileSync(file4, 'utf8');
content4 = content4.replace(/if \(entry\.checksum\) \{[\s\S]*?\}/g, '');
fs.writeFileSync(file4, content4);

console.log("Removed checksum M3");
