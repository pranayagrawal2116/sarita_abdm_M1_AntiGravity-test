const fs = require('fs');
const testFile = 'backend/tests/abdmPayloadSchemaProtocolIntegrity.test.js';
let content = fs.readFileSync(testFile, 'utf8');

content = content.replace('require("../../utils/dateUtils").nowIso()', 'nowIso()');
content = content.replace('M2EncryptionService.encryptBundle("test data")', 'M2EncryptionService.encryptBundle("test data", "BCpsBW37KgfLyjxJK0zHHG26hDjxzK368DEO4PapzFhQM0cghZziKuvJh5/anTnHitVHKMn0Owr1HvcH1fm0DpA=", "0ka0stPfqmXWhX+ODC/iOFMO0PXFdRjBdcEGbv55qqc=")');

fs.writeFileSync(testFile, content);
console.log("Patched test script.");
