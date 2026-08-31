const fs = require('fs');
const path = require('path');
const config = require('../../m2/helpers/config');

class PatientStorageService {
  constructor() {
    // Root directory for patient data storage
    // Use config.runtimeDataDir (which defaults to backend/data)
    this.dataRoot = config.tokenStoreDir 
      ? path.dirname(config.tokenStoreDir) 
      : path.join(__dirname, '../../data');
      
    if (!fs.existsSync(this.dataRoot)) {
      fs.mkdirSync(this.dataRoot, { recursive: true });
    }
  }

  /**
   * Sanitizes a string to be used safely as a folder or file name.
   */
  _sanitizePathSegment(value) {
    if (!value) return "unknown";
    // Remove unsafe characters, replace spaces with underscores
    let normalized = String(value).trim().replace(/\s+/g, '_');
    normalized = normalized.replace(/[^a-zA-Z0-9_\-@\.]/g, '');
    return normalized || "unknown";
  }

  /**
   * Resolves the patient folder name logically identical to macOS.
   * e.g., pranay.12@sbx_Pranay_Anup_Agrawal
   */
  _getPatientFolderName(abhaId, patientName) {
    const sanitizedAbha = this._sanitizePathSegment(abhaId);
    if (!patientName) return sanitizedAbha; // Fallback if name is missing
    
    const sanitizedName = this._sanitizePathSegment(patientName);
    return `${sanitizedAbha}_${sanitizedName}`;
  }

  /**
   * Returns the absolute path to the patient's directory.
   * Creates the directory if it does not exist.
   */
  getPatientDirectory(abhaId, patientName) {
    const folderName = this._getPatientFolderName(abhaId, patientName);
    const dirPath = path.join(this.dataRoot, folderName);
    
    // Prevent path traversal outside dataRoot
    const resolvedPath = path.resolve(dirPath);
    if (!resolvedPath.startsWith(path.resolve(this.dataRoot))) {
      throw new Error("Invalid path traversal detected");
    }

    if (!fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    
    return resolvedPath;
  }

  /**
   * Saves a file in the patient's directory.
   */
  savePatientFile(abhaId, patientName, fileName, content, isLocalDraft = false) {
    const dirPath = this.getPatientDirectory(abhaId, patientName);
    const safeFileName = this._sanitizePathSegment(fileName);
    
    const filePath = path.join(dirPath, safeFileName);
    
    // Optional: add concurrency lock or atomic write if necessary
    fs.writeFileSync(filePath, content, 'utf8');

    // Phase 2: Local HI Document Registry
    if (isLocalDraft) {
      const localDataPath = path.join(dirPath, 'local data');
      let existingFiles = [];
      if (fs.existsSync(localDataPath)) {
        try {
          const fileContent = fs.readFileSync(localDataPath, 'utf8');
          existingFiles = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        } catch (e) {
          console.error("Error reading local data file:", e);
        }
      }

      if (!existingFiles.includes(safeFileName)) {
        existingFiles.push(safeFileName);
        try {
          fs.writeFileSync(localDataPath, existingFiles.join('\n') + '\n', 'utf8');
        } catch (e) {
          console.error("Error writing to local data file:", e);
        }
      }
    }

    return filePath;
  }

  /**
   * Reads a file from the patient's directory.
   */
  readPatientFile(abhaId, patientName, fileName) {
    const dirPath = this.getPatientDirectory(abhaId, patientName);
    const safeFileName = this._sanitizePathSegment(fileName);
    
    const filePath = path.join(dirPath, safeFileName);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf8');
  }
}

module.exports = new PatientStorageService();
