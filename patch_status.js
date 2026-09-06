const fs = require('fs');
let file = 'backend/m2/transfer/M2DataTransferManager.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix the success status
content = content.replace(
  /status: "TRANSFERRED",\s*hiStatus: "OK",/g,
  `status: "TRANSFERRED",
        hiStatus: "DELIVERED",`
);

// 2. Add notification to failTransfer
const failTransferRegex = /async failTransfer\(transactionId, error\) \{[\s\S]*?const tx = await M2TransactionStore\.transitionState\(transactionId, "Failed", \{[\s\S]*?reason: \`Data transfer failed: \$\{error\.message\}\`[\s\S]*?\}\);\s*return tx;\s*\}/m;

const failTransferReplacement = `async failTransfer(transactionId, error) {
    Logger.warn("M2DataTransferManager", "Marking data transfer transaction as Failed.", { transactionId });
    const tx = await M2TransactionStore.transitionState(transactionId, "Failed", {
      reason: \`Data transfer failed: \${error.message}\`
    });

    try {
      if (tx.gatewayRequestId && tx.consentId && tx.transactionId) {
        await this.sendHealthInformationNotify(tx, {
          requestId: tx.gatewayRequestId || tx.requestId || transactionId,
          consentId: tx.consentId,
          transactionId: tx.transactionId,
          status: "FAILED",
          hiStatus: "ERRORED",
          description: \`Data transfer failed: \${error.message}\`
        });
      }
    } catch (notifyErr) {
      Logger.error("M2DataTransferManager", "Failed to send FAILED health information notify.", notifyErr);
    }

    return tx;
  }`;

content = content.replace(failTransferRegex, failTransferReplacement);

// 3. Fix HTTP pseudo-success
const pseudoSuccessRegex = /if \(statusCode === 400 && err\.response\?\.data\?\.error\?\.code === 9999\) \{[\s\S]*?return pseudoAcknowledgement;\s*\}/m;

const pseudoSuccessReplacement = `if (statusCode === 400 && err.response?.data?.error?.code === 9999) {
          // PROMPT #7: SUCCESS MUST MEAN SUCCESS. Do not automatically treat HTTP 400 + ABDM-9999 as pseudo-success.
          // The M2 reference does not support this.
          // Removed sandbox-specific pseudo-success behavior.
        }`;

content = content.replace(pseudoSuccessRegex, pseudoSuccessReplacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched M2DataTransferManager statuses and pseudo-success');
