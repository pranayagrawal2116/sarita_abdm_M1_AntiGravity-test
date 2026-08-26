import re

with open('lib/services/hip_linking_workflow_service.dart', 'r') as f:
    content = f.read()

# Add imports
content = content.replace("import 'package:flutter/foundation.dart';", 
"""import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../utils/api_config.dart';""")

# Update `_readSavedLinkToken`
pattern_read = r"""  static Future<_SavedLinkToken\?> _readSavedLinkToken\(dynamic tokenFile\) async \{
    if \(tokenFile == null \|\| !\(tokenFile is File\)\) return null;
    if \(!await tokenFile.exists\(\)\) return null;
    final content = await tokenFile.readAsString\(\);
    final token = _extractField\(content, 'Link Token'\);"""

replacement_read = r"""  static Future<_SavedLinkToken?> _readSavedLinkToken(dynamic tokenFile) async {
    if (tokenFile == null) return null;
    String content = '';
    
    if (tokenFile is String) {
      try {
        final response = await http.post(
          Uri.parse('${ApiConfig.baseUrl}/files/read'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({'filePath': tokenFile}),
        );
        if (response.statusCode == 200) {
          content = jsonDecode(response.body)['content'] as String;
        } else {
          return null;
        }
      } catch (e) {
        return null;
      }
    } else if (tokenFile is File) {
      if (!await tokenFile.exists()) return null;
      content = await tokenFile.readAsString();
    } else {
      return null;
    }
    
    final token = _extractField(content, 'Link Token');"""

content = re.sub(pattern_read, replacement_read, content)

# Update `_saveLinkToken`
pattern_save = r"""  static Future<void> _saveLinkToken\(\{
    required dynamic tokenFile,
    required String token,
    required String abhaAddress,
    required String abhaNumber,
  \}\) async \{
    if \(tokenFile == null \|\| !\(tokenFile is File\)\) return;
    await tokenFile.parent.create\(recursive: true\);
    final now = DateTime.now\(\).toIso8601String\(\);
    await tokenFile.writeAsString\("""

replacement_save = r"""  static Future<void> _saveLinkToken({
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
      ].join('\n');
      
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
    
    if (!(tokenFile is File)) return;
    
    await tokenFile.parent.create(recursive: true);
    await tokenFile.writeAsString("""

content = re.sub(pattern_save, replacement_save, content)

# Update tokenFilePath access: `tokenFile?.path` was changed to handle String or File
pattern_path = r"'tokenFilePath': tokenFile\?\.path,"
replacement_path = r"'tokenFilePath': tokenFile is File ? tokenFile.path : tokenFile?.toString(),"
content = re.sub(pattern_path, replacement_path, content)

# In the success step, we do tokenFile.path, change it similarly
pattern_path2 = r"'tokenFilePath': tokenFile\.path,"
replacement_path2 = r"'tokenFilePath': tokenFile is File ? tokenFile.path : tokenFile.toString(),"
content = re.sub(pattern_path2, replacement_path2, content)

with open('lib/services/hip_linking_workflow_service.dart', 'w') as f:
    f.write(content)
