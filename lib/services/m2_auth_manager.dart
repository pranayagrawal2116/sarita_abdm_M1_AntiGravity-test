import 'dart:convert';

import 'package:http/http.dart' as http;

import '../utils/api_config.dart';
import '../utils/api_debug_http.dart';
import '../utils/app_runtime_store.dart';
import '../utils/auth_session.dart';

class M2AuthTokens {
  const M2AuthTokens({
    required this.authToken,
    required this.refreshToken,
    required this.abhaAddress,
  });

  final String authToken;
  final String refreshToken;
  final String abhaAddress;
}

class M2AuthenticatedResponse {
  const M2AuthenticatedResponse({
    required this.response,
    required this.requestHeaders,
    required this.tokenRefreshed,
  });

  final http.Response response;
  final Map<String, String> requestHeaders;
  final bool tokenRefreshed;
}

class M2AuthException implements Exception {
  const M2AuthException(this.message);

  final String message;

  @override
  String toString() => message;
}

class M2AuthManager {
  static const Duration _expiryBuffer = Duration(minutes: 2);

  static void provisionFromPatientProfile(Map<String, dynamic> profile) {
    final raw = _asMap(profile['raw']);
    final rawProfile = _asMap(profile['rawProfile']);
    final cardPayload = _asMap(profile['cardPayload']);
    final loggedInProfile = _asMap(profile['loggedInProfile']);
    final profileDetails = _asMap(profile['profileDetails']);
    final tokens = _asMap(profile['tokens']);
    final rawTokens = _asMap(raw['tokens']);
    final rawProfileTokens = _asMap(rawProfile['tokens']);
    final loggedInRawResponse = _asMap(loggedInProfile['rawResponse']);
    final loggedInRawTokens = _asMap(loggedInRawResponse['tokens']);

    final token = _firstUsableJwt([
      AuthSession.currentM2PhrAuthToken,
      cardPayload['sessionToken'],
      cardPayload['token'],
      profile['sessionToken'],
      profile['m2PhrAuthToken'],
      profile['phrAuthToken'],
      profile['authToken'],
      profile['xAuthToken'],
      profile['xToken'],
      raw['sessionToken'],
      rawProfile['sessionToken'],
      profileDetails['sessionToken'],
      loggedInProfile['sessionToken'],
      loggedInRawResponse['sessionToken'],
      tokens['token'],
      tokens['accessToken'],
      rawTokens['token'],
      rawTokens['accessToken'],
      rawProfileTokens['token'],
      rawProfileTokens['accessToken'],
      loggedInRawTokens['token'],
      loggedInRawTokens['accessToken'],
      profile['token'],
      raw['token'],
      rawProfile['token'],
      loggedInProfile['token'],
      loggedInRawResponse['token'],
      profile['accessToken'],
      raw['accessToken'],
      rawProfile['accessToken'],
      loggedInProfile['accessToken'],
      loggedInRawResponse['accessToken'],
    ]);
    final refreshToken = _firstUsableJwt([
      AuthSession.currentM2PhrRefreshToken,
      profile['refreshToken'],
      profile['m2PhrRefreshToken'],
      profile['phrRefreshToken'],
      raw['refreshToken'],
      rawProfile['refreshToken'],
      profileDetails['refreshToken'],
      loggedInProfile['refreshToken'],
      loggedInRawResponse['refreshToken'],
      tokens['refreshToken'],
      rawTokens['refreshToken'],
      rawProfileTokens['refreshToken'],
      loggedInRawTokens['refreshToken'],
      cardPayload['refreshToken'],
    ]);
    final address = _firstNonEmpty([
      profile['preferredAbhaAddress'],
      profile['AbhaAddress'],
      profile['abhaAddress'],
      profile['abhaAddr'],
      raw['preferredAbhaAddress'],
      raw['AbhaAddress'],
      raw['abhaAddress'],
      raw['abhaAddr'],
      rawProfile['preferredAbhaAddress'],
      rawProfile['AbhaAddress'],
      rawProfile['abhaAddress'],
      rawProfile['abhaAddr'],
      profileDetails['preferredAbhaAddress'],
      profileDetails['AbhaAddress'],
      profileDetails['abhaAddress'],
      profileDetails['abhaAddr'],
      loggedInProfile['preferredAbhaAddress'],
      loggedInProfile['AbhaAddress'],
      loggedInProfile['abhaAddress'],
      loggedInRawResponse['preferredAbhaAddress'],
      loggedInRawResponse['AbhaAddress'],
      loggedInRawResponse['abhaAddress'],
      AuthSession.currentM2AbhaAddress,
    ]);

    var finalToken = token;
    var finalRefreshToken = refreshToken;
    var finalAddress = address;

    if (finalToken.isEmpty) {
      finalToken = _findJwtRecursive(profile);
    }
    if (finalRefreshToken.isEmpty) {
      finalRefreshToken = _findRefreshTokenRecursive(profile, finalToken);
    }
    if (finalAddress.isEmpty) {
      finalAddress = _findValueRecursive(profile, ['AbhaAddress', 'abhaAddress', 'preferredAbhaAddress', 'abhaAddr']);
    }

    if (finalToken.isEmpty && finalRefreshToken.isEmpty) return;

    AuthSession.setM2Login(
      token: finalToken,
      address: finalAddress,
      refreshToken: finalRefreshToken.isEmpty ? null : finalRefreshToken,
    );
    AppRuntimeStore.setApiResponse(
      'm2.auth.profileProvision',
      {
        'source': 'patient-profile',
        'hasToken': finalToken.isNotEmpty,
        'hasRefreshToken': finalRefreshToken.isNotEmpty,
        'abhaAddress': finalAddress,
      },
      extraValues: {'m2.auth.generated': true, 'm2.auth.abhaAddress': finalAddress},
    );
  }

