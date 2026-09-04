import 'dart:async';
import 'dart:io';
import 'dart:convert';
import 'dart:math';

import '../config/hospital_config.dart';
import '../services/hip_linking_api_service.dart';
import '../utils/app_runtime_store.dart';
import '../utils/draft_helper.dart';
import 'package:flutter/foundation.dart';

typedef HipLinkingStepListener = void Function(Map<String, dynamic> run);

class HipLinkingWorkflowService {
  HipLinkingWorkflowService._();

  static final Set<String> _activeLinkingPatients = <String>{};

  static const Duration stepDelay = Duration(seconds: 5);
  static const int maxNotFoundAttempts = 3;
  static const Duration callbackPollDelay = Duration(seconds: 3);
  static const int maxCallbackPollAttempts = 20;

  static Future<Map<String, dynamic>> runRecordLinking({
    required Map<String, dynamic> patientProfile,
    required String selectedHiType,
    required String formattedRecordText,
    HipLinkingStepListener? onUpdate,
  }) async {
    final abhaAddress = _abhaAddress(patientProfile).toLowerCase();
    if (_activeLinkingPatients.contains(abhaAddress)) {
      throw Exception('A linking workflow is already active for this patient.');
    }
    _activeLinkingPatients.add(abhaAddress);

    try {
      final apiHiType = _apiHiType(selectedHiType);
      final tokenFilePath = _tokenFilePathForPatient(patientProfile);
      final run = <String, dynamic>{
        'startedAt': DateTime.now().toIso8601String(),
        'completedAt': null,
        'status': 'running',
        'patientName': _patientName(patientProfile),
        'abhaNumber': _abhaNumber(patientProfile),
        'abhaAddress': _abhaAddress(patientProfile),
        'hiType': selectedHiType,
        'apiHiType': apiHiType,
        'tokenFilePath': tokenFilePath,
        'formattedText': formattedRecordText,
        'steps': <Map<String, dynamic>>[],
      };

      void publish() {
        final snapshot = _cloneMap(run);
        AppRuntimeStore.setValue('hipLinking.latestRun', snapshot);
        onUpdate?.call(snapshot);
      }

      Future<Map<String, dynamic>> callStep(
        String action,
        Future<Map<String, dynamic>> Function() call,
      ) async {
        final step = <String, dynamic>{
          'action': action,
          'startedAt': DateTime.now().toIso8601String(),
          'ok': false,
          'status': 'running',
          'attempts': <Map<String, dynamic>>[],
        };
        (run['steps'] as List<Map<String, dynamic>>).add(step);
        publish();

        for (var attempt = 1; attempt <= maxNotFoundAttempts; attempt++) {
          try {
            final response = await call();
            (step['attempts'] as List<Map<String, dynamic>>).add({
              'attempt': attempt,
              'status': 'completed',
              'completedAt': DateTime.now().toIso8601String(),
            });
            step
              ..['ok'] = true
              ..['status'] = 'completed'
              ..['completedAt'] = DateTime.now().toIso8601String()
              ..['response'] = response;
            publish();
            return step;
          } catch (error) {
            final message = error.toString().replaceFirst('Exception: ', '');
            final is404 = _isNotFoundError(message);
            final willRetry = is404 && attempt < maxNotFoundAttempts;
            (step['attempts'] as List<Map<String, dynamic>>).add({
              'attempt': attempt,
              'status': willRetry ? 'retrying' : 'failed',
              'completedAt': DateTime.now().toIso8601String(),
              'error': message,
              if (willRetry) 'nextRetryAfterSeconds': stepDelay.inSeconds,
            });
            step
              ..['ok'] = false
              ..['status'] = willRetry ? 'retrying' : 'failed'
              ..['completedAt'] = DateTime.now().toIso8601String()
              ..['error'] = willRetry
                  ? '$message. Retrying in ${stepDelay.inSeconds} seconds.'
                  : message;
            publish();

            if (!willRetry) {
              return step;
            }
            await Future<void>.delayed(stepDelay);
          }
        }

        publish();
        return step;
      }
      Future<Map<String, dynamic>> pollTokenCallback(String requestId) async {
        final step = <String, dynamic>{
          'action': '2. Check Token Callback',
          'startedAt': DateTime.now().toIso8601String(),
          'ok': false,
          'status': 'waiting',
          'attempts': <Map<String, dynamic>>[],
        };
        (run['steps'] as List<Map<String, dynamic>>).add(step);
        publish();

        for (var attempt = 1; attempt <= maxCallbackPollAttempts; attempt++) {
          try {
            final response = await HipLinkingApiService.fetchTokenCallback(
              requestId,
            );
            final status = response['status']?.toString().toUpperCase() ?? '';

            if (status == 'SUCCESS') {
              final linkToken = _extractLinkToken(response);
              if (linkToken.isNotEmpty) {
                (step['attempts'] as List<Map<String, dynamic>>).add({
                  'attempt': attempt,
                  'status': 'completed',
                  'completedAt': DateTime.now().toIso8601String(),
                });
                step
                  ..['ok'] = true
                  ..['status'] = 'completed'
                  ..['completedAt'] = DateTime.now().toIso8601String()
                  ..['response'] = response;
                publish();
                return step;
              }
            }

            if (status == 'FAILED') {
              String errorMsg = 'ABDM rejected the link token request.';
              final errObj = response['error'];
              if (errObj is Map) {
                errorMsg = errObj['message']?.toString() ?? errObj.toString();
              } else if (errObj != null) {
                errorMsg = errObj.toString();
              }
              (step['attempts'] as List<Map<String, dynamic>>).add({
                'attempt': attempt,
                'status': 'failed',
                'completedAt': DateTime.now().toIso8601String(),
                'error': errorMsg,
              });
              step
                ..['ok'] = false
                ..['status'] = 'failed'
                ..['completedAt'] = DateTime.now().toIso8601String()
                ..['error'] = errorMsg;
              publish();
              return step;
            }

            final willPollAgain = attempt < maxCallbackPollAttempts;
            final message = 'ABDM is still processing the request.';
            (step['attempts'] as List<Map<String, dynamic>>).add({
              'attempt': attempt,
              'status': willPollAgain ? 'waiting' : 'failed',
              'completedAt': DateTime.now().toIso8601String(),
              'error': message,
              if (willPollAgain)
                'nextPollAfterSeconds': callbackPollDelay.inSeconds,
            });
            step
              ..['ok'] = false
              ..['status'] = willPollAgain ? 'waiting' : 'failed'
              ..['completedAt'] = DateTime.now().toIso8601String()
              ..['error'] = willPollAgain
                  ? 'Waiting for ABDM approval. Checking again in ${callbackPollDelay.inSeconds} seconds.'
                  : 'ABDM callback did not return a link token after ${maxCallbackPollAttempts * callbackPollDelay.inSeconds} seconds.';
            publish();

            if (!willPollAgain) {
              return step;
            }
          } catch (error) {
            final message = error.toString().replaceFirst('Exception: ', '');
            (step['attempts'] as List<Map<String, dynamic>>).add({
              'attempt': attempt,
              'status': 'failed',
              'completedAt': DateTime.now().toIso8601String(),
              'error': message,
            });
            step
              ..['ok'] = false
              ..['status'] = 'failed'
              ..['completedAt'] = DateTime.now().toIso8601String()
              ..['error'] = message;
            publish();
            return step;
          }

          await Future<void>.delayed(callbackPollDelay);
        }

        publish();
        return step;
      }


      void addSkippedStep(String action, String reason) {
        (run['steps'] as List<Map<String, dynamic>>).add({
          'action': action,
          'startedAt': DateTime.now().toIso8601String(),
          'completedAt': DateTime.now().toIso8601String(),
          'ok': false,
          'status': 'skipped',
          'error': reason,
        });
        publish();
      }

      publish();

      String linkToken = '';
      String linkedAbhaAddress = '';
      final savedToken = await _readSavedLinkToken(patientProfile);

      if (savedToken != null) {
        linkToken = savedToken.token;
        linkedAbhaAddress = savedToken.abhaAddress;
        (run['steps'] as List<Map<String, dynamic>>).add({
          'action': '1. Generate Link Token',
          'startedAt': DateTime.now().toIso8601String(),
          'completedAt': DateTime.now().toIso8601String(),
          'ok': true,
          'status': 'reused',
          'response': {
            'message': 'Reused saved link token from patient folder.',
            'savedAt': savedToken.savedAt,
            'tokenFilePath': tokenFilePath,
            'abhaAddress': savedToken.abhaAddress,
          },
        });
        publish();
        await Future<void>.delayed(stepDelay);
        addSkippedStep(
          '2. Check Token Callback',
          'Saved link token was reused, so callback check is not required.',
        );
      } else {
        final patientPayload = _patientPayload(patientProfile);
        final generateStep = await callStep(
          '1. Generate Link Token',
          () => HipLinkingApiService.generateToken(patientPayload),
        );
        if (generateStep['ok'] != true) {
          addSkippedStep(
            '2. Check Token Callback',
            'Generate Link Token failed after retry attempts. Exiting process.',
          );
          addSkippedStep(
            '3. Link Care Context',
            'Generate Link Token failed after retry attempts. Exiting process.',
          );
          addSkippedStep(
            '4. Notify Linked Context',
            'Generate Link Token failed after retry attempts. Exiting process.',
          );
          addSkippedStep(
            '5. Send SMS Notification (Deep Link)',
            'Generate Link Token failed after retry attempts. Exiting process.',
          );
          return _completeRun(run, publish);
        }

        await Future<void>.delayed(callbackPollDelay);

        final requestId = _text((generateStep['response'] as Map?)?['requestId']);
        Map<String, dynamic>? callbackResponse;

        if (requestId.isEmpty) {
          addSkippedStep(
            '2. Check Token Callback',
            'Generate Link Token did not return a requestId.',
          );
        } else {
          final callbackStep = await pollTokenCallback(requestId);
          if (callbackStep['ok'] != true) {
            addSkippedStep(
              '3. Link Care Context',
              'ABDM link token callback was not received. Exiting process.',
            );
            addSkippedStep(
              '4. Notify Linked Context',
              'ABDM link token callback was not received. Exiting process.',
            );
            addSkippedStep(
              '5. Send SMS Notification (Deep Link)',
              'ABDM link token callback was not received. Exiting process.',
            );
            return _completeRun(run, publish);
          }
          callbackResponse = callbackStep['response'] is Map<String, dynamic>
              ? Map<String, dynamic>.from(callbackStep['response'] as Map)
              : null;
          linkToken = _extractLinkToken(callbackResponse ?? const {});
          linkedAbhaAddress = _extractCallbackAbhaAddress(
            callbackResponse ?? const {},
          );
          if (linkToken.isNotEmpty) {
            await _saveLinkToken(
              patient: patientProfile,
              token: linkToken,
              abhaAddress: linkedAbhaAddress.isNotEmpty
                  ? linkedAbhaAddress
                  : _abhaAddress(patientProfile),
              abhaNumber: _abhaNumber(patientProfile),
            );
            run['tokenFilePath'] = tokenFilePath;
            publish();
          }
        }
      }

      await Future<void>.delayed(stepDelay);

      final abhaAddress = linkedAbhaAddress.isNotEmpty
          ? linkedAbhaAddress
          : _abhaAddress(patientProfile);
      final careContextReference = _newCareContextReference();
      final patientReference = _patientReference(patientProfile);
      final patientDisplay = '$apiHiType - ${_patientName(patientProfile)}';

      if (linkToken.isEmpty) {
        addSkippedStep(
          '3. Link Care Context',
          'Link token was not available from the callback response.',
        );
      } else {
        final linkStep = await callStep(
          '3. Link Care Context',
          () => HipLinkingApiService.linkCareContext({
            'hipId': HospitalConfig.hipId,
            'linkToken': linkToken,
            'abhaNumber': _abhaNumber(patientProfile),
            'abhaAddress': abhaAddress,
            'AbhaNumber': _abhaNumber(patientProfile),
            'AbhaAddress': abhaAddress,
            'patient': [
              {
                'referenceNumber': patientReference,
                'display': patientDisplay,
                'careContexts': [
                  {
                    'referenceNumber': careContextReference,
                    'display': formattedRecordText,
                  },
                ],
                'hiType': apiHiType,
                'count': 1,
              },
            ],
          }),
        );
        if (linkStep['ok'] != true) {
          addSkippedStep(
            '4. Notify Linked Context',
            'Link Care Context failed after retry attempts. Exiting process.',
          );
          addSkippedStep(
            '5. Send SMS Notification (Deep Link)',
            'Link Care Context failed after retry attempts. Exiting process.',
          );
          return _completeRun(run, publish);
        }
      }

      await Future<void>.delayed(stepDelay);

      final mobile = _text(patientProfile['mobile']).replaceAll(RegExp(r'\D'), '').trim();

      if (linkToken.isEmpty) {
        addSkippedStep(
          '4. Notify Linked Context',
          'Link token was not available from the callback response.',
        );
        addSkippedStep(
          '5. Send SMS Notification (Deep Link)',
          'Link token was not available from the callback response.',
        );
      } else {
        await callStep(
          '4. Notify Linked Context',
          () => HipLinkingApiService.notifyContext({
            'hipId': HospitalConfig.hipId,
            'linkToken': linkToken,
            'mobile': mobile,
            'phoneNo': mobile,
            'notification': {
              'patient': {
                'id': abhaAddress,
                'mobile': mobile,
                'phoneNo': mobile,
              },
              'careContext': {
                'patientReference': patientReference,
                'careContextReference': careContextReference,
              },
              'hiTypes': [apiHiType],
              'date': DateTime.now().toUtc().toIso8601String(),
              'hip': {'id': HospitalConfig.hipId},
            },
          }),
        );

        if (mobile.isNotEmpty) {
          await Future<void>.delayed(const Duration(seconds: 1));
          await callStep(
            '5. Send SMS Notification (Deep Link)',
            () => HipLinkingApiService.notifySms({
              'hipId': HospitalConfig.hipId,
              'hipName': HospitalConfig.hospitalName,
              'phoneNo': mobile,
            }),
          );
        } else {
          addSkippedStep(
            '5. Send SMS Notification (Deep Link)',
            'Patient mobile number not available for SMS notification.',
          );
        }
      }

      return _completeRun(run, publish);
    } finally {
      _activeLinkingPatients.remove(abhaAddress);
    }
  }

