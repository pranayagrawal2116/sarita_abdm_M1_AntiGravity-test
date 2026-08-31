const fs = require('fs');
const path = require('path');
const config = require('../../../m2/helpers/config');

class LocalDataRegistry {
  constructor() {
    this.dataRoot = config.tokenStoreDir 
      ? path.dirname(config.tokenStoreDir) 
      : path.join(__dirname, '../../../data');
    this.documentCache = new Map();
  }

  _sanitizePathSegment(value) {
    if (!value) return "unknown";
    let normalized = String(value).trim().replace(/\s+/g, '_');
    normalized = normalized.replace(/[^a-zA-Z0-9_\-@\.]/g, '');
    return normalized || "unknown";
  }

  _documentType(fileName) {
    const lowerFile = String(fileName || '').toLowerCase().replace(/[^a-z]/g, '');
    if (lowerFile.includes("diagnosticreport")) return "DiagnosticReport";
    if (lowerFile.includes("prescription")) return "Prescription";
    if (lowerFile.includes("opconsultation")) return "OPConsultation";
    if (lowerFile.includes("dischargesummary")) return "DischargeSummary";
    if (lowerFile.includes("immunizationrecord")) return "ImmunizationRecord";
    if (lowerFile.includes("healthdocumentrecord")) return "HealthDocumentRecord";
    if (lowerFile.includes("wellnessrecord")) return "WellnessRecord";
    if (lowerFile.includes("invoice")) return "Invoice";
    return "DocumentReference";
  }

  async _readPatientFolder(folderName, abhaId) {
    const localDataPath = path.join(this.dataRoot, folderName, 'local data');
    try {
      const [stat, content] = await Promise.all([
        fs.promises.stat(localDataPath),
        fs.promises.readFile(localDataPath, 'utf8')
      ]);
      const files = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const documents = (await Promise.all(files.map(async (file) => {
        const documentPath = path.join(this.dataRoot, folderName, file);
        try {
          await fs.promises.access(documentPath, fs.constants.R_OK);
          return {
            documentFileName: file,
            documentPath,
            documentType: this._documentType(file),
            userId: abhaId
          };
        } catch (_) {
          return null;
        }
      }))).filter(Boolean);
      return { signature: `${folderName}:${stat.mtimeMs}:${stat.size}`, documents };
    } catch (error) {
      console.error("Error reading local data for", folderName, error.message);
      return { signature: `${folderName}:unavailable`, documents: [] };
    }
  }

  async _folderIndexSignature(folderName) {
    try {
      const stat = await fs.promises.stat(path.join(this.dataRoot, folderName, 'local data'));
      return `${folderName}:${stat.mtimeMs}:${stat.size}`;
    } catch (_) {
      return `${folderName}:unavailable`;
    }
  }

  /**
   * Loads document indexes asynchronously and reuses parsed documents when
   * their source index files have not changed.
   */
  async getAvailableDocumentsForAbha(abhaId) {
    const sanitizedAbha = this._sanitizePathSegment(abhaId);
    try {
      const folders = await fs.promises.readdir(this.dataRoot, { withFileTypes: true });
      const patientFolders = folders
        .filter((folder) => folder.isDirectory() && folder.name.startsWith(`${sanitizedAbha}_`))
        .map((folder) => folder.name);
      const signature = (await Promise.all(patientFolders.map((folder) =>
        this._folderIndexSignature(folder)
      ))).sort().join('|');
      const cached = this.documentCache.get(sanitizedAbha);
      if (cached && cached.signature === signature) {
        return cached.documents.map((document) => ({ ...document }));
      }

      const folderResults = await Promise.all(patientFolders.map((folder) =>
        this._readPatientFolder(folder, abhaId)
      ));
      const documents = folderResults.flatMap((result) => result.documents);
      this.documentCache.set(sanitizedAbha, { signature, documents });
      return documents.map((document) => ({ ...document }));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error("Error locating local data for", sanitizedAbha, error.message);
      }
      return [];
    }
  }
}

module.exports = new LocalDataRegistry();
