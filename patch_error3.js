const fs = require('fs');
const file = 'backend/m2/controllers/m2ConsentController.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /\} else \{\n\s*throw error;\n\s*\}/g,
  `} else { console.log("ACTUAL GATEWAY ERROR:", JSON.stringify(error.response?.data)); throw error; }`
);

fs.writeFileSync(file, content);
