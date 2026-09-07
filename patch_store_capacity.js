const fs = require('fs');
const file = 'backend/utils/scanShareTokenStore.js';
let content = fs.readFileSync(file, 'utf8');

const targetRecordIssuedToken = `const recordIssuedToken = (payload = {}) => {
  loadQueue();
  const fingerprint = patientFingerprint(payload);`;

const replacementRecordIssuedToken = `const recordIssuedToken = (payload = {}) => {
  loadQueue();

  // PHYSICAL EXPIRY CLEANUP: Remove expired or non-active records to free active capacity
  // (Retain "registered" or "completed" for 24 hours if needed? No, let's just clear logically expired ones to prevent memory bloat)
  queue = queue.filter(r => isCoolingPeriodActive(r) || r.status !== 'queued');

  const fingerprint = patientFingerprint(payload);
  
  if (payload.requestId) {
    const existing = queue.find((record) => record.requestId === payload.requestId);
    if (existing) {
      // Duplicate REQUEST-ID logic (preserve immutability)
      latestRecord = existing;
      Object.assign(existing, {
        lastSeenAt: nowIso(),
        scanCount: Number(existing.scanCount || 1) + 1,
        acknowledgementStatus: payload.acknowledgementStatus || "pending",
        duplicateScan: true,
      });
      persistQueue();
      return clone(existing);
    }
  }

  // QUEUE CAPACITY PROTECTION
  const activeEntries = queue.filter(r => r.status === 'queued');
  const MAX_QUEUE_ENTRIES = Number(process.env.SCAN_SHARE_MAX_QUEUE_ENTRIES) || 500;
  if (activeEntries.length >= MAX_QUEUE_ENTRIES) {
    throw new Error("SCAN_SHARE_QUEUE_FULL: Application resource protection limit reached.");
  }`;

if (content.includes(targetRecordIssuedToken)) {
    // We need to replace the whole beginning of recordIssuedToken
    // I will use regex or precise replacement.
    content = content.replace(/const recordIssuedToken = \(payload = \{\}\) => \{[\s\S]*?const fingerprint = patientFingerprint\(payload\);/m, replacementRecordIssuedToken);
    fs.writeFileSync(file, content);
    console.log("Patched scanShareTokenStore.js for capacity limits");
} else {
    console.log("Target not found.");
}
