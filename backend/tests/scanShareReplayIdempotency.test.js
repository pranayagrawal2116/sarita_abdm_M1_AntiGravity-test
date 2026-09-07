const assert = require("assert");
const request = require("supertest");
const express = require("express");
const path = require("path");
const fs = require("fs");
const axios = require("axios");

process.env.RUNTIME_DATA_DIR = path.join(__dirname, "test_data_m1_replay");
process.env.GATEWAY_BASE = "http://mock-gateway.local";
if (fs.existsSync(process.env.RUNTIME_DATA_DIR)) {
    fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(process.env.RUNTIME_DATA_DIR, { recursive: true });

const scanShareController = require("../controllers/scanShareController");
const store = require("../utils/scanShareTokenStore");

// Mock axios post
let ackCallCount = 0;
const originalPost = axios.post;
axios.post = async (url, payload, options) => {
    if (url.includes("/sessions")) {
        return { data: { accessToken: "mock-token" } };
    }
    if (url.includes("/on-share")) {
        ackCallCount++;
        // Simulate network delay to test concurrency
        await new Promise(r => setTimeout(r, 200));
        return { data: { message: "ACK" } };
    }
    return originalPost(url, payload, options);
};

const app = express();
app.use(express.json({ limit: "100kb" }));
app.post("/api/v3/hip/patient/share", scanShareController.onPatientShare);

const runTests = async () => {
    console.log("Running Replay & Idempotency Tests...");

    // 1. First request
    let res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "REQ-REPLAY-1",
        intent: "PROFILE_SHARE",
        profile: { patient: { abhaAddress: "patient1@sbx" } }
    });
    assert.strictEqual(res.statusCode, 202);
    
    // Wait for background ack
    await new Promise(r => setTimeout(r, 300));
    assert.strictEqual(ackCallCount, 1);

    let queue = store.listIssuedTokens({ status: "queued" });
    let record1 = queue.find(q => q.requestId === "REQ-REPLAY-1");
    assert.strictEqual(record1.acknowledgementStatus, "sent");

    // 2. Duplicate after success
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "REQ-REPLAY-1",
        intent: "PROFILE_SHARE",
        profile: { patient: { abhaAddress: "patient1@sbx" } }
    });
    assert.strictEqual(res.statusCode, 202);

    await new Promise(r => setTimeout(r, 300));
    assert.strictEqual(ackCallCount, 2, "Duplicate after success MUST send another ACK if client retries");
    
    queue = store.listIssuedTokens({ status: "queued" });
    record1 = queue.find(q => q.requestId === "REQ-REPLAY-1");
    assert.strictEqual(record1.scanCount, 2);
    assert.strictEqual(record1.acknowledgementStatus, "sent");

    // 3. Concurrent duplicate requests (Race condition check)
    let p1 = request(app).post("/api/v3/hip/patient/share").send({
        requestId: "REQ-REPLAY-2",
        intent: "PROFILE_SHARE",
        profile: { patient: { abhaAddress: "patient2@sbx" } }
    });
    let p2 = request(app).post("/api/v3/hip/patient/share").send({
        requestId: "REQ-REPLAY-2",
        intent: "PROFILE_SHARE",
        profile: { patient: { abhaAddress: "patient2@sbx" } }
    });
    
    let [res1, res2] = await Promise.all([p1, p2]);
    assert.strictEqual(res1.statusCode, 202);
    assert.strictEqual(res2.statusCode, 202);

    await new Promise(r => setTimeout(r, 500));
    
    queue = store.listIssuedTokens({ status: "queued" });
    let record2 = queue.find(q => q.requestId === "REQ-REPLAY-2");
    
    // Check concurrency isolation
    assert.strictEqual(record2.scanCount, 2); // Was it atomically incremented? Or did race condition make it 1?
    
    // Check how many calls were made. Should be 4 total (1 + 1 + 2 concurrent)
    assert.strictEqual(ackCallCount, 3);

    console.log("Concurrent scanCount:", record2.scanCount);

    console.log("All Replay & Idempotency Tests Passed!");
};

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
