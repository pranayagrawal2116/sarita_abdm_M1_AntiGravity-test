require('dotenv').config({ path: __dirname + '/.env' });
const M2TokenManager = require('./m2/tokens/M2TokenManager');
const gatewayService = require('./services/gatewayService');

async function run() {
  console.log("Testing gatewayService.getGatewayToken()");
  const t1 = Date.now();
  try {
    const token = await gatewayService.getGatewayToken();
    console.log("gatewayService success in", Date.now() - t1);
  } catch(e) {
    console.log("gatewayService failed in", Date.now() - t1, e.message);
  }

  console.log("Testing M2TokenManager.initialize()");
  const t2 = Date.now();
  try {
    const res = await M2TokenManager.initialize();
    console.log("M2TokenManager success in", Date.now() - t2);
  } catch(e) {
    console.log("M2TokenManager failed in", Date.now() - t2, e.message);
  }
}
run();
