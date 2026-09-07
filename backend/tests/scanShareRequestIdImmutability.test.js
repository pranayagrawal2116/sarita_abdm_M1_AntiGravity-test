const assert = require("assert");
const fs = require("fs");
const path = require("path");

// Point to a temporary data root for the test
process.env.RUNTIME_DATA_DIR = path.join(__dirname, "test_data_m1_immutability");
if (fs.existsSync(process.env.RUNTIME_DATA_DIR)) {
    fs.rmSync(process.env.RUNTIME_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(process.env.RUNTIME_DATA_DIR, { recursive: true });

const { recordIssuedToken, getLatestIssuedToken } = require("../utils/scanShareTokenStore");

const runTests = async () => {
    console.log("Running Scan & Share REQUEST-ID Immutability Tests...");

    const requestId = "req-immutability-123";

    const patientA = {
        name: "Patient A",
        abhaAddress: "patientA@sbx",
        abhaNumber: "11-1111-1111-1111",
        mobile: "9999999999"
    };

    const patientB = {
        name: "Patient B",
        abhaAddress: "patientB@sbx",
        abhaNumber: "22-2222-2222-2222",
        mobile: "8888888888"
    };

    // 1. First REQUEST-ID creates authoritative transaction.
    const firstResult = recordIssuedToken({
        requestId,
        hipId: "HIP_1",
        patient: patientA
    });

    assert.strictEqual(firstResult.requestId, requestId);
    assert.strictEqual(firstResult.patient.name, "Patient A");
    assert.strictEqual(firstResult.duplicateScan, false);
    assert.strictEqual(firstResult.scanCount, 1);
    
    const initialTokenNumber = firstResult.tokenNumber;

    // 2. Duplicate identical REQUEST-ID does not overwrite patient.
    const secondResult = recordIssuedToken({
        requestId,
        hipId: "HIP_1",
        patient: patientA
    });

    assert.strictEqual(secondResult.patient.name, "Patient A");
    assert.strictEqual(secondResult.tokenNumber, initialTokenNumber);
    assert.strictEqual(secondResult.duplicateScan, true);
    assert.strictEqual(secondResult.scanCount, 2);

    // 3. Duplicate different-patient REQUEST-ID does not overwrite patient.
    const thirdResult = recordIssuedToken({
        requestId,
        hipId: "HIP_1",
        patient: patientB
    });

    assert.strictEqual(thirdResult.patient.name, "Patient A", "Patient identity was overwritten by duplicate request!");
    assert.strictEqual(thirdResult.patient.abhaAddress, "patientA@sbx", "ABHA Address was overwritten!");
    assert.strictEqual(thirdResult.patient.mobile, "9999999999", "Mobile was overwritten!");
    assert.strictEqual(thirdResult.tokenNumber, initialTokenNumber, "Token association changed!");
    assert.strictEqual(thirdResult.scanCount, 3);

    // 4. Conflicting ABHA cannot overwrite (covered in patientB)
    // 5. Conflicting mobile cannot overwrite (covered in patientB)
    
    // 6. State survives storage reload/restart.
    // Let's force a reload by simulating a new process (clearing require cache is tricky, but we can just require it again or assume store uses file)
    // Actually, recordIssuedToken calls loadQueue() internally, which reads from file. 
    // We can directly parse the JSON file to verify the persistence.
    const storeFile = path.join(process.env.RUNTIME_DATA_DIR, "scan_share_queue.json");
    const rawData = fs.readFileSync(storeFile, "utf8");
    const parsedData = JSON.parse(rawData);
    
    const persistedRecord = parsedData.queue.find(q => q.requestId === requestId);
    assert.strictEqual(persistedRecord.patient.name, "Patient A", "Persisted patient data changed!");
    assert.strictEqual(persistedRecord.scanCount, 3);

    // 7. Concurrent duplicate requests do not produce last-writer-wins patient substitution.
    // Since Node is single-threaded and recordIssuedToken is fully synchronous, concurrency within one process is perfectly serialized.
    // We'll simulate rapid calls:
    const newReqId = "req-immutability-concurrent";
    
    // Fire multiple synchronous calls representing interleaved event loop tasks (they run sequentially in JS)
    recordIssuedToken({ requestId: newReqId, hipId: "HIP_1", patient: { name: "First" } });
    recordIssuedToken({ requestId: newReqId, hipId: "HIP_1", patient: { name: "Second" } });
    const finalConc = recordIssuedToken({ requestId: newReqId, hipId: "HIP_1", patient: { name: "Third" } });
    
    assert.strictEqual(finalConc.patient.name, "First", "Concurrency simulation failed immutability!");
    assert.strictEqual(finalConc.scanCount, 3);

    console.log("All Scan & Share REQUEST-ID Immutability Tests Passed!");
};

runTests().catch(err => {
    console.error(err);
    process.exit(1);
});
