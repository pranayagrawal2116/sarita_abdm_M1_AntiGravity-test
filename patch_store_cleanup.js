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

  const fingerprint = patientFingerprint(payload);`;

// Let's replace whatever is at the start of recordIssuedToken
content = content.replace(/const recordIssuedToken = \(payload = \{\}\) => \{[\s\S]*?const fingerprint = patientFingerprint\(payload\);/m, replacement);
fs.writeFileSync(file, content);
console.log("Patched cleanup logic");
