const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '../app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

const hipLinkingPath = path.join(__dirname, '../controllers/hipLinkingController.js');
const hipLinkingContent = fs.readFileSync(hipLinkingPath, 'utf8');

async function runTests() {
  console.log('Running Security Logging Tests...');

  // TEST 3 - No webhook.site or external debug forwarding
  assert.ok(!appJsContent.includes('webhook.site'), 'webhook.site forwarding found in app.js');
  assert.ok(!appJsContent.includes('requestbin'), 'requestbin forwarding found in app.js');

  // TEST 4 - Sensitive request bodies are not emitted by production logging
  assert.ok(!appJsContent.includes('body: req.body'), 'req.body is logged directly in app.js');
  assert.ok(!hipLinkingContent.includes('JSON.stringify(req.body'), 'req.body is logged directly in hipLinkingController.js');

  // TEST 5 - Authorization headers are masked
  assert.ok(appJsContent.includes('sanitizeHeaders'), 'sanitizeHeaders is missing in app.js');

  // TEST 8 - Error handling does not leak sensitive payloads
  assert.ok(!appJsContent.includes('data: error.response?.data || error.message'), 'Error response data is logged in app.js');
  assert.ok(!hipLinkingContent.includes('Body:", body'), 'Raw body is logged in error logs in hipLinkingController.js');

  console.log('All Security Logging Tests Passed!');
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
