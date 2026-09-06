const fs = require('fs');

let file = 'backend/controllers/scanShareController.js';
let content = fs.readFileSync(file, 'utf8');

const regexAck = /const buildAcknowledgementPayload = \(\{ requestId, abhaAddress, tokenNumber \}\) => \(\{[\s\S]*?\}\);/m;
const newAck = `const buildAcknowledgementPayload = ({ requestId, abhaAddress, tokenNumber }) => ({
  acknowledgement: {
    status: "SUCCESS",
    abhaAddress,
    profile: {
      context: String(hospitalConfig.scanShareCounterId || "5"),
      tokenNumber: String(tokenNumber),
      expiry: "1800",
    },
  },
  response: {
    requestId,
  },
});`;

content = content.replace(regexAck, newAck);
fs.writeFileSync(file, content, 'utf8');
console.log("Patched buildAcknowledgementPayload");
