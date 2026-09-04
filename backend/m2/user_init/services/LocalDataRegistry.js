const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../../../m2/helpers/config');
const { dataRoot } = require('../../../config/environment');

class LocalDataRegistry {
  constructor() {
    this.dataRoot = dataRoot;
    this.abhaVerifiedRoot = path.join(this.dataRoot, 'ABHA_Verified');
    this.nonAbhaVerifiedRoot = path.join(this.dataRoot, 'Non_ABHA_Verified');
    this.documentCache = new Map();

    [this.dataRoot, this.abhaVerifiedRoot, this.nonAbhaVerifiedRoot].forEach(
      (directory) => fs.mkdirSync(directory, { recursive: true }),
    );
  }

  _sanitizePathSegment(value) {
    if (!value) return 'unknown';
    let normalized = String(value).trim().replace(/\s+/g, '_');
    normalized = normalized.replace(/[^a-zA-Z0-9_\-@\.]/g, '');
    return normalized || 'unknown';
  }

  _documentType(fileName) {
    const lowerFile = String(fileName || '').toLowerCase().replace(/[^a-z]/g, '');
    if (lowerFile.includes('diagnosticreport')) return 'DiagnosticReport';
    if (lowerFile.includes('prescription')) return 'Prescription';
    if (lowerFile.includes('opconsultation')) return 'OPConsultation';
    if (lowerFile.includes('dischargesummary') || lowerFile.includes('ipddischargesummary')) return 'DischargeSummary';
    if (lowerFile.includes('immunizationrecord')) return 'ImmunizationRecord';
    if (lowerFile.includes('healthdocumentrecord') || lowerFile.includes('healthdocument')) return 'HealthDocumentRecord';
    if (lowerFile.includes('wellnessrecord')) return 'WellnessRecord';
    if (lowerFile.includes('invoice')) return 'Invoice';
    return 'DocumentReference';
  }

  _normalizeYearOfBirth(value) {
    const match = String(value || '').match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : '';
  }

  _normalizeGender(value) {
    const gender = String(value || '').trim().toLowerCase();
    if (gender === 'm' || gender === 'male') return 'M';
    if (gender === 'f' || gender === 'female') return 'F';
    if (gender === 'o' || gender === 'other' || gender === 'transgender') return 'O';
    return '';
  }

  _normalizeMobile(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 10 ? digits : '';
  }

  _normalizeNonAbhaIdentity({ yearOfBirth, gender, mobile } = {}) {
    const identity = {
      yearOfBirth: this._normalizeYearOfBirth(yearOfBirth),
      gender: this._normalizeGender(gender),
      mobile: this._normalizeMobile(mobile),
    };
    return identity.yearOfBirth && identity.gender && identity.mobile ? identity : null;
  }

  getNonAbhaFolderName(identity) {
    if (!identity?.yearOfBirth || !identity?.gender || !identity?.mobile) {
      throw new Error('Missing non-ABHA patient identity.');
    }
    return `${this._sanitizePathSegment(identity.yearOfBirth)}_${this._sanitizePathSegment(identity.gender)}_${this._sanitizePathSegment(identity.mobile)}`;
  }

  _validUhid(value) {
    const normalized = String(value || '').trim();
    return normalized && normalized !== '-' ? normalized : '';
  }

  _uhidInText(content) {
    const match = String(content || '').match(/^\s*(?:Patient\s+)?UHID\s*:\s*(.+?)\s*$/im);
    return this._validUhid(match?.[1]);
  }

