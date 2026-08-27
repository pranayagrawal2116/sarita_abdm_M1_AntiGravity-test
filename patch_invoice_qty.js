const fs = require('fs');
let code = fs.readFileSync('lib/m3/widgets/fhir_data_viewer.dart', 'utf8');

const oldColumns = `              columns: const [
                DataColumn(label: Text('Item Name')),
                DataColumn(label: Text('MRP')),
                DataColumn(label: Text('Discount')),
                DataColumn(label: Text('Rate')),
                DataColumn(label: Text('GST')),
                DataColumn(label: Text('Amount')),
              ],`;

const newColumns = `              columns: const [
                DataColumn(label: Text('Item Name')),
                DataColumn(label: Text('MRP')),
                DataColumn(label: Text('Qty')),
                DataColumn(label: Text('Discount')),
                DataColumn(label: Text('Rate')),
                DataColumn(label: Text('GST')),
                DataColumn(label: Text('Amount')),
              ],`;

const oldRowLogic = `                double mrp = 0;
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
                }`;

const newRowLogic = `                double mrp = 0;
                double qty = 1;
                double discount = 0;
                double rate = 0;
                double cgst = 0;
                double sgst = 0;
                
                for (var p in prices) {
                  final code = p['code']?['coding']?[0]?['display']?.toString().toLowerCase() ?? '';
                  final valStr = p['amount']?['value']?.toString() ?? '0';
                  final val = double.tryParse(valStr) ?? 0;
                  
                  if (code == 'mrp') {
                    mrp = val;
                    if (p['factor'] != null) {
                      qty = double.tryParse(p['factor'].toString()) ?? 1;
                    }
                  }
                  if (code == 'discount') discount = val;
                  if (code == 'rate') rate = val;
                  if (code == 'cgst') cgst = val;
                  if (code == 'sgst') sgst = val;
                }`;

const oldCells = `                  cells: [
                    DataCell(Text(itemName)),
                    DataCell(Text('₹ \${mrp.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${discount.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${rate.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${totalGst.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold))),
                  ]`;

const newCells = `                  cells: [
                    DataCell(Text(itemName)),
                    DataCell(Text('₹ \${mrp.toStringAsFixed(2)}')),
                    DataCell(Text('\${qty.toInt()}')),
                    DataCell(Text('₹ \${discount.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${rate.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${totalGst.toStringAsFixed(2)}')),
                    DataCell(Text('₹ \${amount.toStringAsFixed(2)}', style: const TextStyle(fontWeight: FontWeight.bold))),
                  ]`;

code = code.replace(oldColumns, newColumns);
code = code.replace(oldRowLogic, newRowLogic);
code = code.replace(oldCells, newCells);

fs.writeFileSync('lib/m3/widgets/fhir_data_viewer.dart', code);
console.log("Patched fhir_data_viewer.dart with Qty");
