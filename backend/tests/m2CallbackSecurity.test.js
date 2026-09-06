const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const tempRuntimeDir = path.join(os.tmpdir(), `m2-callback-test-${Date.now()}`);
process.env.RUNTIME_DATA_DIR = tempRuntimeDir;

if (!fs.existsSync(tempRuntimeDir)) {
  fs.mkdirSync(tempRuntimeDir, { recursive: true });
}

const store = require("../m2/transactions/M2TransactionStore");
const callbacks = require("../m2/callbacks/M2CallbackManager");

async function runTests() {
  console.log("Running M2 Callback Security Tests...");

  // Setup: Create a base transaction
  await store.createTransaction({
    transactionId: "tx-base-1",
    requestId: "req-base-1",
    consentId: "consent-base-1",
    patientId: "patient-1",
    currentState: "WAITING_FOR_CONSENT"
  });

  // 1. Consent notification with missing consentId
  let result = await callbacks.receiveCallback({
    notification: { status: "GRANTED" }
  });
  assert.strictEqual(result.status, "error");
  assert.strictEqual(result.error, "INVALID_PAYLOAD");

  // 2. Consent notification with unknown consentId (should create a new transaction)
  result = await callbacks.receiveCallback({
    requestId: "test-req-999",
    notification: { status: "GRANTED", consentId: "consent-unknown-999" }
  });
  assert.strictEqual(result.status, "success");
  assert.ok(result.transactionId);

  // 3. HI Request with missing transactionId
  result = await callbacks.receiveCallback({
    hiRequest: { consent: { id: "consent-base-1" }, dataPushUrl: "url" },
    response: { requestId: "req-hi-1" }
  });
  assert.strictEqual(result.status, "error");

  // 4. HI Request with mismatched consentId
  result = await callbacks.receiveCallback({
    requestId: "req-x-1",
    hiRequest: { transactionId: "tx-hi-1", consent: { id: "consent-bad-1" }, dataPushUrl: "url" }
  });
  assert.strictEqual(result.status, "error");

  // 5. HI Request duplicate replay
  await store.createTransaction({
    transactionId: "tx-base-2",
    requestId: "req-base-2",
    consentId: "consent-base-2",
    currentState: "CONSENT_GRANTED"
  });
  await callbacks.receiveCallback({
    requestId: "req-dup-1",
    hiRequest: { transactionId: "tx-hi-2", consent: { id: "consent-base-2" }, dataPushUrl: "url" }
  });
  result = await callbacks.receiveCallback({
    requestId: "req-dup-1",
    hiRequest: { transactionId: "tx-hi-2", consent: { id: "consent-base-2" }, dataPushUrl: "url" }
  });
  assert.strictEqual(result.duplicate, true);

  // 6. Notify callback with no transactionId
  result = await callbacks.receiveCallback({
    requestId: "req-notify-1",
    notification: { statusNotification: { status: "DELIVERED" } }
  });
  assert.strictEqual(result.status, "error");

  // 7. Unknown callback type
  result = await callbacks.receiveCallback({
    someRandomField: "value"
  });
  assert.strictEqual(result.status, "error");
  assert.strictEqual(result.error, "UNKNOWN_TYPE");

  // 8. Attempting fallback match (ensure it fails)
  // E.g. sending a Notify with NO consentId but matching patient
  result = await callbacks.receiveCallback({
    notification: { status: "GRANTED", patient: { id: "patient-1" } }
  });
  assert.strictEqual(result.status, "error");

  console.log("M2 Callback Security Tests PASSED");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
