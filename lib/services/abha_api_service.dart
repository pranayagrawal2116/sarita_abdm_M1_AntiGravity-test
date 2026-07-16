import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../utils/api_config.dart';
import '../utils/api_debug_http.dart';
import '../utils/app_runtime_store.dart';
import '../utils/auth_session.dart';
import '../models/abha_profile.dart';

class AbhaApiService {
  static const String invalidOtpMessage =
      'Please enter a valid OTP. Entered OTP is either expired or incorrect.';

  static void _debugLogAadhaarVerificationPayload(String label, dynamic data) {
    if (!kDebugMode) {
      return;
    }

    String payloadText;
    try {
      payloadText = const JsonEncoder.withIndent('  ').convert(data);
    } catch (_) {
      payloadText = data.toString();
    }

    debugPrint('********************************');
    debugPrint('********************************');
    debugPrint('[$label]\n$payloadText');
  }

  static void _debugLogMobileSearchPayload(String label, dynamic data) {
    if (!kDebugMode) {
      return;
    }

    String payloadText;
    try {
      payloadText = const JsonEncoder.withIndent('  ').convert(data);
    } catch (_) {
      payloadText = data.toString();
    }

    debugPrint('********************************');
    debugPrint('********************************');
    debugPrint('[$label]\n$payloadText');
  }

  static dynamic _decodeBody(http.Response response) {
    if (response.body.trim().isEmpty) {
      return {'statusCode': response.statusCode, 'message': 'Empty response'};
    }
    return jsonDecode(response.body);
  }

  static void _storeResponse(
    String key,
    dynamic data, {
    Map<String, dynamic>? extraValues,
  }) {
    AppRuntimeStore.setApiResponse(key, data, extraValues: extraValues);
  }

