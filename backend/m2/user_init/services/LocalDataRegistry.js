const fs = require('fs');
const path = require('path');
const config = require('../../../m2/helpers/config');

class LocalDataRegistry {
  constructor() {
    this.dataRoot = config.tokenStoreDir 
      ? path.dirname(config.tokenStoreDir) 
      : path.join(__dirname, '../../../data');
  }

  _sanitizePathSegment(value) {
    if (!value) return "unknown";
    let normalized = String(value).trim().replace(/\s+/g, '_');
    normalized = normalized.replace(/[^a-zA-Z0-9_\-@\.]/g, '');
    return normalized || "unknown";
  }

  /**
   * Reads all registered HI documents for a given abhaId across all possible patient folders.
   * Or if patient folder convention is known, scans the specific folder.
   * Since we don't always know patientName exactly during discovery, we can search folders matching abhaId.
   */
  getAvailableDocumentsForAbha(abhaId) {
    const sanitizedAbha = this._sanitizePathSegment(abhaId);
    let documents = [];

    if (!fs.existsSync(this.dataRoot)) {
      return documents;
    }

    const folders = fs.readdirSync(this.dataRoot, { withFileTypes: true });
    
    for (const folder of folders) {
      if (folder.isDirectory() && folder.name.startsWith(sanitizedAbha + '_')) {
        const localDataPath = path.join(this.dataRoot, folder.name, 'local data');
        if (fs.existsSync(localDataPath)) {
          try {
            const content = fs.readFileSync(localDataPath, 'utf8');
            const files = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            
            for (const file of files) {
              const fullPath = path.join(this.dataRoot, folder.name, file);
              if (fs.existsSync(fullPath)) {
                let hiType = "DocumentReference";
                const lowerFile = file.toLowerCase().replace(/[^a-z]/g, "");
                if (lowerFile.includes("diagnosticreport")) hiType = "DiagnosticReport";
                else if (lowerFile.includes("prescription")) hiType = "Prescription";
                else if (lowerFile.includes("opconsultation")) hiType = "OPConsultation";
                else if (lowerFile.includes("dischargesummary")) hiType = "DischargeSummary";
                else if (lowerFile.includes("immunizationrecord")) hiType = "ImmunizationRecord";
                else if (lowerFile.includes("healthdocumentrecord")) hiType = "HealthDocumentRecord";
                else if (lowerFile.includes("wellnessrecord")) hiType = "WellnessRecord";
                else if (lowerFile.includes("invoice")) hiType = "Invoice";
                
                documents.push({
                  documentFileName: file,
                  documentPath: fullPath,
                  documentType: hiType,
                  userId: abhaId
                });
              }
            }
          } catch (e) {
            console.error("Error reading local data for", folder.name, e);
          }
        }
      }
    }
    
    return documents;
  }
}

module.exports = new LocalDataRegistry();
