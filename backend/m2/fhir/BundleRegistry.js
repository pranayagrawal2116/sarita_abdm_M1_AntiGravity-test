const fs = require("fs");
const path = require("path");
const Logger = require("../logging/logger");
const config = require("../helpers/config");

const REGISTRY_FILE = path.join(__dirname, "../../data/bundle_registry.json");

// We need to check both backend/data and data/ depending on the deployment structure
const getPossibleDataDirs = () => {
  const root = path.resolve(__dirname, "../../../");
  const runtimeDataDir = config.tokenStoreDir
    ? path.dirname(config.tokenStoreDir)
    : path.join(__dirname, "../../data");
  return [...new Set([
    runtimeDataDir,
    path.join(__dirname, "../../data"),
    path.join(__dirname, "../../../data"),
    path.join(root, "data"),
    path.join(root, "backend", "data"),
    // The desktop app stores patient folders directly beside backend/. This
    // location must be included for automated HIP transfers as well as the
    // folder watcher.
    root,
  ])];
};

const text = (value) => String(value || "").trim();
const normalize = (value) => text(value).toLowerCase();

const extractAbhaNumber = (value) => {
  const match = text(value).match(/\b\d{2}-\d{4}-\d{4}-\d{4}\b/);
  return match ? match[0] : "";
};

const guessHiType = (fileName) => {
  const normalized = text(fileName).toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("diagnosticreport")) return "DiagnosticReport";
  if (normalized.includes("prescription")) return "Prescription";
  if (normalized.includes("opconsultation") || normalized.includes("clinicalconsultation")) return "OPConsultation";
  if (normalized.includes("dischargesummary") || normalized.includes("ipddischargesummary")) return "DischargeSummary";
  if (normalized.includes("immunizationrecord")) return "ImmunizationRecord";
  if (normalized.includes("healthdocumentrecord") || normalized.includes("healthdocument")) return "HealthDocumentRecord";
  if (normalized.includes("wellnessrecord")) return "WellnessRecord";
  if (normalized.includes("invoice")) return "Invoice";
  return "DocumentReference";
};

const canonicalHiType = (value) => {
  const normalized = text(value).toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "ipddischargesummary" || normalized === "dischargesummary" || normalized === "discharge") return "dischargesummary";
  if (normalized === "healthdocument" || normalized === "healthdocumentrecord") return "healthdocumentrecord";
  return normalized;
};

const sameHiType = (t1, t2) => {
  if (!t1 || !t2) return false;
  return canonicalHiType(t1) === canonicalHiType(t2);
};

