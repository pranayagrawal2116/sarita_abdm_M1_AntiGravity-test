import 'dart:convert';
import 'package:http/http.dart' as http;
import '../utils/api_config.dart';
import '../utils/api_debug_http.dart';
import '../utils/app_runtime_store.dart';
import '../models/hip.dart';
import '../models/health_record.dart';

class HiuApiService {
  static String _readableError(http.Response response, String fallback) {
    try {
      final data = jsonDecode(response.body);
      if (data is Map<String, dynamic>) {
        final message = data['message'] ?? data['error'] ?? data['details'];
        if (message != null && message.toString().trim().isNotEmpty) {
          return '${message.toString().trim()} (${response.statusCode})';
        }
      }
    } catch (_) {
      final body = response.body.trim();
      if (body.isNotEmpty) {
        return '$body (${response.statusCode})';
      }
    }

    return '$fallback (${response.statusCode})';
  }

  static Future<List<Hip>> fetchHips() async {
    final url = Uri.parse("${ApiConfig.baseUrl}/hiu/hips");
    final response = await ApiDebugHttp.get(url);

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to fetch HIPs"));
    }

    final data = jsonDecode(response.body);
    AppRuntimeStore.setApiResponse(
      'hiu.fetchHips',
      data,
      extraValues: {'hiu.hips': data['hips']},
    );
    return (data['hips'] as List).map((e) => Hip.fromJson(e)).toList();
  }

  static Future<void> requestData(
    String hipId,
    String consentArtefactId,
  ) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/hiu/request-data");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "hipId": hipId,
        "consentArtefactId": consentArtefactId,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to request data"));
    }

    final data = response.body.trim().isEmpty
        ? {'statusCode': response.statusCode, 'message': 'Empty response'}
        : jsonDecode(response.body);
    AppRuntimeStore.setApiResponse(
      'hiu.requestData',
      data,
      extraValues: {
        'hiu.requestData.hipId': hipId,
        'hiu.requestData.consentArtefactId': consentArtefactId,
      },
    );
  }

  static Future<List<HealthRecord>> fetchRecords() async {
    final url = Uri.parse("${ApiConfig.baseUrl}/hiu/records");

    final response = await ApiDebugHttp.get(url);

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to fetch records"));
    }

    final data = jsonDecode(response.body);
    AppRuntimeStore.setApiResponse(
      'hiu.fetchRecords',
      data,
      extraValues: {'hiu.records': data['records']},
    );
    return (data['records'] as List)
        .map((e) => HealthRecord.fromJson(e))
        .toList();
  }
}
