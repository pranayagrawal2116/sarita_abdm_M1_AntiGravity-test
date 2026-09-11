const fs = require('fs');

let content = fs.readFileSync('backend/m2/consent/M2ConsentManager.js', 'utf-8');

const targetBlock = `    } catch (err) {
      Logger.error("M2ConsentManager", "Failed to create consent.", err);
      return { status: "error", error: "CREATION_FAILED", message: err.message };
    }`;

const replacementBlock = `    } catch (err) {
      Logger.error("M2ConsentManager", "Failed to create consent.", err);
      if (err.response) {
        Logger.error("M2ConsentManager", "ABDM Gateway responded with error", err.response.data);
      }
      return { status: "error", error: "CREATION_FAILED", message: err.message, gatewayError: err.response?.data };
    }`;

if (content.includes(targetBlock)) {
  content = content.replace(targetBlock, replacementBlock);
  fs.writeFileSync('backend/m2/consent/M2ConsentManager.js', content);
  console.log("Successfully patched M2ConsentManager.js error block");
} else {
  console.log("Target block not found");
}
