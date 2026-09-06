require("dotenv").config({ path: __dirname + "/../.env" });
const fs = require("fs");
const path = require("path");
const { dataRoot } = require("../config/environment");
const storeFile = path.join(dataRoot, "scan_share_queue.json");
if (fs.existsSync(storeFile)) {
  fs.unlinkSync(storeFile);
}
const { onPatientShare } = require("../controllers/scanShareController");
const scanShareTokenStore = require("../utils/scanShareTokenStore");

const axios = require("axios");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createMockReqRes = (method, headers, body) => {
  const req = {
    method,
    headers: headers || {},
    body: body || {},
  };
  const res = {
    statusCode: null,
    jsonData: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    }
  };
  return { req, res };
};

// Mock axios
const originalPost = axios.post;
axios.post = async (url, payload, config) => {
  if (url.includes("gateway/v3/sessions")) {
    return { data: { accessToken: "mock-token" } };
  }
  if (url.includes("/on-share")) {
    return { data: { status: "ACKNOWLEDGED" } };
  }
  return originalPost(url, payload, config);
};

async function runTests() {
  console.log("Running Scan & Share Security & Integrity Tests...");
  let passed = true;

  // 1. Missing requestId (Malformed/Missing Correlation)
  let { req: req1, res: res1 } = createMockReqRes("POST", {}, {
    intent: "PROFILE_SHARE",
    profile: { patient: { name: "Test User" } }
  });
  await onPatientShare(req1, res1);
  if (res1.statusCode !== 400) {
    console.error("Test 1 Failed: Expected 400 for missing requestId");
    passed = false;
  }

  // 2. Valid Request (Profile Share)
  let { req: req2, res: res2 } = createMockReqRes("POST", { "request-id": "req-123" }, {
    intent: "PROFILE_SHARE",
    profile: { patient: { abhaAddress: "test@sbx", name: "Test User" } }
  });
  await onPatientShare(req2, res2);
  let data2 = res2.jsonData;
  if (res2.statusCode !== 202 || !data2.accepted || !data2.tokenNumber) {
    console.error("Test 2 Failed: Valid request should be accepted", data2);
    passed = false;
  }

  // Allow async ack to finish
  await delay(100);

  // 3. Duplicate Callback
  let { req: req3, res: res3 } = createMockReqRes("POST", { "request-id": "req-123" }, {
    intent: "PROFILE_SHARE",
    profile: { patient: { abhaAddress: "test@sbx", name: "Test User" } }
  });
  await onPatientShare(req3, res3);
  let data3 = res3.jsonData;
  if (!data3.duplicateScan || data3.scanCount !== 2) {
    console.error("Test 3 Failed: Duplicate callback should update scanCount and mark as duplicateScan");
    passed = false;
  }

  
  // 3b. Same patient, different request id
  let { req: req3b, res: res3b } = createMockReqRes("POST", { "request-id": "req-999" }, {
    intent: "PROFILE_SHARE",
    profile: { patient: { abhaAddress: "test@sbx", name: "Test User" } }
  });
  await onPatientShare(req3b, res3b);
  let data3b = res3b.jsonData;
  if (data3b.duplicateScan || data3b.tokenNumber === data2.tokenNumber) {
    console.error("Test 3b Failed: Same patient different request ID must generate a NEW token");
    passed = false;
  }

  // 4. Persistence and Restart Queue Behavior
  scanShareTokenStore.recordIssuedToken({ requestId: "req-789", patient: { abhaAddress: "other@sbx" } });
  
  // Simulate Restart by reading queue
  const raw = fs.readFileSync(storeFile, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed.queue.length !== 3) {
    console.error("Test 4 Failed: Expected 2 items in persisted queue");
    passed = false;
  }
  if (parsed.queue[0].scanCount !== 2) {
    console.error("Test 4 Failed: Expected first item to have scanCount 2");
    passed = false;
  }

  // 6. Payment Share ACK
  let { req: req6, res: res6 } = createMockReqRes("POST", { "request-id": "req-pay" }, {
    intent: "PAYMENT_SHARE",
    profile: { patient: { abhaAddress: "pay@sbx" } }
  });
  await onPatientShare(req6, res6);
  if (res6.statusCode !== 202) {
    console.error("Test 6 Failed: Payment share failed");
    passed = false;
  }

  if (passed) {
    console.log("All Scan & Share Security Integrity Tests Passed!");
  } else {
    process.exit(1);
  }
}

runTests();
