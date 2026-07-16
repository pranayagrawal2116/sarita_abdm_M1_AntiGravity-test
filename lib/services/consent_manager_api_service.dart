import 'dart:convert';

import 'package:http/http.dart' as http;

import '../utils/api_config.dart';
import '../utils/api_debug_http.dart';
import '../utils/app_runtime_store.dart';

class ConsentManagerApiExecution {
  ConsentManagerApiExecution({
    required this.title,
    required this.method,
    required this.url,
    required this.headers,
    required this.request,
    required this.response,
    required this.statusCode,
    required this.duration,
    required this.timestamp,
  });

  final String title;
  final String method;
  final String url;
  final Map<String, dynamic> headers;
  final Map<String, dynamic> request;
  final Map<String, dynamic> response;
  final int statusCode;
  final Duration duration;
  final DateTime timestamp;
}

class ConsentManagerApiResult {
  ConsentManagerApiResult({required this.data, required this.execution});

  final Map<String, dynamic> data;
  final ConsentManagerApiExecution execution;
}

class ConsentManagerApiException implements Exception {
  ConsentManagerApiException(this.message, this.execution);

  final String message;
  final ConsentManagerApiExecution execution;

  @override
  String toString() => message;
}

class ConsentManagerApiService {
  static void _storeResponse(
    String key,
    Map<String, dynamic> data, {
    Map<String, dynamic>? extraValues,
  }) {
    AppRuntimeStore.setApiResponse(key, data, extraValues: extraValues);
  }

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

  static Map<String, dynamic> _decodeBody(String body) {
    try {
      final decoded = body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(body);
      return decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{'data': decoded};
    } catch (_) {
      return <String, dynamic>{'body': body};
    }
  }

  static ConsentManagerApiExecution _execution({
    required String title,
    required String method,
    required Uri url,
    required Map<String, dynamic> headers,
    required Map<String, dynamic> request,
    required http.Response response,
    required DateTime startedAt,
    required Duration duration,
  }) {
    return ConsentManagerApiExecution(
      title: title,
      method: method,
      url: url.toString(),
      headers: {'request': headers, 'response': response.headers},
      request: request,
      response: _decodeBody(response.body),
      statusCode: response.statusCode,
      duration: duration,
      timestamp: startedAt,
    );
  }

  static Future<Map<String, dynamic>> fetchCallbackConfig() async {
    final response = await ApiDebugHttp.get(
      Uri.parse("${ApiConfig.baseUrl}/config/callbacks"),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to load callback config"),
      );
    }

