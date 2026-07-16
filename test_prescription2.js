const fs = require('fs');
const M2FHIRBundleBuilder = require('./backend/m2/fhir/M2FHIRBundleBuilder');

const content = fs.readFileSync('Example bundle/Prescription.txt', 'utf8');

try {
  const bundle = M2FHIRBundleBuilder.buildBundle({
    abhaId: 'pranay_2025@sbx',
    folderName: 'pranay_2025@sbx_Pranay_Anup_Agrawal',
    file: { content, fileName: 'Prescription_Record.txt', filePath: 'Example bundle/Prescription.txt', hiType: 'PrescriptionRecord' },
    canonicalHiType: 'Prescription'
  });
  console.log("Success! Bundle entries:", bundle.entry.length);
} catch (e) {
  console.error("Error generating bundle:", e);
}
