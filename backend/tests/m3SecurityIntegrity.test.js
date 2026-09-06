const assert = require("assert");
const M3CallbackController = require("../m3/controllers/m3CallbackController");
const M3ConsentStore = require("../m3/store/M3ConsentStore");
const fhirEncryptionService = require("../services/fhirEncryptionService");
const elliptic = require("elliptic");
const crypto = require("crypto");

async function runTests() {
  console.log("Running M3 Security & Integrity Tests...");

  const mockRes = () => {
    const res = {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    res.send = (data) => { res.data = data; return res; };
    return res;
  };

  M3ConsentStore.consents = [];
  M3ConsentStore.transactions = {};
  M3ConsentStore.save();

  M3ConsentStore.addConsentRequest({
    requestId: "req-valid-1",
    status: "REQUESTED"
  });

  await M3CallbackController.onConsentInit({
    body: {
      consentRequest: { id: "abdm-consent-req-1" },
      resp: { requestId: "req-valid-1" }
    }
  }, mockRes());

  let reqNotify = {
    body: {
      notification: {
        status: "GRANTED",
        consentRequestId: "unknown-req",
        consentArtefacts: [{ id: "artefact-1" }]
      }
    },
    headers: {}
  };
  
  let res = mockRes();
  await M3CallbackController.hiuNotify(reqNotify, res);
  assert.strictEqual(res.statusCode, 202);
  
  let consent1 = M3ConsentStore.getConsentByRequestId("req-valid-1");
  assert.strictEqual(consent1.status, "INITIATED", "Unknown callback modified unrelated consent!");

  reqNotify.body.notification.consentRequestId = "abdm-consent-req-1";
  res = mockRes();
  
  const M3ConsentService = require("../m3/services/m3ConsentService");
  const origFetch = M3ConsentService.fetchConsentArtefact;
  M3ConsentService.fetchConsentArtefact = async () => {};
  
  await M3CallbackController.hiuNotify(reqNotify, res);
  M3ConsentService.fetchConsentArtefact = origFetch;
  
  consent1 = M3ConsentStore.getConsentByRequestId("req-valid-1");
  assert.strictEqual(consent1.status, "GRANTED", "Valid callback did not modify consent correctly!");

  const ec = new elliptic.ec("wei25519");
  const hiuKey = ec.genKeyPair();
  const hiuPrivateKeyBase64 = Buffer.from(hiuKey.getPrivate().toArray("be", 32)).toString("base64");
  const hiuPublicKeyBase64 = Buffer.from(hiuKey.getPublic().encode("array", false)).toString("base64");
  const hiuNonceBase64 = crypto.randomBytes(32).toString("base64");

  M3ConsentStore.addTransaction("tx-valid-1", {
    consentId: "artefact-1",
    privateKeyBase64: hiuPrivateKeyBase64,
    nonceBase64: hiuNonceBase64,
    requestId: "req-data-1"
  });

  const plaintext = JSON.stringify({ resourceType: "Bundle" });
  const encrypted = fhirEncryptionService.encrypt(plaintext, hiuPublicKeyBase64, hiuNonceBase64);

  let dataPushReq = {
    body: {
      transactionId: "tx-valid-1",
      entries: [
        {
          careContextReference: "cc-1",
          content: encrypted.encryptedContent,
          checksum: encrypted.checksum
        }
      ],
      keyMaterial: {
        dhPublicKey: { keyValue: encrypted.ourPublicKey },
        nonce: encrypted.ourNonce
      }
    }
  };
  
  const M3PatientStorageService = require("../m3/services/m3PatientStorageService");
  const origSave = M3PatientStorageService.saveM3File;
  let savedDataStr = "";
  M3PatientStorageService.saveM3File = (a, c, h, fn, data) => { savedDataStr = data; return "path"; };
  
  let notifyStatusArgs = null;
  const origNotify = M3ConsentService.notifyHealthInformationStatus;
  M3ConsentService.notifyHealthInformationStatus = async (args) => { notifyStatusArgs = args; };

  res = mockRes();
  await M3CallbackController.healthInfoTransfer(dataPushReq, res);
  
  assert.ok(savedDataStr.includes('"resourceType": "Bundle"'), "Plaintext was not extracted/saved!");
  assert.strictEqual(notifyStatusArgs.sessionStatus, "RECEIVED", "Status should be RECEIVED for success");

  const badEncrypted = {
     ...encrypted,
     encryptedContent: encrypted.encryptedContent.substring(0, encrypted.encryptedContent.length - 5) + "ABCDE"
  };
  
  dataPushReq.body.entries[0].content = badEncrypted.encryptedContent;
  
  savedDataStr = "";
  notifyStatusArgs = null;
  res = mockRes();
  await M3CallbackController.healthInfoTransfer(dataPushReq, res);
  
  assert.strictEqual(savedDataStr, "", "Tampered data should not be saved!");
  assert.strictEqual(notifyStatusArgs.sessionStatus, "FAILED", "Status should be FAILED for tampered data");
  assert.strictEqual(notifyStatusArgs.statusResponses[0].hiStatus, "ERRORED");

  M3PatientStorageService.saveM3File = origSave;
  M3ConsentService.notifyHealthInformationStatus = origNotify;

  console.log("All M3 Security Integrity Tests Passed!");
}

runTests().catch(e => {
  console.error("Test failed", e);
  process.exit(1);
});
