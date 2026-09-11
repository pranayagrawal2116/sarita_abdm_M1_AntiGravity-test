const fs = require('fs');
const { buildBusinessDataFromTextFile } = require('./m2/fhir/M2FHIRBundleBuilder');

const textFile = '../pranay211_2006@sbx_Pranay_Anup_Agrawal/Diagnostic_Report_91-1722-0400-0829.txt';
const content = fs.readFileSync(textFile, 'utf8');

const businessData = buildBusinessDataFromTextFile({
  abhaId: 'pranay211_2006@sbx',
  folderName: 'pranay211_2006@sbx_Pranay_Anup_Agrawal',
  file: { hiType: 'DiagnosticReportRecord', fileName: 'Diagnostic_Report_91-1722-0400-0829.txt', content }
});

console.log(JSON.stringify(businessData.investigations, null, 2));
console.log(JSON.stringify(businessData.diagnosticReports, null, 2));
