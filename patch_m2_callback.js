const fs = require('fs');
const file = 'backend/m2/callbacks/M2CallbackManager.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /\/\/ 2\. Only look at transactions waiting for consent[\s\S]*?return \{ tx: null, reason: "NoMatch", careContextReferences, patientId, hipId \};/m;

const replacement = `// 2. Fallback matching (latest pending, first pending, CareContext, Patient+HIP)
    // has been REMOVED for security (Prompt #5: Authoritative Correlation).
    // A callback must never be matched merely because a patient is the same,
    // an ABHA number is the same, or it is the only transaction.

    return { tx: null, reason: "NoMatch", careContextReferences, patientId, hipId };`;

content = content.replace(regex, replacement);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched M2CallbackManager.js');
