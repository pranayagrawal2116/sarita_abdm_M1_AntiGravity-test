const fs = require('fs');
let file = 'backend/m2/transfer/M2DataTransferManager.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const result = await M2TransactionStore\.updateTransaction\(transactionId, \{\s*transferHistory: \[\.\.\.transferHistory, transferRecord\],\s*lastTransferRecord: transferRecord\s*\}\);/g,
  `const result = await M2TransactionStore.updateTransaction(transactionId, (tx) => ({
        transferHistory: [...(Array.isArray(tx.transferHistory) ? tx.transferHistory : []), transferRecord],
        lastTransferRecord: transferRecord
      }));`
);

content = content.replace(
  /const count = \(tx\.retryCount \|\| 0\) \+ 1;\s*await M2TransactionStore\.updateTransaction\(transactionId, \{\s*retryCount: count\s*\}\);/g,
  `await M2TransactionStore.updateTransaction(transactionId, (currentTx) => ({
      retryCount: (currentTx.retryCount || 0) + 1
    }));
    const updatedTx = M2TransactionStore.getTransaction(transactionId);
    const count = updatedTx.retryCount;`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched M2DataTransferManager updaters');
