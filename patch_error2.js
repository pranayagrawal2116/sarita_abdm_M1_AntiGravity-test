const fs = require('fs');
const file = 'backend/m2/controllers/m2ConsentController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /Logger\.error\("M2ConsentController", "Failed to request health information through M2HealthInformationRequestManager\.", err\.response\?\.data \|\| err\);/,
  `console.log("ACTUAL GATEWAY ERROR:", err.response?.data); Logger.error("M2ConsentController", "Failed to request...", err);`
);

fs.writeFileSync(file, content);
