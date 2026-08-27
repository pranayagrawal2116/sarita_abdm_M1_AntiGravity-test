const fs = require('fs');
let code = fs.readFileSync('lib/m3/screens/consent_detail_screen.dart', 'utf8');

const stateStart = 'class _ConsentDetailScreenState extends State<ConsentDetailScreen> {';
const timerDecl = `  Timer? _refreshTimer;`;
if (!code.includes('_refreshTimer')) {
  code = code.replace(stateStart, stateStart + '\\n' + timerDecl);
}

const initStart = /void initState\(\) \{\s*super\.initState\(\);\s*_request = [^;]+;/;
const initMatch = code.match(initStart);
if (initMatch && !code.includes('Timer.periodic')) {
    code = code.replace(initMatch[0], initMatch[0] + `
    _refreshTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (!mounted) return;
      _refreshRequestData(showToast: false);
    });`);
}

const disposeStart = 'void dispose() {';
const timerDispose = `    _refreshTimer?.cancel();`;
if (code.includes('void dispose() {')) {
  if (!code.includes('_refreshTimer?.cancel()')) {
    code = code.replace(disposeStart, disposeStart + '\\n' + timerDispose);
  }
} else {
  const buildStart = 'Widget build(BuildContext context) {';
  code = code.replace(buildStart, `  @override\\n  void dispose() {\\n    _refreshTimer?.cancel();\\n    super.dispose();\\n  }\\n\\n  @override\\n  ` + buildStart);
}

fs.writeFileSync('lib/m3/screens/consent_detail_screen.dart', code);
console.log("Patched timer5");
