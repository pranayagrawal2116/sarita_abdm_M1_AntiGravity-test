const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'backend', 'data', 'm2_transactions.json');
if (fs.existsSync(filePath)) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const cleanedData = {};
  for (const [key, tx] of Object.entries(data)) {
    // Keep transactions that either don't have a dataPushUrl OR their dataPushUrl does not contain trycloudflare
    if (!tx.dataPushUrl || !tx.dataPushUrl.includes('trycloudflare.com')) {
      cleanedData[key] = tx;
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(cleanedData, null, 2));
  console.log('Cleaned mock transactions from m2_transactions.json');
} else {
  console.log('File not found');
}
