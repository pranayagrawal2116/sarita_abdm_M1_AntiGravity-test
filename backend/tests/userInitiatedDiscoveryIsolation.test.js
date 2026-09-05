const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const LocalDataRegistry = require('../m2/user_init/services/LocalDataRegistry');
const BundleRegistry = require('../m2/fhir/BundleRegistry');
const UserInitController = require('../m2/user_init/controllers/UserInitController');
const UserInitState = require('../m2/user_init/services/UserInitState');

async function createNonAbhaPatient(root, folderName, fileName, abhaAddress = null) {
  const folder = path.join(root, 'Non_ABHA_Verified', folderName);
  await fs.promises.mkdir(folder, { recursive: true });
  await fs.promises.writeFile(path.join(folder, fileName), 'record', 'utf8');
  await fs.promises.writeFile(path.join(folder, 'local data'), `${fileName}\n`, 'utf8');
  if (abhaAddress) {
    await fs.promises.writeFile(path.join(folder, 'patient_identity.json'), JSON.stringify({ abhaAddress }), 'utf8');
  }
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

    // ==========================================
    // NEW REGRESSION TESTS (TESTS 1 - 6)
    // ==========================================
    
    // TEST 1 — ABHA + demographics: ABHA patient's documents are returned.
    const t1AbhaFolder = await createAbhaPatient(fixtureRoot, 'test1@sbx_Test1', 't1_abha_record.txt');
    const t1NonAbhaFolder = await createNonAbhaPatient(fixtureRoot, '2001_M_1111111111', 't1_non_abha.txt');
    const t1Result = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      abhaId: 'test1@sbx', yearOfBirth: '2001', gender: 'M', mobile: '1111111111'
    });
    assert.strictEqual(t1Result.storageClass, 'ABHA_VERIFIED', 'TEST 1 FAILED');
    assert.strictEqual(t1Result.documents[0].documentFileName, 't1_abha_record.txt', 'TEST 1 FAILED');

    // TEST 2 — Non-ABHA only: exact Non_ABHA_Verified folder is used.
    const t2Result = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      yearOfBirth: '2001', gender: 'M', mobile: '1111111111'
    });
    assert.strictEqual(t2Result.storageClass, 'NON_ABHA_VERIFIED', 'TEST 2 FAILED');
    assert.strictEqual(t2Result.documents[0].documentFileName, 't1_non_abha.txt', 'TEST 2 FAILED');

    // TEST 3 — ABHA patient with wrong demographics: authoritative ABHA identity behavior.
    const t3Result = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      abhaId: 'test1@sbx', yearOfBirth: '2099', gender: 'F', mobile: '9999999999'
    });
    assert.strictEqual(t3Result.storageClass, 'ABHA_VERIFIED', 'TEST 3 FAILED');
    assert.strictEqual(t3Result.documents[0].documentFileName, 't1_abha_record.txt', 'TEST 3 FAILED');

    // TEST 4 — Non-ABHA wrong identity: NO MATCH.
    const t4Result = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      yearOfBirth: '2002', gender: 'M', mobile: '1111111111'
    });
    assert.deepStrictEqual(t4Result.documents, [], 'TEST 4 FAILED');

    // TEST 5 — Two patients: NEVER return patient B's records for patient A.
    // Patient A (ABHA) exists without records (fail closed), or we test fallback.
    // If ABHA has no records, fallback to demographic identity MUST check cross-patient leakage.
    // Create Non-ABHA patient B who belongs to test-b@sbx
    await createNonAbhaPatient(fixtureRoot, '2002_F_2222222222', 't5_non_abha.txt', 'test-b@sbx');
    const t5Result = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      abhaId: 'test-a@sbx', yearOfBirth: '2002', gender: 'F', mobile: '2222222222'
    });
    assert.deepStrictEqual(t5Result.documents, [], 'TEST 5 FAILED: Cross-patient leakage!');

    // TEST 6 — ABHA + matching demographics: Do not return records from both storage classes.
    // Already verified in Test 1 (returns only ABHA records, array length 1).
    assert.strictEqual(t1Result.documents.length, 1, 'TEST 6 FAILED');

    
    // ==========================================
    // USER-INITIATED LINKING LIFECYCLE TESTS
    // ==========================================

    // Mock Gateway Callback to prevent real HTTP calls during tests
    const originalSendGatewayCallback = UserInitController.sendGatewayCallback;
    UserInitController.sendGatewayCallback = async () => {};

    try {
      // TEST 1 — Discovery does not claim ownership
      const t7Folder = await createNonAbhaPatient(fixtureRoot, '2005_M_5555555555', 't7_record.txt');
      await UserInitController.processDiscovery({
        transactionId: 'tx-test-1',
        patient: { id: 'test-user@sbx', name: 'Test User', yearOfBirth: '2005', gender: 'M', mobile: '5555555555' },
        unverifiedIdentifiers: []
      }, 'req-1');
      assert.strictEqual(fs.existsSync(path.join(t7Folder, 'patient_identity.json')), false, 'TEST 1 FAILED: Discovery claimed ownership!');

      // TEST 2 — Link Init does not claim ownership
      await UserInitController.processLinkInit({
        transactionId: 'tx-test-1',
        patient: [{ careContexts: [{ referenceNumber: 'dummy' }] }]
      }, 'req-2');
      assert.strictEqual(fs.existsSync(path.join(t7Folder, 'patient_identity.json')), false, 'TEST 2 FAILED: Link Init claimed ownership!');

      // TEST 3 — Successful Link Confirm claims ownership
      const tx = UserInitState.getTransaction('tx-test-1');
      await UserInitController.processLinkConfirm({
        confirmation: { linkRefNumber: tx.linkRefNumber, token: tx.otp }
      }, 'req-3');
      assert.strictEqual(fs.existsSync(path.join(t7Folder, 'patient_identity.json')), true, 'TEST 3 FAILED: Link Confirm did NOT claim ownership!');
      const t7Identity = JSON.parse(await fs.promises.readFile(path.join(t7Folder, 'patient_identity.json'), 'utf8'));
      assert.strictEqual(t7Identity.abhaAddress, 'test-user@sbx', 'TEST 3 FAILED: Ownership belongs to wrong ABHA!');

      // TEST 4 — Failed Link Confirm does not claim ownership
      const t8Folder = await createNonAbhaPatient(fixtureRoot, '2006_F_6666666666', 't8_record.txt');
      await UserInitController.processDiscovery({
        transactionId: 'tx-test-4',
        patient: { id: 'test-user2@sbx', yearOfBirth: '2006', gender: 'F', mobile: '6666666666' }
      }, 'req-4');
      await UserInitController.processLinkInit({
        transactionId: 'tx-test-4',
        patient: [{ careContexts: [{ referenceNumber: 'dummy' }] }]
      }, 'req-5');
      const tx4 = UserInitState.getTransaction('tx-test-4');
      await UserInitController.processLinkConfirm({
        confirmation: { linkRefNumber: tx4.linkRefNumber, token: 'wrong-otp' }
      }, 'req-6');
      assert.strictEqual(fs.existsSync(path.join(t8Folder, 'patient_identity.json')), false, 'TEST 4 FAILED: Failed Link Confirm claimed ownership!');

      // TEST 5 — Second ABHA cannot overwrite ownership
      await UserInitController.processDiscovery({
        transactionId: 'tx-test-5',
        patient: { id: 'attacker@sbx', yearOfBirth: '2005', gender: 'M', mobile: '5555555555' }
      }, 'req-7');
      
      const tx5 = UserInitState.getTransaction('tx-test-5');
      assert.strictEqual(tx5, undefined, 'TEST 5 FAILED: Discovery should have failed closed and not created transaction state!');
      
      const t7IdentityAfter = JSON.parse(await fs.promises.readFile(path.join(t7Folder, 'patient_identity.json'), 'utf8'));
      assert.strictEqual(t7IdentityAfter.abhaAddress, 'test-user@sbx', 'TEST 5 FAILED: Attacker overwrote ownership!');

      // TEST 6 — Concurrent claim
      const t9Folder = await createNonAbhaPatient(fixtureRoot, '2007_M_7777777777', 't9_record.txt');
      await UserInitController.processDiscovery({ transactionId: 'tx-test-6a', patient: { id: 'concurrent-a@sbx', yearOfBirth: '2007', gender: 'M', mobile: '7777777777' } }, 'req-10a');
      await UserInitController.processDiscovery({ transactionId: 'tx-test-6b', patient: { id: 'concurrent-b@sbx', yearOfBirth: '2007', gender: 'M', mobile: '7777777777' } }, 'req-10b');
      await UserInitController.processLinkInit({ transactionId: 'tx-test-6a', patient: [{ careContexts: [{ referenceNumber: 'dummy' }] }] }, 'req-11a');
      await UserInitController.processLinkInit({ transactionId: 'tx-test-6b', patient: [{ careContexts: [{ referenceNumber: 'dummy' }] }] }, 'req-11b');
      const tx6a = UserInitState.getTransaction('tx-test-6a');
      const tx6b = UserInitState.getTransaction('tx-test-6b');
      
      // Fire concurrently
      await Promise.all([
        UserInitController.processLinkConfirm({ confirmation: { linkRefNumber: tx6a.linkRefNumber, token: tx6a.otp } }, 'req-12a'),
        UserInitController.processLinkConfirm({ confirmation: { linkRefNumber: tx6b.linkRefNumber, token: tx6b.otp } }, 'req-12b')
      ]);
      
      const t9Identity = JSON.parse(await fs.promises.readFile(path.join(t9Folder, 'patient_identity.json'), 'utf8'));
      assert.ok(t9Identity.abhaAddress === 'concurrent-a@sbx' || t9Identity.abhaAddress === 'concurrent-b@sbx', 'TEST 6 FAILED: Concurrent claim resulted in invalid state');

      // TEST 7 — Repeated confirmation is idempotent
      await UserInitController.processLinkConfirm({ confirmation: { linkRefNumber: tx6a.linkRefNumber, token: tx6a.otp } }, 'req-13a');
      const t9IdentityRepeated = JSON.parse(await fs.promises.readFile(path.join(t9Folder, 'patient_identity.json'), 'utf8'));
      assert.strictEqual(t9IdentityRepeated.abhaAddress, t9Identity.abhaAddress, 'TEST 7 FAILED: Idempotent confirmation failed');

    } finally {
      UserInitController.sendGatewayCallback = originalSendGatewayCallback;
    }

    // ==========================================
    // EXISTING ISOLATION SCENARIOS
    // ==========================================

    const patientAName = '2000_M_8298540343';
    const patientAFile = 'OP_Consultation_Record_A.txt';
    const patientAFolder = await createNonAbhaPatient(fixtureRoot, patientAName, patientAFile);
    await createAbhaPatient(fixtureRoot, 'person-a@sbx_Person_A', 'ABHA_Record_A.txt');
    
    // Test original exact match for Non-ABHA
    const matched = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      yearOfBirth: '2000', gender: 'M', mobile: '8298540343',
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
        yearOfBirth, gender, mobile,
      });
      assert.deepStrictEqual(noMatch.documents, []);
      assert.strictEqual(noMatch.storageFolderPath, '');
    }

    // no-match cannot return either of two existing patient folders.
    await createNonAbhaPatient(fixtureRoot, '2001_M_8298540344', 'OP_Consultation_Record_B.txt');
    const neitherPatient = await LocalDataRegistry.getAvailableDocumentsForDiscovery({
      yearOfBirth: '2002', gender: 'M', mobile: '8298540345',
    });
    assert.deepStrictEqual(neitherPatient.documents, []);
    assert.strictEqual(fs.existsSync(path.join(fixtureRoot, 'Non_ABHA_Verified', '2002_M_8298540345')), false);

    // registry exact matching returns only the resolved patient's bundles.
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

  // A fresh registry instance resolves the actual configured server
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
