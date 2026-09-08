const fs = require('fs');
const file = 'backend/m2/healthInformation/M2HealthInformationRequestManager.js';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/const requestId = \`req_\$\{uuidv4\(\)\}\`;/g, 'const requestId = uuidv4();');

fs.writeFileSync(file, code);
