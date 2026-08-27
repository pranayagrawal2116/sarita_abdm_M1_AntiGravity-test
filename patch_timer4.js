const fs = require('fs');
let code = fs.readFileSync('lib/m3/screens/consent_detail_screen.dart', 'utf8');

code = code.replace('if (mounted) {\\n          ScaffoldMessenger', 'if (mounted && showToast) {\\n          ScaffoldMessenger');
// since the indentation might be different, let's just do a string replace on exactly what's there
let idx = code.indexOf('if (mounted) {\\n          ScaffoldMessenger.of(context).showSnackBar(');
// let's replace all `if (mounted) {` if it's followed by ScaffoldMessenger
code = code.replace(/if \\(mounted\\) \\{\\s*ScaffoldMessenger/g, 'if (mounted && showToast) {\\n          ScaffoldMessenger');

fs.writeFileSync('lib/m3/screens/consent_detail_screen.dart', code);
console.log("Patched timer4");
