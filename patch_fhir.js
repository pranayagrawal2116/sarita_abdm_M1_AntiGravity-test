const fs = require('fs');

let fhirHelpers = fs.readFileSync('backend/m2/fhir/fhirHelpers.js', 'utf8');

// Patch MedicationRequest
fhirHelpers = fhirHelpers.replace(
  /medicationCodeableConcept: \{\s*coding: \[\s*\{\s*system: "http:\/\/snomed.info\/sct",\s*code: medCode,\s*display: medDisplay\s*\}\s*\],\s*text: medDisplay\s*\}/m,
  `medicationCodeableConcept: {
      coding: medCode ? [
        {
          system: "http://snomed.info/sct",
          code: medCode,
          display: medDisplay
        }
      ] : [],
      text: medDisplay
    }`
);

fs.writeFileSync('backend/m2/fhir/fhirHelpers.js', fhirHelpers, 'utf8');
console.log('Patched fhirHelpers.js');
