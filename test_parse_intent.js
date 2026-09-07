const fs = require('fs');
const text = fs.readFileSync('lib/m1_safe_space/current_app/project/documentation/MileStoneDocumentation/Scan_and_share_Document_03_03_25_8c48f696e0.pdf.txt', 'utf8');
const lines = text.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].toLowerCase().includes('intent')) {
    console.log(lines.slice(Math.max(0, i-2), i+10).join('\n'));
    console.log("-------");
  }
}
