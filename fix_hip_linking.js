const fs = require('fs');
let content = fs.readFileSync('backend/m2/controllers/m2HipLinkingController.js', 'utf8');

// modify name
content = content.replace(/name: patientDetails\.name \|\| "Patient Record"/g, 'name: (patientDetails.name || "Patient Record").substring(0, 44)');

fs.writeFileSync('backend/m2/controllers/m2HipLinkingController.js', content);
