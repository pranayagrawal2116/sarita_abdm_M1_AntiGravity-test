import 'dart:convert';

import 'package:http/http.dart' as http;

import '../utils/api_config.dart';
import '../utils/api_debug_http.dart';
import '../utils/app_runtime_store.dart';

class HipSetupApiService {
  static String _storeKey(String method, String path) {
    final normalizedPath = path
        .replaceAll(RegExp(r'^/+'), '')
        .replaceAll('/', '.')
        .replaceAll('-', '_')
        .replaceAll('?', '.');
    return 'hipSetup.${method.toLowerCase()}.$normalizedPath';
  }

  static void _storeResponse(String method, String path, dynamic data) {
    AppRuntimeStore.setApiResponse(
      _storeKey(method, path),
      data,
      extraValues: {
        'hipSetup.lastMethod': method.toUpperCase(),
        'hipSetup.lastPath': path,
        'hipSetup.lastResponse': data,
      },
    );
  }

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
      if (decoded is List && decoded.isNotEmpty) {
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
      throw Exception(_readableError(response, 'ABDM API call failed'));
    }

    if (response.body.trim().isEmpty) {
      return {'statusCode': response.statusCode, 'message': 'Empty response'};
    }

    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      _storeResponse('post', path, decoded);
      return decoded;
    }

    final data = {'statusCode': response.statusCode, 'data': decoded};
    _storeResponse('post', path, data);
    return data;
  }

  static Future<Map<String, dynamic>> _get(String path) async {
    final response = await ApiDebugHttp.get(
      Uri.parse('${ApiConfig.baseUrl}$path'),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_readableError(response, 'ABDM API call failed'));
    }

    if (response.body.trim().isEmpty) {
      return {'statusCode': response.statusCode, 'message': 'Empty response'};
    }

    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      _storeResponse('get', path, decoded);
      return decoded;
    }

    final data = {'statusCode': response.statusCode, 'data': decoded};
    _storeResponse('get', path, data);
    return data;
  }

  static Future<Map<String, dynamic>> _patch(
    String path,
    Map<String, dynamic> payload,
  ) async {
    final response = await ApiDebugHttp.patch(
      Uri.parse('${ApiConfig.baseUrl}$path'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode(payload),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(_readableError(response, 'ABDM API call failed'));
    }

    if (response.body.trim().isEmpty) {
      return {'statusCode': response.statusCode, 'message': 'Empty response'};
    }

    final decoded = jsonDecode(response.body);
    if (decoded is Map<String, dynamic>) {
      _storeResponse('patch', path, decoded);
      return decoded;
    }

    final data = {'statusCode': response.statusCode, 'data': decoded};
    _storeResponse('patch', path, data);
    return data;
  }

  static Future<Map<String, dynamic>> fetchCallbackConfig() {
    return _get('/config/callbacks');
  }

  static Future<Map<String, dynamic>> checkSetupSession() {
    return _post('/hip/setup/session/check', const {});
  }

  static Future<Map<String, dynamic>> runScanShareSetup() {
    return _post('/hip/setup/scan-share/run', const {});
  }

  static Future<Map<String, dynamic>> updateBridgeUrl(
    Map<String, dynamic> payload,
  ) {
    return _patch('/hip/setup/bridge/url', payload);
  }

  static Future<Map<String, dynamic>> registerBridgeServices(
    Map<String, dynamic> payload,
  ) {
    return _post('/hip/setup/bridge/services/register', payload);
  }

  static Future<Map<String, dynamic>> fetchBridgeServiceByServiceId(
    String serviceId,
  ) {
    return _get('/hip/setup/bridge-service/$serviceId');
  }

  static Future<Map<String, dynamic>> fetchServicesByBridgeId(String bridgeId) {
    return _get('/hip/setup/bridge-services/$bridgeId');
  }

  static Future<Map<String, dynamic>> fetchGatewayCerts() {
    return _get('/hip/setup/certs');
  }

  static Future<Map<String, dynamic>> fetchOpenIdConfiguration() {
    return _get('/hip/setup/openid-configuration');
  }
}
