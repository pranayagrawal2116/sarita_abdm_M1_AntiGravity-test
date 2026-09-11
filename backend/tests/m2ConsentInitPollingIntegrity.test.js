const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Use synthetic DB to avoid polluting real transactions
process.env.RUNTIME_DATA_DIR = path.join(__dirname, "test_data_m2_polling");
if (fs.existsSync(process.env.RUNTIME_DATA_DIR)) {
  fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(process.env.RUNTIME_DATA_DIR, { recursive: true });

const M2TransactionStore = require("../m2/transactions/M2TransactionStore");
const M3CallbackController = require("../m3/controllers/m3CallbackController");
const M2ConsentController = require("../m2/controllers/m2ConsentController");

async function runTests() {
  console.log("Running Consent Init Callback-to-Flutter Polling Integrity Tests...");
  
  // 1. Consent Request Init creates one transaction
  const reqId = "test-req-init-12345";
  await M2TransactionStore.createTransaction({
    transactionId: "tx-" + reqId,
    requestId: reqId,
    consentId: "mock-consent-id",
    patientId: "patient@sbx",
    currentState: "Created"
  });

  const tx1 = M2TransactionStore.getTransaction(reqId);
  assert.strictEqual(tx1.requestId, reqId);
  assert.strictEqual(tx1.currentState, "Created");

  // 2. Real-shaped on-init callback updates that exact transaction
  const req = {
    body: {
      timestamp: new Date().toISOString(),
      consentRequest: {
        id: "real-gateway-consent-req-id"
      },
      resp: {
        requestId: reqId
      }
    }
  };
  let statusCode = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return { send: () => {} };
    }
  };

  await M3CallbackController.onConsentInit(req, res);
  assert.strictEqual(statusCode, 202);

  const tx2 = M2TransactionStore.getTransaction(reqId);
  assert.strictEqual(tx2.consentRequestId, "real-gateway-consent-req-id");
  assert.strictEqual(tx2.currentState, "GatewayAcknowledged");

  // 3. Polling endpoint returns the callback result
  const fetchReq = { params: { requestId: reqId } };
  let fetchStatus = null;
  let fetchJson = null;
  const fetchRes = {
    status: (code) => { fetchStatus = code; return { json: (j) => { fetchJson = j; } }; },
    json: (j) => { fetchStatus = 200; fetchJson = j; }
  };

  await M2ConsentController.fetchConsentInitCallback(fetchReq, fetchRes);
  assert.strictEqual(fetchStatus, 200);
  assert.strictEqual(fetchJson.consentRequest.id, "real-gateway-consent-req-id");
  assert.strictEqual(fetchJson.success, true);
  assert.strictEqual(fetchJson.consentId, "real-gateway-consent-req-id"); // exact mapping used by Flutter
  
  // 4. Unknown requestId does not mutate
  const badReq = {
    body: {
      timestamp: new Date().toISOString(),
      consentRequest: { id: "bad-consent-req-id" },
      resp: { requestId: "unknown-req-id" }
    }
  };
  await M3CallbackController.onConsentInit(badReq, res);
  const tx3 = M2TransactionStore.getTransaction("unknown-req-id");
  assert.strictEqual(tx3, null);

  console.log("All Polling Integrity Tests Passed!");
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
