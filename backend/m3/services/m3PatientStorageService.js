const fs = require('fs');
const path = require('path');
const config = require('../helpers/config');
const Logger = require('../logging/logger');

const { dataRoot } = require('../../config/environment');

class M3PatientStorageService {
  constructor() {
    this.dataDir = dataRoot;
    this.abhaVerifiedDataDir = path.join(this.dataDir, 'ABHA_Verified');

    if (!fs.existsSync(this.abhaVerifiedDataDir)) {
      try {
         fs.mkdirSync(this.abhaVerifiedDataDir, { recursive: true });
      } catch (e) {
         Logger.error("M3PatientStorageService", "Failed to create ABHA verified data directory", { error: e.message });
      }
    }
  }

  _sanitizeName(name) {
    if (!name) return "Unknown";
    return name.replace(/[^a-zA-Z0-9_\-\.@]/g, '_');
  }

  _findPatientFolder(dataDir, safePatientId) {
    if (!fs.existsSync(dataDir)) return null;

    const patientFolder = fs.readdirSync(dataDir, { withFileTypes: true }).find(
      (item) => item.isDirectory() && item.name.startsWith(safePatientId),
    );
    return patientFolder ? path.join(dataDir, patientFolder.name) : null;
  }

  resolvePatientFolder(patientId, { allowLegacy = true } = {}) {
    if (!patientId) throw new Error("patientId is required");
    const safePatientId = this._sanitizeName(patientId);

    // M3 data belongs with all other ABHA-verified patient records.
    const verifiedPatientFolder = this._findPatientFolder(
      this.abhaVerifiedDataDir,
      safePatientId,
    );
    if (verifiedPatientFolder) return verifiedPatientFolder;

    // Keep historical M3 transfers available after the path change, but do not
    // use the legacy root for new writes.
    if (allowLegacy) {
      const legacyPatientFolder = this._findPatientFolder(this.dataDir, safePatientId);
      if (legacyPatientFolder) return legacyPatientFolder;
    }

    return path.join(this.abhaVerifiedDataDir, safePatientId);
  }

  resolveConsentFolder(patientId, consentId, options) {
    if (!consentId) throw new Error("consentId is required");
    const patientDir = this.resolvePatientFolder(patientId, options);
    const safeConsentId = this._sanitizeName(consentId);
    return path.join(patientDir, safeConsentId);
  }

  resolveHospitalFolder(patientId, consentId, hospitalName, options) {
    const consentDir = this.resolveConsentFolder(patientId, consentId, options);
    const safeHospitalName = this._sanitizeName(hospitalName || "UnknownHIP");
    return path.join(consentDir, safeHospitalName);
  }

  saveM3File(patientId, consentId, hospitalName, fileName, dataStr) {
    const hospitalDir = this.resolveHospitalFolder(patientId, consentId, hospitalName, {
      allowLegacy: false,
    });
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
    if (!target) return '';

    for (const dataDir of [this.abhaVerifiedDataDir, this.dataDir]) {
      if (!fs.existsSync(dataDir)) continue;
      for (const patient of fs.readdirSync(dataDir, { withFileTypes: true })) {
        if (!patient.isDirectory() || patient.name === 'ABHA_Verified') continue;
        const candidate = path.join(dataDir, patient.name, target);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          return patient.name;
        }
      }
    }
    return '';
  }

  deleteConsentData(patientId, consentId) {
    if (!patientId || !consentId) return;
    const consentDir = this.resolveConsentFolder(patientId, consentId, {
      allowLegacy: false,
    });
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
