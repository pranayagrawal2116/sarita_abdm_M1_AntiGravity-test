const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const tempRuntimeDir = path.join(os.tmpdir(), `m2-restart-${Date.now()}`);
process.env.RUNTIME_DATA_DIR = tempRuntimeDir;

if (!fs.existsSync(tempRuntimeDir)) {
  fs.mkdirSync(tempRuntimeDir, { recursive: true });
}

let store = require("../m2/transactions/M2TransactionStore");
let callbacks = require("../m2/callbacks/M2CallbackManager");
require("../m2/consent/M2ConsentManager");

async function runTests() {
  console.log("Running M2 Restart Persistence Tests...");

  // 1. Create transaction and persist
  const txId = "tx-restart-1";
  await store.createTransaction({ transactionId: txId, currentState: "WAITING_FOR_CONSENT" });

  // 2. Add callback idempotency record
  await callbacks.receiveCallback({
    requestId: "req-dup-100",
    notification: { status: "GRANTED", consentId: "consent-restart-1" }
  });

  // Verify it exists in memory
  const txBefore = store.getTransaction("consent-restart-1");
  assert.strictEqual(txBefore.currentState, "CONSENT_GRANTED");

  // 3. Restart Node.js process (simulate by clearing require cache and instances)
  store.constructor.instance = null;
  callbacks.constructor.instance = null;
  
  Object.keys(require.cache).forEach(key => {
    if (key.includes("m2/transactions") || key.includes("m2/callbacks")) {
      delete require.cache[key];
    }
  });

  store = require("../m2/transactions/M2TransactionStore");
  callbacks = require("../m2/callbacks/M2CallbackManager");
  require("../m2/consent/M2ConsentManager");

  // 4. Load transaction
  const txAfter = store.getTransaction("consent-restart-1");
  
  // 5. Verify state remains intact
  assert.ok(txAfter, "Transaction should exist after restart");
  assert.strictEqual(txAfter.currentState, "CONSENT_GRANTED", "Consent state did not survive restart");
  
  // 9 & 10. Verify idempotency survives restart
  const duplicateResult = await callbacks.receiveCallback({
    requestId: "req-dup-100",
    notification: { status: "GRANTED", consentId: "consent-restart-1" }
  });
  assert.strictEqual(duplicateResult.duplicate, true, "Callback idempotency did not survive restart!");

  // Verify write failure (Step 11) - simulate corrupted JSON file
  const storeFile = require("../m2/transactions/JSONTransactionStorage").prototype.read;
  const config = require("../m2/helpers/config");
  
  fs.writeFileSync(config.transactionStoreFile, "{ invalid json", "utf8");
  
  let failedClosed = false;
  try {
    store.getTransaction("consent-restart-1");
  } catch (err) {
    if (err.message.includes("TRANSACTION_STORE_CORRUPT")) {
      failedClosed = true;
    }
  }
  assert.ok(failedClosed, "Corrupted JSON did not fail closed safely!");

  console.log("M2 Restart Persistence Tests PASSED");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
