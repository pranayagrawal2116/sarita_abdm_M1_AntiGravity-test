import 'dart:convert';
import 'package:http/http.dart' as http;
import '../utils/api_config.dart';
import '../utils/app_runtime_store.dart';
import '../utils/consent_mode.dart';
import '../models/consent_request.dart';

class ConsentApiExecution {
  ConsentApiExecution({
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

class ConsentRequestsResult {
  ConsentRequestsResult({required this.items, required this.execution});

  final List<ConsentRequest> items;
  final ConsentApiExecution execution;
}

class ConsentDecisionResult {
  ConsentDecisionResult({
    required this.consentArtefactId,
    required this.execution,
  });

  final String consentArtefactId;
  final ConsentApiExecution execution;
}

class ConsentApiException implements Exception {
  ConsentApiException(this.message, this.execution);

  final String message;
  final ConsentApiExecution execution;

  @override
  String toString() => message;
}

class ConsentApiService {
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

  static Future<List<ConsentRequest>> fetchConsentRequests({
    ConsentMode mode = ConsentMode.currentDefault,
  }) async {
    final result = await fetchConsentRequestsWithMetadata(mode: mode);
    return result.items;
  }

  static Future<ConsentRequestsResult> fetchConsentRequestsWithMetadata({
    ConsentMode mode = ConsentMode.currentDefault,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/m2/consents/requests");
    final syncUrl = Uri.parse("${ApiConfig.baseUrl}/m2/consents/sync");
    final headers = {"X-Consent-Mode": mode.apiValue};
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();

    final syncResponse = await http.post(syncUrl, headers: headers);
    Map<String, dynamic> syncData = {};
    try {
      final decoded = syncResponse.body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(syncResponse.body);
      syncData = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{'data': decoded};
    } catch (_) {
      syncData = {'body': syncResponse.body};
    }
    if (syncResponse.statusCode != 200) {
      stopwatch.stop();
      final execution = ConsentApiExecution(
        title: 'Consent Inbox Sync',
        method: 'POST',
        url: syncUrl.toString(),
        headers: _consoleHeaders(headers),
        request: {
          'method': 'POST',
          'url': syncUrl.toString(),
          'mode': mode.apiValue,
          'm2Backend': {'manager': 'M2ConsentManager'},
        },
        response: syncData,
        statusCode: syncResponse.statusCode,
        duration: stopwatch.elapsed,
        timestamp: startedAt,
      );
      throw ConsentApiException(
        _readableError(syncResponse, "Failed to synchronize consents"),
        execution,
      );
    }

    final response = await http.get(url, headers: headers);
    stopwatch.stop();

    Map<String, dynamic> responseData = {};
    try {
      final decoded = response.body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
      responseData = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{'data': decoded};
    } catch (_) {
      responseData = {'body': response.body};
    }

    final execution = ConsentApiExecution(
      title: 'Consent Inbox Fetch',
      method: 'GET',
      url: url.toString(),
      headers: _consoleHeaders(headers),
      request: {
        'method': 'GET',
        'url': url.toString(),
        'mode': mode.apiValue,
        'm2Backend': {'manager': 'M2ConsentManager'},
        'sync': {
          'method': 'POST',
          'url': syncUrl.toString(),
          'statusCode': syncResponse.statusCode,
          'response': syncData,
        },
        'query': const <String, dynamic>{},
      },
      response: responseData,
      statusCode: response.statusCode,
      duration: stopwatch.elapsed,
      timestamp: startedAt,
    );

    if (response.statusCode != 200) {
      throw ConsentApiException(
        _readableError(response, "Failed to fetch consents"),
        execution,
      );
    }

    final data = responseData;
    AppRuntimeStore.setApiResponse(
      'consent.fetchConsentRequests',
      data,
      extraValues: {
        'consent.requests': data['consents'],
        'consent.mode': mode.apiValue,
        'consent.inbox.statusCode': response.statusCode,
        'consent.inbox.durationMs': stopwatch.elapsedMilliseconds,
        'consent.inbox.source': data['source'] ?? 'M2ConsentManager',
        'consent.inbox.sync': syncData,
      },
    );
    final items = (data['consents'] as List)
        .map((e) => ConsentRequest.fromJson(e))
        .toList();
    return ConsentRequestsResult(items: items, execution: execution);
  }

  static Future<String> submitConsentDecision(
    String consentId,
    String decision, {
    Map<String, dynamic>? raw,
    ConsentMode mode = ConsentMode.currentDefault,
  }) async {
    final result = await submitConsentDecisionWithMetadata(
      consentId,
      decision,
      raw: raw,
      mode: mode,
    );
    return result.consentArtefactId;
  }

  static Future<ConsentDecisionResult> submitConsentDecisionWithMetadata(
    String consentId,
    String decision, {
    Map<String, dynamic>? raw,
    ConsentMode mode = ConsentMode.currentDefault,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/m2/consents/decision");
    final headers = {
      "Content-Type": "application/json",
      "X-Consent-Mode": mode.apiValue,
    };
    final payload = {
      "consentId": consentId,
      "decision": decision,
      if (raw != null && raw.isNotEmpty) "raw": raw,
    };
    final startedAt = DateTime.now();
    final stopwatch = Stopwatch()..start();

    final response = await http.post(
      url,
      headers: headers,
      body: jsonEncode(payload),
    );
    stopwatch.stop();

    Map<String, dynamic> responseData = {};
    try {
      final decoded = response.body.trim().isEmpty
          ? <String, dynamic>{}
          : jsonDecode(response.body);
      responseData = decoded is Map<String, dynamic>
          ? decoded
          : <String, dynamic>{'data': decoded};
    } catch (_) {
      responseData = {'body': response.body};
    }

    final execution = ConsentApiExecution(
      title: 'Consent Decision',
      method: 'POST',
      url: url.toString(),
      headers: _consoleHeaders(headers),
      request: {
        ...payload,
        'm2Backend': {'manager': 'M2ConsentManager'},
      },
      response: responseData,
      statusCode: response.statusCode,
      duration: stopwatch.elapsed,
      timestamp: startedAt,
    );

    if (response.statusCode != 200) {
      throw ConsentApiException(
        _readableError(response, "Failed to submit consent decision"),
        execution,
      );
    }

    final data = responseData;
    AppRuntimeStore.setApiResponse(
      'consent.submitConsentDecision',
      data,
      extraValues: {
        'consent.lastDecision.consentId': consentId,
        'consent.lastDecision.decision': decision,
        'consent.lastDecision.artefactId': data['consentArtefactId']
            ?.toString(),
        'consent.lastDecision.statusCode': response.statusCode,
        'consent.lastDecision.durationMs': stopwatch.elapsedMilliseconds,
      },
    );
    return ConsentDecisionResult(
      consentArtefactId: data['consentArtefactId']?.toString() ?? '',
      execution: execution,
    );
  }

  static Map<String, dynamic> _consoleHeaders(Map<String, String> headers) {
    return headers.map((key, value) {
      final lower = key.toLowerCase();
      if (lower == 'x-auth-token' || lower == 'x-refresh-token') {
        return MapEntry(key, value.trim().isEmpty ? '' : '<redacted>');
      }
      return MapEntry(key, value);
    });
  }
}
