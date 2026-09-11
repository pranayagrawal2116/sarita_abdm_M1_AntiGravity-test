const fs = require('fs');
const path = require('path');
const config = require('../../m2/helpers/config');

class PatientStorageService {
  constructor() {
    this.dataRoot = config.tokenStoreDir
      ? path.dirname(config.tokenStoreDir)
      : path.join(__dirname, '../../data');
    this.abhaVerifiedRoot = path.join(this.dataRoot, 'ABHA_Verified');
    this.nonAbhaVerifiedRoot = path.join(this.dataRoot, 'Non_ABHA_Verified');

    [this.dataRoot, this.abhaVerifiedRoot, this.nonAbhaVerifiedRoot].forEach(
      (directory) => {
        if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory, { recursive: true });
        }
      },
    );
  }

  _sanitizePathSegment(value) {
    if (!value) return 'unknown';
    let normalized = String(value).trim().replace(/\s+/g, '_');
    normalized = normalized.replace(/[^a-zA-Z0-9_\-@\.]/g, '');
    return normalized || 'unknown';
  }

  _safeDirectory(root, folderName, { create = true } = {}) {
    const resolvedRoot = path.resolve(root);
    const resolvedPath = path.resolve(resolvedRoot, folderName);
    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new Error('Invalid path traversal detected');
    }
    if (create && !fs.existsSync(resolvedPath)) {
      fs.mkdirSync(resolvedPath, { recursive: true });
    }
    return resolvedPath;
  }

  _getAbhaVerifiedFolderName(abhaId, patientName) {
    const sanitizedAbha = this._sanitizePathSegment(abhaId);
    if (!patientName) return sanitizedAbha;
    return `${sanitizedAbha}_${this._sanitizePathSegment(patientName)}`;
  }

  _valueFromDocument(content, label) {
    const expression = new RegExp(`^${label}:\\s*(.+?)\\s*$`, 'im');
    return String(content || '').match(expression)?.[1]?.trim() || '';
  }

  _normalizeYearOfBirth(value) {
    const match = String(value || '').match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : '';
  }

  _normalizeGender(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'm' || normalized === 'male') return 'M';
    if (normalized === 'f' || normalized === 'female') return 'F';
    if (normalized === 'o' || normalized === 'other' || normalized === 'transgender') return 'O';
    return '';
  }

  _normalizeMobile(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 10 ? digits : '';
  }

  _getNonAbhaPatientIdentity(content) {
    const yearOfBirth = this._normalizeYearOfBirth(
      this._valueFromDocument(content, 'DOB / YOB'),
    );
    const gender = this._normalizeGender(this._valueFromDocument(content, 'Gender'));
    const mobile = this._normalizeMobile(this._valueFromDocument(content, 'Mobile'));

    if (!yearOfBirth || !gender || !mobile) {
      throw new Error(
        'Local patient records require year of birth, gender, and a 10-digit mobile number.',
      );
    }
    return { yearOfBirth, gender, mobile };
  }

  getNonAbhaFolderName(identity) {
    if (!identity?.yearOfBirth || !identity?.gender || !identity?.mobile) {
      throw new Error('Missing non-ABHA patient identity.');
    }
    return `${this._sanitizePathSegment(identity.yearOfBirth)}_${this._sanitizePathSegment(identity.gender)}_${this._sanitizePathSegment(identity.mobile)}`;
  }

  getNonAbhaPatientDirectory(identity, { create = true } = {}) {
    return this._safeDirectory(
      this.nonAbhaVerifiedRoot,
      this.getNonAbhaFolderName(identity),
      { create },
    );
  }

  getAbhaVerifiedPatientDirectory(abhaId, patientName, { create = true } = {}) {
    return this._safeDirectory(
      this.abhaVerifiedRoot,
      this._getAbhaVerifiedFolderName(abhaId, patientName),
      { create },
    );
  }

  getPatientDirectory(abhaId, patientName, { isLocalDraft = false, content = '' } = {}) {
    return isLocalDraft
      ? this.getNonAbhaPatientDirectory(this._getNonAbhaPatientIdentity(content))
      : this.getAbhaVerifiedPatientDirectory(abhaId, patientName);
  }

  savePatientFile(abhaId, patientName, fileName, content, isLocalDraft = false) {
    const localOnly = isLocalDraft === true || isLocalDraft === 'true';
    const dirPath = this.getPatientDirectory(abhaId, patientName, {
      isLocalDraft: localOnly,
      content,
    });
    const safeFileName = this._sanitizePathSegment(fileName);
    const filePath = path.join(dirPath, safeFileName);

    fs.writeFileSync(filePath, content, 'utf8');

    if (localOnly) {
      const localDataPath = path.join(dirPath, 'local data');
      let existingFiles = [];
      if (fs.existsSync(localDataPath)) {
        try {
          existingFiles = fs
            .readFileSync(localDataPath, 'utf8')
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
        } catch (error) {
          console.error('Error reading local data file:', error);
        }
      }

      if (!existingFiles.includes(safeFileName)) {
        existingFiles.push(safeFileName);
        fs.writeFileSync(localDataPath, `${existingFiles.join('\n')}\n`, 'utf8');
      }
    }

    return filePath;
  }

  readPatientFile(abhaId, patientName, fileName) {
    const safeFileName = this._sanitizePathSegment(fileName);
    const verifiedPath = path.join(
      this.getAbhaVerifiedPatientDirectory(abhaId, patientName, { create: false }),
      safeFileName,
    );
    if (fs.existsSync(verifiedPath)) {
      return fs.readFileSync(verifiedPath, 'utf8');
    }

    // Existing verified records remain readable while deployments migrate
    // from the legacy data-root layout to ABHA_Verified.
    const legacyPath = path.join(
      this._safeDirectory(this.dataRoot, this._getAbhaVerifiedFolderName(abhaId, patientName), {
        create: false,
      }),
      safeFileName,
    );
    return fs.existsSync(legacyPath) ? fs.readFileSync(legacyPath, 'utf8') : null;
  }
}

module.exports = new PatientStorageService();
