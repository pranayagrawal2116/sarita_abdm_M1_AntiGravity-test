const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('Running Secrets & Configuration Tests...');

  // 1. Verify .env is not present (simulating CI/CD environment without user local files)
  const envPath = path.join(__dirname, '../.env');
  assert.ok(!fs.existsSync(envPath), '.env file should not be committed/present in the source tree by default');

  // 2. Verify private key is not hardcoded
  const privateKeyPath = path.join(__dirname, '../hiu_private.pem');
  assert.ok(!fs.existsSync(privateKeyPath), 'hiu_private.pem should not be committed/present in the source tree');

  // 3. Verify application can load credentials from runtime env
  process.env.ABDM_HIU_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----";
  const jwsService = require('../services/jwsService');
  try {
    const token = jwsService.signPayloadAsJws({ test: true });
    assert.ok(token, 'JWS token should be generated using runtime environment key');
  } catch (e) {
    if (!e.message.includes('error:0180006C') && !e.message.includes('not configured')) {
        // We expect crypto to fail parsing our MOCK_KEY, but it MUST try to use it
        // and it MUST NOT throw "HIU private key is not configured"
    } else if (e.message.includes('not configured')) {
        assert.fail('Service failed to load key from environment');
    }
  }

  // 4. Check that .gitignore ignores .env and .pem files
  const gitignorePath = path.join(__dirname, '../../.gitignore');
  if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      assert.ok(gitignore.includes('.env'), '.gitignore must ignore .env');
      assert.ok(gitignore.includes('.env.*'), '.gitignore must ignore .env.*');
      assert.ok(gitignore.includes('*private*.pem'), '.gitignore must ignore *private*.pem');
  }

  console.log('All Secrets & Configuration Tests Passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
