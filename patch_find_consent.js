const fs = require('fs');
const file = 'backend/m2/callbacks/M2CallbackManager.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const consentId = payload\.notification\?\.consentId \|\| payload\.notification\?\.consentDetail\?\.consentId;/g,
  'const consentId = payload.notification?.consentRequestId || payload.notification?.consentId || payload.notification?.consentDetail?.consentId;'
);

content = content.replace(
  /const tx = transactions\.find\(t => t\.consentId === consentId \|\| t\.consentDetails\?\.consentId === consentId\);/g,
  'const tx = transactions.find(t => t.consentRequestId === consentId || t.consentId === consentId || t.consentDetails?.consentId === consentId);'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched findConsentNotificationTransaction');
