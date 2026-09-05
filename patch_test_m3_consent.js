const fs = require('fs');
const file = 'backend/test_m3_consent.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/clientId: "SBXID_010086"/g, 'clientId: process.env.ABDM_CLIENT_ID || "REPLACE_ME_CLIENT_ID"');
content = content.replace(/clientSecret: "bf9e7411-5b6a-47e0-ab6b-5809b4393bbe"/g, 'clientSecret: process.env.ABDM_CLIENT_SECRET || "REPLACE_ME_CLIENT_SECRET"');
content = content.replace(/id: "SBXID_010086"/g, 'id: process.env.ABDM_CLIENT_ID || "REPLACE_ME_CLIENT_ID"');

fs.writeFileSync(file, content, 'utf8');
console.log('backend/test_m3_consent.js patched');
