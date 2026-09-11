const content = `Health Information Record
=========================
Type: Diagnostic Report
Saved At: 2026-07-11 15:11:03

--- Record Data ---

Lab Reports:
  - Item 1:
    Report Name: Complete Blood Test
    Observations:
      - Item 1:
        Test Name: WBC
        Value: 6000
        Unit: 10^3u/ml
`;
const lines = content.split(/\r?\n/).map(l => l.trimRight()).filter(Boolean);
const text = (v) => (v ? v.trim() : "");
const labStart = lines.findIndex((line) => /^(?:Reports?|Lab Reports):/i.test(line));
const labObservations = [];
let reportName = "Diagnostic report";
if (labStart >= 0) {
  for (let i = labStart + 1; i < lines.length; i += 1) {
    const line = lines[i];
    console.log("Checking line:", line);
    if (/^[A-Za-z].*:\s*$/.test(line)) {
       console.log("Broke on:", line);
       break;
    }
    const rnMatch = line.match(/^\s*Report Name:\s*(.+)$/i);
    if (rnMatch) reportName = text(rnMatch[1]);
    const tnMatch = line.match(/^\s*Test Name:\s*(.+)$/i);
    if (tnMatch) {
      console.log("Matched test name:", text(tnMatch[1]));
      let v = "Recorded", u = "";
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
         const vMatch = lines[j].match(/^\s*Value:\s*(.+)$/i);
         if (vMatch) v = text(vMatch[1]);
         const uMatch = lines[j].match(/^\s*Unit:\s*(.+)$/i);
         if (uMatch) u = text(uMatch[1]);
      }
      labObservations.push({ code: "718-7", display: text(tnMatch[1]), value: v, unit: u });
    }
  }
}
console.log(labObservations);
