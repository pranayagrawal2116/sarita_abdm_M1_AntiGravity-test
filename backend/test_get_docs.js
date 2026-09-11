const fs = require('fs');
const path = require('path');
const m3ConsentController = require('./m3/controllers/m3ConsentController');
const M3PatientStorageService = require('./m3/services/m3PatientStorageService');
const M3ConsentStore = require('./m3/store/M3ConsentStore');

M3ConsentStore.load();
const consents = M3ConsentStore.getConsents();
const consent = consents[consents.length - 1]; // latest consent
const abha = consent.patientId;
console.log("Patient:", abha);

const files = M3PatientStorageService.getAllHealthDataFiles(abha);
console.log("Found files:", files);

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log("File:", path.basename(file), "entries length:", data.entries?.length);
  if (data.entries && data.entries.length > 0) {
     console.log("First entry content preview:", data.entries[0].content.substring(0, 50));
  }
}
