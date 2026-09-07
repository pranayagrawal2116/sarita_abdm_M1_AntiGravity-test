require('dotenv').config({ path: __dirname + '/.env' });
const { getGatewayToken, clearCache } = require('./services/gatewayService');

async function testStartup() {
  console.log("Starting test T1");
  console.log("GATEWAY_BASE is:", process.env.GATEWAY_BASE);
  const T1 = Date.now();
  
  try {
    const token = await getGatewayToken();
    const T2 = Date.now();
    console.log(`Success! Token fetched in ${T2 - T1}ms`);
  } catch (e) {
    const T2 = Date.now();
    console.error(`Failed! Error after ${T2 - T1}ms:`, e.message);
    if (e.response) {
      console.error(`Status: ${e.response.status}`);
      console.error(`Data:`, JSON.stringify(e.response.data));
    }
  }
}

testStartup();
