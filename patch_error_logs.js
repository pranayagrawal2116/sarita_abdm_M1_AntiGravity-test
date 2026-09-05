const fs = require('fs');
const file = 'backend/controllers/hipLinkingController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/console\.error\("❌ \\[HIP NOTIFY CONTEXT ERROR\\] Failed to send notification to ABDM\. Status:", status, "Body:", body\);/g, 'console.error("❌ [HIP NOTIFY CONTEXT ERROR] Failed to send notification to ABDM. Status:", status, "Body:", "<omitted>");');
content = content.replace(/console\.error\("❌ \\[HIP LINK CONTEXT NOTIFY\\] ABDM reported an ERROR:", JSON\.stringify\(body\.error, null, 2\)\);/g, 'console.error("❌ [HIP LINK CONTEXT NOTIFY] ABDM reported an ERROR:", "<omitted>");');
content = content.replace(/console\.error\("❌ \\[HIP SMS NOTIFY ERROR\\] Status:", status, "Body:", body\);/g, 'console.error("❌ [HIP SMS NOTIFY ERROR] Status:", status, "Body:", "<omitted>");');

fs.writeFileSync(file, content, 'utf8');
console.log('Error logs patched');
