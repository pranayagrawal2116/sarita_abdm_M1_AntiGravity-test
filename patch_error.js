const fs = require('fs');
const file = 'backend/m2/controllers/m2ConsentController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /Logger\.error\("M2ConsentController", "Failed to request health information through M2HealthInformationRequestManager\.", err\);/,
  `Logger.error("M2ConsentController", "Failed to request health information through M2HealthInformationRequestManager.", err.response?.data || err);`
);

fs.writeFileSync(file, content);