    final data = Map<String, dynamic>.from(jsonDecode(response.body));
    _storeResponse(
      'consentManager.fetchCallbackConfig',
      data,
      extraValues: {'consentManager.callbackConfig': data},
    );
    return data;
  }

  static Future<Map<String, dynamic>> initConsentRequest(
    Map<String, dynamic> payload,
  ) async {
    final headers = {"Content-Type": "application/json"};
    final response = await ApiDebugHttp.post(
      Uri.parse("${ApiConfig.baseUrl}/m2/consents/manager/init"),
      headers: headers,
      body: jsonEncode(payload),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to create consent request"),
      );
    }

    final data = Map<String, dynamic>.from(jsonDecode(response.body));
    _storeResponse(
      'consentManager.initConsentRequest',
      data,
      extraValues: {
        'consentManager.requestId': data['requestId'],
        'consentManager.initResponse': data,
        'consentManager.init.authContext': 'backend-gateway-session',
      },
    );
    return data;
  }

  static Future<Map<String, dynamic>> fetchOnInitCallback(
    String requestId,
  ) async {
    final response = await ApiDebugHttp.get(
      Uri.parse(
        "${ApiConfig.baseUrl}/m2/consents/manager/callbacks/on-init/$requestId",
      ),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to fetch on-init callback"),
      );
    }

    final data = Map<String, dynamic>.from(jsonDecode(response.body));
    _storeResponse(
      'consentManager.fetchOnInitCallback',
      data,
      extraValues: {
        'consentManager.onInit': data,
        'consentManager.consentRequestId': data['consentRequest'] is Map
            ? data['consentRequest']['id']
            : null,
      },
    );
    return data;
  }

  static Future<Map<String, dynamic>> fetchOnStatusCallback(
    String consentId,
  ) async {
    final response = await ApiDebugHttp.get(
      Uri.parse(
        "${ApiConfig.baseUrl}/m2/consents/manager/callbacks/on-status/$consentId",
      ),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to fetch on-status callback"),
      );
    }

    final data = Map<String, dynamic>.from(jsonDecode(response.body));
    _storeResponse(
      'consentManager.fetchOnStatusCallback',
      data,
      extraValues: {
        'consentManager.onStatus': data,
        'consentManager.status': data['status'],
        'consentManager.consentId': consentId,
      },
    );
    return data;
  }

  static Future<Map<String, dynamic>> requestHealthInformation(
    Map<String, dynamic> payload,
  ) async {
    final result = await requestHealthInformationWithMetadata(payload);
    return result.data;
  }

  static Future<ConsentManagerApiResult> requestHealthInformationWithMetadata(
    Map<String, dynamic> payload,
  ) async {
    final url = Uri.parse(
      "${ApiConfig.baseUrl}/m2/consents/manager/health-information/request",
    );
    final headers = {"Content-Type": "application/json"};
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();
    final response = await ApiDebugHttp.post(
      url,
      headers: headers,
      body: jsonEncode(payload),
    );
    stopwatch.stop();

    final execution = _execution(
      title: 'Health Information Request',
      method: 'POST',
      url: url,
      headers: headers,
      request: {...payload, 'authContext': 'backend-gateway-session'},
      response: response,
      startedAt: startedAt,
      duration: stopwatch.elapsed,
    );

    if (response.statusCode != 200) {
      throw ConsentManagerApiException(
        _readableError(response, "Failed to request health information"),
        execution,
      );
    }

    final data = execution.response;
    _storeResponse(
      'consentManager.requestHealthInformation',
      data,
      extraValues: {
        'consentManager.healthInfoRequest': data,
        'consentManager.requestId': data['requestId'],
        'consentManager.healthInfoRequest.authContext':
            'backend-gateway-session',
      },
    );
    return ConsentManagerApiResult(data: data, execution: execution);
  }

  static Future<Map<String, dynamic>> fetchOnRequestCallback(
    String requestId,
  ) async {
    final result = await fetchOnRequestCallbackWithMetadata(requestId);
    return result.data;
  }

  static Future<ConsentManagerApiResult> fetchOnRequestCallbackWithMetadata(
    String requestId,
  ) async {
    final url = Uri.parse(
      "${ApiConfig.baseUrl}/m2/consents/manager/callbacks/health-information/on-request/$requestId",
    );
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();
    final response = await ApiDebugHttp.get(url);
    stopwatch.stop();

    final execution = _execution(
      title: 'Health Information On Request Callback',
      method: 'GET',
      url: url,
      headers: const <String, dynamic>{},
      request: {'requestId': requestId},
      response: response,
      startedAt: startedAt,
      duration: stopwatch.elapsed,
    );

    if (response.statusCode != 200) {
      throw ConsentManagerApiException(
        _readableError(
          response,
          "Failed to fetch health-information on-request callback",
        ),
        execution,
      );
    }

    final data = execution.response;
    _storeResponse(
      'consentManager.fetchOnRequestCallback',
      data,
      extraValues: {
        'consentManager.onRequest': data,
        'consentManager.transactionId': data['transactionId'],
      },
    );
    return ConsentManagerApiResult(data: data, execution: execution);
  }

  static Future<Map<String, dynamic>> fetchNotifyCallback(
    String transactionId,
  ) async {
    final response = await ApiDebugHttp.get(
      Uri.parse(
        "${ApiConfig.baseUrl}/m2/consents/manager/callbacks/health-information/notify/$transactionId",
      ),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(
          response,
          "Failed to fetch health-information notify callback",
        ),
      );
    }

    final data = Map<String, dynamic>.from(jsonDecode(response.body));
    _storeResponse(
      'consentManager.fetchNotifyCallback',
      data,
      extraValues: {
        'consentManager.notify': data,
        'consentManager.entries': data['entries'],
        'consentManager.transactionId': transactionId,
      },
    );
    return data;
  }

  static Future<ConsentManagerApiResult> pushHealthInformationDataWithMetadata({
    required String dataPushUrl,
    required Map<String, dynamic> payload,
  }) async {
    final url = Uri.parse(dataPushUrl);
    final headers = {"Content-Type": "application/json"};
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();
    final response = await ApiDebugHttp.post(
      url,
      headers: headers,
      body: jsonEncode(payload),
    );
    stopwatch.stop();

    final execution = _execution(
      title: 'HIU Data Notification',
      method: 'POST',
      url: url,
      headers: headers,
      request: payload,
      response: response,
      startedAt: startedAt,
      duration: stopwatch.elapsed,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ConsentManagerApiException(
        _readableError(response, "Failed to push health information data"),
        execution,
      );
    }

    final data = execution.response;
    _storeResponse(
      'consentManager.pushHealthInformationData',
      data,
      extraValues: {
        'consentManager.dataPushUrl': dataPushUrl,
        'consentManager.dataPushResponse': data,
      },
    );
    return ConsentManagerApiResult(data: data, execution: execution);
  }

  static Future<ConsentManagerApiResult> delegatePushToBackendWithMetadata({
    required String consentId,
    required String transactionId,
    required List<String> recordTypes,
    required String abhaAddress,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/m2/hip/transfer/push");
    final headers = {"Content-Type": "application/json"};
    final payload = {
      'consentId': consentId,
      'transactionId': transactionId,
      'recordTypes': recordTypes,
      'abhaAddress': abhaAddress,
    };
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();
    final response = await ApiDebugHttp.post(
      url,
      headers: headers,
      body: jsonEncode(payload),
    );
    stopwatch.stop();

    final execution = _execution(
      title: 'HIP Transfer Push (Delegate)',
      method: 'POST',
      url: url,
      headers: headers,
      request: payload,
      response: response,
      startedAt: startedAt,
      duration: stopwatch.elapsed,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ConsentManagerApiException(
        _readableError(response, "Failed to delegate transfer push to backend"),
        execution,
      );
    }

    final data = execution.response;
    return ConsentManagerApiResult(data: data, execution: execution);
  }

  static Future<ConsentManagerApiResult>
  notifyHealthInformationTransferWithMetadata(
    Map<String, dynamic> payload,
  ) async {
    final url = Uri.parse(
      "${ApiConfig.baseUrl}/m2/consents/manager/health-information/notify",
    );
    final headers = {"Content-Type": "application/json"};
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();
    final response = await ApiDebugHttp.post(
      url,
      headers: headers,
      body: jsonEncode(payload),
    );
    stopwatch.stop();

    final execution = _execution(
      title: 'HIP Data Flow Notification',
      method: 'POST',
      url: url,
      headers: headers,
      request: {...payload, 'authContext': 'backend-gateway-session'},
      response: response,
      startedAt: startedAt,
      duration: stopwatch.elapsed,
    );

    if (response.statusCode != 200) {
      throw ConsentManagerApiException(
        _readableError(
          response,
          "Failed to notify health information transfer",
        ),
        execution,
      );
    }

    final data = execution.response;
    _storeResponse(
      'consentManager.notifyHealthInformationTransfer',
      data,
      extraValues: {
        'consentManager.transferNotify': data,
        'consentManager.transferNotify.authContext': 'backend-gateway-session',
      },
    );
    return ConsentManagerApiResult(data: data, execution: execution);
  }

  static Future<ConsentManagerApiResult> fetchHipTransferStatusWithMetadata(
    String id,
  ) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/m2/hip/transfer/status/$id");
    final headers = {"Content-Type": "application/json"};
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();
    final response = await ApiDebugHttp.get(url, headers: headers);
    stopwatch.stop();

    final execution = _execution(
      title: 'HIP Transfer Status Check',
      method: 'GET',
      url: url,
      headers: headers,
      request: const <String, dynamic>{},
      response: response,
      startedAt: startedAt,
      duration: stopwatch.elapsed,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ConsentManagerApiException(
        _readableError(
          response,
          "Failed to check transfer status from backend",
        ),
        execution,
      );
    }

    final data = execution.response;
    return ConsentManagerApiResult(data: data, execution: execution);
  }

  static Future<ConsentManagerApiResult> fetchTransferHistoryWithMetadata({
    String? patientId,
  }) async {
    final query = patientId == null || patientId.trim().isEmpty
        ? ''
        : '?patientId=${Uri.encodeQueryComponent(patientId.trim())}';
    final url = Uri.parse("${ApiConfig.baseUrl}/m2/hip/transfer/history$query");
    final headers = {"Content-Type": "application/json"};
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();
    final response = await ApiDebugHttp.get(url, headers: headers);
    stopwatch.stop();

    final execution = _execution(
      title: 'Transfer History',
      method: 'GET',
      url: url,
      headers: headers,
      request: const <String, dynamic>{},
      response: response,
      startedAt: startedAt,
      duration: stopwatch.elapsed,
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ConsentManagerApiException(
        _readableError(response, "Failed to fetch transfer history"),
        execution,
      );
    }

    return ConsentManagerApiResult(
      data: execution.response,
      execution: execution,
    );
  }

  static Future<Map<String, dynamic>> initializeM2TokenManager() async {
    final url = Uri.parse("${ApiConfig.baseUrl}/m2/initialize");
    final headers = {"Content-Type": "application/json"};
    final response = await ApiDebugHttp.post(url, headers: headers);

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to initialize TokenManager"),
      );
    }

    return Map<String, dynamic>.from(jsonDecode(response.body));
  }
}
