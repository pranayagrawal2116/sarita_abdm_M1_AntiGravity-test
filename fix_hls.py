import re

with open('lib/services/hip_linking_workflow_service.dart', 'r') as f:
    content = f.read()

pattern = r"""  static Future<void> _saveLinkToken\(\{.*?try \{\n        await http.post\("""
# I'll just write the entire method.

def replacer():
    start_idx = content.find("  static Future<void> _saveLinkToken({")
    if start_idx == -1: return
    
    end_idx = content.find("  static File _localRecordRoot() {", start_idx)
    
    if end_idx == -1: return
    
    new_method = """  static Future<void> _saveLinkToken({
    required dynamic tokenFile,
    required String token,
    required String abhaAddress,
    required String abhaNumber,
  }) async {
    if (tokenFile == null) return;
    final now = DateTime.now().toIso8601String();
    
    final content = [
        'Saved At: $now',
        'ABHA Address: $abhaAddress',
        'ABHA Number: $abhaNumber',
        'Link Token:',
        token,
      ].join('\\n');
      
    if (tokenFile is String) {
      try {
        await http.post(
          Uri.parse('${ApiConfig.baseUrl}/files/write'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'filePath': tokenFile, 'content': content}),
        );
      } catch (e) {}
      return;
    }
    
    if (tokenFile is File) {
      await tokenFile.parent.create(recursive: true);
      await tokenFile.writeAsString(content);
    }
  }

"""
    return content[:start_idx] + new_method + content[end_idx:]

new_content = replacer()
if new_content:
    with open('lib/services/hip_linking_workflow_service.dart', 'w') as f:
        f.write(new_content)

