const fs = require('fs');
const file = 'backend/m2/controllers/m2ConsentController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const outbound = await postHealthInformationRequestToAbdm/,
  `let outbound; try { outbound = await postHealthInformationRequestToAbdm`
);

content = content.replace(
  /req,\n\s*\}\);\n\s*await M2TransactionStore\.appendAuditEvent/g,
  `req,\n      });\n} catch (e) { console.log("SECOND TRY CATCH ACTUAL GATEWAY ERROR", e.response?.data); throw e; }\n\n      await M2TransactionStore.appendAuditEvent`
);

fs.writeFileSync(file, content);
