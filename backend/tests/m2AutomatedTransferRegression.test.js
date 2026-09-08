const assert = require("assert");
const fs = require("fs");
const path = require("path");

const M2ConsentManager = require("../m2/consent/M2ConsentManager");
const M2TransactionStore = require("../m2/transactions/M2TransactionStore");
const m2ConsentController = require("../m2/controllers/m2ConsentController");
const m2CallbackController = require("../m2/controllers/m2CallbackController");
const axiosClient = require("../m2/helpers/axiosClient");

let axiosPostStub;
let testDataDir = path.join(__dirname, "test_data_m2_automated");

describe("M2 Automated Data Transfer Regression", () => {
  beforeEach(() => {
    // Clear test dir
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });
    // Overwrite storage path
    M2TransactionStore.storageProvider.filePath = path.join(testDataDir, "transactions.json");
    
    // Stub axios
    axiosPostStub = axiosClient.post;
    axiosClient.post = async (url, data, config) => {
      axiosClient.lastCall = { url, data, config };
      return { status: 202, data: {} };
    };
  });

  afterEach(() => {
    axiosClient.post = axiosPostStub;
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  it("TEST 1: initConsentRequest actually invokes the Gateway consent initialization service", async () => {
    const req = {
      body: {
        consent: {
          patient: { id: "testuser@sbx" },
          purpose: { text: "Testing", code: "CAREMGT" }
        }
      }
    };
    const res = {
      status: (code) => res,
      json: (data) => data
    };

    const result = await m2ConsentController.initConsentRequest(req, res);
    
    assert.ok(axiosClient.lastCall, "Axios should have been called");
    assert.ok(axiosClient.lastCall.url.includes("/v3/request/init"));
    assert.strictEqual(axiosClient.lastCall.data.consent.patient.id, "testuser@sbx");
    assert.ok(result.consentId, "Should return consentId");
    
    // Check if ID is a valid UUID
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    assert.ok(uuidRegex.test(result.requestId), "Request ID must be a UUID (TEST 4)");
    assert.ok(uuidRegex.test(result.consentId), "Consent ID must be a UUID");
  });

  it("TEST 2: Gateway failure does not produce fake local consent success", async () => {
    axiosClient.post = async () => { throw new Error("Gateway Error"); };
    
    const req = {
      body: {
        consent: { patient: { id: "testuser@sbx" } }
      }
    };
    const res = {
      status: (code) => {
        res.statusCode = code;
        return res;
      },
      json: (data) => data
    };

    const result = await m2ConsentController.initConsentRequest(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.ok(result.error);
  });

  it("TEST 3, 5, 6, 7: M2 Automated Consent Lifecycle and correlation", async () => {
    // 1. Init
    const reqInit = {
      body: { consent: { patient: { id: "user@sbx" } } }
    };
    const res = { status: () => res, json: (data) => data };
    const initRes = await m2ConsentController.initConsentRequest(reqInit, res);
    const localConsentId = initRes.consentId;
    const localRequestId = initRes.requestId;
    
    // 2. Fetch callback (before webhook) -> should 404 because Gateway hasn't responded
    let fetchRes = await m2ConsentController.fetchConsentInitCallback({ params: { requestId: localRequestId } }, res);
    assert.ok(fetchRes.error, "Should not fake the callback (TEST 6)");

    // 3. Webhook arrives from Gateway
    const gatewayConsentReqId = "real-abdm-consent-req-id";
    const webhookReq = {
      headers: { "request-id": "some-random-gateway-id" },
      body: {
        resp: { requestId: localRequestId },
        consentRequest: { id: gatewayConsentReqId }
      }
    };
    await m2CallbackController.onConsentRequestInit(webhookReq, res);

    // 4. Fetch callback again -> now it should work and return the REAL ID
    fetchRes = await m2ConsentController.fetchConsentInitCallback({ params: { requestId: localRequestId } }, res);
    assert.strictEqual(fetchRes.success, true);
    assert.strictEqual(fetchRes.consentId, gatewayConsentReqId, "Must return real consent ID (TEST 3)");

    // 5. Submit local decision does NOT auto-approve
    const decisionRes = await m2ConsentController.submitConsentDecision({ body: { consentId: gatewayConsentReqId, decision: "APPROVED" } }, res);
    
    let fetchStatusRes = await m2ConsentController.fetchConsentStatusCallback({ params: { consentId: gatewayConsentReqId } }, res);
    assert.strictEqual(fetchStatusRes.status, "Requested", "Should remain Requested until ABDM webhook");

    // 6. ABDM Webhook status arrives
    const statusWebhookReq = {
      headers: { "request-id": "webhook-status-id" },
      body: {
        notification: {
          consentRequestId: gatewayConsentReqId,
          status: "GRANTED",
          consentArtefacts: [{ id: "real-consent-artefact-id" }]
        }
      }
    };
    await m2CallbackController.onConsentRequestStatus(statusWebhookReq, res);

    // 7. Fetch status callback -> now it is Active!
    fetchStatusRes = await m2ConsentController.fetchConsentStatusCallback({ params: { consentId: gatewayConsentReqId } }, res);
    assert.strictEqual(fetchStatusRes.status, "Active");
  });
});
