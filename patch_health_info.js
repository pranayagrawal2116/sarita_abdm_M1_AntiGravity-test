const fs = require('fs');
let file = 'backend/m2/healthInformation/M2HealthInformationRequestManager.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const details = tx\.hiRequestDetails;\s*details\.status = "Cancelled";\s*details\.updatedAt = Date\.now\(\);\s*await M2TransactionStore\.updateTransaction\(tx\.transactionId, \{\s*hiRequestDetails: details\s*\}\);/g,
  `await M2TransactionStore.updateTransaction(tx.transactionId, (currentTx) => ({
      hiRequestDetails: { ...currentTx.hiRequestDetails, status: "Cancelled", updatedAt: Date.now() }
    }));`
);

content = content.replace(
  /const details = tx\.hiRequestDetails;\s*details\.status = "Expired";\s*details\.updatedAt = Date\.now\(\);\s*await M2TransactionStore\.updateTransaction\(tx\.transactionId, \{\s*hiRequestDetails: details\s*\}\);/g,
  `await M2TransactionStore.updateTransaction(tx.transactionId, (currentTx) => ({
      hiRequestDetails: { ...currentTx.hiRequestDetails, status: "Expired", updatedAt: Date.now() }
    }));`
);

content = content.replace(
  /details\.status = "Failed";\s*details\.error = payload\.error;\s*details\.updatedAt = Date\.now\(\);\s*await M2TransactionStore\.updateTransaction\(tx\.transactionId, \{\s*hiRequestDetails: details\s*\}\);/g,
  `await M2TransactionStore.updateTransaction(tx.transactionId, (currentTx) => ({
      hiRequestDetails: { ...currentTx.hiRequestDetails, status: "Failed", error: payload.error, updatedAt: Date.now() }
    }));`
);

content = content.replace(
  /details\.status = "Acknowledged";\s*details\.updatedAt = Date\.now\(\);\s*await M2TransactionStore\.updateTransaction\(tx\.transactionId, \{\s*hiRequestDetails: details\s*\}\);/g,
  `await M2TransactionStore.updateTransaction(tx.transactionId, (currentTx) => ({
      hiRequestDetails: { ...currentTx.hiRequestDetails, status: "Acknowledged", updatedAt: Date.now() }
    }));`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched M2HealthInformationRequestManager updaters');
