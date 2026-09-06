const fs = require('fs');

let file = 'backend/m3/controllers/m3CallbackController.js';
let content = fs.readFileSync(file, 'utf8');

// Find the block starting with "if (!transaction) {" and ending before "if (transaction && transaction.consentId) {"
// Wait, the block is:
//       if (!transaction) {
//         M3ConsentStore.load();
//         const transactions = M3ConsentStore.transactions || {};
//         const pendingTxns = ...
//         // ...
//         if (transaction) {
//           M3ConsentStore.transactions[transactionId] = transaction;
//           M3ConsentStore.save();
//         }
//       }
const regex = /if \(!transaction\) \{\s*M3ConsentStore\.load\(\);\s*const transactions[\s\S]*?if \(transaction\) \{\s*M3ConsentStore\.transactions\[transactionId\] = transaction;\s*M3ConsentStore\.save\(\);\s*\}\s*\}/;

const replacement = `if (!transaction) {
        Logger.error("M3Callback", "Transaction ID not found. Discarding unmatched data push.");
        return;
      }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log("Patched correlation");
