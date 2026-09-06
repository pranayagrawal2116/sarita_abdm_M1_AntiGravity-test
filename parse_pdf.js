const fs = require('fs');

async function run() {
  const content = fs.readFileSync('lib/m1_safe_space/current_app/project/documentation/MileStoneDocumentation/Scan_and_share_Document_03_03_25_8c48f696e0.pdf.txt', 'utf8');
  if (content.includes("OPEN_PAYMENT_ORDER")) console.log("FOUND OPEN_PAYMENT_ORDER");
  if (content.includes("open-order")) console.log("FOUND open-order");
}
run();
