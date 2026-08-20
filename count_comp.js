const fs = require('fs');
const path = require('path');
const fhirEncryptionService = require('./backend/services/fhirEncryptionService');

const consentsStr = fs.readFileSync('backend/m3/store/consents.json', 'utf8');
const consents = JSON.parse(consentsStr);
const transactions = consents.transactions || {};

const targetConsentId = '91c0bc27-7c10-405a-8c35-b124216c7553';
const hospitalDir = 'saurav_50505@sbx_Saurav_Kumar/Other_hospital_data/HIP_Data';
const files = fs.readdirSync(hospitalDir).filter(f => f.startsWith('HealthData_'));

let compCount = 0;
let bundleCount = 0;

files.forEach(file => {
  const tid = file.split('_')[1];
  const tx = transactions[tid];
  if (!tx || tx.consentId !== targetConsentId) return;

  const data = JSON.parse(fs.readFileSync(path.join(hospitalDir, file), 'utf8'));
  let bundlesToProcess = [];
  
  if (data.entries) {
    data.entries.forEach(entry => {
      if (entry.content) {
        let contentStr = entry.content;
        if (typeof contentStr === 'string' && !contentStr.trim().startsWith('{')) {
          try {
            contentStr = fhirEncryptionService.decrypt(
              contentStr, tx.privateKeyBase64, data.keyMaterial.dhPublicKey.keyValue, data.keyMaterial.nonce, tx.nonceBase64
            );
          } catch(e) {}
        }
        try { bundlesToProcess.push(JSON.parse(contentStr)); } catch(e) {}
      }
    });
  } else if (data.resourceType === 'Bundle') {
    bundlesToProcess.push(data);
  }

  bundleCount += bundlesToProcess.length;

  bundlesToProcess.forEach(bundle => {
    let compFound = false;
    const extractResources = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.resourceType === 'Composition') {
        compCount++;
        compFound = true;
      }
      Object.values(obj).forEach(val => {
        if (Array.isArray(val)) val.forEach(extractResources);
        else if (typeof val === 'object') extractResources(val);
      });
    };
    extractResources(bundle);
  });
});

console.log('Total bundles:', bundleCount);
console.log('Total Compositions:', compCount);
