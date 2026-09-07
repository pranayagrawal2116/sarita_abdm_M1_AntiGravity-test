const fs = require('fs');
let content = fs.readFileSync('backend/m2/user_init/controllers/UserInitController.js', 'utf8');

content = content.replace(
  /delete data\.response;/g,
  `/* kept data.response for backwards compatibility with undocumented ABDM quirks */`
);

fs.writeFileSync('backend/m2/user_init/controllers/UserInitController.js', content);
console.log("Patched userinit response");