  static String _firstNonEmpty(Iterable<dynamic> values) {
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty && text.toLowerCase() != 'null') {
        return text;
      }
    }
    return '';
  }

  static bool _looksLikeMobileNumber(String value) {
    final digits = value.replaceAll(RegExp(r'\D'), '');
    return digits.length == 10;
  }

  static bool _looksLikeAbhaNumber(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return false;
    }
    if (trimmed.contains('-')) {
      return true;
    }
    final digits = trimmed.replaceAll(RegExp(r'\D'), '');
    return digits.length > 10;
  }

  static String _resolveBestAbhaNumber(Iterable<dynamic> values) {
    final candidates = values
        .map((value) => value?.toString().trim() ?? '')
        .where((value) => value.isNotEmpty && value.toLowerCase() != 'null')
        .toList(growable: false);

    for (final candidate in candidates) {
      if (_looksLikeAbhaNumber(candidate) &&
          !_looksLikeMobileNumber(candidate)) {
        return candidate;
      }
    }

    for (final candidate in candidates) {
      if (!_looksLikeMobileNumber(candidate)) {
        return candidate;
      }
    }

    return candidates.isEmpty ? '' : candidates.first;
  }

  static Map<String, dynamic> _asMap(dynamic value) {
    if (value is Map<String, dynamic>) {
      return value;
    }
    if (value is Map) {
      return Map<String, dynamic>.from(value);
    }
    return <String, dynamic>{};
  }

  static String _composeName(Map<String, dynamic> data) {
    return _firstNonEmpty([
      data['name'],
      data['fullName'],
      [
        data['fName'],
        data['mName'],
        data['lName'],
      ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' '),
    ]);
  }

  static String _normalizeDateOfBirth(Map<String, dynamic> data) {
    final dob = data['dob'];
    if (dob is Map) {
      final dobMap = Map<String, dynamic>.from(dob);
      final day = _firstNonEmpty([dobMap['d'], dobMap['day']]);
      final month = _firstNonEmpty([dobMap['m'], dobMap['month']]);
      final year = _firstNonEmpty([
        dobMap['y'],
        dobMap['year'],
        data['yob'],
        data['yearOfBirth'],
      ]);
      if (day.isNotEmpty && month.isNotEmpty && year.isNotEmpty) {
        return '$day-$month-$year';
      }
      if (day.isNotEmpty && month.isNotEmpty) {
        return '$day-$month';
      }
    }

    final dayOfBirth = _firstNonEmpty([data['dayOfBirth'], data['day']]);
    final monthOfBirth = _firstNonEmpty([data['monthOfBirth'], data['month']]);
    final yearOfBirth = _firstNonEmpty([
      data['yearOfBirth'],
      data['yob'],
      data['year'],
    ]);
    final hasFullDateOfBirth =
        dayOfBirth.isNotEmpty &&
        monthOfBirth.isNotEmpty &&
        yearOfBirth.isNotEmpty;
    if (hasFullDateOfBirth) {
      return '$dayOfBirth-$monthOfBirth-$yearOfBirth';
    }

    return _firstNonEmpty([
      data['dob'],
      data['dateOfBirth'],
      data['yob'],
      data['yearOfBirth'],
    ]);
  }

  static Map<String, dynamic> _normalizeProfileData(
    Map<String, dynamic> data, {
    Map<String, dynamic>? response,
  }) {
    final addr = _asMap(data['addr']);
    final local = _asMap(data['local']);
    final kyc = _asMap(data['kyc']);
    final source = response ?? data;
    final tokens = _asMap(source['tokens']);
    final resolvedAbhaNumber = _resolveBestAbhaNumber([
      data['healthIdNumber'],
      data['AbhaNumber'],
      data['ABHANumber'],
      data['abhaNumber'],
      data['abhaNo'],
      source['healthIdNumber'],
      source['AbhaNumber'],
      source['ABHANumber'],
      source['abhaNumber'],
      source['abhaNo'],
    ]);
    final preferredAddress = _firstNonEmpty([
      data['preferredAbhaAddress'],
      data['abhaAddr'],
      data['AbhaAddress'],
      data['abhaAddress'],
      source['preferredAbhaAddress'],
      source['abhaAddr'],
      source['AbhaAddress'],
      source['abhaAddress'],
      data['phrAddress'] is List
          ? (data['phrAddress'] as List)
                .map((item) => item?.toString().trim() ?? '')
                .firstWhere((value) => value.isNotEmpty, orElse: () => '')
          : data['phrAddress'],
      source['phrAddress'] is List
          ? (source['phrAddress'] as List)
                .map((item) => item?.toString().trim() ?? '')
                .firstWhere((value) => value.isNotEmpty, orElse: () => '')
          : source['phrAddress'],
    ]);
    final resolvedAddress = _firstNonEmpty([
      data['address'],
      data['addressLine'],
      source['address'],
      source['addressLine'],
      addr['full'],
    ]);
    final resolvedPincode = _firstNonEmpty([
      data['pincode'],
      data['pinCode'],
      source['pincode'],
      source['pinCode'],
      addr['pincode'],
    ]);

    return {
      ...data,
      ...?(response == null ? null : {'rawResponse': response}),
      'txnId': _firstNonEmpty([source['txnId'], data['txnId']]),
      'AbhaNumber': resolvedAbhaNumber,
      'abhaNo': _firstNonEmpty([data['abhaNo'], resolvedAbhaNumber]),
      'preferredAbhaAddress': preferredAddress,
      'AbhaAddress': preferredAddress,
      'abhaAddr': _firstNonEmpty([data['abhaAddr'], preferredAddress]),
      'name': _composeName(data),
      'fullName': _composeName(data),
      'fName': _firstNonEmpty([data['fName'], data['firstName']]),
      'mName': _firstNonEmpty([data['mName'], data['middleName']]),
      'lName': _firstNonEmpty([data['lName'], data['lastName']]),
      'mobile': _firstNonEmpty([
        data['mobile'],
        data['mobileNumber'],
        data['maskedMobile'],
        data['mob'],
        source['mobile'],
      ]),
      'mob': _firstNonEmpty([
        data['mob'],
        data['mobile'],
        data['mobileNumber'],
        data['maskedMobile'],
      ]),
      'gender': _firstNonEmpty([data['gender'], local['gender']]),
      'yearOfBirth': _firstNonEmpty([
        data['yearOfBirth'],
        data['birthYear'],
        data['yob'],
      ]),
      'yob': _firstNonEmpty([data['yob'], data['yearOfBirth']]),
      'dob': _normalizeDateOfBirth(data),
      'dateOfBirth': _normalizeDateOfBirth(data),
      'status': _firstNonEmpty([data['status']]),
      'address': resolvedAddress,
      'pincode': resolvedPincode,
      'pinCode': resolvedPincode,
      'state': _firstNonEmpty([data['state'], addr['state']]),
      'district': _firstNonEmpty([data['district'], addr['district']]),
      'subdistrict': _firstNonEmpty([data['subdistrict'], addr['subdistrict']]),
      'stateCode': _firstNonEmpty([data['stateCode'], addr['stateCode']]),
      'districtCode': _firstNonEmpty([data['districtCode'], addr['distCode']]),
      'photo': _firstNonEmpty([
        data['photo'],
        data['kycPhoto'],
        data['profilePhoto'],
      ]),
      'kycPhoto': _firstNonEmpty([data['kycPhoto'], data['photo']]),
      'profilePhoto': _firstNonEmpty([
        data['profilePhoto'],
        data['photo'],
        data['kycPhoto'],
      ]),
      'verifiedStatus': _firstNonEmpty([data['verifiedStatus'], kyc['status']]),
      'verificationType': _firstNonEmpty([
        data['verificationType'],
        kyc['type'],
      ]),
      'kycVerified': data['kycVerified'] ?? kyc['verified'],
      'kyc': kyc.isNotEmpty ? kyc : data['kyc'],
      'addr': addr.isNotEmpty ? addr : data['addr'],
      'local': local.isNotEmpty ? local : data['local'],
      'auth': data['auth'],
      'created': _firstNonEmpty([data['created']]),
      'token': _firstNonEmpty([
        source['sessionToken'],
        source['token'],
        source['accessToken'],
        tokens['token'],
        tokens['accessToken'],
      ]),
      'sessionToken': _firstNonEmpty([
        source['sessionToken'],
        source['token'],
        source['accessToken'],
        tokens['token'],
        tokens['accessToken'],
      ]),
      'refreshToken': _firstNonEmpty([
        source['refreshToken'],
        tokens['refreshToken'],
      ]),
    };
  }

  static String _readableError(http.Response response, String fallback) {
    try {
      final data = jsonDecode(response.body);
      if (data is Map<String, dynamic>) {
        final bufferTypeValue = data['type'];
        final bufferBytesValue = data['data'];
        final isBufferPayload =
            bufferTypeValue == 'Buffer' && bufferBytesValue is List;
        if (isBufferPayload) {
          try {
            final bufferBytes = bufferBytesValue.cast<int>();
            final bufferText = utf8.decode(bufferBytes).trim();
            if (bufferText.isNotEmpty) {
              try {
                final decodedBufferPayload = jsonDecode(bufferText);
                if (decodedBufferPayload is Map<String, dynamic>) {
                  final decodedMessage =
                      decodedBufferPayload['message'] ??
                      decodedBufferPayload['error'] ??
                      decodedBufferPayload['details'] ??
                      decodedBufferPayload['detail'];
                  if (decodedMessage is String &&
                      decodedMessage.trim().isNotEmpty) {
                    return userFacingError(decodedMessage, fallback: fallback);
                  }
                }
              } catch (_) {}
              return userFacingError(bufferText, fallback: fallback);
            }
          } catch (_) {}
        }

        final nestedError = data['error'];
        final nestedErrorMessage = nestedError is Map<String, dynamic>
            ? nestedError['message'] ?? nestedError['detail']
            : null;
        final message =
            data['message'] ??
            nestedErrorMessage ??
            data['error'] ??
            data['details'] ??
            data['detail'];
        if (message is String && message.trim().isNotEmpty) {
          return userFacingError(message, fallback: fallback);
        }

        final fieldMessages = data.values
            .whereType<String>()
            .map((value) => value.trim())
            .where((value) => value.isNotEmpty)
            .toList();
        if (fieldMessages.isNotEmpty) {
          return userFacingError(fieldMessages.join(", "), fallback: fallback);
        }
      }

      if (data is List) {
        final listMessages = data
            .whereType<Map>()
            .map((item) => item['message'])
            .whereType<String>()
            .map((value) => value.trim())
            .where((value) => value.isNotEmpty)
            .toList();
        if (listMessages.isNotEmpty) {
          return userFacingError(listMessages.join(", "), fallback: fallback);
        }
      }
    } catch (_) {}

    return userFacingError(
      "$fallback (${response.statusCode})",
      fallback: fallback,
    );
  }

  static String readableErrorFromBody(Object? body, String fallback) {
    if (body is Map<String, dynamic>) {
      final nestedError = body['error'];
      final nestedErrorMessage = nestedError is Map<String, dynamic>
          ? nestedError['message'] ?? nestedError['detail']
          : null;
      final message =
          body['message'] ??
          nestedErrorMessage ??
          body['error'] ??
          body['details'] ??
          body['detail'];
      if (message is String && message.trim().isNotEmpty) {
        return userFacingError(message, fallback: fallback);
      }

      final fieldMessages = body.values
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toList();
      if (fieldMessages.isNotEmpty) {
        return userFacingError(fieldMessages.join(", "), fallback: fallback);
      }
    }

    if (body is List) {
      final listMessages = body
          .whereType<Map>()
          .map((item) => item['message'])
          .whereType<String>()
          .map((value) => value.trim())
          .where((value) => value.isNotEmpty)
          .toList();
      if (listMessages.isNotEmpty) {
        return userFacingError(listMessages.join(", "), fallback: fallback);
      }
    }

    return userFacingError(fallback, fallback: fallback);
  }

  static String userFacingError(Object? error, {String fallback = ''}) {
    final rawText = error?.toString() ?? '';
    final cleanedText = rawText
        .replaceFirst(RegExp(r'^Exception:\s*'), '')
        .trim();
    final normalizedText = _normalizeOtpError(cleanedText);
    if (normalizedText.isNotEmpty) {
      return normalizedText;
    }

    final fallbackText = fallback.trim();
    if (fallbackText.isNotEmpty) {
      return fallbackText;
    }

    return cleanedText;
  }

  static String _normalizeOtpError(String message) {
    final trimmedMessage = message.trim();
    if (trimmedMessage.isEmpty) {
      return '';
    }

    final lowerMessage = trimmedMessage.toLowerCase();
    final mentionsInvalidMobileNumber =
        lowerMessage.contains('invalid mobile number') ||
        lowerMessage.contains(
          'communication mobile number must be 10 digits',
        ) ||
        lowerMessage.contains('mobile number must be 10 digits');
    if (mentionsInvalidMobileNumber) {
      return 'Invalid mobile number. Please enter a valid number.';
    }

    final mentionsInvalidLoginId =
        lowerMessage.contains('invalid loginid') ||
        lowerMessage.contains('invalid login id');
    if (mentionsInvalidLoginId) {
      return 'Please enter a valid Aadhar number, Aadhar does not exists';
    }

    final exceededOtpAttempts =
        lowerMessage.contains('multiple otps') ||
        lowerMessage.contains('exceeded maximum number of attempts') ||
        lowerMessage.contains('abdm-1100');
    if (exceededOtpAttempts) {
      return 'You have requested multiple OTPs Or Exceeded maximum number of attempts for OTP match in this transaction. Please try again in 30 minutes.';
    }

    final mentionsOtp = lowerMessage.contains('otp');
    final invalidOtp =
        lowerMessage.contains('expired') ||
        lowerMessage.contains('incorrect') ||
        lowerMessage.contains('wrong otp') ||
        lowerMessage.contains('invalid otp') ||
        lowerMessage.contains('invalid otpvalue') ||
        lowerMessage.contains('otpvalue invalid');
    final genericOtpFailure =
        lowerMessage.contains('otp verification failed') ||
        lowerMessage.contains('otp validation failed') ||
        lowerMessage.contains('failed to verify otp') ||
        lowerMessage.contains('otp failed') ||
        lowerMessage.contains('(422)');

    if (mentionsOtp && (invalidOtp || genericOtpFailure)) {
      return invalidOtpMessage;
    }

    return trimmedMessage;
  }

  // --------------------------------------------------
  // 1️⃣ REQUEST OTP (AADHAAR)
  // --------------------------------------------------
  static Future<String> requestOtp(String aadhaar) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/request-otp");
    final cleanedAadhaar = aadhaar.replaceAll(RegExp(r"\s+"), "");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"aadhaar": cleanedAadhaar}),
    );

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to request OTP"));
    }

    final data = _decodeBody(response);
    _storeResponse(
      'Abha.requestOtp',
      data,
      extraValues: {
        'Abha.aadhaar.requestOtp.txnId': data is Map ? data['txnId'] : null,
      },
    );
    return data['txnId'];
  }

  // --------------------------------------------------
  // 2️⃣ VERIFY OTP & CREATE Abha
  // --------------------------------------------------
  static Future<AbhaProfile> verifyOtp({
    required String txnId,
    required String otp,
    String? mobile,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/verify-otp");
    final cleanedOtp = otp.replaceAll(RegExp(r"\s+"), "");
    final cleanedMobile = mobile?.replaceAll(RegExp(r"\s+"), "");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "txnId": txnId,
        "otp": cleanedOtp,
        if (cleanedMobile != null && cleanedMobile.isNotEmpty)
          "mobile": cleanedMobile,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "OTP verification failed"));
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    final apiProfileSource = data['ABHAProfile'] ??
        data['AbhaProfile'] ??
        data['EnrolProfile'] ??
        data['enrolProfile'] ??
        data['profile'] ??
        data;
    final profileJson = _normalizeProfileData(
      _asMap(apiProfileSource),
      response: data,
    );
    _storeResponse(
      'Abha.verifyOtp',
      data,
      extraValues: {
        'Abha.profile': profileJson,
        'Abha.profile.txnId': profileJson['txnId'],
        'Abha.verifyOtp.isNew': data['isNew'],
        'Abha.profile.AbhaNumber': profileJson['AbhaNumber'],
        'Abha.profile.AbhaAddress': profileJson['preferredAbhaAddress'],
        'Abha.enrollment.xToken': (data['tokens'] is Map<String, dynamic>)
            ? (data['tokens']['token'] ??
                  data['tokens']['accessToken'] ??
                  data['token'] ??
                  data['accessToken'])
            : (data['token'] ?? data['accessToken']),
        'Abha.enrollment.refreshToken': (data['tokens'] is Map<String, dynamic>)
            ? (data['tokens']['refreshToken'] ?? data['refreshToken'])
            : data['refreshToken'],
        'Abha.create.enrollment.xToken':
            (data['tokens'] is Map<String, dynamic>)
            ? (data['tokens']['token'] ??
                  data['tokens']['accessToken'] ??
                  data['token'] ??
                  data['accessToken'])
            : (data['token'] ?? data['accessToken']),
        'Abha.create.enrollment.refreshToken':
            (data['tokens'] is Map<String, dynamic>)
            ? (data['tokens']['refreshToken'] ?? data['refreshToken'])
            : data['refreshToken'],
      },
    );

    return AbhaProfile.fromJson(profileJson);
  }

  // --------------------------------------------------
  // 3️⃣ CHECK Abha ADDRESS (PHR)
  // --------------------------------------------------
  static Future<bool> checkPhrAvailability(String phrAddress) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/phr/check");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phrAddress": phrAddress}),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to check PHR availability"),
      );
    }

    final data = _decodeBody(response);
    _storeResponse(
      'Abha.checkPhrAvailability',
      data,
      extraValues: {'phr.availability.last': data},
    );
    return data['available'] == true;
  }

  static Future<List<String>> getPhrSuggestions(String txnId) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/phr/suggestions");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"txnId": txnId}),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to fetch Abha address suggestions"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.getPhrSuggestions',
      data,
      extraValues: {
        'phr.suggestions': data['AbhaAddressList'] ?? data['abhaAddressList'],
      },
    );
    return ((data['AbhaAddressList'] ?? data['abhaAddressList']) as List? ??
            const [])
        .map((item) => item.toString())
        .toList();
  }

  static Future<Map<String, dynamic>> getPhrSuggestionsPayload(
    String txnId,
  ) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/phr/suggestions");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"txnId": txnId}),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to fetch Abha address suggestions"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.getPhrSuggestionsPayload',
      data,
      extraValues: {'phr.suggestionsPayload': data},
    );
    return data;
  }

  // --------------------------------------------------
  // 4️⃣ LINK Abha ADDRESS (PHR)
  // --------------------------------------------------
  static Future<void> linkPhrAddress({
    required String phrAddress,
    required String txnId,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/phr/link");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phrAddress": phrAddress, "txnId": txnId}),
    );

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to link Abha address"));
    }

    final data = _decodeBody(response);
    _storeResponse(
      'Abha.linkPhrAddress',
      data,
      extraValues: {'phr.linkedAddress': phrAddress, 'phr.link.txnId': txnId},
    );
  }

  // --------------------------------------------------
  // ⚠️ OPTIONAL: LOGIN (ONLY IF BACKEND SUPPORTS)
  // --------------------------------------------------

  static Future<Map<String, dynamic>> searchLoginAuthMethods(
    String phrAddress,
  ) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/login/search");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phrAddress": phrAddress}),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to search Abha address"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.searchLoginAuthMethods',
      data,
      extraValues: {'phr.login.searchAddress': phrAddress},
    );
    return data;
  }

  static Future<String> requestLoginOtp(
    String phrAddress, {
    required String otpMethod,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/login/request-otp");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"phrAddress": phrAddress, "otpMethod": otpMethod}),
    );

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to request login OTP"));
    }

    final data = _decodeBody(response);
    _storeResponse(
      'Abha.requestLoginOtp',
      data,
      extraValues: {
        'phr.login.txnId': data is Map ? data['txnId'] : null,
        'phr.login.address': phrAddress,
        'phr.login.otpMethod': otpMethod,
      },
    );
    return data['txnId'];
  }

  static Future<Map<String, dynamic>> verifyLoginSession({
    required String txnId,
    required String otp,
    required String phrAddress,
    required String otpMethod,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/login/verify-otp");

    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "txnId": txnId,
        "otp": otp,
        "phrAddress": phrAddress,
        "otpMethod": otpMethod,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Login OTP verification failed"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    final tokens = (data['tokens'] is Map<String, dynamic>)
        ? data['tokens'] as Map<String, dynamic>
        : <String, dynamic>{};
    _storeResponse(
      'Abha.verifyLoginSession',
      data,
      extraValues: {
        'phr.login.session': data,
        'phr.login.token':
            tokens['token'] ?? data['token'] ?? data['accessToken'],
        'phr.login.refreshToken':
            tokens['refreshToken'] ?? data['refreshToken'],
        'phr.login.address': phrAddress,
        'phr.login.otpMethod': otpMethod,
      },
    );

    return {
      'token': tokens['token'] ?? data['token'] ?? data['accessToken'] ?? '',
      'refreshToken': tokens['refreshToken'] ?? data['refreshToken'] ?? '',
      'expiresIn': tokens['expiresIn'] ?? data['expiresIn'],
      'refreshExpiresIn':
          tokens['refreshExpiresIn'] ?? data['refreshExpiresIn'],
      'raw': data,
    };
  }

  static Future<String> verifyLoginOtp({
    required String txnId,
    required String otp,
    required String phrAddress,
    required String otpMethod,
  }) async {
    final session = await verifyLoginSession(
      txnId: txnId,
      otp: otp,
      phrAddress: phrAddress,
      otpMethod: otpMethod,
    );
    return session['token']?.toString() ?? '';
  }

  static Future<Map<String, dynamic>> fetchLoggedInProfile() async {
    final token = AuthSession.m1PhrAuthToken;
    if (token == null || token.trim().isEmpty) {
      throw Exception("Missing login session. Please log in again.");
    }

    final url = Uri.parse("${ApiConfig.baseUrl}/abha/profile/me");
    final response = await ApiDebugHttp.get(url, headers: {"X-Token": token});

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to fetch profile"));
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    final normalized = _normalizeProfileData(data, response: data);
    _storeResponse(
      'Abha.fetchLoggedInProfile',
      data,
      extraValues: {'phr.profile': normalized},
    );
    return normalized;
  }

  static Future<Map<String, dynamic>> fetchEnrollmentProfileDetails({
    required String xToken,
    String? refreshToken,
  }) async {
    final url = Uri.parse(
      "${ApiConfig.baseUrl}/abha/profile/enrollment/details",
    );
    final response = await ApiDebugHttp.get(
      url,
      headers: {
        "X-Token": xToken.trim(),
        if (refreshToken != null && refreshToken.trim().isNotEmpty)
          "Refresh-Token": refreshToken.trim(),
      },
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to fetch enrollment profile details"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    final normalized = _normalizeProfileData(data, response: data);
    _storeResponse(
      'Abha.fetchEnrollmentProfileDetails',
      data,
      extraValues: {
        'Abha.enrollment.profileDetails': normalized,
        'Abha.profile.account.sessionToken':
            normalized['sessionToken'] ?? data['sessionToken'] ?? xToken,
        'Abha.profile.account.refreshToken':
            normalized['refreshToken'] ?? data['refreshToken'] ?? refreshToken,
      },
    );
    return normalized;
  }

  static Future<Map<String, dynamic>> downloadPhrCard() async {
    final token = AuthSession.m1PhrAuthToken;
    if (token == null || token.trim().isEmpty) {
      throw Exception("Missing login session. Please log in again.");
    }
    return downloadPhrCardWithToken(xToken: token);
  }

  static Future<Map<String, dynamic>> downloadPhrCardWithToken({
    required String xToken,
  }) async {
    final normalizedToken = xToken.trim();
    if (normalizedToken.isEmpty) {
      throw Exception("Missing login session. Please log in again.");
    }

    final url = Uri.parse("${ApiConfig.baseUrl}/abha/profile/phr-card");
    final response = await ApiDebugHttp.get(
      url,
      headers: {"X-Token": normalizedToken},
    );

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to download Abha card"));
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.downloadPhrCard',
      data,
      extraValues: {'phr.card': data, 'phr.login.token': normalizedToken},
    );
    return data;
  }

  static Future<Map<String, dynamic>> downloadProfileAccountCard({
    required String xToken,
    String? refreshToken,
  }) async {
    if (xToken.trim().isEmpty) {
      throw Exception("Missing Abha session token.");
    }

    final url = Uri.parse("${ApiConfig.baseUrl}/abha/profile/account-card");
    final response = await ApiDebugHttp.get(
      url,
      headers: {
        "X-Token": xToken.trim(),
        if (refreshToken != null && refreshToken.trim().isNotEmpty)
          "Refresh-Token": refreshToken.trim(),
      },
    );

    if (response.statusCode != 200) {
      throw Exception(_readableError(response, "Failed to download Abha card"));
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.downloadProfileAccountCard',
      data,
      extraValues: {
        'phr.card': data,
        'Abha.profile.account.sessionToken': data['sessionToken'] ?? xToken,
      },
    );
    return data;
  }

  static Future<Map<String, dynamic>> requestProfileMobileUpdateOtp({
    required String txnId,
    required String mobile,
    required String xToken,
    String? refreshToken,
  }) async {
    final url = Uri.parse(
      "${ApiConfig.baseUrl}/abha/profile/update-mobile/request-otp",
    );
    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "txnId": txnId.trim(),
        "mobile": mobile.replaceAll(RegExp(r"\s+"), ""),
        "xToken": xToken.trim(),
        if (refreshToken != null && refreshToken.trim().isNotEmpty)
          "refreshToken": refreshToken.trim(),
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to request mobile update OTP"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.requestProfileMobileUpdateOtp',
      data,
      extraValues: {
        'Abha.profile.updateMobile.txnId': data['txnId'],
        'Abha.profile.updateMobile.enrollmentTxnId': txnId,
        'Abha.profile.updateMobile.mobile': mobile,
        'Abha.profile.updateMobile.sessionToken': data['sessionToken'],
      },
    );
    return data;
  }

  static Future<Map<String, dynamic>> verifyProfileMobileUpdateOtp({
    required String txnId,
    required String otp,
    required String xToken,
    String? refreshToken,
  }) async {
    final url = Uri.parse(
      "${ApiConfig.baseUrl}/abha/profile/update-mobile/verify-otp",
    );
    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "txnId": txnId,
        "otp": otp.replaceAll(RegExp(r"\s+"), ""),
        "xToken": xToken.trim(),
        if (refreshToken != null && refreshToken.trim().isNotEmpty)
          "refreshToken": refreshToken.trim(),
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to verify mobile update OTP"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.verifyProfileMobileUpdateOtp',
      data,
      extraValues: {'Abha.profile.updateMobile.result': data},
    );
    return data;
  }

  static Future<Map<String, dynamic>> updateProfileAccount({
    required String abhaNumber,
    required String mobile,
    required String address,
    String? xToken,
    String? refreshToken,
    String? stateCode,
    String? districtCode,
    String? pinCode,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/profile/account");
    final normalizedAbhaNumber = abhaNumber.replaceAll(RegExp(r'[^0-9]'), '');
    final response = await ApiDebugHttp.patch(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "AbhaNumber": normalizedAbhaNumber,
        "mobile": mobile.replaceAll(RegExp(r"\s+"), ""),
        "address": address.trim(),
        if (xToken != null && xToken.trim().isNotEmpty) "xToken": xToken.trim(),
        if (refreshToken != null && refreshToken.trim().isNotEmpty)
          "refreshToken": refreshToken.trim(),
        if (stateCode != null && stateCode.trim().isNotEmpty)
          "stateCode": stateCode.trim(),
        if (districtCode != null && districtCode.trim().isNotEmpty)
          "districtCode": districtCode.trim(),
        if (pinCode != null && pinCode.trim().isNotEmpty)
          "pinCode": pinCode.trim(),
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to update Abha account"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.updateProfileAccount',
      data,
      extraValues: {'Abha.profile.updateAccount': data},
    );
    return data;
  }

  static Future<String> requestVerificationOtp({
    required String identifierType,
    required String identifierValue,
    String? otpMethod,
    String? xToken,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/verification/request-otp");
    final requestIdentifierType = identifierType;
    final requestIdentifierValue = identifierValue;
    final requestOtpMethod = otpMethod;
    final requestXToken = xToken;
    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "identifierType": requestIdentifierType,
        "identifierValue": requestIdentifierValue,
        if (requestOtpMethod != null && requestOtpMethod.trim().isNotEmpty)
          "otpMethod": requestOtpMethod.trim(),
        if (requestXToken != null && requestXToken.trim().isNotEmpty)
          "xToken": requestXToken.trim(),
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to request verification OTP"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    if (requestIdentifierType.trim().toUpperCase() == 'AADHAAR_NUMBER') {
      _debugLogAadhaarVerificationPayload(
        'Aadhaar Verification Request OTP API',
        data,
      );
    }
    _storeResponse(
      'Abha.requestVerificationOtp',
      data,
      extraValues: {
        'Abha.verification.txnId': data['txnId'],
        'Abha.verification.identifierType': requestIdentifierType,
        'Abha.verification.identifierValue': requestIdentifierValue,
        'Abha.verification.otpMethod': requestOtpMethod,
      },
    );
    return data['txnId']?.toString() ?? '';
  }

  static Future<Map<String, dynamic>> verifyRegistrationOtp({
    required String identifierType,
    required String identifierValue,
    required String txnId,
    required String otp,
    String? otpMethod,
    String? xToken,
  }) async {
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/verification/verify-otp");
    final requestIdentifierType = identifierType;
    final requestIdentifierValue = identifierValue;
    final requestTxnId = txnId;
    final requestOtp = otp;
    final requestOtpMethod = otpMethod;
    final requestXToken = xToken;
    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "identifierType": requestIdentifierType,
        "identifierValue": requestIdentifierValue,
        "txnId": requestTxnId,
        "otp": requestOtp,
        if (requestOtpMethod != null && requestOtpMethod.trim().isNotEmpty)
          "otpMethod": requestOtpMethod.trim(),
        if (requestXToken != null && requestXToken.trim().isNotEmpty)
          "xToken": requestXToken.trim(),
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to verify registration OTP"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    if (requestIdentifierType.trim().toUpperCase() == 'AADHAAR_NUMBER') {
      _debugLogAadhaarVerificationPayload(
        'Aadhaar Verification Verify OTP API',
        data,
      );
    }
    _storeResponse(
      'Abha.verifyRegistrationOtp',
      data,
      extraValues: {
        'Abha.verification.result': data,
        'Abha.verification.identifierType': requestIdentifierType,
        'Abha.verification.identifierValue': requestIdentifierValue,
        'Abha.verification.otpMethod': requestOtpMethod,
      },
    );
    return data;
  }

  static Future<Map<String, dynamic>> verifyMobileLinkedUser({
    required String txnId,
    required String abhaNumber,
    required String transferToken,
  }) async {
    final normalizedAbhaNumber = abhaNumber.trim();
    final url = Uri.parse(
      "${ApiConfig.baseUrl}/abha/verification/mobile/verify-user",
    );
    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({
        "txnId": txnId,
        "AbhaNumber": normalizedAbhaNumber,
        "transferToken": transferToken,
      }),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to verify selected Abha user"),
      );
    }

    final data = Map<String, dynamic>.from(_decodeBody(response) as Map);
    _storeResponse(
      'Abha.verifyMobileLinkedUser',
      data,
      extraValues: {
        'Abha.mobile.verifyUser': data,
        'Abha.mobile.selectedAbhaNumber': normalizedAbhaNumber,
        'Abha.mobile.sessionToken': _firstNonEmpty([
          data['sessionToken'],
          data['token'],
          data['accessToken'],
        ]),
      },
    );
    return data;
  }

  static Future<Map<String, dynamic>> searchAbhaByMobile(String mobile) async {
    final normalizedMobile = mobile.replaceAll(RegExp(r'\D'), '');
    final url = Uri.parse("${ApiConfig.baseUrl}/abha/search/mobile");
    final response = await ApiDebugHttp.post(
      url,
      headers: {"Content-Type": "application/json"},
      body: jsonEncode({"mobile": normalizedMobile}),
    );

    if (response.statusCode != 200) {
      throw Exception(
        _readableError(response, "Failed to search ABHA records"),
      );
    }

    final decoded = _decodeBody(response);
    final data = decoded is Map<String, dynamic>
        ? Map<String, dynamic>.from(decoded)
        : decoded is Map
        ? Map<String, dynamic>.from(decoded)
        : <String, dynamic>{'results': decoded};
    _debugLogMobileSearchPayload('Mobile Search API Response', decoded);
    _storeResponse(
      'Abha.searchAbhaByMobile',
      data,
      extraValues: {
        'Abha.search.mobile': normalizedMobile,
        'Abha.search.mobileResult': data,
      },
    );
    return data;
  }
}
