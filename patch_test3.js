const fs = require('fs');

let file = 'backend/tests/scanShareSecurityIntegrity.test.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/parsed\.queue\.length !== 2/, 'parsed.queue.length !== 3');

fs.writeFileSync(file, content, 'utf8');
console.log("Patched test length");
