const fs = require('fs');

let file = 'backend/m3/controllers/m3CallbackController.js';
let content = fs.readFileSync(file, 'utf8');

const target = `// Security: Remove the ephemeral private key now that data is successfully decrypted
      if (transaction && transactionId && M3ConsentStore.transactions[transactionId]) {
         delete M3ConsentStore.transactions[transactionId].privateKeyBase64;
         M3ConsentStore.save();
         Logger.info("M3Callback", "Ephemeral private key successfully wiped from persistent storage.");
      }`;

content = content.replace(target, '');
fs.writeFileSync(file, content, 'utf8');
console.log("Reverted speculative key removal");
