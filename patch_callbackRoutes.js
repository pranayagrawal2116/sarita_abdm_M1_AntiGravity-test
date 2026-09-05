const fs = require('fs');
const file = 'backend/routes/callbackRoutes.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/console\.log\("Consent Status:", req\.body\);/g, 'console.log("Consent Status:", "<omitted for security>");');
content = content.replace(/console\.log\("Health Data:", req\.body\);/g, 'console.log("Health Data:", "<omitted for security>");');

fs.writeFileSync(file, content, 'utf8');
console.log('backend/routes/callbackRoutes.js sanitized');
