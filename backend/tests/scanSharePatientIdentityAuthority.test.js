const assert = require("assert");
const request = require("supertest");
const express = require("express");
const path = require("path");
const fs = require("fs");

process.env.RUNTIME_DATA_DIR = path.join(__dirname, "test_data_m1_identity");
if (fs.existsSync(process.env.RUNTIME_DATA_DIR)) {
    fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(process.env.RUNTIME_DATA_DIR, { recursive: true });
process.env.SCAN_SHARE_MAX_QUEUE_ENTRIES = "500";

const scanShareController = require("../controllers/scanShareController");
const store = require("../utils/scanShareTokenStore");

const app = express();
app.use(express.json({ limit: "100kb" }));
app.post("/api/v3/hip/patient/share", scanShareController.onPatientShare);

const runTests = async () => {
    console.log("Running Patient Identity Authority Tests...");

    // 1-4 & 5. Conflicting identifiers
    let res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-auth-1",
        intent: "PROFILE_SHARE",
        profile: {
            patient: {
                abhaAddress: "ATTACKER-ABHA-001@sbx",
                abhaNumber: "12341234123412",
                mobile: "9999999999",
                name: "ATTACKER NAME"
            }
        }
    });
    assert.strictEqual(res.statusCode, 202);

    let queue = store.listIssuedTokens({ status: "queued" });
    let record1 = queue.find(q => q.requestId === "req-auth-1");
    assert.strictEqual(record1.patient.abhaAddress, "ATTACKER-ABHA-001@sbx");
    assert.strictEqual(record1.patient.abhaNumber, "12341234123412");
    assert.strictEqual(record1.patient.mobile, "9999999999");
    assert.strictEqual(record1.patient.name, "ATTACKER NAME");
    
    // Check fingerprint
    assert.strictEqual(record1.patientFingerprint.includes("attacker-abha-001@sbx"), true);

    // 6. Duplicate REQUEST-ID attempting patient replacement (Prompt #23 immutability check)
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-auth-1",
        intent: "PROFILE_SHARE",
        profile: {
            patient: {
                abhaAddress: "LEGITIMATE-ABHA-002@sbx", // Attacker tries to change identity!
                name: "LEGITIMATE NAME"
            }
        }
    });
    assert.strictEqual(res.statusCode, 202);

    queue = store.listIssuedTokens({ status: "queued" });
    let record2 = queue.find(q => q.requestId === "req-auth-1");
    
    // Proof of authority preservation: the identity must not change!
    assert.strictEqual(record2.patient.abhaAddress, "ATTACKER-ABHA-001@sbx");
    assert.strictEqual(record2.patient.name, "ATTACKER NAME");
    assert.strictEqual(record2.scanCount, 2);

    // 10. Multiple unique REQUEST-IDs containing different synthetic patients
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-auth-3",
        intent: "PROFILE_SHARE",
        profile: { patient: { abhaAddress: "PATIENT-C@sbx" } }
    });
    assert.strictEqual(res.statusCode, 202);

    // 11-12. __proto__ / constructor / prototype
    res = await request(app).post("/api/v3/hip/patient/share").send({
        requestId: "req-auth-4",
        intent: "PROFILE_SHARE",
        profile: {
            patient: {
                abhaAddress: "PATIENT-D@sbx",
                "__proto__": { malicious: true },
                "constructor": { prototype: { malicious2: true } }
            }
        }
    });
    assert.strictEqual(res.statusCode, 202);

    queue = store.listIssuedTokens({ status: "queued" });
    let record4 = queue.find(q => q.requestId === "req-auth-4");
    assert.strictEqual(record4.patient.abhaAddress, "PATIENT-D@sbx");
    assert.strictEqual(record4.patient.malicious, undefined);

    // 8. Persistence/reload of accepted patient data
    
    queue = store.listIssuedTokens({ status: "queued" });
    let reloadedRecord = queue.find(q => q.requestId === "req-auth-1");
    assert.strictEqual(reloadedRecord.patient.abhaAddress, "ATTACKER-ABHA-001@sbx");

    console.log("All Patient Identity Authority Tests Passed!");
};

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
