const fs = require('fs');

let f1 = 'backend/tests/scanShareQueueResourceLimits.test.js';
let c1 = fs.readFileSync(f1, 'utf8');
c1 = c1.replace(/{ requestId: "api-1", profile: { patient: { name: "api" } }}/g, '{ requestId: "api-1", intent: "PROFILE_SHARE", profile: { patient: { name: "api" } }}');
c1 = c1.replace(/{ requestId: "api-2", profile: { patient: { name: "api" } }}/g, '{ requestId: "api-2", intent: "PROFILE_SHARE", profile: { patient: { name: "api" } }}');
fs.writeFileSync(f1, c1);
console.log("Patched correctly");
