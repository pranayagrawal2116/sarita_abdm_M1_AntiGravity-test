const assert = require('assert');
const M2ConsentManager = require('../m2/consent/M2ConsentManager');
const sinon = require('sinon');
const axios = require('../helpers/axiosClient');
const M2TokenManager = require('../tokens/M2TokenManager');

describe('M2ConsentManager Payload', () => {
  let axiosStub, tokenStub;

  before(() => {
    axiosStub = sinon.stub(axios, 'post').resolves({ status: 202 });
    tokenStub = sinon.stub(M2TokenManager, 'getGatewayToken').resolves('mock-token');
  });

  after(() => {
    axiosStub.restore();
    tokenStub.restore();
  });

  it('should generate valid consent-init payload structure', async () => {
    const manager = M2ConsentManager.getInstance();
    await manager.createConsent({
      patientId: 'test@sbx',
      hiTypes: ['OPConsultation'],
      dateRange: {
        from: new Date(Date.now() - 365*24*60*60*1000).toISOString(),
        to: new Date(Date.now() + 24*60*60*1000).toISOString() // Future date
      }
    });

    const call = axiosStub.getCall(0);
    assert.ok(call, "axios.post should be called");
    const payload = call.args[1];

    assert.ok(payload.requestId, "requestId should be present");
    assert.ok(payload.timestamp, "timestamp should be present");
    assert.strictEqual(payload.consent.patient.id, 'test@sbx');
    assert.deepStrictEqual(payload.consent.hiTypes, ['OPConsultation'], "hiTypes must be exact string match array");
    
    // Future date should be capped to now (approx)
    const toDate = new Date(payload.consent.permission.dateRange.to);
    assert.ok(toDate <= new Date(), "to date must not be in the future");
    
    // Frequency should be set properly
    assert.strictEqual(payload.consent.permission.frequency.value, 0);
  });
});
