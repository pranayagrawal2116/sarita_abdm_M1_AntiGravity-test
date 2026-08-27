const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

// 1. Add invoices array
code = code.replace(
  'List<Map<String, dynamic>> others = [];',
  'List<Map<String, dynamic>> others = [];\n    List<Map<String, dynamic>> invoices = [];'
);

// 2. Add Invoice / ChargeItem parsing
const oldElse = `} else if (!['Patient', 'Practitioner', 'Organization', 'Composition', 'Encounter', 'DocumentReference'].contains(type)) {`;
const newElse = `} else if (type == 'Invoice') {
        invoices.add(res);
      } else if (type == 'ChargeItem') {
        // Ignored, rendered inside Invoice
      } else if (!['Patient', 'Practitioner', 'Organization', 'Composition', 'Encounter', 'DocumentReference'].contains(type)) {`;
code = code.replace(oldElse, newElse);

// 3. Add to build method
const oldOtherSection = `_buildSection("OTHER RECORDS", Icons.folder, const Color(0xFF0C8A99), others, _buildFullWidthItem),`;
const newOtherSection = `if (invoices.isNotEmpty) _buildInvoiceSection(invoices),
          _buildSection("OTHER RECORDS", Icons.folder, const Color(0xFF0C8A99), others, _buildFullWidthItem),`;
code = code.replace(oldOtherSection, newOtherSection);

// 4. Update empty check
const oldEmpty = `medications.isEmpty && others.isEmpty)`;
const newEmpty = `medications.isEmpty && others.isEmpty && invoices.isEmpty)`;
code = code.replace(oldEmpty, newEmpty);

// 5. Add the new helper methods at the end of the class (before the final closing brace)
const helpers = `
  Widget _buildInvoiceSection(List<Map<String, dynamic>> invoices) {
    if (invoices.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.receipt_long, color: Color(0xFF0C8A99), size: 16),
            SizedBox(width: 8),
            Text("INVOICE RECORD", style: TextStyle(color: Color(0xFF0C8A99), fontSize: 12, fontWeight: FontWeight.bold)),
          ]
        ),
        const SizedBox(height: 12),
        ...invoices.map((inv) => _buildSingleInvoice(inv)),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildSingleInvoice(Map<String, dynamic> invoice) {
    String invoiceNo = 'Unknown';
    if (invoice['identifier'] != null && invoice['identifier'].isNotEmpty) {
      invoiceNo = invoice['identifier'][0]['value']?.toString() ?? 'Unknown';
    }
    
    final date = invoice['date']?.toString() ?? '';
    final totalNet = invoice['totalNet']?['value']?.toString() ?? '0';
    
    final lineItems = invoice['lineItem'] as List<dynamic>? ?? [];

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
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Invoice No', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(invoiceNo, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
                  ],
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    const Text('Invoice Date', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 4),
                    Text(date.length > 10 ? date.substring(0, 10) : date, style: const TextStyle(color: Color(0xFF17324A), fontSize: 14, fontWeight: FontWeight.bold)),
                  ],
                ),
              ],
            ),
          ),
          
          // Items Table
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: DataTable(
              headingRowHeight: 40,
              dataRowMinHeight: 48,
              dataRowMaxHeight: 48,
              headingTextStyle: const TextStyle(color: Color(0xFF7A8D9C), fontSize: 11, fontWeight: FontWeight.bold),
              dataTextStyle: const TextStyle(color: Color(0xFF17324A), fontSize: 13, fontWeight: FontWeight.w500),
              columns: const [
                DataColumn(label: Text('Item Name')),
                DataColumn(label: Text('MRP')),
                DataColumn(label: Text('Discount')),
                DataColumn(label: Text('Rate')),
                DataColumn(label: Text('GST')),
                DataColumn(label: Text('Amount')),
              ],
              rows: lineItems.map((item) {
                final itemName = item['chargeItemReference']?['display']?.toString() ?? 'Item';
                final prices = item['priceComponent'] as List<dynamic>? ?? [];
                
                double mrp = 0;
                double discount = 0;
                double rate = 0;
                double cgst = 0;
                double sgst = 0;
                
                for (var p in prices) {
                  final code = p['code']?['coding']?[0]?['display']?.toString().toLowerCase() ?? '';
                  final valStr = p['amount']?['value']?.toString() ?? '0';
                  final val = double.tryParse(valStr) ?? 0;
                  
                  if (code == 'mrp') mrp = val;
                  if (code == 'discount') discount = val;
                  if (code == 'rate') rate = val;
                  if (code == 'cgst') cgst = val;
                  if (code == 'sgst') sgst = val;
                }
                
                final double totalGst = cgst + sgst;
                final double amount = rate + totalGst;
                
                return DataRow(
                  cells: [
                    DataCell(Text(itemName)),
                    DataCell(Text('₹ \${mrp.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${discount.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${rate.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${totalGst.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold))),
                  ]
                );
              }).toList(),
            ),
          ),
          
          // Footer / Total
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            decoration: const BoxDecoration(
              color: Color(0xFFF9FDFD),
              borderRadius: BorderRadius.only(bottomLeft: Radius.circular(12), bottomRight: Radius.circular(12)),
              border: Border(top: BorderSide(color: Color(0xFFD9E4EF))),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const Text('Total Net: ', style: TextStyle(color: Color(0xFF7A8D9C), fontSize: 13, fontWeight: FontWeight.w600)),
                Text('₹ $totalNet', style: const TextStyle(color: Color(0xFF17324A), fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
          )
        ],
      ),
    );
  }
}
`;

code = code.replace(/}\s*$/, helpers);

fs.writeFileSync('lib/m3/widgets/fhir_data_viewer.dart', code);
console.log("Patched fhir_data_viewer.dart for Invoice UI");
