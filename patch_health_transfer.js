const fs = require('fs');
let code = fs.readFileSync('backend/m3/controllers/M3CallbackController.js', 'utf8');

const oldFallback = `      // Fallback for missing on-request webhook or race conditions
      if (!transaction) {
        M3ConsentStore.load();
        const transactions = M3ConsentStore.transactions || {};
        const pendingTxns = Object.values(transactions).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (pendingTxns.length > 0) {
          transaction = pendingTxns[0];
          
          // Re-key it immediately so future chunks map correctly
          M3ConsentStore.transactions[transactionId] = transaction;
          M3ConsentStore.save();
          Logger.warn("M3Callback", "Fallback used: Mapped unmapped transaction to incoming health data", { transactionId });
        }
      }`;

const newFallback = `      // Wait for on-request webhook to arrive (up to 4 seconds) to avoid race conditions with multiple HIPs
      let retries = 0;
      while (!transaction && retries < 8) {
          await new Promise(r => setTimeout(r, 500));
          M3ConsentStore.load();
          transaction = M3ConsentStore.getTransaction(transactionId);
          retries++;
      }

      // Fallback for missing on-request webhook or race conditions
      if (!transaction) {
        M3ConsentStore.load();
        const transactions = M3ConsentStore.transactions || {};
        const pendingTxns = Object.values(transactions).filter(t => t.transactionId === t.requestId).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (pendingTxns.length === 1) {
          transaction = pendingTxns[0];
          
          // Re-key it immediately so future chunks map correctly
          M3ConsentStore.transactions[transactionId] = transaction;
          M3ConsentStore.save();
          Logger.warn("M3Callback", "Fallback used: Mapped unmapped transaction to incoming health data", { transactionId });
        } else if (pendingTxns.length > 1) {
          Logger.error("M3Callback", "Ambiguous fallback: Multiple pending transactions found and on-request webhook is missing", { transactionId, count: pendingTxns.length });
        }
      }`;

code = code.replace(oldFallback, newFallback);
fs.writeFileSync('backend/m3/controllers/M3CallbackController.js', code);
console.log("Patched healthInfoTransfer");
