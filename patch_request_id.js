const fs = require('fs');
const file = 'backend/m2/healthInformation/M2HealthInformationRequestManager.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const requestId = \`req_\$\{uuidv4\(\)\}\`;/,
  `const requestId = uuidv4();`
);

fs.writeFileSync(file, content);
