const fs = require('fs');
let storeFile = 'backend/utils/scanShareTokenStore.js';
let storeContent = fs.readFileSync(storeFile, 'utf8');

const storeTarget = `      Object.assign(existing, {
        // DO NOT overwrite the authoritative patient or fingerprint payload
        lastSeenAt: nowIso(),
        scanCount: Number(existing.scanCount || 1) + 1,
        acknowledgementStatus: payload.acknowledgementStatus || "pending",
        duplicateScan: true,
      });`;

const storeReplacement = `      const isCurrentlyPending = existing.acknowledgementStatus === "pending";
      Object.assign(existing, {
        // DO NOT overwrite the authoritative patient or fingerprint payload
        lastSeenAt: nowIso(),
        scanCount: Number(existing.scanCount || 1) + 1,
        acknowledgementStatus: payload.acknowledgementStatus || "pending",
        duplicateScan: true,
        _preventConcurrentAck: isCurrentlyPending
      });`;

if (storeContent.includes(storeTarget)) {
    storeContent = storeContent.replace(storeTarget, storeReplacement);
    fs.writeFileSync(storeFile, storeContent);
    console.log("Patched store");
} else {
    console.log("Store target not found");
}

let ctrlFile = 'backend/controllers/scanShareController.js';
let ctrlContent = fs.readFileSync(ctrlFile, 'utf8');

const ctrlTarget = `    acknowledgeInBackground({
      issued,
      isOpenOrder,
      acknowledgementPayload,
    });`;

const ctrlReplacement = `    if (!issued._preventConcurrentAck) {
      acknowledgeInBackground({
        issued,
        isOpenOrder,
        acknowledgementPayload,
      });
    }`;

if (ctrlContent.includes(ctrlTarget)) {
    ctrlContent = ctrlContent.replace(ctrlTarget, ctrlReplacement);
    fs.writeFileSync(ctrlFile, ctrlContent);
    console.log("Patched controller");
} else {
    console.log("Controller target not found");
}
