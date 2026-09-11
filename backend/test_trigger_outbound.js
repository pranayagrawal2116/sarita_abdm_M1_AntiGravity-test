const M2TokenManager = require('./m2/tokens/M2TokenManager');
const axios = require('axios');
require('dotenv').config();

async function test() {
  try {
    const token = await M2TokenManager.getGatewayToken();
    const payload = {
      requestId: require('uuid').v4(),
      timestamp: new Date().toISOString(),
      transactionId: require('uuid').v4(),
      hiRequest: {
        consent: { id: require('uuid').v4() }, // Mock artefact id
        dateRange: {
          from: new Date(Date.now() - 365*24*60*60*1000).toISOString(),
          to: new Date().toISOString()
        },
        dataPushUrl: 'https://isolation-pouncing-ecard.ngrok-free.dev/api/v3/health-information/notify',
        keyMaterial: {
          cryptoAlg: 'ECDH', curve: 'Curve25519',
          dhPublicKey: { expiry: new Date(Date.now() + 100000).toISOString(), parameters: 'Curve25519/32byte random key', keyValue: 'test' },
          nonce: 'test'
        }
      }
    };
    console.log("Sending payload:", JSON.stringify(payload, null, 2));
    const res = await axios.post(`${process.env.GATEWAY_BASE || 'https://dev.abdm.gov.in'}/api/hiecm/data-flow/v3/health-information/request`, payload, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-HIU-ID': 'IN2410002480',
        'Content-Type': 'application/json',
        'REQUEST-ID': require('uuid').v4(),
        'TIMESTAMP': new Date().toISOString()
      }
    });
    console.log("SUCCESS:", res.status);
  } catch(e) {
    console.log("FAILED:", e.response?.status, e.response?.data || e.message);
  }
}
test();
