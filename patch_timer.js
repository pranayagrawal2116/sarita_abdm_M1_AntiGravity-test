const fs = require('fs');
let code = fs.readFileSync('lib/m3/screens/consent_detail_screen.dart', 'utf8');

if (!code.includes("import 'dart:async';")) {
  code = code.replace("import 'package:flutter/material.dart';", "import 'package:flutter/material.dart';\nimport 'dart:async';");
}

const stateStart = 'class _ConsentDetailScreenState extends State<ConsentDetailScreen> {';
const timerDecl = `  Timer? _refreshTimer;`;
if (!code.includes('_refreshTimer')) {
  code = code.replace(stateStart, stateStart + '\n' + timerDecl);
}

const initStart = 'void initState() {\n    super.initState();\n    _request = widget.request;';
const timerInit = `    _refreshTimer = Timer.periodic(const Duration(seconds: 3), (timer) {
      if (!mounted) return;
      _refreshRequest(showToast: false);
    });`;
if (!code.includes('Timer.periodic')) {
  code = code.replace(initStart, initStart + '\n' + timerInit);
}

const disposeStart = 'void dispose() {';
const timerDispose = `    _refreshTimer?.cancel();`;
if (code.includes('void dispose() {')) {
  if (!code.includes('_refreshTimer?.cancel()')) {
    code = code.replace(disposeStart, disposeStart + '\n' + timerDispose);
  }
} else {
  const buildStart = 'Widget build(BuildContext context) {';
  code = code.replace(buildStart, `  @override\n  void dispose() {\n    _refreshTimer?.cancel();\n    super.dispose();\n  }\n\n  @override\n  ` + buildStart);
}

code = code.replace('Future<void> _refreshRequest() async {', 'Future<void> _refreshRequest({bool showToast = true}) async {');
code = code.replace('if (mounted) {\n        ScaffoldMessenger.of(context).showSnackBar(', 'if (mounted && showToast) {\n        ScaffoldMessenger.of(context).showSnackBar(');

fs.writeFileSync('lib/m3/screens/consent_detail_screen.dart', code);
console.log("Patched timer");
