const fs = require('fs');

let file = 'backend/controllers/scanShareController.js';
let content = fs.readFileSync(file, 'utf8');

const regexAck = /const buildAcknowledgementPayload = \(\{ requestId, abhaAddress, tokenNumber \}\) => \(\{[\s\S]*?\}\);/m;
const newAck = `const buildAcknowledgementPayload = ({ requestId, abhaAddress, tokenNumber, intent }) => {
  let ackData = { status: "SUCCESS", abhaAddress };
  if (intent === "PAYMENT_SHARE") {
    ackData.payment = { paymentReference: String(tokenNumber) };
  } else if (intent === "RECORD_SHARE") {
    ackData.healthInformation = { healthInformationReference: String(tokenNumber) };
  } else {
    ackData.profile = {
      context: String(hospitalConfig.scanShareCounterId || "5"),
      tokenNumber: String(tokenNumber),
      expiry: "1800",
    };
  }
  
  return {
    acknowledgement: ackData,
    response: { requestId }
  };
};`;

content = content.replace(regexAck, newAck);

// Also need to pass intent when calling buildAcknowledgementPayload
content = content.replace(
  /buildAcknowledgementPayload\(\{([\s\S]*?)tokenNumber: issued\.tokenNumber,([\s\S]*?)\}\)/m,
  `buildAcknowledgementPayload({$1tokenNumber: issued.tokenNumber, intent: toText(payload.intent).toUpperCase()$2})`
);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched buildAcknowledgementPayload to support intents");
