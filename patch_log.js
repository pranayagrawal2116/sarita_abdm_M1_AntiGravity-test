const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'backend', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

const targetFunction = `const logApiDebug = (label, details) => {
  if (!API_DEBUG_ENABLED) return;

  const lines = [label];
  for (const [key, value] of Object.entries(details)) {
    if (value == null || value === "") continue;
    lines.push(\`\${key}: \${typeof value === "string" ? value : stringifyForLog(value)}\`);
  }

  const logStr = truncateLog(lines.join("\\n"));
  console.log(logStr);
  
  // Write to api_responses.txt
  try {
    const fs = require('fs');
    const path = require('path');
    const apiLogPath = path.join(__dirname, 'data', 'api_responses.txt');
    fs.appendFileSync(apiLogPath, logStr + "\\n\\n");
  } catch (e) {
    // Ignore error
  }
};`;

// We use string replacement
const oldFunctionStart = `const logApiDebug = (label, details) => {`;
const oldFunctionRegex = /const logApiDebug = \(label, details\) => \{[\s\S]*?\};/;

appJs = appJs.replace(oldFunctionRegex, targetFunction);

fs.writeFileSync(appJsPath, appJs);
console.log("Patched app.js successfully.");
