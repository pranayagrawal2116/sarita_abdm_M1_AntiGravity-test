const fs = require('fs');
let content = fs.readFileSync('backend/m2/user_init/controllers/UserInitController.js', 'utf8');

content = content.replace(
  /const callbackRequestId = String\(correlationRequestId \|\| ''\)\.trim\(\) \|\| newId\(\);/,
  `const callbackRequestId = newId();\n    const callbackTimestamp = nowIso();\n    data.requestId = callbackRequestId;\n    data.timestamp = callbackTimestamp;\n    if (data.response) {\n        data.resp = data.response;\n        delete data.response;\n    }`
);
content = content.replace(
  /"TIMESTAMP": nowIso\(\)/g,
  `"TIMESTAMP": callbackTimestamp`
);

fs.writeFileSync('backend/m2/user_init/controllers/UserInitController.js', content);
console.log("Patched UserInitController");
