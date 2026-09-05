const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LocalDataRegistry = require('../m2/user_init/services/LocalDataRegistry');
const BundleRegistry = require('../m2/fhir/BundleRegistry');

async function createNonAbhaPatient(root, folderName, fileName) {
  const folder = path.join(root, 'Non_ABHA_Verified', folderName);
  await fs.promises.mkdir(folder, { recursive: true });
  await fs.promises.writeFile(path.join(folder, fileName), 'record', 'utf8');
  await fs.promises.writeFile(path.join(folder, 'local data'), `${fileName}\n`, 'utf8');
  return folder;
}

async function createAbhaPatient(root, folderName, fileName) {
  const folder = path.join(root, 'ABHA_Verified', folderName);
  await fs.promises.mkdir(folder, { recursive: true });
  await fs.promises.writeFile(path.join(folder, fileName), 'record', 'utf8');
  await fs.promises.writeFile(path.join(folder, 'local data'), `${fileName}\n`, 'utf8');
  return folder;
}

async function run() {
  const originalRoots = {
    dataRoot: LocalDataRegistry.dataRoot,
    abhaVerifiedRoot: LocalDataRegistry.abhaVerifiedRoot,
    nonAbhaVerifiedRoot: LocalDataRegistry.nonAbhaVerifiedRoot,
  };
  const fixtureRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'abdm-user-init-discovery-'));

  try {
    LocalDataRegistry.dataRoot = fixtureRoot;
    LocalDataRegistry.abhaVerifiedRoot = path.join(fixtureRoot, 'ABHA_Verified');
    LocalDataRegistry.nonAbhaVerifiedRoot = path.join(fixtureRoot, 'Non_ABHA_Verified');
    LocalDataRegistry.documentCache.clear();

    // Tests 1-4: the three-part folder identity is required and exact.
    const patientAName = '2000_M_8298540343';
    const patientAFile = 'OP_Consultation_Record_A.txt';
    const patientAFolder = await createNonAbhaPatient(fixtureRoot, patientAName, patientAFile);
    // A matching ABHA directory makes the no-fallback assertions meaningful.
    await createAbhaPatient(fixtureRoot, 'person-a@sbx_Person_A', 'ABHA_Record_A.txt');
    const matched = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      abhaId: 'person-a@sbx', yearOfBirth: '2000', gender: 'M', mobile: '8298540343',
    });
    assert.strictEqual(matched.storageClass, 'NON_ABHA_VERIFIED');
    assert.strictEqual(matched.storageFolderPath, patientAFolder);
    assert.deepStrictEqual(matched.documents.map((document) => document.documentFileName), [patientAFile]);

    for (const [yearOfBirth, gender, mobile] of [
      ['2000', 'M', '8298540344'],
      ['2001', 'M', '8298540343'],
      ['2000', 'F', '8298540343'],
    ]) {
      const noMatch = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
        abhaId: 'person-a@sbx', yearOfBirth, gender, mobile,
      });
      assert.deepStrictEqual(noMatch.documents, []);
      assert.strictEqual(noMatch.storageFolderPath, '');
    }

    // Test 5: no-match cannot return either of two existing patient folders.
    await createNonAbhaPatient(fixtureRoot, '2001_M_8298540344', 'OP_Consultation_Record_B.txt');
    await createAbhaPatient(fixtureRoot, 'person-c@sbx_Person_C', 'ABHA_Record_C.txt');
    const neitherPatient = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      abhaId: 'person-c@sbx', yearOfBirth: '2002', gender: 'M', mobile: '8298540345',
    });
    assert.deepStrictEqual(neitherPatient.documents, []);
    assert.strictEqual(fs.existsSync(path.join(fixtureRoot, 'Non_ABHA_Verified', '2002_M_8298540345')), false);

    // Test 6: registry exact matching returns only the resolved patient's bundles.
    const originalInit = BundleRegistry.init;
    const originalScan = BundleRegistry._scanForBundles;
    const originalRegistry = BundleRegistry.registry;
    try {
      BundleRegistry.init = () => {};
      BundleRegistry.registry = [];
      BundleRegistry._scanForBundles = () => [
        { patientId: patientAName, bundlePath: path.join(patientAFolder, 'a_bundle.json'), hiType: 'OPConsultation', abhaNumber: '11-1111-1111-1111' },
        { patientId: '2001_M_8298540344', bundlePath: path.join(fixtureRoot, 'Non_ABHA_Verified', '2001_M_8298540344', 'b_bundle.json'), hiType: 'OPConsultation', abhaNumber: '11-1111-1111-1111' },
      ];
      const onlyA = BundleRegistry.getBundlesForPatient(patientAName, { abhaNumber: '11-1111-1111-1111' });
      assert.deepStrictEqual(onlyA.map((bundle) => bundle.patientId), [patientAName]);
      assert.deepStrictEqual(BundleRegistry.getBundlesForPatient('2002_M_8298540345', { abhaNumber: '11-1111-1111-1111' }), []);
    } finally {
      BundleRegistry.init = originalInit;
      BundleRegistry._scanForBundles = originalScan;
      BundleRegistry.registry = originalRegistry;
    }

  } finally {
    LocalDataRegistry.dataRoot = originalRoots.dataRoot;
    LocalDataRegistry.abhaVerifiedRoot = originalRoots.abhaVerifiedRoot;
    LocalDataRegistry.nonAbhaVerifiedRoot = originalRoots.nonAbhaVerifiedRoot;
    LocalDataRegistry.documentCache.clear();
    await fs.promises.rm(fixtureRoot, { recursive: true, force: true });
  }

  // Test 7: a fresh registry instance resolves the actual configured server
  // filesystem, rather than relying on the test instance's cache.
  const reinitializedRegistry = new LocalDataRegistry.constructor();
  const actualFolder = path.join(
    reinitializedRegistry.nonAbhaVerifiedRoot,
    '2000_M_8298540343',
  );
  assert.strictEqual(fs.existsSync(actualFolder), true);
  const afterReinitialization = await reinitializedRegistry.getAvailableDocumentsForDiscovery({
    yearOfBirth: '2000', gender: 'M', mobile: '8298540343',
  });
  assert.strictEqual(afterReinitialization.storageFolderPath, actualFolder);
}

run()
  .then(() => console.log('User-initiated discovery isolation tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
