const fs = require('fs');
const content = `
Medications:
  - Item 1:
    Name: Dolo 650
    Dose: 1-0-1
    Route: Oral
    Timing: After Food
    Instructions: Fever
  - Item 2:
    Name: Paracetamol 500 mg
    Dose: 1-0-1
    Route: Oral
    Timing: After Food
    Instructions: Fever
Draft Medication:
  Name: -
  Dose: -
  Route: Oral
  Timing: After Food
  Instructions: -
`;
const lines = content.split("\n");
const text = (v) => v ? v.trim() : "";
const medicationsList = [];
const medsStart = lines.findIndex((line) => /^Medications:/i.test(line));
if (medsStart >= 0) {
  for (let i = medsStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^(?:Family History|Follow Up|Items|Summary|Header|Draft Item|Draft Medication):/i.test(line)) break;
    const match = line.match(/^\s*Name:\s*(.+)$/i);
    if (match && text(match[1]) !== "-") {
      let name = text(match[1]);
      let dose = "1-0-1", route = "Oral", timing = "After Food", instr = "";
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
          if (/^\s*-\s*Item/i.test(lines[j])) break;
          const dMatch = lines[j].match(/^\s*Dose:\s*(.+)$/i);
          if (dMatch) dose = text(dMatch[1]);
          const rMatch = lines[j].match(/^\s*Route:\s*(.+)$/i);
          if (rMatch) route = text(rMatch[1]);
          const tMatch = lines[j].match(/^\s*Timing:\s*(.+)$/i);
          if (tMatch) timing = text(tMatch[1]);
          const iMatch = lines[j].match(/^\s*Instructions:\s*(.+)$/i);
          if (iMatch) instr = text(iMatch[1]);
      }
      medicationsList.push({ drugName: name, dose, route, timing, instructions: instr });
    }
  }
}
console.log("Extracted medications:", medicationsList.length);