  static String _findJwtRecursive(dynamic data) {
    if (data is Map) {
      for (final key in ['sessionToken', 'token', 'accessToken']) {
        if (data.containsKey(key)) {
          final val = data[key]?.toString().trim() ?? '';
          if (val.startsWith('eyJ') && val.contains('.')) {
            return val;
          }
        }
      }
      for (final value in data.values) {
        final res = _findJwtRecursive(value);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is List) {
      for (final element in data) {
        final res = _findJwtRecursive(element);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is String) {
      final val = data.trim();
      if (val.startsWith('eyJ') && val.contains('.')) {
        return val;
      }
    }
    return '';
  }

  static String _findRefreshTokenRecursive(dynamic data, String sessionToken) {
    if (data is Map) {
      for (final key in ['refreshToken', 'refresh_token']) {
        if (data.containsKey(key)) {
          final val = data[key]?.toString().trim() ?? '';
          if (val.isNotEmpty && val != sessionToken) {
            return val;
          }
        }
      }
      for (final value in data.values) {
        final res = _findRefreshTokenRecursive(value, sessionToken);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is List) {
      for (final element in data) {
        final res = _findRefreshTokenRecursive(element, sessionToken);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is String) {
      final val = data.trim();
      if (val.isNotEmpty && val.startsWith('eyJ') && val.contains('.') && val != sessionToken) {
        return val;
      }
    }
    return '';
  }

  static String _findValueRecursive(dynamic data, List<String> keys) {
    if (data is Map) {
      for (final key in keys) {
        if (data.containsKey(key)) {
          final val = data[key]?.toString().trim() ?? '';
          if (val.isNotEmpty) {
            return val;
          }
        }
      }
      for (final value in data.values) {
        final res = _findValueRecursive(value, keys);
        if (res.isNotEmpty) {
          return res;
        }
      }
    } else if (data is List) {
      for (final element in data) {
        final res = _findValueRecursive(element, keys);
        if (res.isNotEmpty) {
          return res;
        }
      }
    }
    return '';
  }

  static Future<M2AuthTokens> ensureValidTokens() async {
    _hydrateFromRuntimeStore();

    var token = AuthSession.currentM2PhrAuthToken?.trim() ?? '';
    var refreshToken = AuthSession.currentM2PhrRefreshToken?.trim() ?? '';
    var address = AuthSession.currentM2AbhaAddress?.trim() ?? '';

    if (token.isEmpty && refreshToken.isEmpty) {
      await _provisionFromRuntimeLoginSession();
      token = AuthSession.currentM2PhrAuthToken?.trim() ?? '';
      refreshToken = AuthSession.currentM2PhrRefreshToken?.trim() ?? '';
      address = AuthSession.currentM2AbhaAddress?.trim() ?? '';
    }

    if (token.isNotEmpty && !_isExpiredOrNearExpiry(token)) {
      return M2AuthTokens(
        authToken: token,
        refreshToken: refreshToken,
        abhaAddress: address,
      );
    }

    if (refreshToken.isNotEmpty) {
      token = await _refreshToken(
        currentToken: token,
        refreshToken: refreshToken,
        abhaAddress: address,
      );
      return M2AuthTokens(
        authToken: token,
        refreshToken: refreshToken,
        abhaAddress: AuthSession.currentM2AbhaAddress?.trim() ?? address,
      );
    }

    throw const M2AuthException(
      'Missing M2 authentication session. Log in again to create an M2 session.',
    );
  }

  static Future<M2AuthenticatedResponse> get(
    Uri url, {
    Map<String, String> headers = const <String, String>{},
  }) {
    return _sendWithAuth(
      method: 'GET',
      url: url,
      headers: headers,
      send: (requestHeaders) => ApiDebugHttp.get(url, headers: requestHeaders),
    );
  }

  static Future<M2AuthenticatedResponse> post(
    Uri url, {
    Map<String, String> headers = const <String, String>{},
    Object? body,
  }) {
    return _sendWithAuth(
      method: 'POST',
      url: url,
      headers: headers,
      send: (requestHeaders) =>
          ApiDebugHttp.post(url, headers: requestHeaders, body: body),
    );
  }

  static Future<M2AuthenticatedResponse> _sendWithAuth({
    required String method,
    required Uri url,
    required Map<String, String> headers,
    required Future<http.Response> Function(Map<String, String> requestHeaders)
    send,
  }) async {
    var tokens = await ensureValidTokens();
    var requestHeaders = _withM2Headers(headers, tokens);
    var response = await send(requestHeaders);

    if (!_shouldRefreshAfterResponse(response)) {
      return M2AuthenticatedResponse(
        response: response,
        requestHeaders: requestHeaders,
        tokenRefreshed: false,
      );
    }

    tokens = await refreshTokens();
    requestHeaders = _withM2Headers(headers, tokens);
    response = await send(requestHeaders);

    AppRuntimeStore.setApiResponse('m2.auth.retry', {
      'method': method,
      'url': url.toString(),
      'statusCode': response.statusCode,
    });

    return M2AuthenticatedResponse(
      response: response,
      requestHeaders: requestHeaders,
      tokenRefreshed: true,
    );
  }

  static Future<M2AuthTokens> refreshTokens() async {
    _hydrateFromRuntimeStore();
    final refreshToken = AuthSession.currentM2PhrRefreshToken?.trim() ?? '';
    if (refreshToken.isEmpty) {
      throw const M2AuthException(
        'Missing M2 refresh token. Cannot refresh M2 session.',
      );
    }

    final token = await _refreshToken(
      currentToken: AuthSession.currentM2PhrAuthToken?.trim() ?? '',
      refreshToken: refreshToken,
      abhaAddress: AuthSession.currentM2AbhaAddress?.trim() ?? '',
    );
    return M2AuthTokens(
      authToken: token,
      refreshToken: refreshToken,
      abhaAddress: AuthSession.currentM2AbhaAddress?.trim() ?? '',
    );
  }

  static Map<String, String> _withM2Headers(
    Map<String, String> headers,
    M2AuthTokens tokens,
  ) {
    return {
      ...headers,
      'X-Auth-Token': tokens.authToken,
      if (tokens.refreshToken.isNotEmpty)
        'X-Refresh-Token': tokens.refreshToken,
    };
  }

  static Future<String> _refreshToken({
    required String currentToken,
    required String refreshToken,
    required String abhaAddress,
  }) async {
    final url = Uri.parse(
      '${ApiConfig.baseUrl}/abha/profile/enrollment/details',
    );
    final shouldSendCurrentToken =
        currentToken.isNotEmpty && !_isExpiredOrNearExpiry(currentToken);
    var response = await ApiDebugHttp.get(
      url,
      headers: {
        if (shouldSendCurrentToken) 'X-Token': currentToken,
        'Refresh-Token': refreshToken,
      },
    );

    if (response.statusCode == 401 &&
        shouldSendCurrentToken &&
        _readableError(response, '').toLowerCase().contains('x-token')) {
      response = await ApiDebugHttp.get(
        url,
        headers: {'Refresh-Token': refreshToken},
      );
    }

    if (response.statusCode != 200) {
      throw M2AuthException(
        _readableError(response, 'Failed to refresh M2 token'),
      );
    }

    final data = _decodeMap(response.body);
    final tokens = data['tokens'] is Map<String, dynamic>
        ? data['tokens'] as Map<String, dynamic>
        : const <String, dynamic>{};
    final nextToken = _firstNonEmpty([
      data['sessionToken'],
      tokens['token'],
      data['token'],
      data['accessToken'],
      currentToken,
    ]);
    if (nextToken.isEmpty) {
      throw const M2AuthException('M2 token refresh returned no token.');
    }

    final nextRefreshToken = _firstNonEmpty([
      tokens['refreshToken'],
      data['refreshToken'],
      refreshToken,
    ]);
    final nextAddress = _firstNonEmpty([
      data['preferredAbhaAddress'],
      data['AbhaAddress'],
      data['abhaAddress'],
      abhaAddress,
    ]);

    AuthSession.setM2Login(
      token: nextToken,
      address: nextAddress,
      refreshToken: nextRefreshToken.isEmpty ? null : nextRefreshToken,
    );
    AppRuntimeStore.setApiResponse(
      'm2.auth.refresh',
      data,
      extraValues: {
        'm2.auth.refreshed': true,
        'm2.auth.abhaAddress': nextAddress,
      },
    );
    return nextToken;
  }

  static void _hydrateFromRuntimeStore() {
    final token = AuthSession.currentM2PhrAuthToken?.trim() ?? '';
    final refreshToken = AuthSession.currentM2PhrRefreshToken?.trim() ?? '';
    if (token.isNotEmpty || refreshToken.isNotEmpty) return;

    final storedToken = _firstUsableJwt([
      AppRuntimeStore.getValue<String>('session.m2.phrAuthToken'),
      AppRuntimeStore.getValue<String>('phr.login.token'),
      AppRuntimeStore.getValue<String>('api.Abha.verifyLoginSession.token'),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.accessToken',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.tokens.token',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.tokens.accessToken',
      ),
      AppRuntimeStore.getValue<String>('Abha.profile.account.sessionToken'),
      AppRuntimeStore.getValue<String>(
        'api.Abha.fetchEnrollmentProfileDetails.sessionToken',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.downloadProfileAccountCard.sessionToken',
      ),
    ]);
    final storedRefresh = _firstUsableJwt([
      AppRuntimeStore.getValue<String>('session.m2.phrRefreshToken'),
      AppRuntimeStore.getValue<String>('phr.login.refreshToken'),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.refreshToken',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.tokens.refreshToken',
      ),
      AppRuntimeStore.getValue<String>('Abha.profile.account.refreshToken'),
      AppRuntimeStore.getValue<String>(
        'api.Abha.fetchEnrollmentProfileDetails.refreshToken',
      ),
    ]);
    final storedAddress = _firstNonEmpty([
      AppRuntimeStore.getValue<String>('session.m2.abhaAddress'),
      AppRuntimeStore.getValue<String>('phr.login.address'),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.preferredAbhaAddress',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.AbhaAddress',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.abhaAddress',
      ),
    ]);

    if (storedToken.isEmpty && storedRefresh.isEmpty) return;
    AuthSession.setM2Login(
      token: storedToken,
      address: storedAddress,
      refreshToken: storedRefresh.isEmpty ? null : storedRefresh,
    );
  }

  static Future<void> _provisionFromRuntimeLoginSession() async {
    final loginToken = _firstUsableJwt([
      AppRuntimeStore.getValue<String>(
        'api.Abha.downloadProfileAccountCard.sessionToken',
      ),
      AppRuntimeStore.getValue<String>('Abha.profile.account.sessionToken'),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.tokens.token',
      ),
      AppRuntimeStore.getValue<String>('api.Abha.verifyLoginSession.token'),
      AppRuntimeStore.getValue<String>('phr.login.token'),
    ]);
    final loginRefreshToken = _firstUsableJwt([
      AppRuntimeStore.getValue<String>('phr.login.refreshToken'),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.tokens.refreshToken',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.refreshToken',
      ),
      AppRuntimeStore.getValue<String>('Abha.profile.account.refreshToken'),
    ]);
    final loginAddress = _firstNonEmpty([
      AppRuntimeStore.getValue<String>('phr.login.address'),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.preferredAbhaAddress',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.AbhaAddress',
      ),
      AppRuntimeStore.getValue<String>(
        'api.Abha.verifyLoginSession.abhaAddress',
      ),
    ]);

    if (loginToken.isEmpty && loginRefreshToken.isEmpty) return;

    if (loginRefreshToken.isNotEmpty) {
      await _refreshToken(
        currentToken: loginToken,
        refreshToken: loginRefreshToken,
        abhaAddress: loginAddress,
      );
      return;
    }

    AuthSession.setM2Login(
      token: loginToken,
      address: loginAddress,
      refreshToken: null,
    );
    AppRuntimeStore.setApiResponse(
      'm2.auth.generate',
      {
        'source': 'runtime-login-session',
        'hasToken': loginToken.isNotEmpty,
        'hasRefreshToken': false,
      },
      extraValues: {
        'm2.auth.generated': true,
        'm2.auth.abhaAddress': loginAddress,
      },
    );
  }

  static bool _shouldRefreshAfterResponse(http.Response response) {
    if (response.statusCode == 401 || response.statusCode == 403) return true;
    final body = response.body.toLowerCase();
    return body.contains('invalid x-token') ||
        body.contains('invalid jwt token') ||
        body.contains('x-token expired') ||
        body.contains('token expired') ||
        body.contains('provided token is invalid');
  }

  static bool _isExpiredOrNearExpiry(String token) {
    final expiry = _jwtExpiry(token);
    if (expiry == null) return false;
    return DateTime.now().toUtc().add(_expiryBuffer).isAfter(expiry);
  }

  static DateTime? _jwtExpiry(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return null;
      final normalized = base64Url.normalize(parts[1]);
      final payload = jsonDecode(utf8.decode(base64Url.decode(normalized)));
      final exp = payload is Map
          ? int.tryParse('${payload['exp'] ?? ''}')
          : null;
      if (exp == null || exp <= 0) return null;
      return DateTime.fromMillisecondsSinceEpoch(exp * 1000, isUtc: true);
    } catch (_) {
      return null;
    }
  }

  static Map<String, dynamic> _decodeMap(String body) {
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

  static String _readableError(http.Response response, String fallback) {
    final data = _decodeMap(response.body);
    final message = data['message'] ?? data['error'] ?? data['details'];
    if (message != null && message.toString().trim().isNotEmpty) {
      return '${message.toString().trim()} (${response.statusCode})';
    }
    return '$fallback (${response.statusCode})';
  }

  static String _firstNonEmpty(Iterable<Object?> values) {
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty && text.toLowerCase() != 'null') return text;
    }
    return '';
  }

  static String _firstUsableJwt(Iterable<Object?> values) {
    String fallback = '';
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isEmpty || text.toLowerCase() == 'null') continue;
      fallback = fallback.isEmpty ? text : fallback;
      if (!_isExpiredOrNearExpiry(text)) return text;
    }
    return fallback;
  }

  static Map<String, dynamic> _asMap(Object? value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return Map<String, dynamic>.from(value);
    return const <String, dynamic>{};
  }
}
