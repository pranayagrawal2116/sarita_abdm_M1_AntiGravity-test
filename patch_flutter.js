const fs = require('fs');
const file = 'lib/services/hip_linking_api_service.dart';
let content = fs.readFileSync(file, 'utf8');

const target = `  static Future<Map<String, dynamic>> linkCareContext(
    Map<String, dynamic> payload,
  ) async {
    final response = await _post('/hip/link/carecontext', payload);
    await _registerM2LinkedCareContext(payload, response);
    return response;
  }

  static Future<void> _registerM2LinkedCareContext(
    Map<String, dynamic> payload,
    Map<String, dynamic> linkResponse,
  ) async {
    final requestId = linkResponse['requestId']?.toString().trim() ?? '';
    if (requestId.isEmpty) return;

    // Artificial delay to prevent Ngrok rate-limiting (Failed to fetch)
    // when consecutive rapid requests are fired because the link token is reused.
    await Future.delayed(const Duration(seconds: 3));

    final response = await ApiDebugHttp.post(
      Uri.parse('\${ApiConfig.baseUrl}/m2/consents/link/context'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'requestId': requestId,
        'hipId': payload['hipId'],
        'linkToken': payload['linkToken'] ?? payload['linkingToken'],
        'abhaAddress': payload['abhaAddress'] ?? payload['AbhaAddress'],
        'AbhaAddress': payload['AbhaAddress'] ?? payload['abhaAddress'],
        'patient': payload['patient'],
        'createdTime': DateTime.now().toUtc().toIso8601String(),
        'linkPayload': payload,
        'linkResponse': linkResponse,
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        'Failed to register M2 care context: \${response.statusCode}',
      );
    }
  }`;

const replacement = `  static Future<Map<String, dynamic>> linkCareContext(
    Map<String, dynamic> payload,
  ) async {
    // The backend now automatically registers the M2 linked care context internally.
    return _post('/hip/link/carecontext', payload);
  }`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content);
console.log("Patched flutter successfully!");
