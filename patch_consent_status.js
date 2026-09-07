const fs = require('fs');
const file = 'backend/m2/consent/M2ConsentManager.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /else if \(notificationStatus === "DENIED" \|\| notificationStatus === "REVOKED" \|\| notificationStatus === "EXPIRED"\) statusMapping = "Rejected";/;
const replacement = `else if (notificationStatus === "DENIED") statusMapping = "Rejected";
    else if (notificationStatus === "REVOKED") statusMapping = "Revoked";
    else if (notificationStatus === "EXPIRED") statusMapping = "Expired";`;

if (content.match(regex)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content);
  console.log("Patched M2ConsentManager.");
} else {
  console.log("Regex not found.");
}
