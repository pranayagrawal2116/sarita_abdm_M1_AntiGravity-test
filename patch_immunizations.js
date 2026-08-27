const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

// 1. Add immunizations list
const listRegex = /List<Map<String, dynamic>> invoices = \[\];/;
code = code.replace(listRegex, `List<Map<String, dynamic>> invoices = [];
    List<Map<String, dynamic>> immunizations = [];`);

// 2. Add to categorizer
const categorizerRegex = /} else if \(!\['Patient', 'Practitioner', 'Organization', 'Composition', 'Encounter', 'DocumentReference'\].contains\(type\)\) {/;
code = code.replace(categorizerRegex, `} else if (type == 'Immunization') {
        immunizations.add(res);
      } else if (!['Patient', 'Practitioner', 'Organization', 'Composition', 'Encounter', 'DocumentReference'].contains(type)) {`);

// 3. Add to build method
const buildRegex = /if \(invoices\.isNotEmpty\) _buildInvoiceSection\(invoices\),/;
code = code.replace(buildRegex, `if (immunizations.isNotEmpty) _buildImmunizationSection(immunizations),
          if (invoices.isNotEmpty) _buildInvoiceSection(invoices),`);

// 4. Update empty check
const emptyRegex = /medications\.isEmpty && others\.isEmpty && invoices\.isEmpty && diagnosticReports\.isEmpty\)/;
code = code.replace(emptyRegex, `medications.isEmpty && others.isEmpty && invoices.isEmpty && diagnosticReports.isEmpty && immunizations.isEmpty)`);

// 5. Append helper
const helpers = `
  Widget _buildImmunizationSection(List<Map<String, dynamic>> immunizations) {
    if (immunizations.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.vaccines, color: Colors.blueAccent, size: 16),
            SizedBox(width: 8),
            Text("IMMUNIZATION TABLE", style: TextStyle(color: Colors.blueAccent, fontSize: 12, fontWeight: FontWeight.bold)),
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
          child: LayoutBuilder(
            builder: (context, constraints) {
              return SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: ConstrainedBox(
                  constraints: BoxConstraints(minWidth: constraints.maxWidth),
                  child: DataTable(
                    headingRowHeight: 40,
                    dataRowMinHeight: 48,
                    dataRowMaxHeight: 48,
                    headingTextStyle: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.bold),
                    dataTextStyle: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500),
                    columns: const [
                      DataColumn(label: Text('Vaccine Name')),
                      DataColumn(label: Text('Brand')),
                      DataColumn(label: Text('Occurrence Date')),
                      DataColumn(label: Text('Lot Number')),
                      DataColumn(label: Text('Dose No.')),
                    ],
                    rows: immunizations.map((imm) {
                      final name = imm['vaccineCode']?['text'] ?? imm['vaccineCode']?['coding']?[0]?['display'] ?? 'Vaccine';
                      final brand = imm['manufacturer']?['display'] ?? imm['manufacturer']?['reference'] ?? '-';
                      final date = imm['occurrenceDateTime'] ?? imm['occurrenceString'] ?? '-';
                      final lot = imm['lotNumber'] ?? '-';
                      
                      String dose = '-';
                      if (imm['protocolApplied'] != null && (imm['protocolApplied'] as List).isNotEmpty) {
                        final p = imm['protocolApplied'][0];
                        if (p['doseNumberPositiveInt'] != null) {
                          dose = p['doseNumberPositiveInt'].toString();
                        } else if (p['doseNumberString'] != null) {
                          dose = p['doseNumberString'].toString();
                        }
                      }
                      
                      return DataRow(
                        cells: [
                          DataCell(Text(name.toString())),
                          DataCell(Text(brand.toString())),
                          DataCell(Text(date.toString().length > 10 ? date.toString().substring(0, 10) : date.toString())),
                          DataCell(Text(lot.toString())),
                          DataCell(Text(dose.toString())),
                        ]
                      );
                    }).toList(),
                  ),
                ),
              );
            },
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
console.log("Patched immunizations");
