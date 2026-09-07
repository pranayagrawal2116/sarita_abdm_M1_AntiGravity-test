const fs = require('fs');

const file1 = 'backend/m2/transfer/M2DataTransferManager.js';
let content1 = fs.readFileSync(file1, 'utf8');

const regex = /const body = \{\n\s*hiRequest: \{\n\s*transactionId,\n\s*sessionStatus: "ACKNOWLEDGED"\n\s*\},\n\s*response: \{\n\s*requestId\n\s*\}\n\s*\};/;
const replacement = `const body = {
      requestId: require("uuid").v4(),
      timestamp: new Date().toISOString(),
      hiRequest: {
        transactionId,
        sessionStatus: "ACKNOWLEDGED"
      },
      resp: {
        requestId
      }
    };`;

if (content1.match(regex)) {
  content1 = content1.replace(regex, replacement);
  fs.writeFileSync(file1, content1);
  console.log("Patched M2 on-request payload.");
} else {
  console.log("Regex not found.");
}
