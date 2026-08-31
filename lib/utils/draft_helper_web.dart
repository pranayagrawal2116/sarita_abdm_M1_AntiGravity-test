import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_config.dart';

Future<String> saveDraftImpl(String abhaId, String patientName, String fileName, String content, {bool isLocalDraft = false}) async {
  try {
    final response = await http.post(
      Uri.parse('${ApiConfig.baseUrl}/m2/patient-storage/write'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'abhaId': abhaId,
        'patientName': patientName,
        'fileName': fileName.contains('/') ? fileName.split('/').last : fileName,
        'content': content,
        'isLocalDraft': isLocalDraft,
      }),
    );
    
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return 'Server: ${data['path']}';
    } else {
      throw Exception('Failed to save to server: ${response.statusCode}');
    }
  } catch (e) {
    throw Exception('Server upload failed: $e');
  }
}

Future<String?> readDraftImpl(String abhaId, String patientName, String fileName) async {
  try {
    final response = await http.post(
      Uri.parse('${ApiConfig.baseUrl}/m2/patient-storage/read'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'abhaId': abhaId,
        'patientName': patientName,
        'fileName': fileName.contains('/') ? fileName.split('/').last : fileName,
      }),
    );
    
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['content'] as String?;
    }
    return null;
  } catch (e) {
    return null;
  }
}
