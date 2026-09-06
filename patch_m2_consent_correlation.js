const fs = require('fs');
const file = 'backend/m2/consent/M2ConsentManager.js';
let content = fs.readFileSync(file, 'utf8');

// Update static registerConsentNotification to use consentRequestId
content = content.replace(
  /const txContext = tx \|\| M2TransactionStore\.getTransaction\(payload\.notification\?\.consentId \|\| payload\.consentId\);/g,
  `const txContext = tx || M2TransactionStore.getTransaction(
      payload.notification?.consentRequestId || 
      payload.notification?.consentId || 
      payload.consentId
    );`
);

// Add safety check inside async registerConsentNotification
const target = `Logger.info("M2ConsentManager", "registerConsentNotification callback handler triggered.", {`;
const replacement = `if (!tx) {
      Logger.error("M2ConsentManager", "Unmatched consent callback received.", { payload });
      return { success: false, error: "Unmatched consent transaction" };
    }
    
    Logger.info("M2ConsentManager", "registerConsentNotification callback handler triggered.", {`;

content = content.replace(target, replacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched correlation');
