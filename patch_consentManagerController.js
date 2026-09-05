const fs = require('fs');
const file = 'backend/controllers/consentManagerController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/console\.log\(\`\\[HI REQUEST\\] Failed\. Status: \$\{status\}, Body: \$\{JSON\.stringify\(body\)\}\`\);/g, 'console.log(`[HI REQUEST] Failed. Status: ${status}, Body: <omitted for security>`);');
content = content.replace(/console\.log\("\\[HI CALLBACK STORED\\] Failed to store callback event \\(invalid body\\)"\);/g, 'console.log("[HI CALLBACK STORED] Failed to store callback event (invalid body)");');

fs.writeFileSync(file, content, 'utf8');
console.log('backend/controllers/consentManagerController.js sanitized');
