const fs = require('fs');
const file = 'backend/m3/controllers/m3CallbackController.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /if \(!updated\) \{\s*const consents = M3ConsentStore\.getConsents\(\);\s*const latestPending = \[\.\.\.consents\]\.reverse\(\)\.find\(c => c\.status === "REQUESTED" \|\| c\.status === "INITIATED"\);\s*if \(latestPending\) \{\s*latestPending\.consentRequestId = notification\.consentRequestId;\s*latestPending\.status = notification\.status;\s*latestPending\.updatedAt = timestamp;\s*M3ConsentStore\.save\(\);\s*\}\s*\}/;

if (regex.test(content)) {
  content = content.replace(regex, `if (!updated) {
           Logger.warn("M3Callback", "consentRequestId not found for status update. Discarding unrelated callback.", { consentRequestId: notification.consentRequestId, status: notification.status });
         }`);
  fs.writeFileSync(file, content);
  console.log("Patched successfully.");
} else {
  console.log("Regex not found.");
}
