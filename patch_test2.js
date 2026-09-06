const fs = require('fs');

let file = 'backend/tests/scanShareSecurityIntegrity.test.js';
let content = fs.readFileSync(file, 'utf8');

const additionalTest = `
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
`;

// Insert after Test 3
content = content.replace(/\/\/ 4\. Persistence and Restart Queue Behavior/, additionalTest + '\n  // 4. Persistence and Restart Queue Behavior');

fs.writeFileSync(file, content, 'utf8');
console.log("Patched test with 3b");
