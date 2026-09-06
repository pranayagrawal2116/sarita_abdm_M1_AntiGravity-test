const fs = require('fs');
const file = 'backend/m2/consent/M2ConsentManager.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /const notificationStatus = payload\.notification\?\.status \|\| "GRANTED";/g,
  'const notificationStatus = payload.notification?.status || "UNKNOWN";'
);

content = content.replace(
  /const incomingConsentId = firstText\(\n      payload\.notification\?\.consentId,\n      consentDetail\.consentId\n    \);/g,
  `const incomingConsentId = firstText(
      payload.notification?.consentArtefacts?.[0]?.id,
      payload.notification?.consentId,
      consentDetail.consentId
    );`
);

content = content.replace(
  /const statusMapping = notificationStatus === "DENIED" \|\| notificationStatus === "REVOKED" \? "Rejected" : "Active";/g,
  `let statusMapping = "Requested";
    if (notificationStatus === "GRANTED") statusMapping = "Active";
    else if (notificationStatus === "DENIED" || notificationStatus === "REVOKED" || notificationStatus === "EXPIRED") statusMapping = "Rejected";`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched notificationStatus');
