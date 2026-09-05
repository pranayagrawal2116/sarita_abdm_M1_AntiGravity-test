const fs = require('fs');
const file = 'backend/tests/userInitiatedDiscoveryIsolation.test.js';
let content = fs.readFileSync(file, 'utf8');

const oldTest5 = `      // TEST 5 — Second ABHA cannot overwrite ownership
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
      assert.strictEqual(t7IdentityAfter.abhaAddress, 'test-user@sbx', 'TEST 5 FAILED: Attacker overwrote ownership!');`;

const newTest5 = `      // TEST 5 — Second ABHA cannot overwrite ownership
      await UserInitController.processDiscovery({
        transactionId: 'tx-test-5',
        patient: { id: 'attacker@sbx', yearOfBirth: '2005', gender: 'M', mobile: '5555555555' }
      }, 'req-7');
      
      const tx5 = UserInitState.getTransaction('tx-test-5');
      assert.strictEqual(tx5, undefined, 'TEST 5 FAILED: Discovery should have failed closed and not created transaction state!');
      
      const t7IdentityAfter = JSON.parse(await fs.promises.readFile(path.join(t7Folder, 'patient_identity.json'), 'utf8'));
      assert.strictEqual(t7IdentityAfter.abhaAddress, 'test-user@sbx', 'TEST 5 FAILED: Attacker overwrote ownership!');`;

content = content.replace(oldTest5, newTest5);
fs.writeFileSync(file, content, 'utf8');
