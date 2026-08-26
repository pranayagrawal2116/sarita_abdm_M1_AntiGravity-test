with open('lib/services/hip_linking_workflow_service.dart', 'r') as f:
    content = f.read()

start_idx = content.find("  static Future<void> _saveLinkToken({")
end_idx = content.find("  static File _localRecordRoot() {")

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
content = content[:start_idx] + new_method + content[end_idx:]
with open('lib/services/hip_linking_workflow_service.dart', 'w') as f:
    f.write(content)

