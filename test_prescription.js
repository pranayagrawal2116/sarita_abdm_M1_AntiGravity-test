const fs = require('fs');
const { generatePrescriptionBundle } = require('./backend/m2/fhir/prescriptionRecordGenerator');
const M2FHIRBundleBuilder = require('./backend/m2/fhir/M2FHIRBundleBuilder');

const content = fs.readFileSync('Example bundle/Prescription.txt', 'utf8');
const businessData = M2FHIRBundleBuilder._buildBusinessDataFromTextFile({
  abhaId: 'pranay_2025@sbx',
  folderName: 'pranay_2025@sbx_Pranay_Anup_Agrawal',
  file: { content, fileName: 'Prescription.txt', filePath: 'Example bundle/Prescription.txt', hiType: 'PrescriptionRecord' }
});

try {
  const bundle = generatePrescriptionBundle(M2FHIRBundleBuilder._buildPrescriptionInput(businessData));
  console.log("Success! Bundle entries:", bundle.entry.length);
} catch (e) {
  console.error("Error generating bundle:", e);
}
