const fs = require('fs');
const file = 'backend/controllers/scanShareController.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /return \{\n\s*acknowledgement: ackData,\n\s*response: \{ requestId \}\n\s*\};/;
const replacement = `return {
    requestId: require("uuid").v4(),
    timestamp: new Date().toISOString(),
    acknowledgement: ackData,
    resp: { requestId }
  };`;

if (content.match(regex)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content);
  console.log("Patched M1 ACK payload.");
} else {
  console.log("Regex not found.");
}
