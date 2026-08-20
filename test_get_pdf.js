const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname);
const dirs = fs.readdirSync(rootDir);
let targetUserDir = dirs.find(d => d.includes("@sbx"));
const userDirPath = path.join(rootDir, targetUserDir);
console.log("User Dir:", userDirPath);

let allFiles = [];
const processDirectory = (dirPath) => {
   const items = fs.readdirSync(dirPath, { withFileTypes: true });
   for (const item of items) {
      if (item.isDirectory()) {
         processDirectory(path.join(dirPath, item.name));
      } else if (item.isFile() && item.name.endsWith('.json')) {
         allFiles.push(path.join(dirPath, item.name));
      }
   }
};
processDirectory(userDirPath);

console.log("Found JSON files:", allFiles.length);

for (const filePath of allFiles) {
  const file = path.basename(filePath);
  const parts = file.split('_');
  let transactionId = parts.length >= 2 ? parts[1] : "fallback";
  
  // Parse file to get bundle count
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let bundlesToProcess = [];
  if (data.entries && Array.isArray(data.entries)) {
    for (const entry of data.entries) {
      if (entry.content) {
        let contentStr = entry.content;
        try {
          let bundle = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
          bundlesToProcess.push(bundle);
        } catch(e) {}
      }
    }
  } else if (data.resourceType === "Bundle") {
    bundlesToProcess.push(data);
  }
  
  console.log(`File: ${file}`);
  console.log(`  transactionId: ${transactionId}`);
  console.log(`  bundlesToProcess length: ${bundlesToProcess.length}`);
  
  // Simulate docId
  for (let bIdx = 0; bIdx < bundlesToProcess.length; bIdx++) {
    const docId = `${transactionId}_${file}_${bIdx}`;
    // Simulate getHealthDocumentPdf split
    const docIdParts = docId.split('_');
    const reconstructedTxnId = docIdParts[0];
    const reconstructedBIdx = parseInt(docIdParts[docIdParts.length - 1], 10);
    const reconstructedFile = docIdParts.slice(1, docIdParts.length - 1).join('_');
    
    if (reconstructedFile !== file) {
      console.log(`  ERROR: Reconstructed file (${reconstructedFile}) != Original (${file})`);
    }
    if (reconstructedBIdx !== bIdx) {
      console.log(`  ERROR: Reconstructed bIdx (${reconstructedBIdx}) != Original (${bIdx})`);
    }
    if (bundlesToProcess[reconstructedBIdx] === undefined) {
      console.log(`  ERROR: bundlesToProcess[${reconstructedBIdx}] is undefined`);
    }
  }
}
