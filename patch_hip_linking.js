const fs = require('fs');

let file = 'backend/controllers/hipLinkingController.js';
let content = fs.readFileSync(file, 'utf8');

// Replace normalizeCareContextReferenceForLinking
const normCareCtxReg = /const normalizeCareContextReferenceForLinking = \([^)]+\) => \{[^}]+\};/g;
const newNormCareCtx = `const normalizeCareContextReferenceForLinking = (value) => {
  const text = toText(value);
  if (!text) return require("uuid").v4(); // Only if completely empty
  return text;
};`;
content = content.replace(normCareCtxReg, newNormCareCtx);

// Replace normalizePatientEntriesForLinking
const normPatEntReg = /const normalizePatientEntriesForLinking = \([^)]*\) =>[\s\S]*?(?=\nconst buildLinkCareContextPayload)/;

const newNormPatEnt = `const normalizePatientEntriesForLinking = (patient = [], abhaAddress = "") =>
  patient.map((entry) => {
    if (!entry || typeof entry !== "object") {
      return entry;
    }

    const fallbackName =
      toText(entry.display) ||
      toText(entry.name) ||
      abhaAddress;

    return {
      ...entry,
      referenceNumber: normalizePatientReferenceForLinking(
        entry.referenceNumber,
        fallbackName
      ),
      careContexts: Array.isArray(entry.careContexts)
        ? entry.careContexts.map((careContext) => {
            if (!careContext || typeof careContext !== "object") {
              return careContext;
            }
            // PROMPT #9: Do not invent UUIDs or append HI types. Preserve the exact reference.
            const baseReference = normalizeCareContextReferenceForLinking(careContext.referenceNumber);
            return {
              ...careContext,
              referenceNumber: baseReference
            };
          })
        : entry.careContexts,
    };
  });
`;

content = content.replace(normPatEntReg, newNormPatEnt);

fs.writeFileSync(file, content, 'utf8');
console.log('Patched care context reference logic');
