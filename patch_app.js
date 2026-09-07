const fs = require('fs');
let content = fs.readFileSync('backend/app.js', 'utf8');

content = content.replace(
  /data: error\.response \? "<omitted for security>" : error\.message,/g,
  `data: error.response ? error.response.data : error.message,`
);

fs.writeFileSync('backend/app.js', content);
console.log("Patched app.js");
