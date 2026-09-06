const fs = require('fs');

let file = 'backend/controllers/scanShareController.js';
let content = fs.readFileSync(file, 'utf8');

const regexLog = /console\.log\([\s\S]*?\[ScanShare\] Patient scan added to queue[\s\S]*?JSON\.stringify\([\s\S]*?name: patient\.name,[\s\S]*?abhaAddress: patient\.abhaAddress,[\s\S]*?abhaNumber: patient\.abhaNumber,[\s\S]*?mobile: patient\.mobile,[\s\S]*?2\s*\)\s*\);/m;

const safeLog = `console.log(
      "[ScanShare] Patient scan added to queue",
      JSON.stringify(
        {
          tokenNumber: issued.tokenNumber,
          duplicateScan: issued.duplicateScan === true,
          scanCount: issued.scanCount,
          hipId,
          flow: issued.flow,
        },
        null,
        2
      )
    );`;

content = content.replace(regexLog, safeLog);
fs.writeFileSync(file, content, 'utf8');
console.log("Patched logging");
