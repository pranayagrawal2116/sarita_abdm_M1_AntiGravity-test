const fs = require('fs');
let code = fs.readFileSync('lib/m3/screens/consent_detail_screen.dart', 'utf8');

code = code.replace(/if \\(mounted\\) \\{\\s+ScaffoldMessenger/g, 'if (mounted && showToast) {\\n          ScaffoldMessenger');

fs.writeFileSync('lib/m3/screens/consent_detail_screen.dart', code);
console.log("Patched timer3");
