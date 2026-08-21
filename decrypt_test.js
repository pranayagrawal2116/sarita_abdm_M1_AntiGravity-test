
const fs = require('fs');
const fhirEncryptionService = require('./backend/services/fhirEncryptionService');
const M3ConsentStore = require('./backend/m3/store/M3ConsentStore');

async function run() {
  const data = JSON.parse(fs.readFileSync('./saurav_50505@sbx_Saurav_Kumar/bf1d018d-1296-4631-9520-7d4ccbb31ed6_NetEdge_Wellness_Clinic/HealthData_ab446181-bf53-45a4-84aa-1e273d121d1c_1787236358218.json', 'utf8'));
  const tId = 'ab446181-bf53-45a4-84aa-1e273d121d1c';
  const transaction = M3ConsentStore.getTransaction(tId);
  const entry = data.entries[2];
  let contentStr = entry.content;
  contentStr = await fhirEncryptionService.decrypt(
    contentStr,
    transaction.privateKeyBase64,
    data.keyMaterial.dhPublicKey.keyValue,
    data.keyMaterial.nonce,
    transaction.nonceBase64
  );
  const bundle = JSON.parse(contentStr);
  console.log(bundle.entry.map(e => e.resource.resourceType));
}
run().catch(console.error);
