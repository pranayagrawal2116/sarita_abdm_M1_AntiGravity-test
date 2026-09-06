const fs = require('fs');

let pres = fs.readFileSync('backend/m2/fhir/prescriptionRecordGenerator.js', 'utf8');

pres = pres.replace(
  /reasonCode: \[\s*\{\s*coding: \[\{ system: SNOMED_SYSTEM, code: med\.indicationSnomedCode, display: med\.indicationText \}\],\s*text: med\.indicationText\s*\}\s*\]/m,
  `reasonCode: [
      {
        coding: med.indicationSnomedCode ? [{ system: SNOMED_SYSTEM, code: med.indicationSnomedCode, display: med.indicationText }] : [],
        text: med.indicationText
      }
    ]`
);

fs.writeFileSync('backend/m2/fhir/prescriptionRecordGenerator.js', pres, 'utf8');
console.log('Patched prescription reason code');
