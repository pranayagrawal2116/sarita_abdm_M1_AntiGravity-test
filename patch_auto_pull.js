const fs = require('fs');
let code = fs.readFileSync('backend/m3/controllers/M3CallbackController.js', 'utf8');

// 1. Add auto-pull to onConsentFetch
const fetchReplacement = `        Object.assign(consentReq, {
          status: "FETCHED",
          artefactDetails: consentReq.artefactDetails,
          details: consent.consentDetail // keep backward compatibility for single artefact
        });
        M3ConsentStore.save();
        
        // Auto-trigger data pull for this HIP
        try {
          const M3ConsentService = require("../services/m3ConsentService");
          setTimeout(async () => {
             try {
                const patientId = consentReq.patientId || consent.consentDetail.patient.id;
                await M3ConsentService.requestHealthInformation(consent.consentDetail.consentId, patientId);
                const Logger = require("../logging/logger");
                Logger.info("M3Callback", "Auto-requested health info for HIP", { consentId: consent.consentDetail.consentId });
             } catch(err) {
                const Logger = require("../logging/logger");
                Logger.error("M3Callback", "Auto data pull failed", { error: err.message });
             }
          }, 1000);
        } catch (e) {
        }
`;

code = code.replace(/Object\.assign\(consentReq, {[\s\S]*?M3ConsentStore\.save\(\);/, fetchReplacement);

// 2. Add hasData flag to healthInfoTransfer
const transferReplacement = `        if (consentReq && consentReq.patientId) {
          abhaId = consentReq.patientId;
          if (entries && entries.length > 0 && consentReq.artefactDetails[transaction.consentId]) {
              consentReq.artefactDetails[transaction.consentId].hasData = true;
              M3ConsentStore.save();
          }
        }`;

code = code.replace(/if \(consentReq && consentReq\.patientId\) {\s*abhaId = consentReq\.patientId;\s*}/, transferReplacement);

fs.writeFileSync('backend/m3/controllers/M3CallbackController.js', code);
console.log("Patched backend for auto pull and hasData flag");
