const assert = require("assert");
const M2TransactionStore = require("../m2/transactions/M2TransactionStore");
const hipLinkingController = require("../controllers/hipLinkingController");

async function runTests() {
  console.log("Running HIP Linking Persistence & Care Context Integrity Tests...");
  const txId = "req-1-" + Date.now();

  const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
  };
  
  await M2TransactionStore.createTransaction({
    requestId: txId,
    abhaAddress: "patientA@sbx",
    patientId: "patientA@sbx",
    transactionType: "HIP_LINK_TOKEN",
    currentState: "Created"
  });

  const txAfterRestart = M2TransactionStore.getTransaction(txId);
  assert.strictEqual(txAfterRestart.currentState, "Created", "State reloaded successfully");

  const validCallbackReq = {
    body: { requestId: txId, linkToken: "valid-token-123" }
  };
  let res = mockRes();
  await hipLinkingController.onGenerateToken(validCallbackReq, res);
  assert.strictEqual(res.statusCode, 202, "Valid callback accepted");
  
  const txUpdated = M2TransactionStore.getTransaction(txId);
  assert.strictEqual(txUpdated.currentState, "Completed", "State transitioned");
  assert.strictEqual(txUpdated.linkToken, "valid-token-123", "Token stored");

  console.log("All HIP Linking Persistence Tests Passed!");
}

runTests().catch(e => {
  console.error("Test failed", e);
  process.exit(1);
});
