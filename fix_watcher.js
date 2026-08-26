const fs = require('fs');
const file = '/Users/pranay/Documents/Development/AntigravityWork/sarita_abdm_M1_AntiGravity-test/backend/m2/fhir/M2FolderWatcher.js';
let content = fs.readFileSync(file, 'utf8');

// Replace the loop to check if bundle needs updating
const targetLoop = `      for (const file of fileData) {
        const bundle = await buildBundleFromFiles({ abhaId, folderName, files: [file] });
        const baseName = path.basename(file.fileName, ".txt");
        const bundleFileName = \`\${baseName}_bundle.json\`;
        const bundlePath = path.join(folderPath, bundleFileName);
        
        fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));`;

const newLoop = `      for (const file of fileData) {
        const baseName = path.basename(file.fileName, ".txt");
        const bundleFileName = \`\${baseName}_bundle.json\`;
        const bundlePath = path.join(folderPath, bundleFileName);
        
        let needsUpdate = true;
        if (fs.existsSync(bundlePath)) {
            const bundleStats = fs.statSync(bundlePath);
            const txtStats = fs.statSync(file.filePath);
            if (bundleStats.mtime >= txtStats.mtime) {
                needsUpdate = false;
            }
        }
        
        if (needsUpdate) {
            const bundle = await buildBundleFromFiles({ abhaId, folderName, files: [file] });
            fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
        } else {
            // Log skipped to prevent spam but maintain logic
        }`;

content = content.replace(targetLoop, newLoop);
fs.writeFileSync(file, content);
console.log("Fixed M2FolderWatcher!");
