const fs = require('fs');

let consentController = fs.readFileSync('backend/m3/controllers/m3ConsentController.js', 'utf8');

consentController = consentController.replace(
  /const targetUserDir = dirs\.find\(d => d\.includes\("@sbx"\)\);/g,
  `let targetUserDir = dirs.find(d => d.includes("@sbx"));
      const docIdVar = typeof docId !== 'undefined' ? docId : null;
      const consentReq = M3ConsentStore.consents.find(c => c.artefactDetails && c.artefactDetails[hipId || docIdVar]);
      if (consentReq && consentReq.patientId) {
        const found = dirs.find(d => d.startsWith(consentReq.patientId));
        if (found) targetUserDir = found;
      }`
);

fs.writeFileSync('backend/m3/controllers/m3ConsentController.js', consentController, 'utf8');
console.log("Consent controller updated.");

let callbackController = fs.readFileSync('backend/m3/controllers/m3CallbackController.js', 'utf8');
callbackController = callbackController.replace(
  /let targetUserDir = dirs\.find\(d => d\.includes\("@sbx"\)\);/g,
  `let targetUserDir = dirs.find(d => d.includes("@sbx"));
      const transaction = M3ConsentStore.getTransaction(transactionId);
      if (transaction && transaction.consentId) {
        const consentReq = M3ConsentStore.consents.find(c => c.artefactDetails && c.artefactDetails[transaction.consentId]);
        if (consentReq && consentReq.patientId) {
          const found = dirs.find(d => d.startsWith(consentReq.patientId));
          if (found) targetUserDir = found;
        }
      }`
);

fs.writeFileSync('backend/m3/controllers/m3CallbackController.js', callbackController, 'utf8');
console.log("Callback controller updated.");
