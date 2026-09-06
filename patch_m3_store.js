const fs = require('fs');

let file = 'backend/m3/store/M3ConsentStore.js';
let content = fs.readFileSync(file, 'utf8');

const regex = /save\(\) \{[\s\S]*?fs\.writeFileSync\(storePath, JSON\.stringify\(\{[\s\S]*?\}, null, 2\), "utf-8"\);[\s\S]*?\}/;

const newSave = `save() {
    try {
      const tempPath = storePath + ".tmp";
      fs.writeFileSync(tempPath, JSON.stringify({
        consents: this.consents,
        transactions: this.transactions || {}
      }, null, 2), "utf-8");
      fs.renameSync(tempPath, storePath);
    } catch (err) {
      Logger.error("M3ConsentStore", "Failed to save consents", { error: err.message });
    }
  }`;

content = content.replace(regex, newSave);
fs.writeFileSync(file, content, 'utf8');
console.log("Patched M3ConsentStore save()");
