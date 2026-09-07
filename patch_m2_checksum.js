const fs = require('fs');

const file1 = 'backend/m2/transfer/M2DataTransferManager.js';
let content1 = fs.readFileSync(file1, 'utf8');
content1 = content1.replace(/checksum: encryptionRes\.metadata\.checksum,/g, '');
content1 = content1.replace(/checksumStr \+= encryptionRes\.metadata\.checksum;/g, '');
content1 = content1.replace(/let checksumStr = "";/g, '');
content1 = content1.replace(/const overallChecksum = crypto\.createHash\("sha256"\)\.update\(checksumStr\)\.digest\("hex"\);/g, '');
content1 = content1.replace(/encryptionMetadata: \{ checksum: overallChecksum \},/g, '');
content1 = content1.replace(/checksum: crypto\.createHash\("sha256"\)\.update\(encryptedEntries\)\.digest\("hex"\),/g, '');
fs.writeFileSync(file1, content1);

const file2 = 'backend/m2/encryption/M2EncryptionService.js';
let content2 = fs.readFileSync(file2, 'utf8');
content2 = content2.replace(/const checksum = crypto\.createHash\("sha256"\)\.update\(encryptedPayload\)\.digest\("hex"\);/g, '');
content2 = content2.replace(/checksum,/g, '');
fs.writeFileSync(file2, content2);

console.log("Removed checksum");
