require('dotenv').config();
const M2DataTransferManager = require('./m2/transfer/M2DataTransferManager');
const M2TransactionStore = require('./m2/transactions/M2TransactionStore');
const BundleRegistry = require('./m2/fhir/BundleRegistry');

async function test() {
  try {
    const tx = M2TransactionStore.getTransaction('49181d8f-4eda-4bc4-9fc0-ff734e02c866');
    if (!tx) {
        console.log("Transaction not found");
        return;
    }
    console.log("Transaction found:", tx.transactionId);
    console.log("consentId:", tx.consentId);
    console.log("patientId:", tx.patientId);
    
    // Simulate what the setTimeout does
    await M2DataTransferManager.initiateTransfer(
      tx.consentId,
      tx.patientId,
      ["DiagnosticReport"],
      tx.receiverPublicKey || tx.keyMaterial?.dhPublicKey?.keyValue,
      tx.receiverNonce || tx.keyMaterial?.nonce,
      tx.dataPushUrl || tx.hiRequestPayload?.hiRequest?.dataPushUrl,
      tx.transactionId
    );
    console.log("Transfer successful");
  } catch(e) {
    console.error("Transfer failed:", e);
  }
}
test();
