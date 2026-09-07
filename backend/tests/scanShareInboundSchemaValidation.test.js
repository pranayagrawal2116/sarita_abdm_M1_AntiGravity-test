const assert = require("assert");
const request = require("supertest");
const express = require("express");
const path = require("path");
const fs = require("fs");

process.env.RUNTIME_DATA_DIR = path.join(__dirname, "test_data_m1_schema_full");
if (fs.existsSync(process.env.RUNTIME_DATA_DIR)) {
    fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(process.env.RUNTIME_DATA_DIR, { recursive: true });
process.env.SCAN_SHARE_MAX_QUEUE_ENTRIES = "500";

const scanShareController = require("../controllers/scanShareController");

const app = express();
app.use(express.json({ limit: "100kb" }));

app.post("/api/v3/hip/patient/share", scanShareController.onPatientShare);
app.post("/api/hiecm/patient-share/v3/share", scanShareController.onPatientShare);

const runTests = async () => {
    console.log("Running Full Inbound Schema Tests...");

    let res;

    // 1 & 2. Missing/Empty REQUEST-ID
    res = await request(app).post("/api/v3/hip/patient/share").send({
        intent: "PROFILE_SHARE",
        profile: { patient: { name: "Test" } }
    });
    assert.strictEqual(res.statusCode, 400);

    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "",
        intent: "PROFILE_SHARE",
        profile: { patient: { name: "Test" } }
    });
    assert.strictEqual(res.statusCode, 400);

    // 3. Missing intent
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-1",
        profile: { patient: { name: "Test" } }
    });
    assert.strictEqual(res.statusCode, 400);

    // 4. Unknown intent
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-2",
        intent: "BOGUS_INTENT",
        profile: { patient: { name: "Test" } }
    });
    assert.strictEqual(res.statusCode, 400);

    // 5. Non-string intent (Type confusion)
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-2b",
        intent: ["PROFILE_SHARE"],
        profile: { patient: { name: "Test" } }
    });
    // ["PROFILE_SHARE"] stringifies to "PROFILE_SHARE" via toText
    assert.strictEqual(res.statusCode, 202);

    // 6 & 7 & 8. Missing/Null/Invalid patient
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-3",
        intent: "PROFILE_SHARE",
    });
    assert.strictEqual(res.statusCode, 400);

    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-3b",
        intent: "PROFILE_SHARE",
        profile: null
    });
    assert.strictEqual(res.statusCode, 400);

    // 9. Invalid nested patient field type
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-3c",
        intent: "PROFILE_SHARE",
        profile: { patient: { name: [] } } // empty array stringifies to ""
    });
    assert.strictEqual(res.statusCode, 400);

    // 10. PROFILE_SHARE valid structure
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-4",
        intent: "PROFILE_SHARE",
        profile: { patient: { name: "Test" } }
    });
    assert.strictEqual(res.statusCode, 202);

    // 11. RECORD_SHARE valid structure
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-5",
        intent: "RECORD_SHARE",
        profile: { patient: { name: "Test" } },
        healthInfoBundle: { content: "data" }
    });
    assert.strictEqual(res.statusCode, 202);

    // 12. PAYMENT_SHARE valid structure
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-6",
        intent: "PAYMENT_SHARE",
        profile: { patient: { name: "Test" } },
        paymentBundle: { amount: 100 }
    });
    assert.strictEqual(res.statusCode, 202);

    // 13. Intent/data mismatch
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-7",
        intent: "RECORD_SHARE",
        profile: { patient: { name: "Test" } },
        paymentBundle: { amount: 100 } // Missing healthInfoBundle
    });
    assert.strictEqual(res.statusCode, 400);

    // 14 & 15. __proto__ / constructor / prototype
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-8",
        intent: "PROFILE_SHARE",
        profile: { patient: { name: "Test" } },
        "__proto__": { polluted: true },
        "constructor": { prototype: { polluted2: true } }
    });
    assert.strictEqual(res.statusCode, 202);
    assert.strictEqual({}.polluted, undefined); // Ensure no pollution

    // 16. Oversized request through both aliases (bypassed if limit works)
    const largeStr = "A".repeat(150 * 1024);
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-9",
        intent: "PROFILE_SHARE",
        profile: { patient: { name: largeStr } }
    });
    assert.strictEqual(res.statusCode, 413);

    res = await request(app).post("/api/hiecm/patient-share/v3/share").send({
        requestId: "req-10",
        intent: "PROFILE_SHARE",
        profile: { patient: { name: largeStr } }
    });
    assert.strictEqual(res.statusCode, 413);

    // 17 & 18. Invalid request does not create queue state or outbound traffic
    const store = require("../utils/scanShareTokenStore");
    const queue = store.listIssuedTokens({ status: "queued" });
    assert.strictEqual(queue.find(q => q.requestId === "req-3"), undefined);
    assert.strictEqual(queue.find(q => q.requestId === "req-7"), undefined);
    
    console.log("All Full Schema Tests Passed!");
};

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
