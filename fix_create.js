const fs = require('fs');
const file = 'backend/m2/consent/M2ConsentManager.js';
let content = fs.readFileSync(file, 'utf8');

// Replace the first occurrence of status: statusMapping back to status: "Requested"
content = content.replace(/status: statusMapping,\n        patientId: tx\.patientId,/g, 'status: "Requested",\n        patientId: tx.patientId,');

fs.writeFileSync(file, content, 'utf8');
