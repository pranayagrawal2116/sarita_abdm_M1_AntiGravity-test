require("dotenv").config();
const M3TokenManager = require("./backend/m3/tokens/M3TokenManager");

async function test() {
  try {
    const token = await M3TokenManager.getGatewayToken();
    console.log("M3 Token:", token ? "SUCCESS" : "FAIL");
  } catch (err) {
    console.error("Error:", err.message);
  }
}
test();
