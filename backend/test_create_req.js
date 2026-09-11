const M2ConsentManager = require('./m2/consent/M2ConsentManager');
const M2TransactionStore = require('./m2/transactions/M2TransactionStore');
const M2HealthInformationRequestManager = require('./m2/healthInformation/M2HealthInformationRequestManager');
const crypto = require('crypto');

async function test() {
  const txId = crypto.randomUUID();
  const artId = crypto.randomUUID();
  const tx = await M2TransactionStore.createTransaction({
    transactionId: txId,
    patientId: 'abdulkalam@sbx',
    consentDetails: {
      patientId: 'abdulkalam@sbx',
      status: 'GRANTED',
      expiry: Date.now() + 1000000,
      consentArtefacts: [{ id: artId }]
    },
    consentArtifactId: artId
  });

  try {
    const res = await M2HealthInformationRequestManager.createRequest(artId, 'abdulkalam@sbx', {
      from: new Date().toISOString(),
      to: new Date().toISOString()
    });
    console.log("SUCCESS:", res);
  } catch(e) {
    console.log("FAILED:", e.stack);
  }
}
test();
