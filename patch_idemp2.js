const fs = require('fs');

let file = 'backend/utils/scanShareTokenStore.js';
let content = fs.readFileSync(file, 'utf8');

// I will refactor recordIssuedToken to check requestId idempotency universally
const regexFunc = /const recordIssuedToken = \(payload = \{\}\) => \{[\s\S]*?const fingerprint = patientFingerprint\(payload\);[\s\S]*?if \(fingerprint\) \{[\s\S]*?const existing = queue\.find\(\(record\) => record\.requestId === payload\.requestId\);[\s\S]*?if \(existing\) \{[\s\S]*?latestRecord = existing;[\s\S]*?Object\.assign\(existing, \{[\s\S]*?requestId: payload\.requestId \|\| existing\.requestId,[\s\S]*?patient: payload\.patient \|\| existing\.patient,[\s\S]*?lastSeenAt: nowIso\(\),[\s\S]*?scanCount: Number\(existing\.scanCount \|\| 1\) \+ 1,[\s\S]*?acknowledgementStatus: payload\.acknowledgementStatus \|\| "pending",[\s\S]*?duplicateScan: true,[\s\S]*?\}\);[\s\S]*?persistQueue\(\);[\s\S]*?return clone\(existing\);[\s\S]*?\}[\s\S]*?\}[\s\S]*?const tokenNumber = nextTokenNumber\(\);/m;

const replacement = `const recordIssuedToken = (payload = {}) => {
  loadQueue();
  const fingerprint = patientFingerprint(payload);
  
  if (payload.requestId) {
    const existing = queue.find((record) => record.requestId === payload.requestId);
    if (existing) {
      latestRecord = existing;
      Object.assign(existing, {
        patient: payload.patient || existing.patient,
        patientFingerprint: fingerprint || existing.patientFingerprint,
        lastSeenAt: nowIso(),
        scanCount: Number(existing.scanCount || 1) + 1,
        acknowledgementStatus: payload.acknowledgementStatus || "pending",
        duplicateScan: true,
      });
      persistQueue();
      return clone(existing);
    }
  }

  const tokenNumber = nextTokenNumber();`;

content = content.replace(regexFunc, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log("Universally patched requestId idempotency");