  static Map<String, dynamic> _completeRun(
    Map<String, dynamic> run,
    void Function() publish,
  ) {
    final steps = run['steps'];
    final hasFailedStep =
        steps is List &&
        steps.whereType<Map>().any((step) => step['status'] == 'failed');
    run
      ..['completedAt'] = DateTime.now().toIso8601String()
      ..['status'] = hasFailedStep ? 'failed' : 'completed';
    publish();
    return _cloneMap(run);
  }

  static Map<String, dynamic> _patientPayload(Map<String, dynamic> patient) {
    return {
      'hipId': HospitalConfig.hipId,
      'AbhaNumber': _abhaNumber(patient),
      'AbhaAddress': _abhaAddress(patient),
      'name': _patientName(patient),
      'gender': _genderForApi(_text(patient['gender'])),
      'yearOfBirth': _yearFromPatient(patient),
    };
  }

  static String _apiHiType(String selectedHiType) {
    switch (selectedHiType.trim()) {
      case 'OP Consultation Record':
      case 'OPConsultation':
        return 'OPConsultation';
      case 'Prescription Record':
      case 'Prescription':
        return 'Prescription';
      case 'Wellness Record':
      case 'WellnessRecord':
        return 'WellnessRecord';
      case 'Diagnostic Report':
      case 'DiagnosticReport':
        return 'DiagnosticReport';
      case 'Immunization Record':
      case 'ImmunizationRecord':
        return 'ImmunizationRecord';
      case 'Invoice Record':
      case 'Invoice':
        return 'Invoice';
      case 'Discharge Summary':
      case 'DischargeSummary':
        return 'DischargeSummary';
      case 'Health Document Record':
      case 'HealthDocumentRecord':
        return 'HealthDocumentRecord';
      default:
        return selectedHiType.trim().replaceAll(' ', '');
    }
  }

