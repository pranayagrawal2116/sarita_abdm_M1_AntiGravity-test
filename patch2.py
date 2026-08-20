import re
import os

filepath = 'lib/m3/screens/hip_documents_screen.dart'
with open(filepath, 'r') as f:
    content = f.read()

# Add import
import_line = "import '../services/hiu_api_service.dart';"
new_import = "import '../services/hiu_api_service.dart';\nimport '../widgets/fhir_data_viewer.dart';"
content = content.replace(import_line, new_import)

# Modify fetchContent
old_fetch = """                  try {
                    _contentData = const JsonEncoder.withIndent('  ').convert(jsonDecode(response.body));
                  } catch(e) {
                    _contentData = response.body;
                  }"""
                  
new_fetch = """                  try {
                    _contentData = jsonDecode(response.body);
                  } catch(e) {
                    _contentData = null;
                    _errorMessage = 'Invalid JSON document format';
                  }"""
content = content.replace(old_fetch, new_fetch)

# Modify render
old_render = """                                      ? SingleChildScrollView(
                                          padding: const EdgeInsets.all(16),
                                          child: Text(_contentData as String, style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                                        )"""

new_render = """                                      ? (_contentData is Map<String, dynamic>
                                          ? FhirDataViewer(bundle: _contentData as Map<String, dynamic>)
                                          : const Center(child: Text('Invalid JSON data', style: TextStyle(color: Colors.red))))"""
content = content.replace(old_render, new_render)

with open(filepath, 'w') as f:
    f.write(content)
