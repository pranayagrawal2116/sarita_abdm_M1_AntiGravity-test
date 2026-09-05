const fs = require('fs');
const file = 'backend/tests/userInitiatedDiscoveryIsolation.test.js';
let content = fs.readFileSync(file, 'utf8');

const importStatement = `const BundleRegistry = require('../m2/fhir/BundleRegistry');
const UserInitController = require('../m2/user_init/controllers/UserInitController');
const UserInitState = require('../m2/user_init/services/UserInitState');`;

content = content.replace("const BundleRegistry = require('../m2/fhir/BundleRegistry');", importStatement);

const newTests = `
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
      await UserInitController.processLinkInit({
        transactionId: 'tx-test-5',
        patient: [{ careContexts: [{ referenceNumber: 'dummy' }] }]
      }, 'req-8');
      const tx5 = UserInitState.getTransaction('tx-test-5');
      await UserInitController.processLinkConfirm({
        confirmation: { linkRefNumber: tx5.linkRefNumber, token: tx5.otp }
      }, 'req-9');
      // It should NOT overwrite test-user@sbx
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
`;

const targetAnchor = `// ==========================================
    // EXISTING ISOLATION SCENARIOS`;

if (content.includes(targetAnchor)) {
  content = content.replace(targetAnchor, newTests + "\n    " + targetAnchor);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Tests patched successfully');
} else {
  console.log('Could not find targetAnchor in tests');
}
