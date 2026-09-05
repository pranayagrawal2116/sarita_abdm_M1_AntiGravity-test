const fs = require('fs');
const file = 'backend/controllers/hipLinkingController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/console\.log\("Payload:", JSON\.stringify\(req\.body, null, 2\)\);/g, 'console.log("Payload:", "<omitted for security>");');
content = content.replace(/console\.log\("Body:", JSON\.stringify\(payload, null, 2\)\);/g, 'console.log("Body:", "<omitted for security>");');
content = content.replace(/console\.log\("Body:", JSON\.stringify\(body, null, 2\)\);/g, 'console.log("Body:", "<omitted for security>");');
content = content.replace(/console\.log\("Body:", JSON\.stringify\(req\.body, null, 2\)\);/g, 'console.log("Body:", "<omitted for security>");');
content = content.replace(/console\.log\("Payload:", JSON\.stringify\(payload, null, 2\)\);/g, 'console.log("Payload:", "<omitted for security>");');
content = content.replace(/console\.log\("Headers:", JSON\.stringify\(req\.headers, null, 2\)\);/g, 'console.log("Headers:", "<omitted for security>");');
content = content.replace(/console\.log\("Headers:", JSON\.stringify\(headers, null, 2\)\);/g, 'console.log("Headers:", "<omitted for security>");');
content = content.replace(/console\.log\("Data:", JSON\.stringify\(response\.data \|\| \{\}, null, 2\)\);/g, 'console.log("Data:", "<omitted for security>");');
content = content.replace(/console\.log\("Phone:", cleanPhone\);/g, 'console.log("Phone:", "<omitted for security>");');
content = content.replace(/console\.log\("Patient ID \\(ABHA\\):", patientId\);/g, 'console.log("Patient ID (ABHA):", "<omitted for security>");');
content = content.replace(/console\.log\("Patient Reference:", matchedPatientRef\);/g, 'console.log("Patient Reference:", "<omitted for security>");');

fs.writeFileSync(file, content, 'utf8');
console.log('backend/controllers/hipLinkingController.js sanitized');
