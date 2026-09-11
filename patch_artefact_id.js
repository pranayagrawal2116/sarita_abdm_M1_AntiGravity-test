const fs = require('fs');
let content = fs.readFileSync('backend/m3/controllers/m3CallbackController.js', 'utf-8');

const target = `                    currentState: "Granted",
                    consentDetails: {
                       ...tx.consentDetails,
                       status: "GRANTED",
                       consentArtefacts: notification.consentArtefacts
                    }`;

const replacement = `                    currentState: "Granted",
                    consentArtifactId: (notification.consentArtefacts && notification.consentArtefacts.length > 0) ? notification.consentArtefacts[0].id : undefined,
                    consentDetails: {
                       ...tx.consentDetails,
                       status: "GRANTED",
                       consentArtefacts: notification.consentArtefacts
                    }`;

content = content.replace(target, replacement);
fs.writeFileSync('backend/m3/controllers/m3CallbackController.js', content);
console.log("Patched consentArtifactId in m3CallbackController");
