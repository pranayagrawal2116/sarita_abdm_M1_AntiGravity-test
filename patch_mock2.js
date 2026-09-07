const fs = require('fs');
let file = 'backend/tests/crossPatientCareContextIntegrity.test.js';
let content = fs.readFileSync(file, 'utf8');

const newMockStr = `
// Mock Gateway Calls
const M2AuthenticationManager = require("../m2/authentication/M2AuthenticationManager");
M2AuthenticationManager.callGatewayApi = async () => ({ data: { message: "ACK" } });
`;

content = content.replace("// Mock axios", newMockStr + "\n// Mock axios");
fs.writeFileSync(file, content);
console.log("Patched test 2");
