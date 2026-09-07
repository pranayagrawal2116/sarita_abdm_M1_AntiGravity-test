const fs = require('fs');

let f1 = 'backend/tests/scanSharePatientIdentityAuthority.test.js';
let c1 = fs.readFileSync(f1, 'utf8');
c1 = c1.replace(/store\.loadQueue\(\); \/\/ Force reload from disk/g, '');
fs.writeFileSync(f1, c1);
console.log("Patched correctly");
