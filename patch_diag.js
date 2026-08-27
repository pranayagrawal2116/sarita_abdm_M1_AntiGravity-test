const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

// 1. Add diagnosticReports array and the pre-pass
const oldFirstPass = `    // First pass: extract summary & categorize
    for (var entry in entries) {`;
    
const newFirstPass = `    List<Map<String, dynamic>> diagnosticReports = [];
    Set<String> diagObsIds = {};
    Map<String, Map<String, dynamic>> allObsMap = {};

    for (var entry in entries) {
      final res = entry['resource'];
      if (res == null) continue;
      if (res['resourceType'] == 'DiagnosticReport') {
        diagnosticReports.add(res);
        if (res['result'] != null) {
          for (var r in res['result']) {
             if (r['reference'] != null) {
                String ref = r['reference'].toString();
                if (ref.startsWith('urn:uuid:')) ref = ref.substring(9);
                diagObsIds.add(ref);
             }
          }
        }
      } else if (res['resourceType'] == 'Observation') {
        if (res['id'] != null) {
           allObsMap[res['id'].toString()] = res;
        }
      }
    }

    // First pass: extract summary & categorize
    for (var entry in entries) {
      final res = entry['resource'];
      if (res == null) continue;
      
      final type = res['resourceType'];
      if (type == 'Observation' && res['id'] != null && diagObsIds.contains(res['id'].toString())) {
         continue; // skip! rendered inside diagnostic report
      }`;

code = code.replace(oldFirstPass, newFirstPass);

// 2. Remove investigations.add(res) from DiagnosticReport
const oldDiagBlock = `      } else if (type == 'DiagnosticReport') {
        investigations.add(res);
        if (docTitle == 'Health Document' && res['code'] != null && res['code']['text'] != null) docTitle = res['code']['text'];`;
const newDiagBlock = `      } else if (type == 'DiagnosticReport') {
        if (docTitle == 'Health Document' && res['code'] != null && res['code']['text'] != null) docTitle = res['code']['text'];`;
code = code.replace(oldDiagBlock, newDiagBlock);

// 3. Inject into build method
const oldBuildSection = `if (invoices.isNotEmpty) _buildInvoiceSection(invoices),`;
const newBuildSection = `if (diagnosticReports.isNotEmpty) _buildDiagnosticReportsSection(diagnosticReports, allObsMap),
          if (invoices.isNotEmpty) _buildInvoiceSection(invoices),`;
code = code.replace(oldBuildSection, newBuildSection);

const oldEmpty = `medications.isEmpty && others.isEmpty && invoices.isEmpty)`;
const newEmpty = `medications.isEmpty && others.isEmpty && invoices.isEmpty && diagnosticReports.isEmpty)`;
code = code.replace(oldEmpty, newEmpty);

// 4. Append _buildDiagnosticReportsSection & _buildSingleDiagnosticReport
const helpers = `
  Widget _buildDiagnosticReportsSection(List<Map<String, dynamic>> reports, Map<String, Map<String, dynamic>> allObsMap) {
    if (reports.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.biotech, color: Color(0xFF0C8A99), size: 16),
            SizedBox(width: 8),
            Text("LAB REPORTS (DIAGNOSTIC)", style: TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
          ]
        ),
        const SizedBox(height: 12),
        ...reports.map((report) => _buildSingleDiagnosticReport(report, allObsMap)),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildSingleDiagnosticReport(Map<String, dynamic> report, Map<String, Map<String, dynamic>> allObsMap) {
    final reportName = report['code']?['text'] ?? report['code']?['coding']?[0]?['display'] ?? 'Diagnostic Report';
    final results = report['result'] as List<dynamic>? ?? [];

    List<Map<String, dynamic>> reportObs = [];
    for (var r in results) {
       if (r['reference'] != null) {
          String ref = r['reference'].toString();
          if (ref.startsWith('urn:uuid:')) ref = ref.substring(9);
          if (allObsMap.containsKey(ref)) {
             reportObs.add(allObsMap[ref]!);
          }
       }
    }

    return Container(
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.all(16),
            decoration: const BoxDecoration(
              color: Color(0xFFF9FDFD),
              borderRadius: BorderRadius.only(topLeft: Radius.circular(12), topRight: Radius.circular(12)),
              border: Border(bottom: BorderSide(color: Color(0xFFD9E4EF))),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Lab Report Name', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(reportName, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          
          // Items Table
          if (reportObs.isNotEmpty)
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: DataTable(
                headingRowHeight: 40,
                dataRowMinHeight: 48,
                dataRowMaxHeight: 48,
                headingTextStyle: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.bold),
                dataTextStyle: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500),
                columns: const [
                  DataColumn(label: Text('Test Name / Display')),
                  DataColumn(label: Text('Value')),
                  DataColumn(label: Text('Unit')),
                ],
                rows: reportObs.map((obs) {
                  final testName = obs['code']?['text'] ?? obs['code']?['coding']?[0]?['display'] ?? 'Unknown Test';
                  
                  String valueStr = '-';
                  String unitStr = '';
                  
                  if (obs['valueQuantity'] != null) {
                    valueStr = obs['valueQuantity']['value']?.toString() ?? '-';
                    unitStr = obs['valueQuantity']['unit']?.toString() ?? '';
                  } else if (obs['valueString'] != null) {
                    valueStr = obs['valueString']?.toString() ?? '-';
                  }
                  
                  return DataRow(
                    cells: [
                      DataCell(Text(testName)),
                      DataCell(Text(valueStr)),
                      DataCell(Text(unitStr)),
                    ]
                  );
                }).toList(),
              ),
            ),
          if (reportObs.isEmpty)
             const Padding(
               padding: EdgeInsets.all(16.0),
               child: Text('No observation results available.', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 13, fontStyle: FontStyle.italic)),
             )
        ],
      ),
    );
  }
}
`;
code = code.replace(/}\s*$/, helpers);

fs.writeFileSync('lib/m3/widgets/fhir_data_viewer.dart', code);
console.log("Patched fhir_data_viewer.dart for Diagnostic Reports");
