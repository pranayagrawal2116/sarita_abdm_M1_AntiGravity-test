const fs = require('fs');
const path = require('path');
const config = require('../helpers/config');
const Logger = require('../logging/logger');

class M3PatientStorageService {
  constructor() {
    if (process.env.DATA_ROOT) {
      this.rootDir = path.resolve(process.env.DATA_ROOT);
    } else {
      // Default to the backend folder
      this.rootDir = path.resolve(__dirname, "../../");
    }
    
    if (!fs.existsSync(this.rootDir)) {
      try {
         fs.mkdirSync(this.rootDir, { recursive: true });
      } catch (e) {
         Logger.error("M3PatientStorageService", "Failed to create root directory", { error: e.message });
      }
    }
  }

  _sanitizeName(name) {
    if (!name) return "Unknown";
    return name.replace(/[^a-zA-Z0-9_\-\.@]/g, '_');
  }

  resolvePatientFolder(patientId) {
    if (!patientId) throw new Error("patientId is required");
    const safePatientId = this._sanitizeName(patientId);
    const dataDir = path.join(this.rootDir, "data");
    
    // Find an existing folder that starts with the patientId (e.g., saurav_50505@sbx_Saurav_Kumar)
    if (fs.existsSync(dataDir)) {
      const items = fs.readdirSync(dataDir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && item.name.startsWith(safePatientId)) {
           return path.join(dataDir, item.name);
        }
      }
    }
    
    return path.join(dataDir, safePatientId);
  }

  resolveConsentFolder(patientId, consentId) {
    if (!consentId) throw new Error("consentId is required");
    const patientDir = this.resolvePatientFolder(patientId);
    const safeConsentId = this._sanitizeName(consentId);
    return path.join(patientDir, safeConsentId);
  }

  resolveHospitalFolder(patientId, consentId, hospitalName) {
    const consentDir = this.resolveConsentFolder(patientId, consentId);
    const safeHospitalName = this._sanitizeName(hospitalName || "UnknownHIP");
    return path.join(consentDir, safeHospitalName);
  }

  saveM3File(patientId, consentId, hospitalName, fileName, dataStr) {
    const hospitalDir = this.resolveHospitalFolder(patientId, consentId, hospitalName);
    if (!fs.existsSync(hospitalDir)) {
      fs.mkdirSync(hospitalDir, { recursive: true });
    }
    
    let safeFileName = this._sanitizeName(fileName);
    if (fileName.endsWith('.json')) {
       safeFileName = safeFileName.replace(/_json$/, '.json');
    }
    
    const filePath = path.join(hospitalDir, safeFileName);
    fs.writeFileSync(filePath, dataStr, "utf-8");
    return filePath;
  }

  getConsentHospitalFoldersForPatient(patientId) {
    const patientDir = this.resolvePatientFolder(patientId);
    if (!fs.existsSync(patientDir)) return [];
    
    let folders = [];
    const consents = fs.readdirSync(patientDir, { withFileTypes: true });
    for (const consent of consents) {
      if (consent.isDirectory()) {
         const consentDir = path.join(patientDir, consent.name);
         const hospitals = fs.readdirSync(consentDir, { withFileTypes: true });
         for (const hospital of hospitals) {
            if (hospital.isDirectory()) {
               folders.push(path.join(consentDir, hospital.name));
            }
         }
      }
    }
    return folders;
  }

  getAllHealthDataFiles(patientId) {
    const patientDir = this.resolvePatientFolder(patientId);
    if (!fs.existsSync(patientDir)) return [];
    
    let files = [];
    const consents = fs.readdirSync(patientDir, { withFileTypes: true });
    for (const consent of consents) {
      if (consent.isDirectory()) {
         const consentDir = path.join(patientDir, consent.name);
         const hospitals = fs.readdirSync(consentDir, { withFileTypes: true });
         for (const hospital of hospitals) {
            if (hospital.isDirectory()) {
               const hospitalDir = path.join(consentDir, hospital.name);
               const subFiles = fs.readdirSync(hospitalDir)
                   .filter(f => f.startsWith("HealthData_") && f.endsWith(".json"))
                   .map(f => path.join(hospitalDir, f));
               files.push(...subFiles);
            }
         }
      }
    }
    return files;
  }

  findPatientIdForStoredConsent(consentId) {
    const target = this._sanitizeName(consentId);
    const dataDir = path.join(this.rootDir, 'data');
    if (!target || !fs.existsSync(dataDir)) return '';

    for (const patient of fs.readdirSync(dataDir, { withFileTypes: true })) {
      if (!patient.isDirectory()) continue;
      const candidate = path.join(dataDir, patient.name, target);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
        const separator = patient.name.indexOf('_');
        return separator > 0 ? patient.name.slice(0, separator) : patient.name;
      }
    }
    return '';
  }

  deleteConsentData(patientId, consentId) {
    if (!patientId || !consentId) return;
    const consentDir = this.resolveConsentFolder(patientId, consentId);
    if (fs.existsSync(consentDir)) {
      Logger.info("M3PatientStorageService", `Deleting expired consent data directory: ${consentDir}`);
      fs.rmSync(consentDir, { recursive: true, force: true });
    }
  }

  findFileByTransactionAndName(patientId, fileBaseName) {
    const patientDir = this.resolvePatientFolder(patientId);
    if (!fs.existsSync(patientDir)) return null;

    const consents = fs.readdirSync(patientDir, { withFileTypes: true });
    for (const consent of consents) {
      if (consent.isDirectory()) {
         const consentDir = path.join(patientDir, consent.name);
         const hospitals = fs.readdirSync(consentDir, { withFileTypes: true });
         for (const hospital of hospitals) {
            if (hospital.isDirectory()) {
               const testPath = path.join(consentDir, hospital.name, fileBaseName);
               if (fs.existsSync(testPath)) {
                  return testPath;
               }
            }
         }
      }
    }
    return null;
  }
}

module.exports = new M3PatientStorageService();
