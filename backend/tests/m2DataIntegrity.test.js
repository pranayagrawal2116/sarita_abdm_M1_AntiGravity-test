const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { buildBundleFromFiles } = require("../m2/fhir/M2FHIRBundleBuilder");
const BundleRegistry = require("../m2/fhir/BundleRegistry");

async function runTests() {
  console.log("Running Data Integrity Tests...");
  
  // Test 1: Missing SNOMED code should FAIL generation, not fabricate Paracetamol
  const fakeFile = {
    content: "Name: Test Patient\nGender: M\nMobile: 9999999999\nMedications:\nName: Lisinopril\nDose: 1-0-0\nRoute: Oral\nTiming: After Food\nInstructions: Hypertension",
    fileName: "prescription.txt",
    hiType: "Prescription"
  };
  
  try {
    await buildBundleFromFiles({
      abhaId: "test@sbx",
      folderName: "test@sbx",
      files: [fakeFile],
      forceGeneratedPdf: true
    });
    assert.fail("Should have thrown an error due to missing SNOMED code");
  } catch (error) {
    assert.ok(error.message.includes("indicationSnomedCode is required") || error.message.includes("drugSnomedCode is required"), "Failed safely with validation error: " + error.message);
  }
  
  console.log("Test 1 Passed: Synthetic defaults removed, fails safely.");
  
  
  console.log("All Data Integrity Tests Passed!");
}

runTests().catch(e => { console.error(e); process.exit(1); });
