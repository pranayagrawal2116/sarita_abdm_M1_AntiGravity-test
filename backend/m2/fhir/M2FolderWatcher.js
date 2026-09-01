const chokidar = require("chokidar");
const path = require("path");
const fs = require("fs");
const { buildBundleFromFiles } = require("./M2FHIRBundleBuilder");
const BundleRegistry = require("./BundleRegistry");

const log = (event, details = {}) => {
  console.log(JSON.stringify({ scope: "M2FolderWatcher", event, ...details }));
};

const PROJECT_ROOT = path.resolve(__dirname, "../../../");

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

// Simple debounce to prevent generating multiple times if many files change at once
const debounceTimers = new Map();

const startWatcher = () => {
  log("Starting M2 Folder Watcher for FHIR Bundle Generation", { projectRoot: PROJECT_ROOT });

  // Watch for .txt files in directories matching the abhaId pattern
  // Match PatientStorageService.js dataRoot resolution
  const watchPatterns = [
    path.join(__dirname, "../../../data", "*@sbx_*", "*.txt"),      // If inside backend/m2/fhir
    path.join(__dirname, "../../data", "*@sbx_*", "*.txt"),         // If flattened to m2/fhir
    path.join(PROJECT_ROOT, "*@sbx_*", "*.txt")                     // Desktop root fallback
  ];
  
  const watcher = chokidar.watch(watchPatterns, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: false, 
  });

  const processFolder = async (folderPath) => {
    try {
      const folderName = path.basename(folderPath);
      // AbhaId is typically the part before the first underscore in the folder name, or up to the @sbx
      // e.g., pranay2006_0121@sbx_Pranay_Anup_Agrawal -> pranay2006_0121@sbx
      const abhaIdMatch = folderName.match(/^(.+?@sbx)/);
      const abhaId = abhaIdMatch ? abhaIdMatch[1] : folderName;

      log("Processing folder for FHIR Bundle generation", { folderName, abhaId });

      const txtFiles = fs.readdirSync(folderPath).filter((f) => f.endsWith(".txt") && f !== "hip_link_token.txt");
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

      // Find any bundles in the registry for this patient that no longer have a corresponding TXT file
      const existingBundles = BundleRegistry.getBundlesForPatient(abhaId);
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
        processFolder(folderPath);
      }, 1000)
    );
  };

  watcher
    .on("add", scheduleProcess)
    .on("change", scheduleProcess)
    .on("unlink", scheduleProcess);
    
  return watcher;
};

module.exports = { startWatcher };