  static String _patientName(Map<String, dynamic> patient) {
    return _firstText([
      patient['name'],
      patient['fullName'],
      patient['patientName'],
      'Patient',
    ]);
  }

  static String _patientReference(Map<String, dynamic> patient) {
    return _firstText([
      patient['name'],
      patient['uhid'],
      patient['AbhaAddress'],
      patient['preferredAbhaAddress'],
      patient['mobile'],
      'Patient',
    ]);
  }

  static String _abhaAddress(Map<String, dynamic> patient) {
    return _firstText([
      patient['AbhaAddress'],
      patient['preferredAbhaAddress'],
      patient['healthId'],
    ]).toLowerCase();
  }

  static String _abhaNumber(Map<String, dynamic> patient) {
    return _firstText([
      patient['AbhaNumber'],
      patient['healthIdNumber'],
      patient['abhaNumber'],
    ]).replaceAll(RegExp(r'\D'), '');
  }

  static String _firstText(Iterable<Object?> values) {
    for (final value in values) {
      final text = _text(value);
      if (text.isNotEmpty && text.toLowerCase() != 'null') {
        return text;
      }
    }
    return '';
  }

  static String _text(Object? value) => value?.toString().trim() ?? '';

  static String _genderForApi(String value) {
    final normalized = value.trim().toLowerCase();
    if (normalized == 'male') return 'M';
    if (normalized == 'female') return 'F';
    if (normalized == 'other') return 'O';
    return value.isEmpty ? 'M' : value;
  }

