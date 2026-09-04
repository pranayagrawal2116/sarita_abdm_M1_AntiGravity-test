const chokidar = require("chokidar");
const path = require("path");
const fs = require("fs");
const { buildBundleFromFiles } = require("./M2FHIRBundleBuilder");
const BundleRegistry = require("./BundleRegistry");
const config = require("../helpers/config");
const { dataRoot, backendRoot } = require("../../config/environment");

const log = (event, details = {}) => {
  console.log(JSON.stringify({ scope: "M2FolderWatcher", event, ...details }));
};

const RUNTIME_DATA_ROOT = dataRoot;

const guessHiType = (fileName) => {
  const normalized = fileName.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.includes("diagnosticreport")) return "DiagnosticReport";
  if (normalized.includes("prescription")) return "Prescription";
  if (normalized.includes("opconsultation")) return "OPConsultation";
  if (normalized.includes("dischargesummary") || normalized.includes("ipddischargesummary")) return "DischargeSummary";
  if (normalized.includes("immunizationrecord")) return "ImmunizationRecord";
  if (normalized.includes("healthdocumentrecord") || normalized.includes("healthdocument")) return "HealthDocumentRecord";
  if (normalized.includes("wellnessrecord")) return "WellnessRecord";
  if (normalized.includes("invoice")) return "Invoice";
  return "DocumentReference";
};

const extractAbhaNumber = (value) => {
  const match = String(value || "").match(/\b\d{2}-\d{4}-\d{4}-\d{4}\b/);
  return match ? match[0] : "";
};

const isHealthRecordFile = (fileName) => {
  if (!/\.txt$/i.test(fileName)) return false;
  const normalized = String(fileName).toLowerCase().replace(/[^a-z]/g, '');
  return !(
    normalized === 'localdata' ||
    normalized === 'localdraftsindex' ||
    normalized === 'linkedrecords' ||
    normalized === 'sentrecords' ||
    normalized === 'hiplinktoken'
  );
};

// Simple debounce to prevent generating multiple times if many files change at once
const debounceTimers = new Map();
const pendingFolders = new Set();
let queueIsRunning = false;

const startWatcher = () => {
  log("Starting M2 Folder Watcher for FHIR Bundle Generation", { dataRoot: RUNTIME_DATA_ROOT });

  // Watch both patient storage roots and canonical data directory
  const watchPatterns = [
    path.join(RUNTIME_DATA_ROOT, "ABHA_Verified", "*", "*.txt"),
    path.join(RUNTIME_DATA_ROOT, "Non_ABHA_Verified", "*", "*.txt"),
    path.join(RUNTIME_DATA_ROOT, "*@sbx_*", "*.txt"),
  ];
  
  const watcher = chokidar.watch(watchPatterns, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    // Existing bundles are read by BundleRegistry. Rebuilding every historic
    // text file after a restart creates CPU and disk pressure that is not part
    // of a live User-Initiated request. Only react to new/changed records.
    ignoreInitial: true,
  });

  const processFolder = async (folderPath) => {
    try {
      const folderName = path.basename(folderPath);
      // AbhaId is typically the part before the first underscore in the folder name, or up to the @sbx
      // e.g., pranay2006_0121@sbx_Pranay_Anup_Agrawal -> pranay2006_0121@sbx
      const abhaIdMatch = folderName.match(/^(.+?@sbx)/);
      const abhaId = abhaIdMatch ? abhaIdMatch[1] : folderName;

      log("Processing folder for FHIR Bundle generation", { folderName, abhaId });

      const txtFiles = fs.readdirSync(folderPath).filter(isHealthRecordFile);
      const currentTxtFilePaths = new Set(txtFiles.map(f => path.join(folderPath, f)));
      
      const fileData = txtFiles.map((fileName) => {
        const filePath = path.join(folderPath, fileName);
        const content = fs.readFileSync(filePath, "utf8");
        const stats = fs.statSync(filePath);
        
        return {
          fileName,
          filePath,
          content,
          hiType: guessHiType(fileName),
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
        };
      });

      // This is cleanup for watcher-managed files only. A full filesystem
      // scan here is expensive and used to run once for every initial folder,
      // delaying User-Initiated callbacks. Runtime bundle lookup still uses
      // BundleRegistry.getBundlesForPatient() where a cross-worker scan is
      // actually needed.
      const existingBundles = BundleRegistry.getKnownBundlesForPatient(abhaId);
      existingBundles.forEach((bundle) => {
        if (!currentTxtFilePaths.has(bundle.sourceTxtFile)) {
          // The TXT file was deleted, remove the bundle
          if (fs.existsSync(bundle.bundlePath)) {
            fs.unlinkSync(bundle.bundlePath);
            log("Deleted orphaned FHIR bundle", { bundlePath: bundle.bundlePath });
          }
          BundleRegistry.removeBundleByTxt(bundle.sourceTxtFile);
        }
      });

      if (fileData.length === 0) {
        log("No valid .txt files found in folder to build bundle", { folderName });
        return;
      }

      for (const file of fileData) {
        const baseName = path.basename(file.fileName, ".txt");
        const bundleFileName = `${baseName}_bundle.json`;
        const bundlePath = path.join(folderPath, bundleFileName);
        
        let needsUpdate = true;
        if (fs.existsSync(bundlePath)) {
            const bundleStats = fs.statSync(bundlePath);
            const txtStats = fs.statSync(file.filePath);
            if (bundleStats.mtime >= txtStats.mtime) {
                needsUpdate = false;
            }
        }
        
        if (needsUpdate) {
            const bundle = await buildBundleFromFiles({ abhaId, folderName, files: [file] });
            fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
        } else {
            // Log skipped to prevent spam but maintain logic
        }
        
        BundleRegistry.addBundle({
          patientId: abhaId,
          abhaNumber: extractAbhaNumber(file.fileName) || extractAbhaNumber(file.filePath),
          hiType: file.hiType,
          bundleFileName,
          bundlePath,
          sourceTxtFile: file.filePath,
          status: "READY",
          createdAt: file.createdAt,
          updatedAt: file.updatedAt
        });
        
        log("Successfully generated and saved FHIR bundle", { bundlePath, hiType: file.hiType });
      }

    } catch (error) {
      log("Failed to process folder for FHIR bundle", { folderPath, error: error.message });
    }
  };

  const scheduleProcess = (filePath) => {
    const folderPath = path.dirname(filePath);
    if (debounceTimers.has(folderPath)) {
      clearTimeout(debounceTimers.get(folderPath));
    }
    debounceTimers.set(
      folderPath,
      setTimeout(() => {
        debounceTimers.delete(folderPath);
        pendingFolders.add(folderPath);
        void processNextFolder();
      }, 1000)
    );
  };

  // The initial watcher scan can find hundreds of existing files. Processing
  // every folder at once blocks the Node event loop long enough for ABDM
  // callbacks to time out. Keep the same bundle generation work, but run it
  // one folder at a time and yield between folders so live callbacks win.
  const processNextFolder = async () => {
    if (queueIsRunning) return;
    queueIsRunning = true;
    try {
      while (pendingFolders.size > 0) {
        const [folderPath] = pendingFolders;
        pendingFolders.delete(folderPath);
        await processFolder(folderPath);
        await new Promise((resolve) => setImmediate(resolve));
      }
    } finally {
      queueIsRunning = false;
      if (pendingFolders.size > 0) void processNextFolder();
    }
  };

  watcher
    .on("add", scheduleProcess)
    .on("change", scheduleProcess)
    .on("unlink", scheduleProcess);
    
  return watcher;
};

module.exports = { startWatcher };
