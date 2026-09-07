const fs = require('fs');

// Patch Resource Limits Test
let f1 = 'backend/tests/scanShareQueueResourceLimits.test.js';
let c1 = fs.readFileSync(f1, 'utf8');
c1 = c1.replace(/{ requestId: "req-empty", profile: { patient: {} }}/g, '{ requestId: "req-empty", intent: "PROFILE_SHARE", profile: { patient: {} }}');
c1 = c1.replace(/{ requestId: "req-large", profile: { patient: { name: largeString } }}/g, '{ requestId: "req-large", intent: "PROFILE_SHARE", profile: { patient: { name: largeString } }}');
c1 = c1.replace(/{ requestId: "api-1", profile: { patient: { name: "api" } } }/g, '{ requestId: "api-1", intent: "PROFILE_SHARE", profile: { patient: { name: "api" } } }');
c1 = c1.replace(/{ requestId: "api-2", profile: { patient: { name: "api" } } }/g, '{ requestId: "api-2", intent: "PROFILE_SHARE", profile: { patient: { name: "api" } } }');
fs.writeFileSync(f1, c1);

// Patch Security Integrity Test
let f2 = 'backend/tests/scanShareSecurityIntegrity.test.js';
let c2 = fs.readFileSync(f2, 'utf8');
c2 = c2.replace(/intent: "PAYMENT_SHARE",\s*profile/g, 'intent: "PAYMENT_SHARE", paymentBundle: { amount: 100 }, profile');
fs.writeFileSync(f2, c2);

console.log("Tests patched.");
