const fs = require('fs');
let file = 'backend/tests/crossPatientCareContextIntegrity.test.js';
let content = fs.readFileSync(file, 'utf8');

const newMockStr = `
// Mock Gateway Calls
const M2AuthenticationManager = require("../m2/authentication/M2AuthenticationManager");
M2AuthenticationManager.callGatewayApi = async () => ({ data: { message: "ACK" } });

const axiosClient = require("../m2/helpers/axiosClient");
axiosClient.post = async () => ({ data: { message: "ACK" } });
axiosClient.get = async () => ({ data: { message: "ACK" } });
`;

content = content.replace("// Mock Gateway Calls\nconst M2AuthenticationManager = require(\"../m2/authentication/M2AuthenticationManager\");\nM2AuthenticationManager.callGatewayApi = async () => ({ data: { message: \"ACK\" } });", newMockStr);
fs.writeFileSync(file, content);
console.log("Patched test 3");
