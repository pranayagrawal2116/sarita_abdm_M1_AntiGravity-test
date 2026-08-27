const fs = require('fs');
let code = fs.readFileSync('lib/m3/screens/consent_detail_screen.dart', 'utf8');

code = code.replace('_refreshRequest(showToast: false);', '_refreshRequestData(showToast: false);');
code = code.replace('Future<void> _refreshRequestData() async {', 'Future<void> _refreshRequestData({bool showToast = true}) async {');
code = code.replace('if (mounted) {\\n          ScaffoldMessenger.of(context).showSnackBar(', 'if (mounted && showToast) {\\n          ScaffoldMessenger.of(context).showSnackBar(');

fs.writeFileSync('lib/m3/screens/consent_detail_screen.dart', code);
console.log("Patched timer2");
