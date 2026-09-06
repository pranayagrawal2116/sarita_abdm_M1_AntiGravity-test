const fs = require('fs');
let file = 'backend/m2/transactions/M2TransactionStore.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /_findCanonicalId\(id, allTransactions\) \{[\s\S]*?return normalizedId;\s*\}/m;

const replacement = `_findCanonicalId(id, allTransactions) {
    const normalizedId = toText(id);
    if (!normalizedId) return "";

    // PROMPT #6: Prevent identifier collision by checking most specific authoritative fields first.
    // UUIDs and primary IDs should take precedence over secondary references.

    const checkFields = (fields) => {
      for (const key of Object.keys(allTransactions)) {
        if (key === normalizedId) return key;
        const tx = allTransactions[key];
        for (const field of fields) {
          if (toText(tx[field]) === normalizedId) {
            return key;
          }
        }
      }
      return null;
    };

    // Tier 1: Primary unique identifiers (UUIDs)
    let match = checkFields(["transactionId", "requestId", "gatewayRequestId", "consentId", "consentRequestId"]);
    if (match) return match;

    // Tier 2: Secondary identifiers (Transfer/Session)
    match = checkFields(["hiRequestId", "healthInformationRequestId", "consentArtifactId", "sessionId", "correlationId"]);
    if (match) return match;

    // Tier 3: External references (Less specific, higher collision risk if prioritized)
    match = checkFields(["linkToken", "subscriptionId", "careContextReference"]);
    if (match) return match;

    return normalizedId;
  }`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('Patched M2TransactionStore _findCanonicalId');
