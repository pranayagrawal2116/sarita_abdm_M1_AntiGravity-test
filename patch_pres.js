const fs = require('fs');

let pres = fs.readFileSync('backend/m2/fhir/prescriptionRecordGenerator.js', 'utf8');

pres = pres.replace(
  /medicationCodeableConcept: \{\s*coding: \[\{ system: SNOMED_SYSTEM, code: med\.drugSnomedCode, display: med\.drugName \}\],\s*text: med\.drugName\s*\}/m,
  `medicationCodeableConcept: {
      coding: med.drugSnomedCode ? [{ system: SNOMED_SYSTEM, code: med.drugSnomedCode, display: med.drugName }] : [],
      text: med.drugName
    }`
);

fs.writeFileSync('backend/m2/fhir/prescriptionRecordGenerator.js', pres, 'utf8');
console.log('Patched prescriptionRecordGenerator.js');
