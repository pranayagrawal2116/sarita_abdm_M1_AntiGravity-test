const assert = require("assert");
const os = require("os");
const path = require("path");
const fs = require("fs");

const tempRuntimeDir = path.join(os.tmpdir(), `m2-transfer-${Date.now()}`);
const tempStoreFile = path.join(tempRuntimeDir, "m2_transactions.json");
process.env.RUNTIME_DATA_DIR = tempRuntimeDir;
process.env.M2_DATA_PUSH_TIMEOUT_MS = "1000";
process.env.M2_DATA_PUSH_MAX_RETRIES = "2";
process.env.M2_DATA_PUSH_RETRY_DELAY_MS = "1";

const encodeBase64Url = (value) =>
  Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const unsignedJwt = (payload) =>
  `${encodeBase64Url({ alg: "none", typ: "JWT" })}.${encodeBase64Url(payload)}.`;

const axios = require("axios");
const tokenManager = require("../m2/tokens/M2TokenManager");
const encryption = require("../m2/encryption/M2EncryptionService");
const store = require("../m2/transactions/M2TransactionStore");
const callbacks = require("../m2/callbacks/M2CallbackManager");
const consentManager = require("../m2/consent/M2ConsentManager");
require("../m2/transfer/M2DataTransferManager");

tokenManager.getGatewayToken = async () => "test-gateway-token";

const createReceiverKeyMaterial = () => {
  const keyMaterial = encryption.generateKeyMaterial();
  return {
    privateKey: keyMaterial.privateKey,
    publicKey: keyMaterial.publicKey,
    nonce: keyMaterial.nonce,
    keyMaterial: {
      cryptoAlg: "ECDH",
      curve: "Curve25519",
      dhPublicKey: {
        expiry: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        parameters: "Curve25519/32byte random key",
        keyValue: keyMaterial.publicKey,
      },
      nonce: keyMaterial.nonce,
    },
  };
};

(async () => {
  const originalPost = axios.post;
  const dataPushUrl = "https://phr.example.test/data-push";
  let dataPushAttempts = 0;
  let lastDataPushPayload = null;
  const gatewayPosts = [];

  axios.post = async (url, body) => {
    if (url === dataPushUrl) {
      dataPushAttempts += 1;
      lastDataPushPayload = body;
      if (dataPushAttempts === 1) {
        const error = new Error("transient");
        error.response = { status: 500, data: { error: "transient" } };
        throw error;
      }
      return { status: 202, data: { acknowledgement: { status: "SUCCESS" } } };
    }

    gatewayPosts.push({ url, body });
    return { status: 202, data: { acknowledgement: { status: "SUCCESS" } } };
  };

  try {
    const transactionId = "gateway-txn-1";
    const requestId = "link-request-1";
    const consentId = "consent-1";
    const patientId = "pranay_0120061@sbx";
    const hipId = "IN2410002480";
    const careContextReference = "care-context-1";
    const receiver = createReceiverKeyMaterial();

    await consentManager.registerHipLinkContext({
      requestId,
      hipId,
      linkToken: unsignedJwt({ hipId, abhaAddress: patientId, sub: patientId, transactionId }),
      abhaAddress: patientId,
      patient: [
        {
          referenceNumber: "Pranay Anup Agrawal",
          careContexts: [{ referenceNumber: careContextReference }],
        },
      ],
    });

    const consentResult = await callbacks.receiveCallback({
      notification: {
        status: "GRANTED",
        consentId,
        patient: { id: patientId },
        hip: { id: hipId },
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
    assert.strictEqual(consentResult.status, "success");

    const requestResult = await callbacks.receiveCallback({
      response: { requestId: "hi-request-1", transactionId },
      hiRequest: {
        consent: { id: consentId },
        dataPushUrl,
        keyMaterial: receiver.keyMaterial,
        careContexts: [{ careContextReference }],
      },
    });
    assert.strictEqual(requestResult.status, "success");

    const completed = store.getTransaction(transactionId);
    assert.strictEqual(completed.currentState, "Completed");
    assert.strictEqual(dataPushAttempts, 2);
    assert.strictEqual(lastDataPushPayload.transactionId, transactionId);
    assert.strictEqual(lastDataPushPayload.entries[0].careContextReference, careContextReference);
    assert.ok(lastDataPushPayload.entries[0].content);
    assert.ok(lastDataPushPayload.keyMaterial.nonce);
    assert.strictEqual(completed.dataPushResult.ok, true);
    assert.strictEqual(completed.dataPushResult.retryCount, 1);
    assert.strictEqual(completed.retryCount, 1);
    assert.ok(completed.encryptedPayload);
    assert.ok(gatewayPosts.some((item) => item.body?.hiRequest?.sessionStatus === "ACKNOWLEDGED"));
    assert.ok(gatewayPosts.some((item) => item.body?.notification?.statusNotification?.sessionStatus === "TRANSFERRED"));

    const decrypted = encryption.decryptBundle(
      completed.encryptedPayload,
      receiver.privateKey,
      completed.keyToShare,
      completed.senderNonce,
      receiver.nonce
    );
    const bundle = JSON.parse(decrypted);
    assert.strictEqual(bundle.resourceType, "Bundle");
    assert.strictEqual(bundle.type, "document");
    assert.strictEqual(bundle.entry[0].resource.resourceType, "Composition");

    assert.ok(fs.existsSync(tempStoreFile));

    delete require.cache[require.resolve("../m2/transactions/M2TransactionStore")];
    const recoveredStore = require("../m2/transactions/M2TransactionStore");
    assert.strictEqual(recoveredStore.getTransaction("hi-request-1").currentState, "Completed");

    console.log("M2 data transfer pipeline integration test passed");
  } finally {
    axios.post = originalPost;
    try {
      fs.rmSync(tempRuntimeDir, { recursive: true, force: true });
    } catch (_) {}
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
