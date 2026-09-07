const fs = require('fs');
let content = fs.readFileSync('backend/controllers/scanShareController.js', 'utf8');

content = content.replace(
  /console\.error\(\s*"\[ScanShare\] Failed to send on-share acknowledgement",\s*"<omitted for security>"\s*\);/g,
  `console.error("[ScanShare] Failed to send on-share acknowledgement", e.response ? e.response.data : e.message);`
);

fs.writeFileSync('backend/controllers/scanShareController.js', content);
console.log("Patched log again");
