const fs = require('fs');
const text = fs.readFileSync('lib/m1_safe_space/current_app/project/documentation/MileStoneDocumentation/Updated_M2_Document_07_04_2025_97225f4af2.pdf.txt', 'utf8');
const lines = text.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('resp') || lines[i].includes('response')) {
    console.log(lines[i]);
  }
}