class BundleRegistry {
  constructor() {
    this.registry = [];
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(REGISTRY_FILE)) {
        this.registry = [];
        return;
      }
      const parsed = JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf8"));
      this.registry = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      Logger.error("BundleRegistry", "Failed to read bundle registry.", error);
      this.registry = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(REGISTRY_FILE, JSON.stringify(this.registry, null, 2));
    } catch (error) {
      Logger.error("BundleRegistry", "Failed to save bundle registry.", error);
    }
  }

  addBundle(bundleData = {}) {
    const existingIndex = this.registry.findIndex(
      (bundle) => bundle.sourceTxtFile === bundleData.sourceTxtFile
    );
    const entry = {
      ...bundleData,
      createdAt: bundleData.createdAt || new Date().toISOString(),
      updatedAt: bundleData.updatedAt || new Date().toISOString()
    };
    if (existingIndex >= 0) {
      this.registry[existingIndex] = { ...this.registry[existingIndex], ...entry };
    } else {
      this.registry.push(entry);
    }
    this.save();
  }

  removeBundleByTxt(sourceTxtFile) {
    const next = this.registry.filter((bundle) => bundle.sourceTxtFile !== sourceTxtFile);
    if (next.length !== this.registry.length) {
      this.registry = next;
      this.save();
    }
  }

  /**
   * Dynamically scans the data folders for bundle.json files to prevent PM2 cluster cache issues.
   */
  _scanForBundles() {
    const bundles = [];
    const dirs = getPossibleDataDirs();
    const checkedFolders = new Set();

    for (const dataDir of dirs) {
      if (!fs.existsSync(dataDir)) continue;

      try {
        const directFolders = fs.readdirSync(dataDir, { withFileTypes: true });
        const patientFolders = [];
        for (const entry of directFolders) {
          if (!entry.isDirectory()) continue;
          const folderPath = path.join(dataDir, entry.name);
          if (entry.name === "ABHA_Verified" || entry.name === "Non_ABHA_Verified") {
            try {
              fs.readdirSync(folderPath, { withFileTypes: true })
                .filter((child) => child.isDirectory())
                .forEach((child) => patientFolders.push(path.join(folderPath, child.name)));
            } catch (_) {
              // A partially-created storage root simply has no bundles yet.
            }
          } else {
            patientFolders.push(folderPath);
          }
        }
        for (const folderPath of patientFolders) {
          if (checkedFolders.has(folderPath)) continue;
          checkedFolders.add(folderPath);

          if (!fs.statSync(folderPath).isDirectory()) continue;

          // Parse abhaId from folder (e.g. pranay@sbx_Pranay_Anup_Agrawal)
          const folderName = path.basename(folderPath);
          const abhaMatch = folderName.match(/^(.+?@sbx)/);
          const patientId = abhaMatch ? abhaMatch[1] : folderName;

          try {
            const files = fs.readdirSync(folderPath);
            const bundleFiles = files.filter(f => f.endsWith("_bundle.json"));

            for (const bFile of bundleFiles) {
              const bPath = path.join(folderPath, bFile);
              try {
                const content = JSON.parse(fs.readFileSync(bPath, "utf8"));
                let hiType = guessHiType(bFile);

                // File names preserve ABDM's M2 HI type (for example,
                // OPConsultation). FHIR composition displays use different
                // labels such as "Clinical consultation report", so only use
                // them if the file name is not a known record type.
                if (hiType === "DocumentReference" && content.entry) {
                  const comp = content.entry.find(e => e.resource && e.resource.resourceType === "Composition");
                  if (comp && comp.resource.type && comp.resource.type.coding && comp.resource.type.coding.length > 0) {
                    const display = comp.resource.type.coding[0].display;
                    hiType = display ? display.replace(/\s+/g, "") : "DocumentReference";
                  }
                }

                bundles.push({
                  patientId,
                  abhaNumber: extractAbhaNumber(bFile),
                  hiType: hiType,
                  bundleFileName: bFile,
                  bundlePath: bPath,
                  sourceTxtFile: bPath.replace("_bundle.json", ".txt"),
                  updatedAt: fs.statSync(bPath).mtime.toISOString()
                });
              } catch (e) {
                // Ignore parse errors on individual files
              }
            }
          } catch (e) {
            // Ignore errors reading individual folder
          }
        }
      } catch (e) {
        // Ignore errors reading data dir
      }
    }
    return bundles;
  }

  /**
   * Get all bundles for a specific patient.
   * @param {string} patientId - ABHA address
   * @returns {Array} List of bundles
   */
  getBundlesForPatient(patientId, options = {}) {
    // Reload persisted entries in every IIS worker, then merge them with a
    // live scan so desktop-written folders and web-written folders both work.
    this.init();
    const scannedBundles = this._scanForBundles();
    const persistedBundles = this.registry.filter(
      (bundle) => bundle?.bundlePath && fs.existsSync(bundle.bundlePath)
    );
    const bundlesByPath = new Map();
    [...persistedBundles, ...scannedBundles].forEach((bundle) => {
      bundlesByPath.set(path.resolve(bundle.bundlePath), bundle);
    });
    const bundles = [...bundlesByPath.values()];
    Logger.info("BundleRegistry", "Scanned filesystem for bundles.", { count: bundles.length });

    const patientKey = normalize(patientId);
    const abhaNumber = text(options.abhaNumber) || extractAbhaNumber(patientId);
    const hiType = text(options.hiType);
    const aliases = Array.isArray(options.aliases) ? options.aliases.map(normalize).filter(Boolean) : [];

    const eligible = bundles.filter((bundle) => !hiType || sameHiType(bundle.hiType, hiType));
    const exactMatches = eligible.filter((bundle) => {
      const exactPatientMatch = patientKey && normalize(bundle.patientId) === patientKey;
      const aliasMatch = aliases.includes(normalize(bundle.patientId));
      return exactPatientMatch || aliasMatch;
    });

    if (exactMatches.length > 0) return exactMatches;

    const abhaMatches = eligible.filter((bundle) => abhaNumber && bundle.abhaNumber === abhaNumber);
    if (abhaMatches.length > 0) return abhaMatches;

    Logger.info("BundleRegistry", "No exact patient bundles found.", { patientId });
    return [];
  }

  /**
   * The folder watcher only needs to remove bundles it created in this
   * process. Do not perform a live filesystem scan here: during startup that
   * scan is repeated once per watched patient folder and can starve ABDM
   * callback handling.
   */
  getKnownBundlesForPatient(patientId) {
    const patientKey = normalize(patientId);
    if (!patientKey) return [];
    return this.registry.filter(
      (bundle) => normalize(bundle?.patientId) === patientKey,
    );
  }

  getBundleByHiType(patientId, hiType, options = {}) {
    return this.getBundlesForPatient(patientId, { ...options, hiType })[0];
  }
}

module.exports = new BundleRegistry();
