const fs = require('fs');
const file = 'backend/controllers/scanShareController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/error\.response\?\.data \|\| error\.message \|\| error/g, '"<omitted for security>"');
content = content.replace(/error\.response\?\.data \|\| error\.message/g, '"<omitted for security>"');
content = content.replace(/console\.log\([^)]*payload[^)]*\);/g, 'console.log("[ScanShare] payload log omitted");'); // Roughly omitting payload logs if any
// specifically fixing line 194 console.log
content = content.replace(/console\.log\(\s*"\[ScanShare\] Received",\s*isOpenOrder \? "Open Order" : "Patient Share",\s*payload\s*\);/g, 'console.log("[ScanShare] Received", isOpenOrder ? "Open Order" : "Patient Share");');

fs.writeFileSync(file, content, 'utf8');
console.log('scanShareController patched');