  async _establishedUhid({ folderPath, abhaAddress } = {}) {
    const candidateFolders = new Set();
    if (folderPath) candidateFolders.add(path.resolve(folderPath));

    if (abhaAddress) {
      for (const folder of await this._matchingAbhaFolders(abhaAddress)) {
        candidateFolders.add(path.resolve(folder.folderPath));
      }
    }

    const documentUhids = [];
    const sidecarUhids = [];
    for (const candidateFolder of candidateFolders) {
      try {
        const entries = await fs.promises.readdir(candidateFolder, { withFileTypes: true });
        const textFiles = entries
          .filter((entry) => entry.isFile() && /\.txt$/i.test(entry.name))
          .map((entry) => entry.name)
          .sort();
        for (const fileName of textFiles) {
          const value = this._uhidInText(await fs.promises.readFile(path.join(candidateFolder, fileName), 'utf8'));
          if (value) documentUhids.push(value);
        }
        try {
          const identity = JSON.parse(await fs.promises.readFile(path.join(candidateFolder, 'patient_identity.json'), 'utf8')) || {};
          const value = this._validUhid(identity.patientUhid);
          if (value) sidecarUhids.push(value);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }

    // A UHID printed on a prior clinical record is the authoritative hospital
    // identifier. Sidecars are only a fallback for patients with no records.
    return documentUhids[0] || sidecarUhids[0] || '';
  }

  // Keep generated-PDF identity outside the clinical source documents. A
  // data-entry patient has no ABHA details until discovery, but their UHID
  // must stay the same in every PDF created from this folder.
  async persistPatientDocumentIdentity({
    folderPath,
    folderName,
    storageClass,
    identity,
    patientName,
    abhaAddress,
    abhaNumber,
  } = {}) {
    const resolvedFolderPath = path.resolve(String(folderPath || ''));
    const resolvedDataRoot = path.resolve(this.dataRoot);
    if (!resolvedFolderPath.startsWith(`${resolvedDataRoot}${path.sep}`)) {
      throw new Error('Patient document identity must be stored inside the data directory.');
    }

    await fs.promises.mkdir(resolvedFolderPath, { recursive: true });
    const identityPath = path.join(resolvedFolderPath, 'patient_identity.json');
    let existing = {};
    try {
      existing = JSON.parse(await fs.promises.readFile(identityPath, 'utf8')) || {};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const normalizedFolderName = String(folderName || path.basename(resolvedFolderPath));
    const establishedUhid = await this._establishedUhid({
      folderPath: resolvedFolderPath,
      abhaAddress,
    });
    const generatedUhid = storageClass === 'NON_ABHA_VERIFIED'
      ? `UHID-${crypto.createHash('sha256').update(normalizedFolderName).digest('hex').slice(0, 12).toUpperCase()}`
      : '';
    const next = {
      ...existing,
      folderName: normalizedFolderName,
      storageClass: storageClass || existing.storageClass || '',
      patientUhid: establishedUhid || existing.patientUhid || generatedUhid || '',
      patientName: patientName || existing.patientName || '',
      abhaAddress: abhaAddress || existing.abhaAddress || '',
      abhaNumber: abhaNumber || existing.abhaNumber || '',
      mobile: identity?.mobile || existing.mobile || '',
      gender: identity?.gender || existing.gender || '',
      yearOfBirth: identity?.yearOfBirth || existing.yearOfBirth || '',
      updatedAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(identityPath, JSON.stringify(next, null, 2), 'utf8');
    return next;
  }

  _abhaVerifiedFolderName(abhaId, patientName) {
    const abha = this._sanitizePathSegment(abhaId);
    return patientName ? `${abha}_${this._sanitizePathSegment(patientName)}` : abha;
  }

  async _linkedFileNames(folderPath) {
    try {
      const content = await fs.promises.readFile(path.join(folderPath, 'linked_records.json'), 'utf8');
      const parsed = JSON.parse(content);
      return new Set(Array.isArray(parsed) ? parsed.map((fileName) => String(fileName)) : []);
    } catch (_) {
      return new Set();
    }
  }

  async markDocumentsLinked(careContexts = []) {
    const documentsByFolder = new Map();
    for (const context of careContexts) {
      const documentPath = String(context?.documentPath || context?._localPath || '').trim();
      const documentFileName = String(context?.documentFileName || path.basename(documentPath || '')).trim();
      if (!documentPath || !documentFileName || path.extname(documentFileName).toLowerCase() !== '.txt') continue;

      const folderPath = path.dirname(documentPath);
      const files = documentsByFolder.get(folderPath) || new Set();
      files.add(documentFileName);
      documentsByFolder.set(folderPath, files);
    }

    for (const [folderPath, fileNames] of documentsByFolder.entries()) {
      const localDataPath = path.join(folderPath, 'local data');
      const linkedRecordsPath = path.join(folderPath, 'linked_records.json');

      try {
        const content = await fs.promises.readFile(localDataPath, 'utf8');
        const remainingFiles = content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((fileName) => fileName && !fileNames.has(fileName));
        await fs.promises.writeFile(
          localDataPath,
          remainingFiles.length ? `${remainingFiles.join('\n')}\n` : '',
          'utf8',
        );
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }

      const linkedRecords = [...(await this._linkedFileNames(folderPath))];
      await fs.promises.writeFile(
        linkedRecordsPath,
        JSON.stringify([...new Set([...linkedRecords, ...fileNames])], null, 2),
        'utf8',
      );
    }

    this.documentCache.clear();
  }

  async _readPatientFolder({ folderPath, folderName, userId, storageClass }) {
    const localDataPath = path.join(folderPath, 'local data');
    try {
      let files;
      let signature;
      let filesAreKnownReadable = false;
      const linkedFileNames = await this._linkedFileNames(folderPath);
      try {
        const [stat, content] = await Promise.all([
          fs.promises.stat(localDataPath),
          fs.promises.readFile(localDataPath, 'utf8'),
        ]);
        files = content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((fileName) => fileName && !linkedFileNames.has(fileName));
        signature = `${folderName}:index:${stat.mtimeMs}:${stat.size}`;
      } catch (_) {
        const [folderStat, entries] = await Promise.all([
          fs.promises.stat(folderPath),
          fs.promises.readdir(folderPath, { withFileTypes: true }),
        ]);
        files = entries
          .filter((entry) => entry.isFile() && /\.txt$/i.test(entry.name) && entry.name !== 'hip_link_token.txt' && !linkedFileNames.has(entry.name))
          .map((entry) => entry.name);
        filesAreKnownReadable = true;
        signature = `${folderName}:folder:${folderStat.mtimeMs}:${files.sort().join(',')}`;
      }

      const documents = (await Promise.all(files.map(async (file) => {
        const documentPath = path.join(folderPath, file);
        try {
          if (!filesAreKnownReadable) {
            await fs.promises.access(documentPath, fs.constants.R_OK);
          }
          return {
            documentFileName: file,
            documentPath,
            documentType: this._documentType(file),
            userId,
            storageClass,
            storageFolderName: folderName,
            storageFolderPath: folderPath,
          };
        } catch (_) {
          return null;
        }
      }))).filter(Boolean);
      return { signature, documents };
    } catch (error) {
      console.error('Error reading local data for', folderName, error.message);
      return { signature: `${folderName}:unavailable`, documents: [] };
    }
  }

  async _folderIndexSignature(folderPath, folderName) {
    try {
      const [indexStat, trackerStat] = await Promise.all([
        fs.promises.stat(path.join(folderPath, 'local data')),
        fs.promises.stat(path.join(folderPath, 'linked_records.json')).catch(() => null),
      ]);
      return `${folderName}:index:${indexStat.mtimeMs}:${indexStat.size}:linked:${trackerStat?.mtimeMs || 0}`;
    } catch (_) {
      try {
        const [folderStat, entries, trackerStat] = await Promise.all([
          fs.promises.stat(folderPath),
          fs.promises.readdir(folderPath, { withFileTypes: true }),
          fs.promises.stat(path.join(folderPath, 'linked_records.json')).catch(() => null),
        ]);
        const txtFiles = entries
          .filter((entry) => entry.isFile() && /\.txt$/i.test(entry.name) && entry.name !== 'hip_link_token.txt')
          .map((entry) => entry.name)
          .sort();
        return `${folderName}:folder:${folderStat.mtimeMs}:${txtFiles.join(',')}:linked:${trackerStat?.mtimeMs || 0}`;
      } catch (_) {
        return `${folderName}:unavailable`;
      }
    }
  }

  async _matchingAbhaFolders(abhaId) {
    const sanitizedAbha = this._sanitizePathSegment(abhaId);
    const roots = [
      { root: this.abhaVerifiedRoot, storageClass: 'ABHA_VERIFIED' },
      // Legacy direct data folders are read-only compatibility fallback.
      { root: this.dataRoot, storageClass: 'LEGACY_ABHA_VERIFIED' },
    ];
    const folders = [];
    const seen = new Set();
    for (const { root, storageClass } of roots) {
      let entries = [];
      try {
        entries = await fs.promises.readdir(root, { withFileTypes: true });
      } catch (_) {
        continue;
      }
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith(`${sanitizedAbha}_`)) continue;
        const folderPath = path.join(root, entry.name);
        if (seen.has(folderPath)) continue;
        seen.add(folderPath);
        folders.push({ folderPath, folderName: entry.name, storageClass });
      }
    }
    return folders;
  }

  async getAvailableDocumentsForAbha(abhaId) {
    const sanitizedAbha = this._sanitizePathSegment(abhaId);
    try {
      const patientFolders = await this._matchingAbhaFolders(abhaId);
      const signature = (await Promise.all(patientFolders.map((folder) =>
        this._folderIndexSignature(folder.folderPath, folder.folderName),
      ))).sort().join('|');
      const cached = this.documentCache.get(`abha:${sanitizedAbha}`);
      if (cached && cached.signature === signature) {
        return cached.documents.map((document) => ({ ...document }));
      }

      const folderResults = await Promise.all(patientFolders.map((folder) =>
        this._readPatientFolder({ ...folder, userId: abhaId }),
      ));
      const documents = folderResults.flatMap((result) => result.documents);
      this.documentCache.set(`abha:${sanitizedAbha}`, { signature, documents });
      return documents.map((document) => ({ ...document }));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error locating local data for', sanitizedAbha, error.message);
      }
      return [];
    }
  }

  /**
   * User-initiated linking for a data-entry patient is keyed by the patient
   * attributes that ABDM sends in its discovery webhook. The directory is
   * created even when empty, as requested, so later local saves use the same
   * stable identity.
   */
  async getAvailableDocumentsForDiscovery({ abhaId, yearOfBirth, gender, mobile } = {}) {
    const identity = this._normalizeNonAbhaIdentity({ yearOfBirth, gender, mobile });
    if (identity) {
      const folderName = this.getNonAbhaFolderName(identity);
      const folderPath = path.join(this.nonAbhaVerifiedRoot, folderName);
      await fs.promises.mkdir(folderPath, { recursive: true });
      const result = await this._readPatientFolder({
        folderPath,
        folderName,
        userId: abhaId || folderName,
        storageClass: 'NON_ABHA_VERIFIED',
      });
      if (result.documents.length > 0) {
        return {
          documents: result.documents,
          identity,
          storageClass: 'NON_ABHA_VERIFIED',
          storageFolderName: folderName,
          storageFolderPath: folderPath,
        };
      }
    }

    const documents = await this.getAvailableDocumentsForAbha(abhaId);
    const firstDocument = documents[0];
    return {
      documents,
      identity,
      storageClass: firstDocument?.storageClass || 'ABHA_VERIFIED',
      storageFolderName: firstDocument?.storageFolderName || '',
      storageFolderPath: firstDocument?.storageFolderPath || '',
    };
  }

  async _mergeTrackerFile(sourcePath, targetPath, { asJson }) {
    const readEntries = async (filePath) => {
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        if (asJson) {
          const parsed = JSON.parse(content);
          return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
        }
        return content.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
      } catch (_) {
        return [];
      }
    };
    const merged = [...new Set([...(await readEntries(targetPath)), ...(await readEntries(sourcePath))])];
    await fs.promises.writeFile(
      targetPath,
      asJson ? JSON.stringify(merged, null, 2) : (merged.length ? `${merged.join('\n')}\n` : ''),
      'utf8',
    );
    await fs.promises.unlink(sourcePath);
  }

