const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const tempRuntimeDir = path.join(os.tmpdir(), `m2-lostupdate-${Date.now()}`);
process.env.RUNTIME_DATA_DIR = tempRuntimeDir;

if (!fs.existsSync(tempRuntimeDir)) {
  fs.mkdirSync(tempRuntimeDir, { recursive: true });
}

const store = require("../m2/transactions/M2TransactionStore");

async function runTests() {
  await store.createTransaction({ transactionId: "tx-1", currentState: "Created" });
  await store.createTransaction({ transactionId: "tx-2", currentState: "Created" });

  // Concurrently update both
  const p1 = store.updateTransaction("tx-1", { currentState: "tx1-updated" });
  const p2 = store.updateTransaction("tx-2", { currentState: "tx2-updated" });

  await Promise.all([p1, p2]);

  // Read back and verify BOTH updates exist
  const tx1 = store.getTransaction("tx-1");
  const tx2 = store.getTransaction("tx-2");

  assert.strictEqual(tx1.currentState, "tx1-updated", "Update to tx-1 was lost!");
  assert.strictEqual(tx2.currentState, "tx2-updated", "Update to tx-2 was lost!");
  
  console.log("Lost Update Test PASSED!");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
