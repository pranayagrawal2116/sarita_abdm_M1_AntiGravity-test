const fs = require('fs');
let file = 'backend/m3/store/M3ConsentStore.js';
let content = fs.readFileSync(file, 'utf8');

// I'll just replace the whole messed up save block.
const regex = /save\(\) \{[\s\S]*?\} catch \(err\) \{[\s\S]*?\}[\s\S]*?\}[\s\S]*?\n\n\s*addConsentRequest/m;
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
  }

  addConsentRequest`;

content = content.replace(regex, newSave);
fs.writeFileSync(file, content, 'utf8');
