const assert = require('assert');
const fs = require('fs');
const path = require('path');
const M2TransactionStore = require('../m2/transactions/M2TransactionStore');
const M2ConsentManager = require('../m2/consent/M2ConsentManager');
const M2CallbackManager = require('../m2/callbacks/M2CallbackManager');

// Mock external dependencies
jest = { fn: () => {} };
process.env.HIP_ID = "MOCK_HIP";
process.env.ABDM_CLIENT_ID = "MOCK_CLIENT";
process.env.ABDM_CLIENT_SECRET = "MOCK_SECRET";
process.env.ABDM_GATEWAY_URL = "http://localhost:9999";

const M2TokenManager = require('../m2/tokens/M2TokenManager');
M2TokenManager.getGatewayToken = async () => "mock-token";
const axios = require('axios');
axios.post = async () => ({ status: 202 });

async function runTests() {
  const dataPath = path.resolve(__dirname, "../data/m2_transactions.json");
  if(fs.existsSync(dataPath)) fs.unlinkSync(dataPath);

  console.log('Running M2 Consent State Machine Tests...');

  // 1. Setup mock transaction
  await M2TransactionStore.createTransaction({
    transactionId: "tx-A",
    requestId: "req-A",
    consentRequestId: "creq-A",
    consentId: "creq-A",
    patientId: "patient@sbx",
    currentState: "Created",
    consentDetails: { status: "Requested" },
    consentStatus: "REQUESTED"
  });

  // 1. consentDetails alone does NOT produce CONSENT_GRANTED
  await M2ConsentManager.synchronizeConsentWorkflow();
  let txA = M2TransactionStore.getTransaction("tx-A");
  assert.ok(txA.currentState !== "CONSENT_GRANTED", "consentDetails alone must NOT trigger CONSENT_GRANTED");

  // 2. Failed/rejected consent does NOT transition to CONSENT_GRANTED
  const rejectPayload = {
      requestId: "req-rej",
      notification: {
          status: "DENIED",
          consentRequestId: "creq-A"
      }
  };
  await M2CallbackManager.processCallback("Consent Notification", rejectPayload);
  txA = M2TransactionStore.getTransaction("tx-A");
  assert.ok(txA.currentState !== "CONSENT_GRANTED", "Denied consent must NOT transition to CONSENT_GRANTED");
  assert.strictEqual(txA.consentDetails.status, "Rejected");

  // 3. Setup a NEW transaction for GRANTED testing
  await M2TransactionStore.createTransaction({
    transactionId: "tx-B",
    requestId: "req-B",
    consentRequestId: "creq-B",
    consentId: "creq-B",
    patientId: "patient@sbx",
    currentState: "Created",
    consentDetails: { status: "Requested" },
    consentStatus: "REQUESTED"
  });

  // 4. Valid ABDM consent-granted evidence transitions to CONSENT_GRANTED
  const grantPayload = {
      requestId: "req-grant",
      notification: {
          status: "GRANTED",
          consentRequestId: "creq-B",
          consentArtefacts: [{ id: "artefact-B" }]
      }
  };
  await M2CallbackManager.processCallback("Consent Notification", grantPayload);
  let txB = M2TransactionStore.getTransaction("tx-B");
  assert.strictEqual(txB.currentState, "CONSENT_GRANTED", "Granted consent MUST transition to CONSENT_GRANTED");
  assert.strictEqual(txB.consentDetails.status, "Active");

  // 5. Duplicate valid GRANTED callback is idempotent
  await M2CallbackManager.processCallback("Consent Notification", grantPayload);
  let txB_dup = M2TransactionStore.getTransaction("tx-B");
  assert.strictEqual(txB_dup.currentState, "CONSENT_GRANTED", "Duplicate granted callback must be idempotent");

  // 6. Unmatched consent callback does NOT grant a transaction
  const unmatchedPayload = {
      requestId: "req-unmatched",
      notification: {
          status: "GRANTED",
          consentRequestId: "unknown-req"
      }
  };
  const res = await M2CallbackManager.processCallback("Consent Notification", unmatchedPayload);
  assert.ok(res.error, "Unmatched callback must return error");

  console.log('All M2 Consent State Machine Tests Passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
