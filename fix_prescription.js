const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

const oldMed = `_buildSection("MEDICATION ADVICE", Icons.medication, const Color(0xFF0C8A99), medications, _buildFullWidthItem),`;
const newMed = `if (medications.isNotEmpty) _buildPrescriptionSection(medications),`;

if (code.includes(oldMed)) {
    code = code.replace(oldMed, newMed);
    fs.writeFileSync('lib/m3/widgets/fhir_data_viewer.dart', code);
    console.log("Successfully replaced the old Medication Advice block!");
} else {
    console.log("Could not find the old Medication Advice block!");
}