  static int _yearFromPatient(Map<String, dynamic> patient) {
    final year = int.tryParse(_text(patient['yearOfBirth']));
    if (year != null) return year;
    final dob = _text(patient['dob']);
    final match = RegExp(r'(\d{4})').firstMatch(dob);
    if (match != null) {
      return int.tryParse(match.group(1)!) ?? DateTime.now().year;
    }
    return DateTime.now().year;
  }

  static String _newCareContextReference() {
    final random = Random();
    String hex(int length) => List.generate(
      length,
      (_) => random.nextInt(16).toRadixString(16),
    ).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}';
  }

  static String _extractLinkToken(Map<String, dynamic> response) {
    final direct = _text(response['linkToken']);
    if (direct.isNotEmpty) return direct;
    final payload = response['payload'];
    if (payload is Map) {
      return _text(payload['linkToken']).isNotEmpty
          ? _text(payload['linkToken'])
          : _text(payload['linkingToken']);
    }
    return '';
  }

  static String _extractCallbackAbhaAddress(Map<String, dynamic> response) {
    final direct = _text(response['abhaAddress']);
    if (direct.isNotEmpty) return direct.toLowerCase();
    final payload = response['payload'];
    if (payload is Map) {
      final fromPayload = _text(payload['abhaAddress']).isNotEmpty
          ? _text(payload['abhaAddress'])
          : _text(payload['AbhaAddress']);
      if (fromPayload.isNotEmpty) {
        return fromPayload.toLowerCase();
      }
    }
    return '';
  }

  static bool _isNotFoundError(String message) {
    final normalized = message.toLowerCase();
    return normalized.contains('(404)') ||
        normalized.contains(' 404') ||
        normalized.contains('not found') ||
        normalized.contains('not been received yet');
  }



  static Future<_SavedLinkToken?> _readSavedLinkToken(Map<String, dynamic> patient) async {
    final abhaId = _tokenFolderAbhaId(patient);
    final patientName = _patientName(patient);
    final path = _tokenFilePathForPatient(patient);
    final content = await readDraft(abhaId, patientName, path);
    if (content == null || content.isEmpty) return null;
    final token = _extractField(content, 'Link Token');
    if (token.isEmpty || _isJwtExpired(token)) {
      return null;
    }
    return _SavedLinkToken(
      token: token,
      savedAt: _extractField(content, 'Saved At'),
      abhaAddress: _extractField(content, 'ABHA Address'),
    );
  }

  static Future<void> _saveLinkToken({
    required Map<String, dynamic> patient,
    required String token,
    required String abhaAddress,
    required String abhaNumber,
  }) async {
    final now = DateTime.now().toIso8601String();
    final content = [
      'Saved At: $now',
      'ABHA Address: $abhaAddress',
      'ABHA Number: $abhaNumber',
      'Link Token:',
      token,
      '',
    ].join('\n');
    
    final abhaId = _tokenFolderAbhaId(patient);
    final patientName = _patientName(patient);
    final path = _tokenFilePathForPatient(patient);
    
    if (!kIsWeb) {
      final patientFolderName = '${_sanitizePathSegment(abhaId)}_${_sanitizePathSegment(patientName)}';
      final patientFolder = Directory('${_localRecordRoot().path}/$patientFolderName');
      await patientFolder.create(recursive: true);
    }
    
    await saveDraft(abhaId, patientName, path, content);
  }

  static String _extractField(String content, String label) {
    final lines = const LineSplitter().convert(content);
    for (var index = 0; index < lines.length; index++) {
      final line = lines[index];
      final prefix = '$label:';
      if (!line.startsWith(prefix)) continue;
      final sameLine = line.substring(prefix.length).trim();
      if (sameLine.isNotEmpty) return sameLine;
      if (index + 1 < lines.length) {
        return lines[index + 1].trim();
      }
      return '';
    }
    return '';
  }

  static bool _isJwtExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length < 2) return false;
      final payload = utf8.decode(
        base64Url.decode(base64Url.normalize(parts[1])),
      );
      final decoded = jsonDecode(payload);
      if (decoded is! Map) return false;
      final exp = int.tryParse(decoded['exp']?.toString() ?? '');
      if (exp == null) return false;
      return DateTime.now().millisecondsSinceEpoch >= exp * 1000;
    } catch (_) {
      return false;
    }
  }

  static String _tokenFilePathForPatient(Map<String, dynamic> patient) {
    if (kIsWeb) return 'hip_link_token.txt';
    final patientFolderName =
        '${_sanitizePathSegment(_tokenFolderAbhaId(patient))}_${_sanitizePathSegment(_patientName(patient))}';
    return '${_localRecordRoot().path}/$patientFolderName/hip_link_token.txt';
  }

  static String _tokenFolderAbhaId(Map<String, dynamic> patient) {
    return _firstText([
      patient['AbhaAddress'],
      patient['preferredAbhaAddress'],
      patient['healthId'],
      patient['healthIdNumber'],
      patient['AbhaNumber'],
      patient['abhaNumber'],
      patient['uhid'],
      'unknown_abha',
    ]);
  }

  static Directory _localRecordRoot() {
    final current = Directory.current;
    if (File('${current.path}/pubspec.yaml').existsSync()) {
      return current;
    }

    var directory = File(Platform.resolvedExecutable).parent;
    while (directory.parent.path != directory.path) {
      if (directory.path.endsWith('.app')) {
        return directory.parent;
      }
      directory = directory.parent;
    }

    return current;
  }

  static String _sanitizePathSegment(String value) {
    final normalized = value.trim().replaceAll(RegExp(r'\s+'), '_');
    final cleaned = normalized.replaceAll(RegExp(r'[^A-Za-z0-9._@-]'), '_');
    final compact = cleaned.replaceAll(RegExp(r'_+'), '_');
    return compact.isEmpty ? 'unknown' : compact;
  }

  static Map<String, dynamic> _cloneMap(Map<String, dynamic> source) {
    return Map<String, dynamic>.from(
      source.map((key, value) => MapEntry(key, _clone(value))),
    );
  }

  static dynamic _clone(dynamic value) {
    if (value is Map) {
      return Map<String, dynamic>.fromEntries(
        value.entries.map(
          (entry) => MapEntry(entry.key.toString(), _clone(entry.value)),
        ),
      );
    }
    if (value is List) {
      return value.map(_clone).toList(growable: false);
    }
    return value;
  }
}

class _SavedLinkToken {
  const _SavedLinkToken({
    required this.token,
    required this.savedAt,
    required this.abhaAddress,
  });

  final String token;
  final String savedAt;
  final String abhaAddress;
}
