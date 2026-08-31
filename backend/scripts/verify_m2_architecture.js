const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "abdm-m2-audit-"));
process.env.RUNTIME_DATA_DIR = runtimeDir;

const encodeBase64Url = (value) =>
  Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const unsignedJwt = (payload) =>
  `${encodeBase64Url({ alg: "none", typ: "JWT" })}.${encodeBase64Url(payload)}.`;

const fail = (stage, error) => {
  console.error(`FAILED: ${stage}`);
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
};

(async () => {
  const M2TransactionStore = require("../m2/transactions/M2TransactionStore");
  const M2ConsentManager = require("../m2/consent/M2ConsentManager");
  const M2CallbackManager = require("../m2/callbacks/M2CallbackManager");

  const transactionId = "75beb427-e943-4dad-89ee-60021b51811d";
  const requestId = "8a03cc92-1a77-4f2c-8a63-662d6be0ae13";
  const consentId = "consent-audit-1";
  const patientId = "pranjali_20031801@sbx";
  const hipId = "IN2410002480";
  const careContextReference = "5b45813e-2dd8-4142-a16d-68b8cdc3c6fa";
  const linkToken = unsignedJwt({
    hipId,
    abhaAddress: patientId,
    sub: patientId,
    transactionId,
  });

  try {
    const linked = await M2ConsentManager.registerHipLinkContext({
      requestId,
      hipId,
      linkToken,
      abhaAddress: patientId,
      patient: [
        {
          referenceNumber: "Pranjali Anup Agrawal",
          careContexts: [{ referenceNumber: careContextReference }],
        },
      ],
    });

    assert.strictEqual(linked.transactionId, requestId, "link requestId must be the unique transaction key");
    assert.strictEqual(linked.linkTokenTransactionId, transactionId, "link-token transactionId must be retained as metadata");
    assert.strictEqual(linked.currentState, "WAITING_FOR_CONSENT", "linked context should wait for consent");

    const callbackResult = await M2CallbackManager.receiveCallback({
      notification: {
        status: "GRANTED",
        consentId,
        consentDetail: {
          consentId,
          patient: { id: patientId },
          hip: { id: hipId },
          hiTypes: ["Prescription"],
          careContexts: [{ careContextReference }],
          permission: {
            dateRange: {
              from: "2026-07-01T00:00:00.000Z",
              to: "2026-07-02T00:00:00.000Z",
            },
            dataEraseAt: "2126-07-02T00:00:00.000Z",
          },
        },
      },
    });

    assert.strictEqual(callbackResult.status, "success", "consent notify callback should process");
    assert.strictEqual(callbackResult.transactionId, requestId, "callback result must retain the link transaction key");

    const consentTx = M2TransactionStore.getTransaction(consentId);
    assert.ok(consentTx, "consent should be queryable by consentId");
    assert.strictEqual(consentTx.transactionId, requestId, "consent transactionId must remain the link request id");
    assert.strictEqual(consentTx.linkTokenTransactionId, transactionId, "consent must retain link-token transaction metadata");
    assert.strictEqual(consentTx.consentDetails.status, "Active", "granted consent should become Active");

    await M2TransactionStore.updateTransaction(requestId, {
      transactionId: "",
      requestId: "",
      consentId: "",
      healthInformationRequestId: "",
    });

    const protectedTx = M2TransactionStore.getTransaction(requestId);
    assert.strictEqual(protectedTx.transactionId, requestId, "empty transactionId update must be ignored");
    assert.strictEqual(protectedTx.requestId, requestId, "empty requestId update must be ignored");
    assert.strictEqual(protectedTx.consentId, consentId, "empty consentId update must be ignored");
    assert.ok(
      Array.isArray(protectedTx.identifierProtectionHistory) &&
        protectedTx.identifierProtectionHistory.length > 0,
      "identifier protection should be audited"
    );

    const storeFile = path.join(runtimeDir, "m2_transactions.json");
    assert.ok(fs.existsSync(storeFile), "temp transaction store should be persisted");

    console.log("M2 architecture verification passed");
    console.log(JSON.stringify({
      checked: [
        "Scan-share/link-token transactionId extraction",
        "Consent notification matching by careContextReference",
        "Consent persistence with non-empty transactionId",
        "Identifier overwrite protection",
        "JSON transaction persistence isolation",
      ],
      transactionId,
      requestId,
      consentId,
    }, null, 2));
  } catch (error) {
    fail("M2 architecture verification", error);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
})();
