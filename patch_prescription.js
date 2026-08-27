const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

const oldMedSection = `_buildSection("MEDICATION ADVICE", Icons.medication, Colors.teal, medications, _buildFullWidthItem),`;
const newMedSection = `if (medications.isNotEmpty) _buildPrescriptionSection(medications),`;
code = code.replace(oldMedSection, newMedSection);

const helpers = `
  Widget _buildPrescriptionSection(List<Map<String, dynamic>> medications) {
    if (medications.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.medication, color: Colors.teal, size: 16),
            SizedBox(width: 8),
            Text("MEDICATION ADVICE", style: TextStyle(color: Colors.teal, fontSize: 12, fontWeight: FontWeight.bold)),
          ]
        ),
        const SizedBox(height: 12),
        Container(
          margin: const EdgeInsets.only(bottom: 16),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFD9E4EF)),
            boxShadow: const [
              BoxShadow(
                color: Color(0x040E2233),
                blurRadius: 8,
                offset: Offset(0, 2),
              )
            ]
          ),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowHeight: 40,
              dataRowMinHeight: 48,
              dataRowMaxHeight: 48,
              headingTextStyle: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.bold),
              dataTextStyle: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500),
              columns: const [
                DataColumn(label: Text('Medicine Name')),
                DataColumn(label: Text('Dose Pattern')),
                DataColumn(label: Text('Route')),
                DataColumn(label: Text('Timing / Method')),
                DataColumn(label: Text('Instructions')),
              ],
              rows: medications.map((med) {
                final name = med['medicationCodeableConcept']?['text'] ?? med['medicationCodeableConcept']?['coding']?[0]?['display'] ?? 'Unknown Medicine';
                
                String dose = '';
                String route = '';
                String timing = '';
                
                if (med['dosageInstruction'] != null && med['dosageInstruction'].isNotEmpty) {
                  final dosage = med['dosageInstruction'][0];
                  dose = dosage['text']?.toString() ?? '';
                  if (dosage['route'] != null) {
                     route = dosage['route']['text'] ?? dosage['route']['coding']?[0]?['display'] ?? '';
                  }
                  if (dosage['method'] != null) {
                     timing = dosage['method']['text'] ?? dosage['method']['coding']?[0]?['display'] ?? '';
                  }
                }
                
                String instructions = '';
                if (med['reasonCode'] != null && med['reasonCode'].isNotEmpty) {
                  instructions = med['reasonCode'][0]['text'] ?? med['reasonCode'][0]['coding']?[0]?['display'] ?? '';
                }
                
                return DataRow(
                  cells: [
                    DataCell(Text(name.toString())),
                    DataCell(Text(dose.toString())),
                    DataCell(Text(route.toString())),
                    DataCell(Text(timing.toString())),
                    DataCell(Text(instructions.toString())),
                  ]
                );
              }).toList(),
            ),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }
}
`;

code = code.replace(/}\s*$/, helpers);
fs.writeFileSync('lib/m3/widgets/fhir_data_viewer.dart', code);
console.log("Patched fhir_data_viewer.dart for Prescriptions");
