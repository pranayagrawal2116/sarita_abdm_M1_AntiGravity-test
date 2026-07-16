import 'dart:convert';

import '../utils/api_config.dart';
import '../utils/api_debug_http.dart';
import '../utils/app_runtime_store.dart';

class FacilityProviderApiService {
  static String _readableError(String body, int statusCode, String fallback) {
    try {
      final data = jsonDecode(body);
      if (data is Map<String, dynamic>) {
        final message = data['message'] ?? data['error'] ?? data['details'];
        if (message is String && message.trim().isNotEmpty) {
          return message;
        }
        return data.toString();
      }
    } catch (_) {}
    return '$fallback ($statusCode)';
  }

  static Future<List<Map<String, dynamic>>> searchProviders(String name) async {
    final response = await ApiDebugHttp.get(
      Uri.parse(
        "${ApiConfig.baseUrl}/facilities/providers?name=${Uri.encodeQueryComponent(name)}",
      ),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(
          response.body,
          response.statusCode,
          "Failed to search health facilities",
        ),
      );
    }

    final data = jsonDecode(response.body) as Map<String, dynamic>;
    AppRuntimeStore.setApiResponse(
      'facilities.searchProviders',
      data,
      extraValues: {
        'facilities.providers': data['providers'],
        'facilities.searchQuery': name,
      },
    );
    return (data['providers'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => Map<String, dynamic>.from(item))
        .toList();
  }
}
