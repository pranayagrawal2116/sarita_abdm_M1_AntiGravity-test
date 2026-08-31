const fs = require('fs');

let content = fs.readFileSync('backend/controllers/linkingController.js', 'utf8');

content = content.replace(/\{\s*headers\s*\}/g, '{ headers, timeout: 15000 }');

content = content.replace(/name,\s*},\s*}\s*\);/g, "name,\n                },\n                timeout: 15000\n            }\n        );");

fs.writeFileSync('backend/controllers/linkingController.js', content);
