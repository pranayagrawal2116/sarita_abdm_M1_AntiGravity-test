const fs = require('fs');

// Patch M2FHIRBundleBuilder.js defaults
let fhirBuilder = fs.readFileSync('backend/m2/fhir/M2FHIRBundleBuilder.js', 'utf8');

// 1. Remove 2000-01-01 fallback
fhirBuilder = fhirBuilder.replace(
  /return "2000-01-01";/g,
  `return undefined;`
);

// 2. Remove fake snomed drug codes fallback
fhirBuilder = fhirBuilder.replace(
  /const inferDrugCode = \(drugName\) => \{[\s\S]*?\};/m,
  `const inferDrugCode = (drugName) => {
  const raw = text(drugName).toLowerCase();
  if (/para|acetaminophen|paracetamol/.test(raw)) return "387517004";
  if (/amoxicillin/.test(raw)) return "387544009";
  if (/pantoprazole/.test(raw)) return "1086921000168107";
  return undefined; // PROMPT #8: Removed arbitrary SNOMED fallback
};`
);

// 3. Remove fake snomed indication codes fallback
fhirBuilder = fhirBuilder.replace(
  /const inferIndicationCode = \(indicationText\) => \{[\s\S]*?\};/m,
  `const inferIndicationCode = (indicationText) => {
  const raw = text(indicationText).toLowerCase();
  if (/fever|pyrexia/.test(raw)) return "386661006";
  if (/pain|ache/.test(raw)) return "22253000";
  if (/gas|gastr|acid|reflux/.test(raw)) return "235595009";
  if (/cough/.test(raw)) return "49727002";
  return undefined; // PROMPT #8: Removed arbitrary SNOMED fallback
};`
);

fs.writeFileSync('backend/m2/fhir/M2FHIRBundleBuilder.js', fhirBuilder, 'utf8');
console.log('Patched M2FHIRBundleBuilder.js');
