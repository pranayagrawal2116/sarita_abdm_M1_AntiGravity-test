const fs = require('fs');
const path = require('path');
const file = 'backend/m2/user_init/services/LocalDataRegistry.js';
let content = fs.readFileSync(file, 'utf8');

const oldPersist = `  async persistPatientDocumentIdentity({
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
    if (!resolvedFolderPath.startsWith(\`\${resolvedDataRoot}\${path.sep}\`)) {
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
      ? \`UHID-\${crypto.createHash('sha256').update(normalizedFolderName).digest('hex').slice(0, 12).toUpperCase()}\`
      : '';
    const patientUhid = establishedUhid || existing.patientUhid || generatedUhid || '';
    const next = {
      ...existing,
      folderName: normalizedFolderName,
      storageClass: storageClass || existing.storageClass || '',
      patientUhid,
      patientUhidSource: establishedUhid
        ? 'clinical_record'
        : (existing.patientUhidSource || (this._isGeneratedUhid(patientUhid) ? 'generated' : 'existing')),
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
  }`;

const newPersist = `  async persistPatientDocumentIdentity({
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
    if (!resolvedFolderPath.startsWith(\`\${resolvedDataRoot}\${path.sep}\`)) {
      throw new Error('Patient document identity must be stored inside the data directory.');
    }

    await fs.promises.mkdir(resolvedFolderPath, { recursive: true });
    const identityPath = path.join(resolvedFolderPath, 'patient_identity.json');
    
    // First read to see if it already exists and check ownership
    let existing = null;
    try {
      existing = JSON.parse(await fs.promises.readFile(identityPath, 'utf8')) || {};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (existing && abhaAddress) {
      const existingAbha = String(existing.abhaAddress || '').trim();
      const newAbha = String(abhaAddress).trim();
      if (existingAbha && newAbha && existingAbha !== newAbha) {
        throw new Error('Folder is already bound to a different ABHA identity');
      }
    }
    
    if (!existing) {
      existing = {};
    }

    const normalizedFolderName = String(folderName || path.basename(resolvedFolderPath));
    const establishedUhid = await this._establishedUhid({
      folderPath: resolvedFolderPath,
      abhaAddress,
    });
    const generatedUhid = storageClass === 'NON_ABHA_VERIFIED'
      ? \`UHID-\${crypto.createHash('sha256').update(normalizedFolderName).digest('hex').slice(0, 12).toUpperCase()}\`
      : '';
    const patientUhid = establishedUhid || existing.patientUhid || generatedUhid || '';
    const next = {
      ...existing,
      folderName: normalizedFolderName,
      storageClass: storageClass || existing.storageClass || '',
      patientUhid,
      patientUhidSource: establishedUhid
        ? 'clinical_record'
        : (existing.patientUhidSource || (this._isGeneratedUhid(patientUhid) ? 'generated' : 'existing')),
      patientName: patientName || existing.patientName || '',
      abhaAddress: abhaAddress || existing.abhaAddress || '',
      abhaNumber: abhaNumber || existing.abhaNumber || '',
      mobile: identity?.mobile || existing.mobile || '',
      gender: identity?.gender || existing.gender || '',
      yearOfBirth: identity?.yearOfBirth || existing.yearOfBirth || '',
      updatedAt: new Date().toISOString(),
    };

    const nextJson = JSON.stringify(next, null, 2);

    try {
      // Attempt atomic creation
      await fs.promises.writeFile(identityPath, nextJson, { flag: 'wx', encoding: 'utf8' });
    } catch (error) {
      if (error.code === 'EEXIST') {
        // File was created concurrently! Read it to ensure it belongs to the same ABHA
        const concurrent = JSON.parse(await fs.promises.readFile(identityPath, 'utf8')) || {};
        const concurrentAbha = String(concurrent.abhaAddress || '').trim();
        const newAbha = String(abhaAddress).trim();
        if (concurrentAbha && newAbha && concurrentAbha !== newAbha) {
          throw new Error('Folder is already bound to a different ABHA identity');
        }
        // It's the same ABHA (idempotent), we can safely overwrite/update it if needed,
        // but typically for concurrent claims by the same ABHA we can just rewrite or leave it.
        await fs.promises.writeFile(identityPath, nextJson, 'utf8');
      } else {
        throw error;
      }
    }
    
    return next;
  }`;

if (content.includes(oldPersist)) {
  content = content.replace(oldPersist, newPersist);
  fs.writeFileSync(file, content, 'utf8');
  console.log('LocalDataRegistry patched successfully');
} else {
  console.log('Could not find exact old function in LocalDataRegistry');
}
