const fs = require('fs');
const file = 'backend/utils/scanShareTokenStore.js';
let content = fs.readFileSync(file, 'utf8');

const replacement = `const recordIssuedToken = (payload = {}) => {
  loadQueue();

  // PHYSICAL EXPIRY CLEANUP: Remove logically expired or very old records to prevent unbounded disk/memory growth
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  queue = queue.filter(r => {
      if (r.status === 'queued') {
          return isCoolingPeriodActive(r);
      } else {
          const issuedAtMs = Date.parse(r.issuedAt || "");
          return Number.isFinite(issuedAtMs) && (Date.now() - issuedAtMs) < TWENTY_FOUR_HOURS;
      }
  });

  const fingerprint = patientFingerprint(payload);
  
  if (payload.requestId) {
    const existing = queue.find((record) => record.requestId === payload.requestId);
    if (existing) {
      latestRecord = existing;
      Object.assign(existing, {
        // DO NOT overwrite the authoritative patient or fingerprint payload
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

// Replace from recordIssuedToken until the end of if (payload.requestId) block
// We can just use the whole function body up to `const tokenNumber = nextTokenNumber();`
content = content.replace(/const recordIssuedToken = \(payload = \{\}\) => \{[\s\S]*?const tokenNumber = nextTokenNumber\(\);/m, replacement + "\n\n  const tokenNumber = nextTokenNumber();");
fs.writeFileSync(file, content);
console.log("Patched combined logic");
