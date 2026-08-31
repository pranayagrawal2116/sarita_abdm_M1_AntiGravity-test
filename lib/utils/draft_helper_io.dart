import 'dart:io';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'api_config.dart';

Future<String> saveDraftImpl(String abhaId, String patientName, String fileName, String content, {bool isLocalDraft = false}) async {
  final file = File(fileName);
  await file.writeAsString(content, flush: true);
  
  // When running the desktop app with a remote backend, the backend needs the text file
  // to generate the FHIR bundle for M2 data transfer. So we upload it to the server too.
  try {
    final baseName = file.uri.pathSegments.last;
    
    await http.post(
      Uri.parse('${ApiConfig.baseUrl}/m2/patient-storage/write'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'abhaId': abhaId,
        'patientName': patientName,
        'fileName': baseName,
        'content': content, 'isLocalDraft': isLocalDraft,
      }),
    );
  } catch (e) {
    print('Failed to upload draft to server: $e');
  }

  return file.path;
}

Future<String?> readDraftImpl(String abhaId, String patientName, String fileName) async {
  final file = File(fileName);
  if (await file.exists()) {
    return await file.readAsString();
  }
  return null;
}
