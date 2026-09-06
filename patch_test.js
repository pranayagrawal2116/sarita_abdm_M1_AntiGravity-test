const fs = require('fs');

let file = 'backend/tests/scanShareSecurityIntegrity.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/"request-id": "req-456"/, '"request-id": "req-123"');

fs.writeFileSync(file, content, 'utf8');
console.log("Patched test request id");
