const fs = require('fs');
const file = 'backend/m2/consent/M2ConsentManager.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `
  async submitConsentDecision(consentId, decision, metadata = {}) {
    Logger.info("M2ConsentManager", "submitConsentDecision called locally. Ignoring auto-approval to wait for real ABDM Gateway callback.", { consentId, decision });
    const tx = M2TransactionStore.getTransaction(consentId);
    if (!tx || !tx.consentDetails) {
      throw new Error(\`Consent record with ID \${consentId} not found.\`);
    }
    return tx.consentDetails;
  }
`;

code = code.replace(/async submitConsentDecision\(consentId, decision, metadata = \{\}\) \{[\s\S]*?source: "M2ConsentController"\n    \}\);\n  \}/m, replacement);
fs.writeFileSync(file, code);
