import 'dart:convert';

import '../utils/api_config.dart';
import '../utils/api_debug_http.dart';

class ScanShareApiService {
  ScanShareApiService._();

  static Future<List<Map<String, dynamic>>> fetchQueue({
    String status = 'queued',
  }) async {
    final response = await ApiDebugHttp.get(
      Uri.parse('${ApiConfig.baseUrl}/scan-share/queue?status=$status'),
      headers: const {'Content-Type': 'application/json'},
    );
    _ensureSuccess(response.statusCode, response.body);
    final data = _decode(response.body);
    final queue = data['queue'];
    if (queue is List) {
      return queue
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList(growable: false);
    }
    return const <Map<String, dynamic>>[];
  }

  static Future<void> markRegistered(String tokenNumber) async {
    final response = await ApiDebugHttp.post(
      Uri.parse('${ApiConfig.baseUrl}/scan-share/queue/$tokenNumber/register'),
      headers: const {'Content-Type': 'application/json'},
    );
    _ensureSuccess(response.statusCode, response.body);
  }

  static Future<void> skip(String tokenNumber) async {
    final response = await ApiDebugHttp.post(
      Uri.parse('${ApiConfig.baseUrl}/scan-share/queue/$tokenNumber/skip'),
      headers: const {'Content-Type': 'application/json'},
    );
    _ensureSuccess(response.statusCode, response.body);
  }

  static Map<String, dynamic> _decode(String body) {
    if (body.trim().isEmpty) {
      return const <String, dynamic>{};
    }
    final decoded = jsonDecode(body);
    if (decoded is Map<String, dynamic>) {
      return decoded;
    }
    if (decoded is Map) {
      return Map<String, dynamic>.from(decoded);
    }
    return const <String, dynamic>{};
  }

  static void _ensureSuccess(int statusCode, String body) {
    if (statusCode >= 200 && statusCode < 300) {
      return;
    }
    throw Exception('Scan and Share API failed ($statusCode): $body');
  }
}
