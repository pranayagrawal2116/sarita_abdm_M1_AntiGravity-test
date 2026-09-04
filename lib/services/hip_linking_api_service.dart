import 'dart:convert';

import 'package:http/http.dart' as http;

import '../utils/api_config.dart';
import '../utils/api_debug_http.dart';
import '../utils/app_runtime_store.dart';

class HipLinkingApiService {
  static String _readableError(http.Response response, String fallback) {
    try {
      final decoded = jsonDecode(response.body);
      if (decoded is Map<String, dynamic>) {
        final message =
            decoded['message'] ?? decoded['error'] ?? decoded['details'];
        if (message is String && message.trim().isNotEmpty) {
          return '$message (${response.statusCode})';
        }
        return '${decoded.toString()} (${response.statusCode})';
      }
    } catch (_) {}
    return '$fallback (${response.statusCode})';
  }

  static Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> payload,
  ) async {
    final response = await ApiDebugHttp.post(
      Uri.parse('${ApiConfig.baseUrl}$path'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_readableError(response, 'HIP linking API failed'));
    }

    final decoded = response.body.trim().isEmpty
        ? <String, dynamic>{'statusCode': response.statusCode}
        : jsonDecode(response.body);
    final data = decoded is Map<String, dynamic>
        ? decoded
        : <String, dynamic>{'data': decoded};
    AppRuntimeStore.setApiResponse('hipLinking.$path', data);
    return data;
  }

  static Future<Map<String, dynamic>> _get(String path) async {
    final response = await ApiDebugHttp.get(
      Uri.parse('${ApiConfig.baseUrl}$path'),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_readableError(response, 'HIP linking API failed'));
    }

    final decoded = response.body.trim().isEmpty
        ? <String, dynamic>{'statusCode': response.statusCode}
        : jsonDecode(response.body);
    final data = decoded is Map<String, dynamic>
        ? decoded
        : <String, dynamic>{'data': decoded};
    AppRuntimeStore.setApiResponse('hipLinking.$path', data);
    return data;
  }

  static Future<Map<String, dynamic>> generateToken(
    Map<String, dynamic> payload,
  ) {
    return _post('/hip/link/token/generate', payload);
  }

  static Future<Map<String, dynamic>> fetchTokenCallback(String requestId) {
    return _get('/hip/link/token/callback/$requestId');
  }

  static Future<Map<String, dynamic>> linkCareContext(
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
      Uri.parse('${ApiConfig.baseUrl}/m2/consents/link/context'),
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
        _readableError(response, 'M2 linked care context registration failed'),
      );
    }

    final decoded = response.body.trim().isEmpty
        ? <String, dynamic>{'statusCode': response.statusCode}
        : jsonDecode(response.body);
    AppRuntimeStore.setApiResponse(
      'm2.consents.link.context',
      decoded is Map<String, dynamic> ? decoded : <String, dynamic>{},
    );
  }

  static Future<Map<String, dynamic>> notifyContext(
    Map<String, dynamic> payload,
  ) {
    return _post('/hip/link/context/notify', payload);
  }

  static Future<Map<String, dynamic>> notifySms(
    Map<String, dynamic> payload,
  ) {
    return _post('/hip/link/patient/links/sms/notify2', payload);
  }

  static Future<Map<String, dynamic>> getContextNotifyCallback(
    String requestId,
  ) {
    return _get('/hip/link/context/notify/callback/$requestId');
  }
}
