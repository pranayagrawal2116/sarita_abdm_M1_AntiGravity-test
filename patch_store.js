const fs = require('fs');
const file = 'backend/utils/scanShareTokenStore.js';
let content = fs.readFileSync(file, 'utf8');

const target = `      Object.assign(existing, {
        patient: payload.patient || existing.patient,
        patientFingerprint: fingerprint || existing.patientFingerprint,
        lastSeenAt: nowIso(),
        scanCount: Number(existing.scanCount || 1) + 1,
        acknowledgementStatus: payload.acknowledgementStatus || "pending",
        duplicateScan: true,
      });`;

const replacement = `      Object.assign(existing, {
        // DO NOT overwrite the authoritative patient or fingerprint payload
        // patient: payload.patient || existing.patient,
        // patientFingerprint: fingerprint || existing.patientFingerprint,
        lastSeenAt: nowIso(),
        scanCount: Number(existing.scanCount || 1) + 1,
        acknowledgementStatus: payload.acknowledgementStatus || "pending",
        duplicateScan: true,
      });`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
    fs.writeFileSync(file, content);
    console.log("Patched scanShareTokenStore.js");
} else {
    console.log("Target not found. It might be slightly different.");
}
