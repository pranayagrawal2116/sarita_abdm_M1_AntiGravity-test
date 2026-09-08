const fs = require('fs');
const file = 'backend/m2/consent/M2ConsentManager.js';
let code = fs.readFileSync(file, 'utf8');

// Require uuid if not present
if (!code.includes('require("uuid")')) {
  code = code.replace(/const Logger = require\("\.\.\/logging\/logger"\);/, 'const Logger = require("../logging/logger");\nconst { v4: uuidv4 } = require("uuid");');
}

code = code.replace(/requestId: consentData\.requestId \|\| \`req_\$\{Date\.now\(\)\}\`,/g, 'requestId: consentData.requestId || uuidv4(),');
code = code.replace(/consentId: consentData\.consentId \|\| \`consent_\$\{Date\.now\(\)\}\`,/g, 'consentId: consentData.consentId || uuidv4(),');
code = code.replace(/const tempId = consentData\.transactionId \|\| \`tx_\$\{Date\.now\(\)\}\`;/g, 'const tempId = consentData.transactionId || uuidv4();');

fs.writeFileSync(file, code);
