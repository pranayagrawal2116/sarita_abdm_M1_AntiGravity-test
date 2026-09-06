const fs = require('fs');

let file = 'backend/utils/scanShareTokenStore.js';
let content = fs.readFileSync(file, 'utf8');

// Replace the loadQueue() call at the bottom with a change to the mutators
// Actually, just call loadQueue() at the beginning of recordIssuedToken, updateIssuedTokenStatus, updateIssuedToken
const regexRecord = /(const recordIssuedToken = \(payload = \{\}\) => \{)/;
const replaceRecord = `$1\n  loadQueue();`;

const regexUpdateStatus = /(const updateIssuedTokenStatus = \(tokenNumber, status\) => \{)/;
const replaceUpdateStatus = `$1\n  loadQueue();`;

const regexUpdate = /(const updateIssuedToken = \(tokenNumber, patch = \{\}\) => \{)/;
const replaceUpdate = `$1\n  loadQueue();`;

const regexList = /(const listIssuedTokens = \(\{ status \} = \{\}\) => \{)/;
const replaceList = `$1\n  loadQueue();`;

content = content.replace(regexRecord, replaceRecord);
content = content.replace(regexUpdateStatus, replaceUpdateStatus);
content = content.replace(regexUpdate, replaceUpdate);
content = content.replace(regexList, replaceList);

fs.writeFileSync(file, content, 'utf8');
console.log("Patched loadQueue before mutation");
