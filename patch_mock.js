const fs = require('fs');
let file = 'backend/tests/crossPatientCareContextIntegrity.test.js';
let content = fs.readFileSync(file, 'utf8');

const mockStr = `
// Mock Token Manager
const M2TokenManager = require("../m2/tokens/M2TokenManager");
M2TokenManager.getValidAuthentication = async () => ({ success: true, accessToken: "mock-token" });
M2TokenManager.getGatewayToken = async () => "mock-token";

// Mock axios
const axios = require("axios");
axios.post = async () => ({ data: { message: "ACK" } });
axios.get = async () => ({ data: { message: "ACK" } });

`;

content = content.replace("async function runTests() {", mockStr + "\nasync function runTests() {");
fs.writeFileSync(file, content);
console.log("Patched test");
