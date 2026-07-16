const fs = require('fs');
const { buildBusinessDataFromTextFile } = require('./m2/fhir/M2FHIRBundleBuilder');

const testFile = (fileName, hiType) => {
  try {
    const content = fs.readFileSync(`../pranay211_2006@sbx_Pranay_Anup_Agrawal/${fileName}`, 'utf8');
    const data = buildBusinessDataFromTextFile({
      abhaId: 'pranay211_2006@sbx',
      folderName: 'pranay211_2006@sbx_Pranay_Anup_Agrawal',
      file: { hiType, fileName, content }
    });
    console.log(`[PASS] ${fileName} parsed successfully.`);
  } catch (e) {
    console.log(`[FAIL] ${fileName} error:`, e.message);
  }
};

// I need to export or access the function. 
// M2FHIRBundleBuilder.js only exports buildWithRecordBuilder. I'll read and eval it.
