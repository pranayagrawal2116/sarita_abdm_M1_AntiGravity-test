const fs = require('fs');
let code = fs.readFileSync('backend/m3/controllers/M3CallbackController.js', 'utf8');

const oldLoop = `        for (const artefact of notification.consentArtefacts) {
          // Optionally Auto-fetch the artefact
          await M3ConsentService.fetchConsentArtefact(artefact.id);
        }`;

const newLoop = `        for (const artefact of notification.consentArtefacts) {
          try {
             await M3ConsentService.fetchConsentArtefact(artefact.id);
             // Add a 250ms delay to prevent ABDM Sandbox rate limiting / burst drops
             await new Promise(r => setTimeout(r, 250));
          } catch(e) {
             const Logger = require("../logging/logger");
             Logger.error("M3Callback", "Failed to fetch artefact in hiuNotify, continuing with others", { id: artefact.id, error: e.message });
          }
        }`;

if (code.includes('await M3ConsentService.fetchConsentArtefact(artefact.id);')) {
    code = code.replace(oldLoop, newLoop);
    fs.writeFileSync('backend/m3/controllers/M3CallbackController.js', code);
    console.log("Patched hiuNotify");
} else {
    console.log("Could not find the loop");
}
