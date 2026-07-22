const fs = require("fs");
const path = require("path");
const M2FHIRBuilder = require("../m2/fhir/M2FHIRBuilder");
const { buildBundleFromFiles, normalizeHiType } = require("../m2/fhir/M2FHIRBundleBuilder");
const { validateBundle: validatePrescriptionBundle } = require("../m2/fhir/prescriptionRecordGenerator");

const root = path.resolve(__dirname, "../..");

const guessHiType = (fileName) => {
  const normalized = fileName.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("diagnosticreport")) return "DiagnosticReport";
  if (normalized.includes("prescription")) return "Prescription";
  if (normalized.includes("opconsultation")) return "OPConsultation";
  if (normalized.includes("dischargesummary")) return "DischargeSummary";
  if (normalized.includes("immunizationrecord")) return "ImmunizationRecord";
  if (normalized.includes("healthdocumentrecord")) return "HealthDocumentRecord";
  if (normalized.includes("wellnessrecord")) return "WellnessRecord";
  if (normalized.includes("invoice")) return "Invoice";
  return "HealthDocumentRecord";
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const failures = [];
let checked = 0;
const checkedTypes = new Set();

async function run() {
  for (const folderName of fs.readdirSync(root)) {
  const folderPath = path.join(root, folderName);
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory() || !/@sbx_/.test(folderName)) {
    continue;
  }

  const abhaId = folderName.match(/^(.+?@sbx)/)?.[1] || folderName;
  for (const fileName of fs.readdirSync(folderPath)) {
    if (!fileName.endsWith(".txt") || fileName === "hip_link_token.txt") continue;

    const filePath = path.join(folderPath, fileName);
    const hiType = guessHiType(fileName);
    try {
      const bundle = await buildBundleFromFiles({
        abhaId,
        folderName,
        files: [
          {
            fileName,
            filePath,
            hiType,
            content: fs.readFileSync(filePath, "utf8")
          }
        ]
      });

      assert(bundle.resourceType === "Bundle", "resourceType must be Bundle");
      assert(bundle.type === "document", "bundle type must be document");
      assert(bundle.entry?.[0]?.resource?.resourceType === "Composition", "first entry must be Composition");

      if (normalizeHiType(hiType) === "Prescription") {
        validatePrescriptionBundle(bundle);
      } else {
        const validation = M2FHIRBuilder.validateBundle(bundle);
        assert(validation.isValid, validation.errors.join("; "));
      }

      checked += 1;
      checkedTypes.add(normalizeHiType(hiType));
    } catch (err) {
      failures.push({
        file: path.relative(root, filePath),
        hiType,
        error: err.message
      });
    }
  }
}

if (failures.length > 0) {
  console.error(JSON.stringify({ checked, failures }, null, 2));
  process.exit(1);  }
  
  console.log(JSON.stringify({
    status: "ok",
    checked: checked,
    checkedTypes: Array.from(checkedTypes).sort()
  }, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
