const fs = require('fs');

// Patch M3CallbackController
let controllerFile = 'backend/m3/controllers/m3CallbackController.js';
let content = fs.readFileSync(controllerFile, 'utf8');

// 1. Remove the fallback in hiuNotify
const hiuNotifyFallbackRegex = /if \(\!updated\) \{[\s\S]*?Logger\.warn\("M3Callback", "consentRequestId not found, falling back to latest pending request"\);[\s\S]*?M3ConsentStore\.save\(\);\s*\}\s*\}/;

content = content.replace(hiuNotifyFallbackRegex, `if (!updated) {
            Logger.error("M3Callback", "consentRequestId not found. Discarding unrelated callback.");
            return;
        }`);

// 2. Remove the fallback in healthInfoTransfer
const hiTransferFallbackRegex = /if \(\!transaction\) \{[\s\S]*?M3ConsentStore\.load\(\);\s*const transactions = M3ConsentStore\.transactions \|\| \{\};[\s\S]*?Logger\.warn\("M3Callback", "Fallback used: Mapped unmapped transaction to incoming health data via careContext matching", \{ transactionId \}\);[\s\S]*?else \{[\s\S]*?Logger\.error\("M3Callback", "Ambiguous fallback: Could not match transaction even with careContextReference"[\s\S]*?\}[\s\S]*?\}/;

content = content.replace(hiTransferFallbackRegex, `if (!transaction) {
        Logger.error("M3Callback", "Transaction not found for transactionId. Discarding data.", { transactionId });
      }`);

fs.writeFileSync(controllerFile, content, 'utf8');
console.log("Patched correlation fallbacks in m3CallbackController.js");

// Patch M3ConsentStore for atomic writes
let storeFile = 'backend/m3/store/M3ConsentStore.js';
let storeContent = fs.readFileSync(storeFile, 'utf8');

storeContent = storeContent.replace(
  /fs\.writeFileSync\(storePath, JSON\.stringify\(\{[\s\S]*?\}\), "utf-8"\);/g,
  `const tempPath = storePath + ".tmp";
      fs.writeFileSync(tempPath, JSON.stringify({
        consents: this.consents,
        transactions: this.transactions || {}
      }, null, 2), "utf-8");
      fs.renameSync(tempPath, storePath);`
);

fs.writeFileSync(storeFile, storeContent, 'utf8');
console.log("Patched atomic persistence in M3ConsentStore.js");
