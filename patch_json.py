import re

with open('lib/screens/m2_data_exchange_screen.dart', 'r') as f:
    content = f.read()

pattern1 = r"""    final currentResourceJSON = _getResourceJSON\(_selectedFhirResource\);
    return SelectableText\(
      const JsonEncoder\.withIndent\('  '\)\.convert\(currentResourceJSON\),"""

replacement1 = r"""    final currentResourceJSON = _getResourceJSON(_selectedFhirResource);
    String jsonString = const JsonEncoder.withIndent('  ').convert(currentResourceJSON);
    if (jsonString.length > 50000) {
      jsonString = jsonString.substring(0, 50000) + '\n\n...[TRUNCATED FOR UI PERFORMANCE]...';
    }
    return SelectableText(
      jsonString,"""

pattern2 = r"""      child: SelectableText\(
        const JsonEncoder\.withIndent\('  '\)\.convert\(jsonMap\),"""

replacement2 = r"""      child: SelectableText(
        () {
          String s = const JsonEncoder.withIndent('  ').convert(jsonMap);
          return s.length > 50000 ? s.substring(0, 50000) + '\n\n...[TRUNCATED]' : s;
        }(),"""

content = re.sub(pattern1, replacement1, content)
content = re.sub(pattern2, replacement2, content)

with open('lib/screens/m2_data_exchange_screen.dart', 'w') as f:
    f.write(content)
