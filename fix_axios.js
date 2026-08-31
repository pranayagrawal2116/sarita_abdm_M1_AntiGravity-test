const fs = require('fs');
let content = fs.readFileSync('backend/controllers/linkingController.js', 'utf8');

// replace { headers } with { headers, timeout: 15000 }
content = content.replace(/\{ headers \}/g, '{ headers, timeout: 15000 }');

// for searchProviders, replace name, } with name, }, timeout: 15000
content = content.replace(/name,\s*},\s*}\s*\);/g, "name,\n                },\n                timeout: 15000\n            }\n        );");

fs.writeFileSync('backend/controllers/linkingController.js', content);