  async _moveFile(sourcePath, targetDirectory) {
    const sourceName = path.basename(sourcePath);
    let targetPath = path.join(targetDirectory, sourceName);
    if (fs.existsSync(targetPath)) {
      const [sourceBuffer, targetBuffer] = await Promise.all([
        fs.promises.readFile(sourcePath),
        fs.promises.readFile(targetPath),
      ]);
      if (sourceBuffer.equals(targetBuffer)) {
        await fs.promises.unlink(sourcePath);
        return targetPath;
      }
      const extension = path.extname(sourceName);
      const stem = path.basename(sourceName, extension);
      let copyIndex = 1;
      do {
        targetPath = path.join(targetDirectory, `${stem}-${copyIndex}${extension}`);
        copyIndex += 1;
      } while (fs.existsSync(targetPath));
    }
    try {
      await fs.promises.rename(sourcePath, targetPath);
    } catch (error) {
      if (error.code !== 'EXDEV') throw error;
      await fs.promises.copyFile(sourcePath, targetPath);
      await fs.promises.unlink(sourcePath);
    }
    return targetPath;
  }

  async promoteNonAbhaPatientRecords({ sourceFolderPath, sourceFolderName, abhaAddress, patientName, documentPaths = [] } = {}) {
    const sourceRoot = path.resolve(this.nonAbhaVerifiedRoot);
    let resolvedSource = null;

    // 1. If explicit folder name provided, resolve against canonical root
    if (sourceFolderName) {
      const safeName = this._sanitizePathSegment(sourceFolderName);
      const candidate = path.join(sourceRoot, safeName);
      if (candidate.startsWith(`${sourceRoot}${path.sep}`) && fs.existsSync(candidate)) {
        resolvedSource = candidate;
      }
    }

    // 2. If sourceFolderPath provided, check if it directly points into sourceRoot
    if (!resolvedSource && sourceFolderPath) {
      const candidate = path.resolve(String(sourceFolderPath));
      if (candidate.startsWith(`${sourceRoot}${path.sep}`) && fs.existsSync(candidate)) {
        resolvedSource = candidate;
      } else {
        // 3. Backward compatibility for legacy absolute path from another OS/machine
        const extractedBase = path.basename(String(sourceFolderPath).replace(/\\/g, '/'));
        const safeBase = this._sanitizePathSegment(extractedBase);
        const candidateFromBase = path.join(sourceRoot, safeBase);
        if (candidateFromBase.startsWith(`${sourceRoot}${path.sep}`) && fs.existsSync(candidateFromBase)) {
          resolvedSource = candidateFromBase;
        }
      }
    }

    if (!resolvedSource) {
      return { promoted: false, reason: 'source-folder-not-found', files: [] };
    }
    const sourcePath = resolvedSource;

    const destinationPath = path.join(
      this.abhaVerifiedRoot,
      this._abhaVerifiedFolderName(abhaAddress, patientName),
    );
    await fs.promises.mkdir(destinationPath, { recursive: true });

    // Keep the same discovery identity with the promoted records. The source
    // folder can retain unlinked documents, so copy rather than move it.
    const sourceIdentityPath = path.join(sourcePath, 'patient_identity.json');
    const destinationIdentityPath = path.join(destinationPath, 'patient_identity.json');
    try {
      const sourceIdentity = JSON.parse(await fs.promises.readFile(sourceIdentityPath, 'utf8')) || {};
      let destinationIdentity = {};
      try {
        destinationIdentity = JSON.parse(await fs.promises.readFile(destinationIdentityPath, 'utf8')) || {};
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      const mergedIdentity = { ...sourceIdentity, ...destinationIdentity };
      // Do not let a previously generated placeholder replace the genuine UHID
      // discovered in the source patient's earlier clinical records.
      mergedIdentity.patientUhid = sourceIdentity.patientUhid || destinationIdentity.patientUhid || '';
      mergedIdentity.updatedAt = new Date().toISOString();
      await fs.promises.writeFile(destinationIdentityPath, JSON.stringify(mergedIdentity, null, 2), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    // A user can link any subset of their local records. Never promote the
    // entire folder after a successful transfer: only the files that produced
    // packets acknowledged by the HIU may become ABHA-verified records.
    const sourceDocuments = [...new Set(documentPaths
      .map((documentPath) => {
        const raw = String(documentPath || '');
        const direct = path.resolve(raw);
        if (direct.startsWith(`${sourcePath}${path.sep}`) && fs.existsSync(direct)) {
          return direct;
        }
        const base = path.basename(raw.replace(/\\/g, '/'));
        const remapped = path.join(sourcePath, base);
        if (remapped.startsWith(`${sourcePath}${path.sep}`) && fs.existsSync(remapped)) {
          return remapped;
        }
        return '';
      })
      .filter((documentPath) => (
        Boolean(documentPath)
        && path.extname(documentPath).toLowerCase() === '.txt'
        && fs.existsSync(documentPath)
      ))
    )];
    if (sourceDocuments.length === 0) {
      return { promoted: false, reason: 'no-transferred-local-documents', sourcePath, destinationPath, files: [] };
    }

    const documentNames = new Set(sourceDocuments.map((documentPath) => path.basename(documentPath)));
    const movedFiles = [];

    for (const sourceFile of sourceDocuments) {
      movedFiles.push(path.basename(await this._moveFile(sourceFile, destinationPath)));

      // The FHIR bundle belongs to exactly the same local document and must
      // travel with it. Other record bundles remain in the local folder.
      const bundlePath = sourceFile.replace(/\.txt$/i, '_bundle.json');
      if (fs.existsSync(bundlePath)) {
        movedFiles.push(path.basename(await this._moveFile(bundlePath, destinationPath)));
      }
    }

    const updateTracker = async ({ fileName, asJson, destinationIncludesSelected }) => {
      const sourceFile = path.join(sourcePath, fileName);
      const destinationFile = path.join(destinationPath, fileName);
      const readEntries = async (filePath) => {
        try {
          const content = await fs.promises.readFile(filePath, 'utf8');
          if (asJson) {
            const parsed = JSON.parse(content);
            return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
          }
          return content.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
        } catch (_) {
          return [];
        }
      };
      const [sourceEntries, destinationEntries] = await Promise.all([
        readEntries(sourceFile),
        readEntries(destinationFile),
      ]);
      const remainingSourceEntries = sourceEntries.filter((entry) => !documentNames.has(entry));
      const nextDestinationEntries = destinationIncludesSelected
        ? [...new Set([...destinationEntries, ...[...documentNames]])]
        : destinationEntries;

      if (fs.existsSync(sourceFile) || remainingSourceEntries.length > 0) {
        await fs.promises.writeFile(
          sourceFile,
          asJson ? JSON.stringify(remainingSourceEntries, null, 2) : (remainingSourceEntries.length ? `${remainingSourceEntries.join('\n')}\n` : ''),
          'utf8',
        );
      }
      if (destinationIncludesSelected) {
        await fs.promises.writeFile(
          destinationFile,
          asJson ? JSON.stringify(nextDestinationEntries, null, 2) : (nextDestinationEntries.length ? `${nextDestinationEntries.join('\n')}\n` : ''),
          'utf8',
        );
      }
    };

    // Keep both folder indexes accurate: source retains unlinked records;
    // destination receives only the transferred records.
    await updateTracker({ fileName: 'local data', asJson: false, destinationIncludesSelected: true });
    await updateTracker({ fileName: 'linked_records.json', asJson: true, destinationIncludesSelected: true });
    await updateTracker({ fileName: 'sent_records.json', asJson: true, destinationIncludesSelected: true });

    try {
      const remainingEntries = await fs.promises.readdir(sourcePath);
      if (remainingEntries.length === 0) {
        await fs.promises.rmdir(sourcePath);
      }
    } catch (_) {
      // A later retry can clean up an empty source folder.
    }

    this.documentCache.clear();
    return { promoted: true, sourcePath, destinationPath, files: movedFiles };
  }
}

module.exports = new LocalDataRegistry();
