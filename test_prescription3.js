const fs = require('fs');
const { buildBundleFromFiles } = require('./backend/m2/fhir/M2FHIRBundleBuilder');

const content = fs.readFileSync('Example bundle/Prescription.txt', 'utf8');

try {
  const bundle = buildBundleFromFiles({
    abhaId: 'pranay_2025@sbx',
    folderName: 'pranay_2025@sbx_Pranay_Anup_Agrawal',
    files: [{ content, fileName: 'Prescription_Record.txt', filePath: 'Example bundle/Prescription.txt', hiType: 'PrescriptionRecord' }]
  });
  console.log("Success! Bundle length:", bundle.length);
} catch (e) {
  console.error("Error generating bundle:", e);
}
