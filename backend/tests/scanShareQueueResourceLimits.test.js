const assert = require("assert");
const fs = require("fs");
const path = require("path");
const http = require("http");

// Mock environment
process.env.RUNTIME_DATA_DIR = path.join(__dirname, "test_data_m1_limits");
if (fs.existsSync(process.env.RUNTIME_DATA_DIR)) {
    fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(process.env.RUNTIME_DATA_DIR, { recursive: true });
process.env.SCAN_SHARE_MAX_QUEUE_ENTRIES = "5"; // Small limit for testing

const { recordIssuedToken, getLatestIssuedToken } = require("../utils/scanShareTokenStore");

// Mock controller setup for Express tests
const express = require("express");
const app = express();

app.use([
  "/api/v3/hip/patient/share"
], express.json({ limit: "100kb" }));

const scanShareController = require("../controllers/scanShareController");
app.post("/api/v3/hip/patient/share", scanShareController.onPatientShare);

const request = require("supertest");

const runTests = async () => {
    console.log("Running Scan & Share Resource Limit Tests...");

    // 1. A. Queue capacity & B. Expired entries
    // Let's create 5 entries that are active.
    for (let i = 0; i < 5; i++) {
        recordIssuedToken({ requestId: `req-${i}`, patient: { name: `Name-${i}`, abhaAddress: `a${i}@sbx` }});
    }

    // Next request should fail
    let threw = false;
    try {
        recordIssuedToken({ requestId: `req-full`, patient: { name: `Name-Full`, abhaAddress: `full@sbx` }});
    } catch(e) {
        threw = true;
        assert.ok(e.message.includes("SCAN_SHARE_QUEUE_FULL"));
    }
    assert.ok(threw, "Queue capacity check failed!");

    // C. Duplicate REQUEST-ID (should not throw capacity error)
    const dup = recordIssuedToken({ requestId: `req-0`, patient: { name: `Name-Dup`, abhaAddress: `dup@sbx` }});
    assert.strictEqual(dup.duplicateScan, true);
    assert.strictEqual(dup.patient.name, "Name-0", "Prompt 23 immutability regressed!");

    // Let's mock time or just manually edit the file to make them expired and see if they get cleaned up.
    const storeFile = path.join(process.env.RUNTIME_DATA_DIR, "scan_share_queue.json");
    let raw = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    // Make first 2 expired
    raw.queue[0].issuedAt = new Date(Date.now() - 2000 * 1000).toISOString();
    raw.queue[1].issuedAt = new Date(Date.now() - 2000 * 1000).toISOString();
    fs.writeFileSync(storeFile, JSON.stringify(raw));

    // Now inserting a new record should trigger cleanup of the 2 expired ones, and succeed!
    const newRec = recordIssuedToken({ requestId: `req-new`, patient: { name: `Name-New`, abhaAddress: `new@sbx` }});
    assert.strictEqual(newRec.requestId, "req-new");
    
    raw = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
    assert.strictEqual(raw.queue.length, 4); // 5 - 2 expired + 1 new = 4

    // Express route tests
    // F. Empty patient
    let res = await request(app)
        .post("/api/v3/hip/patient/share")
        .send({ requestId: "req-empty", intent: "PROFILE_SHARE", profile: { patient: {} }});
    
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.body.error.includes("Application safety limit"));

    // E. Oversized body
    // 100kb limit. We send 150kb
    const largeString = "a".repeat(150 * 1024);
    res = await request(app)
        .post("/api/v3/hip/patient/share")
        .send({ requestId: "req-large", intent: "PROFILE_SHARE", profile: { patient: { name: largeString } }});
    
    assert.strictEqual(res.statusCode, 413); // Payload Too Large

    // Fill queue through API
    await request(app).post("/api/v3/hip/patient/share").send({ requestId: "api-1", intent: "PROFILE_SHARE", profile: { patient: { name: "api" } }});
    // Queue now has 5
    res = await request(app).post("/api/v3/hip/patient/share").send({ requestId: "api-2", intent: "PROFILE_SHARE", profile: { patient: { name: "api" } }});
    assert.strictEqual(res.statusCode, 503);
    assert.ok(res.body.error.includes("Queue is full"));

    console.log("All Queue Resource Limit Tests Passed!");
};

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
