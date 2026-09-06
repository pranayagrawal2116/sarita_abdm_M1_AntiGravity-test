const fs = require('fs');
const file = 'backend/m2/callbacks/M2CallbackManager.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /if \(\!payload\.notification\.consentId && \!payload\.notification\.consentDetail\?\.consentId\) \{/g,
  'if (!payload.notification.consentId && !payload.notification.consentDetail?.consentId && !payload.notification.consentRequestId) {'
);

content = content.replace(
  /return \{ isValid: false, reason: "Consent Notify payload must contain notification\.consentId\." \};/g,
  'return { isValid: false, reason: "Consent Notify payload must contain notification.consentId or consentRequestId." };'
);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched M2CallbackManager validateCallback');
