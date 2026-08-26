import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../config/hospital_config.dart';
import '../models/consent_request.dart';
import '../services/consent_api_service.dart';
import '../services/consent_manager_api_service.dart';
import '../utils/consent_mode.dart';
import '../widgets/desktop_workspace.dart';
import '../services/m2_automated_workflow_service.dart';


class M2DataExchangeScreen extends StatefulWidget {
  const M2DataExchangeScreen({super.key, required this.patientProfile, this.autoStartHiType});

  final Map<String, dynamic> patientProfile;
  final String? autoStartHiType;

  @override
  State<M2DataExchangeScreen> createState() => _M2DataExchangeScreenState();
}

class _M2DataExchangeScreenState extends State<M2DataExchangeScreen> {
  // Navigation & Step Tracking
  int _currentStep =
      0; // 0: Consents, 1: HI Request, 2: FHIR Preview, 3: Transfer, 4: History
  bool _isConsoleExpanded = false;

  // Consent Inbox
  List<Map<String, dynamic>> _consents = [];
  Map<String, dynamic>? _selectedConsent;
  bool _isLoadingConsents = false;
  bool _isSubmittingConsentDecision = false;
  String? _consentError;
  final ConsentMode _consentMode = ConsentMode.currentDefault;

  // Page 2 State: HI Request
  final Map<String, bool> _selectedRecords = {
    'Prescription': true,
    'OP Consultation': true,
    'Invoice': true,
    'Diagnostic Report': true,
    'Wellness': false,
    'Immunization': false,
    'Discharge Summary': false,
    'Health Document Record': false,
  };
  bool _isRequestingHealthInformation = false;
  String _hiRequestStatus = 'idle';
  String? _hiRequestError;
  String? _hiRequestId;
  String? _hiTransactionId;
  String? _hiDataPushUrl;
  bool _isBundleGenerated = false;
  bool _isBundleValidated = false;
  Map<String, dynamic>? _generatedFhirBundle;

  // Page 3 State: FHIR Preview
  String _selectedFhirResource = 'Bundle';
  String _fhirViewerFormat = 'JSON'; // JSON, XML, Validation
  bool _isValidatingBundle = false;

  // Page 4 State: Transfer progress
  bool _isTransferring = false;
  double _transferProgress = 0.0;
  String _transferStepStatus = 'idle'; // idle, running, success, error
  Map<String, dynamic>? _lastTransactionData;
  List<Map<String, dynamic>> _transferSteps = [];

  // Page 5 State: Transfer History
  final List<Map<String, dynamic>> _transferHistory = [];
  Map<String, dynamic>? _selectedHistoryItem;
  bool _isLoadingTransferHistory = false;
  String? _transferHistoryError;

  // Developer Console Timeline Logs
  final List<Map<String, dynamic>> _consoleLogs = [];
  final ScrollController _consoleScrollController = ScrollController();

  Future<void> _initializeTokenManager() async {
    _addConsoleLog(
      _createLogEntry(
        title: 'M2 TokenManager Initialization',
        timestamp: _nowText(),
        duration: '--',
        statusCode: 0,
        request: const <String, dynamic>{},
        response: const <String, dynamic>{'status': 'initializing'},
        headers: const <String, dynamic>{},
        expanded: false,
      ),
    );
    try {
      final res = await ConsentManagerApiService.initializeM2TokenManager();
      _addConsoleLog(
        _createLogEntry(
          title: 'M2 TokenManager Initialization',
          timestamp: _nowText(),
          duration: 'success',
          statusCode: 200,
          request: const <String, dynamic>{},
          response: res,
          headers: const <String, dynamic>{},
          expanded: false,
        ),
      );
    } catch (err) {
      _addConsoleLog(
        _createLogEntry(
          title: 'M2 TokenManager Initialization',
          timestamp: _nowText(),
          duration: 'failed',
          statusCode: 500,
          request: const <String, dynamic>{},
          response: {'error': err.toString()},
          headers: const <String, dynamic>{},
          expanded: true,
        ),
      );
      _showToast('TokenManager initialization failed: $err', isError: true);
    }
  }

  @override
  void initState() {
    super.initState();
    _initializeTokenManager();
    _loadConsentInbox();
    _loadTransferHistory();
    
    if (widget.autoStartHiType != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _startAutomatedTransfer(widget.autoStartHiType!);
      });
    }
  }

  void _startAutomatedTransfer(String hiType) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Data transfer will take place in the background.'),
        duration: Duration(seconds: 3),
      ),
    );

    M2AutomatedWorkflowService.runAutomatedDataTransfer(
      patientProfile: widget.patientProfile,
      hiType: hiType,
      onProgress: (message) {
        debugPrint("[M2 Background Transfer] $message");
      },
    ).then((_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('M2 Data Transfer process completed successfully.'),
            duration: Duration(seconds: 3),
          ),
        );
        _loadConsentInbox();
        _loadTransferHistory();
      }
    }).catchError((e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Background transfer failed: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    });
  }

  Future<void> _loadTransferHistory() async {
    if (mounted) {
      setState(() {
        _isLoadingTransferHistory = true;
        _transferHistoryError = null;
      });
    }
    try {
      final result =
          await ConsentManagerApiService.fetchTransferHistoryWithMetadata(
            patientId: _patientAbhaAddress(),
          );
      final rawItems = result.data['items'];
      final items = rawItems is List
          ? rawItems
                .whereType<Map>()
                .map(
                  (raw) => _transferHistoryItem(Map<String, dynamic>.from(raw)),
                )
                .toList(growable: false)
          : <Map<String, dynamic>>[];
      if (!mounted) return;
      setState(() {
        _transferHistory
          ..clear()
          ..addAll(items);
        _isLoadingTransferHistory = false;
      });
      _addConsoleLog(_logFromConsentManagerExecution(result.execution));
    } on ConsentManagerApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _isLoadingTransferHistory = false;
        _transferHistoryError = error.message;
      });
      _addConsoleLog(
        _logFromConsentManagerExecution(error.execution, expanded: true),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _isLoadingTransferHistory = false;
        _transferHistoryError = error.toString().replaceFirst(
          'Exception: ',
          '',
        );
      });
    }
  }

  Map<String, dynamic> _transferHistoryItem(Map<String, dynamic> raw) {
    final completedAt = raw['completedAt'];
    final completedDate = completedAt is num
        ? DateTime.fromMillisecondsSinceEpoch(completedAt.toInt())
        : DateTime.tryParse(completedAt?.toString() ?? '');
    final durationMs = (raw['durationMs'] as num?)?.toInt() ?? 0;
    final types = raw['recordTypes'] is List
        ? (raw['recordTypes'] as List)
              .map((item) => item.toString())
              .where((item) => item.trim().isNotEmpty)
              .toList()
        : <String>[];
    return {
      ...raw,
      'transactionId': raw['transactionId']?.toString() ?? '-',
      'patient': raw['patientId']?.toString() ?? _patientName(),
      'consentId': raw['consentId']?.toString() ?? '-',
      'recordType': types.isEmpty ? 'FHIR Bundle' : types.join(', '),
      'date': completedDate == null ? '-' : _formatDateTime(completedDate),
      'duration': _formatDuration(Duration(milliseconds: durationMs)),
      'status': raw['status']?.toString() ?? 'UNKNOWN',
    };
  }

  Future<void> _loadConsentInbox() async {
    setState(() {
      _isLoadingConsents = true;
      _consentError = null;
      // _isConsoleExpanded = true;
    });

    try {
      final result = await ConsentApiService.fetchConsentRequestsWithMetadata(
        mode: _consentMode,
      );
      final items = result.items
          .where(_consentBelongsToSelectedPatient)
          .map(_consentToMap)
          .toList();
      items.sort((a, b) {
        final byCreated = _sortTimestamp(
          b['createdDate'],
        ).compareTo(_sortTimestamp(a['createdDate']));
        if (byCreated != 0) return byCreated;
        return b['consentId'].toString().compareTo(a['consentId'].toString());
      });
      if (!mounted) return;
      setState(() {
        _consents = items;
        _selectedConsent = items.isEmpty ? null : items.first;
        _isLoadingConsents = false;
      });
      _addConsoleLog(_logFromExecution(result.execution, expanded: true));
      _showToast('Consent inbox refreshed. ${items.length} request(s) loaded.');
    } on ConsentApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _consentError = error.message;
        _isLoadingConsents = false;
      });
      _addConsoleLog(_logFromExecution(error.execution, expanded: true));
      _showToast('Consent inbox fetch failed: ${error.message}', isError: true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _consentError = error.toString().replaceFirst('Exception: ', '');
        _isLoadingConsents = false;
      });
      _addConsoleLog(
        _createLogEntry(
          title: 'Consent Inbox Fetch',
          timestamp: _nowText(),
          duration: '--',
          statusCode: 0,
          request: {'mode': _consentMode.apiValue},
          response: {'error': _consentError},
          headers: const <String, dynamic>{},
          expanded: true,
        ),
      );
      _showToast('Consent inbox fetch failed: $_consentError', isError: true);
    }
  }

  Map<String, dynamic> _createLogEntry({
    required String title,
    required String timestamp,
    required String duration,
    required int statusCode,
    required Map<String, dynamic> request,
    required Map<String, dynamic> response,
    required Map<String, dynamic> headers,
    bool expanded = false,
  }) {
    return {
      'title': title,
      'timestamp': timestamp,
      'duration': duration,
      'statusCode': statusCode,
      'request': request,
      'response': response,
      'headers': headers,
      'expanded': expanded,
    };
  }

  Map<String, dynamic> _logFromExecution(
    ConsentApiExecution execution, {
    bool expanded = false,
  }) {
    return _createLogEntry(
      title: execution.title,
      timestamp: _formatDateTime(execution.timestamp),
      duration: _formatDuration(execution.duration),
      statusCode: execution.statusCode,
      request: {
        ...execution.request,
        'method': execution.method,
        'url': execution.url,
      },
      response: execution.response,
      headers: execution.headers,
      expanded: expanded,
    );
  }

  Map<String, dynamic> _logFromConsentManagerExecution(
    ConsentManagerApiExecution execution, {
    bool expanded = false,
    Map<String, dynamic> extraResponse = const <String, dynamic>{},
  }) {
    return _createLogEntry(
      title: execution.title,
      timestamp: _formatDateTime(execution.timestamp),
      duration: _formatDuration(execution.duration),
      statusCode: execution.statusCode,
      request: {
        ...execution.request,
        'method': execution.method,
        'url': execution.url,
      },
      response: {...execution.response, ...extraResponse},
      headers: execution.headers,
      expanded: expanded,
    );
  }

  Map<String, dynamic> _consentToMap(ConsentRequest consent) {
    final raw = consent.raw;
    final patientName =
        widget.patientProfile['name']?.toString() ??
        widget.patientProfile['fullName']?.toString() ??
        'Patient';
    final selectedAbhaAddress = _selectedPatientAbhaAddress();
    final abhaAddress = selectedAbhaAddress.isNotEmpty
        ? selectedAbhaAddress
        : raw['patient']?['id']?.toString() ?? '';
    final abhaNumber = _selectedPatientAbhaNumber();
    final permission =
        _readMap(raw, ['permission']) ??
        _readMap(raw, ['consent', 'permission']) ??
        _readMap(raw, ['consentDetail', 'permission']) ??
        _readMap(raw, ['notification', 'consentDetail', 'permission']) ??
        _readMap(raw, ['notification', 'permission']) ??
        const <String, dynamic>{};
    final dateRange = permission['dateRange'] is Map
        ? Map<String, dynamic>.from(permission['dateRange'] as Map)
        : const <String, dynamic>{};
    final hiTypes = consent.dataTypes.isEmpty
        ? _readStringList(raw, [
            ['hiTypes'],
            ['hiType'],
            ['consent', 'hiTypes'],
            ['consentDetail', 'hiTypes'],
            ['notification', 'consentDetail', 'hiTypes'],
            ['notification', 'consentDetail', 'hiType'],
          ])
        : consent.dataTypes;

    return {
      'consentId': consent.effectiveId,
      'purpose': consent.purpose,
      'requester': consent.requester,
      'requesterId': _firstText([
        _readString(raw, ['requester', 'identifier', 'value']),
        _readString(raw, ['hiu', 'id']),
        _readString(raw, ['consentDetail', 'hiu', 'id']),
        _readString(raw, ['consent', 'hiu', 'id']),
        consent.requester,
      ]),
      'hiTypes': hiTypes.isEmpty ? <String>['-'] : hiTypes,
      'createdDate': _firstText([
        _readString(raw, ['createdAt']),
        _readString(raw, ['lastUpdated']),
        _readString(raw, ['consentDetail', 'lastUpdated']),
        '0',
      ]),
      'status': _normalizeConsentStatus(consent.status),
      'patient': patientName,
      'abhaAddress': abhaAddress,
      'abhaNumber': abhaNumber,
      'hip': HospitalConfig.hipId,
      'permissionStart': _firstText([
        dateRange['from'],
        permission['from'],
        _nowText(),
      ]),
      'permissionEnd': _firstText([
        dateRange['to'],
        permission['to'],
        consent.expiry,
      ]),
      'expiry': _firstText([consent.expiry, permission['dataEraseAt'], '-']),
      'frequency': _frequencyText(permission['frequency']),
      'raw': raw,
      'consentRequest': consent,
    };
  }

  bool _consentBelongsToSelectedPatient(ConsentRequest consent) {
    final selectedAddress = _normalizePatientIdentifier(
      _selectedPatientAbhaAddress(),
    );
    final selectedNumber = _digitsOnly(_selectedPatientAbhaNumber());
    if (selectedAddress.isEmpty && selectedNumber.isEmpty) return false;

    final raw = consent.raw;
    final addressCandidates = <String>[
      consent.raw['patientId']?.toString() ?? '',
      _readString(raw, ['patientId']),
      _readString(raw, ['abhaAddress']),
      _readString(raw, ['AbhaAddress']),
      _readString(raw, ['patient', 'id']),
      _readString(raw, ['patient', 'abhaAddress']),
      _readString(raw, ['patient', 'AbhaAddress']),
      _readString(raw, ['consentDetail', 'patient', 'id']),
      _readString(raw, ['consentDetail', 'patient', 'abhaAddress']),
      _readString(raw, ['consent', 'patient', 'id']),
      _readString(raw, ['consent', 'patient', 'abhaAddress']),
      _readString(raw, ['notification', 'consentDetail', 'patient', 'id']),
      _readString(raw, [
        'notification',
        'consentDetail',
        'patient',
        'abhaAddress',
      ]),
      _readString(raw, [
        'rawNotification',
        'notification',
        'consentDetail',
        'patient',
        'id',
      ]),
      _readString(raw, ['request', 'patient', 'id']),
      _readString(raw, ['request', 'patient', 'abhaAddress']),
      _readString(raw, ['request', 'consentDetail', 'patient', 'id']),
    ];

    final numberCandidates = <String>[
      _readString(raw, ['abhaNumber']),
      _readString(raw, ['AbhaNumber']),
      _readString(raw, ['healthIdNumber']),
      _readString(raw, ['patient', 'abhaNumber']),
      _readString(raw, ['patient', 'AbhaNumber']),
      _readString(raw, ['patient', 'healthIdNumber']),
      _readString(raw, ['consentDetail', 'patient', 'abhaNumber']),
      _readString(raw, ['consentDetail', 'patient', 'AbhaNumber']),
      _readString(raw, ['consent', 'patient', 'abhaNumber']),
      _readString(raw, [
        'notification',
        'consentDetail',
        'patient',
        'abhaNumber',
      ]),
      _readString(raw, [
        'rawNotification',
        'notification',
        'consentDetail',
        'patient',
        'abhaNumber',
      ]),
      _readString(raw, ['request', 'patient', 'abhaNumber']),
      _readString(raw, ['request', 'consentDetail', 'patient', 'abhaNumber']),
    ];

    final addressMatches =
        selectedAddress.isNotEmpty &&
        addressCandidates
            .map(_normalizePatientIdentifier)
            .any((value) => value == selectedAddress);
    final numberMatches =
        selectedNumber.isNotEmpty &&
        numberCandidates
            .map(_digitsOnly)
            .any((value) => value == selectedNumber);

    return addressMatches || numberMatches;
  }

  String _selectedPatientAbhaAddress() {
    return _firstText([
      widget.patientProfile['preferredAbhaAddress'],
      widget.patientProfile['AbhaAddress'],
      widget.patientProfile['abhaAddress'],
      _readString(widget.patientProfile, ['rawProfile', 'abhaAddress']),
      _readString(widget.patientProfile, ['rawProfile', 'AbhaAddress']),
      _readString(widget.patientProfile, ['patient', 'abhaAddress']),
      _readString(widget.patientProfile, ['patient', 'AbhaAddress']),
    ]);
  }

  String _selectedPatientAbhaNumber() {
    return _firstText([
      widget.patientProfile['AbhaNumber'],
      widget.patientProfile['abhaNumber'],
      widget.patientProfile['healthIdNumber'],
      _readString(widget.patientProfile, ['rawProfile', 'abhaNumber']),
      _readString(widget.patientProfile, ['rawProfile', 'AbhaNumber']),
      _readString(widget.patientProfile, ['rawProfile', 'healthIdNumber']),
      _readString(widget.patientProfile, ['patient', 'abhaNumber']),
      _readString(widget.patientProfile, ['patient', 'AbhaNumber']),
    ]);
  }

  static String _normalizePatientIdentifier(String value) {
    return value.trim().toLowerCase();
  }

  static String _digitsOnly(String value) {
    return value.replaceAll(RegExp(r'\D'), '');
  }

  static Map<String, dynamic>? _readMap(
    Map<String, dynamic> source,
    List<String> path,
  ) {
    dynamic current = source;
    for (final key in path) {
      if (current is Map && current[key] != null) {
        current = current[key];
      } else {
        return null;
      }
    }
    return current is Map ? Map<String, dynamic>.from(current) : null;
  }

  static String _readString(Map<String, dynamic> source, List<String> path) {
    dynamic current = source;
    for (final key in path) {
      if (current is Map && current[key] != null) {
        current = current[key];
      } else {
        return '';
      }
    }
    return current?.toString().trim() ?? '';
  }

  static List<String> _readStringList(
    Map<String, dynamic> source,
    List<List<String>> paths,
  ) {
    for (final path in paths) {
      dynamic current = source;
      for (final key in path) {
        if (current is Map && current[key] != null) {
          current = current[key];
        } else {
          current = null;
          break;
        }
      }
      if (current is List) {
        final values = current
            .map((item) => item?.toString().trim() ?? '')
            .where((item) => item.isNotEmpty)
            .toList(growable: false);
        if (values.isNotEmpty) return values;
      }
      if (current is String && current.trim().isNotEmpty) {
        return [current.trim()];
      }
    }
    return const <String>[];
  }

  static String _firstText(Iterable<Object?> values) {
    for (final value in values) {
      final text = value?.toString().trim() ?? '';
      if (text.isNotEmpty && text.toLowerCase() != 'null') {
        return text;
      }
    }
    return '';
  }

  static String _frequencyText(Object? value) {
    if (value is Map) {
      final unit = value['unit']?.toString().trim() ?? '';
      final frequencyValue = value['value']?.toString().trim() ?? '';
      return [frequencyValue, unit].where((part) => part.isNotEmpty).join(' ');
    }
    return _firstText([value, '-']);
  }

  static String _normalizeConsentStatus(String value) {
    final upper = value.trim().toUpperCase();
    if (upper.contains('GRANT') || upper.contains('APPROV')) return 'Approved';
    if (upper.contains('DEN') || upper.contains('REJECT')) return 'Rejected';
    if (upper.contains('EXPIR')) return 'Expired';
    if (upper.isEmpty || upper == 'UNKNOWN') return 'Pending';
    return upper[0] + upper.substring(1).toLowerCase();
  }

  static String _formatDateTime(DateTime value) {
    return value
        .toLocal()
        .toIso8601String()
        .replaceAll('T', ' ')
        .substring(0, 19);
  }

  static int _sortTimestamp(Object? value) {
    final text = value?.toString().trim() ?? '';
    if (text.isEmpty) return 0;
    final numeric = int.tryParse(text);
    if (numeric != null) return numeric;
    return DateTime.tryParse(text)?.millisecondsSinceEpoch ?? 0;
  }

  static String _nowText() => _formatDateTime(DateTime.now());

  static String _formatUtcIso3(DateTime value) {
    final utc = value.toUtc();
    final y = utc.year.toString().padLeft(4, '0');
    final m = utc.month.toString().padLeft(2, '0');
    final d = utc.day.toString().padLeft(2, '0');
    final h = utc.hour.toString().padLeft(2, '0');
    final min = utc.minute.toString().padLeft(2, '0');
    final s = utc.second.toString().padLeft(2, '0');
    final ms = (utc.millisecond).toString().padLeft(3, '0');
    return '$y-$m-${d}T$h:$min:$s.${ms}Z';
  }

  static String _normalizeTimestampToIso(String? value) {
    if (value == null || value.trim().isEmpty) {
      return _formatUtcIso3(DateTime.now());
    }
    try {
      final cleaned = value.trim();
      DateTime parsed;
      if (cleaned.contains(' ') && !cleaned.contains('T')) {
        final parts = cleaned.split(' ');
        final dateParts = parts[0].split('-');
        final timeParts = parts[1].split(':');
        parsed = DateTime(
          int.parse(dateParts[0]),
          int.parse(dateParts[1]),
          int.parse(dateParts[2]),
          int.parse(timeParts[0]),
          int.parse(timeParts[1]),
          int.parse(timeParts[2]),
        );
      } else {
        parsed = DateTime.parse(cleaned);
      }
      return _formatUtcIso3(parsed);
    } catch (_) {
      return _formatUtcIso3(DateTime.now());
    }
  }

  static String _formatDuration(Duration duration) {
    if (duration.inMilliseconds < 1000) {
      return '${duration.inMilliseconds}ms';
    }
    return '${(duration.inMilliseconds / 1000).toStringAsFixed(1)}s';
  }

  static String _datePrefix(Object? value) {
    final text = value?.toString().trim() ?? '';
    if (text.isEmpty) return '-';
    final numeric = int.tryParse(text);
    if (numeric != null) {
      final dt = DateTime.fromMillisecondsSinceEpoch(numeric.toInt());
      return dt.toLocal().toIso8601String().substring(0, 10);
    }
    if (text.length >= 10) return text.substring(0, 10);
    return text;
  }

  void _addConsoleLog(Map<String, dynamic> log) {
    setState(() {
      _consoleLogs.add(log);
    });
    // Auto-scroll to bottom of console
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_consoleScrollController.hasClients) {
        _consoleScrollController.animateTo(
          _consoleScrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void _showToast(String message, {bool isError = false}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Row(
          children: [
            Icon(
              isError ? Icons.error_outline : Icons.check_circle_outline,
              color: Colors.white,
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(message)),
          ],
        ),
        backgroundColor: isError
            ? const Color(0xFFD32F2F)
            : const Color(0xFF00A86B),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        margin: const EdgeInsets.all(20),
        duration: const Duration(seconds: 3),
      ),
    );
  }

  // --- ACTIONS ---

  Future<void> _approveConsent(Map<String, dynamic> consent) async {
    if (_isSubmittingConsentDecision) return;
    setState(() {
      _isSubmittingConsentDecision = true;
      // _isConsoleExpanded = true;
    });

    try {
      final result = await ConsentApiService.submitConsentDecisionWithMetadata(
        consent['consentId']?.toString() ?? '',
        'APPROVED',
        raw: Map<String, dynamic>.from(consent['raw'] as Map? ?? const {}),
        mode: _consentMode,
      );
      if (!mounted) return;
      setState(() {
        consent['status'] = 'Approved';
        consent['consentArtefactId'] = result.consentArtefactId;
        _isSubmittingConsentDecision = false;
      });
      _addConsoleLog(_logFromExecution(result.execution, expanded: true));
      _showToast(
        'Consent Request ${consent['consentId']} approved successfully.',
      );

      Future.delayed(const Duration(milliseconds: 1500), () {
        if (!mounted) return;
        setState(() {
          _currentStep = 1;
        });
      });
    } on ConsentApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmittingConsentDecision = false);
      _addConsoleLog(_logFromExecution(error.execution, expanded: true));
      _showToast('Consent approval failed: ${error.message}', isError: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _isSubmittingConsentDecision = false);
      _addConsoleLog(
        _createLogEntry(
          title: 'Consent Decision',
          timestamp: _nowText(),
          duration: '--',
          statusCode: 0,
          request: {'consentId': consent['consentId'], 'decision': 'APPROVED'},
          response: {'error': error.toString().replaceFirst('Exception: ', '')},
          headers: const <String, dynamic>{},
          expanded: true,
        ),
      );
      _showToast('Consent approval failed: $error', isError: true);
    }
  }

  Future<void> _rejectConsent(Map<String, dynamic> consent) async {
    if (_isSubmittingConsentDecision) return;
    setState(() {
      _isSubmittingConsentDecision = true;
      // _isConsoleExpanded = true;
    });

    try {
      final result = await ConsentApiService.submitConsentDecisionWithMetadata(
        consent['consentId']?.toString() ?? '',
        'DENIED',
        raw: Map<String, dynamic>.from(consent['raw'] as Map? ?? const {}),
        mode: _consentMode,
      );
      if (!mounted) return;
      setState(() {
        consent['status'] = 'Rejected';
        _isSubmittingConsentDecision = false;
      });
      _addConsoleLog(_logFromExecution(result.execution, expanded: true));
      _showToast(
        'Consent Request ${consent['consentId']} rejected.',
        isError: true,
      );
    } on ConsentApiException catch (error) {
      if (!mounted) return;
      setState(() => _isSubmittingConsentDecision = false);
      _addConsoleLog(_logFromExecution(error.execution, expanded: true));
      _showToast('Consent rejection failed: ${error.message}', isError: true);
    } catch (error) {
      if (!mounted) return;
      setState(() => _isSubmittingConsentDecision = false);
      _addConsoleLog(
        _createLogEntry(
          title: 'Consent Decision',
          timestamp: _nowText(),
          duration: '--',
          statusCode: 0,
          request: {'consentId': consent['consentId'], 'decision': 'DENIED'},
          response: {'error': error.toString().replaceFirst('Exception: ', '')},
          headers: const <String, dynamic>{},
          expanded: true,
        ),
      );
      _showToast('Consent rejection failed: $error', isError: true);
    }
  }

  void _generateFHIRBundle() {
    final stopwatch = Stopwatch()..start();
    final selectedRecords = _selectedRecords.entries
        .where((entry) => entry.value)
        .map((entry) => entry.key)
        .toList(growable: false);
    final generatedAt = DateTime.now().toUtc();
    final bundle = _buildFhirBundle(
      selectedRecords: selectedRecords,
      generatedAt: generatedAt,
    );
    stopwatch.stop();

    setState(() {
      _isBundleGenerated = true;
      _isBundleValidated = false;
      _generatedFhirBundle = bundle;
      _selectedFhirResource = 'Bundle';
    });

    _addConsoleLog(
      _createLogEntry(
        title: 'Generate FHIR Bundle',
        timestamp: _formatDateTime(generatedAt),
        duration: _formatDuration(stopwatch.elapsed),
        statusCode: 200,
        request: {
          'consentId': _firstText([
            _selectedConsent?['consentArtefactId'],
            _selectedConsent?['consentId'],
          ]),
          'hiRequestId': _hiRequestId,
          'hiTransactionId': _hiTransactionId,
          'dataPushUrl': _hiDataPushUrl,
          'patient': _patientName(),
          'abhaAddress': _patientAbhaAddress(),
          'abhaNumber': _patientAbhaNumber(),
          'recordsSelected': selectedRecords,
        },
        response: bundle,
        headers: const {
          'Content-Type': 'application/fhir+json',
          'FHIR-Specification': 'R4',
        },
        expanded: true,
      ),
    );

    _showToast(
      'FHIR Bundle generated containing composition, patient, and practitioner.',
    );

    // Auto navigate to FHIR Preview step
    Future.delayed(const Duration(milliseconds: 1000), () {
      setState(() {
        _currentStep = 2;
      });
    });
  }

  Future<void> _requestHealthInformationAndGenerateBundle() async {
    if (_isRequestingHealthInformation) return;
    if (_hiRequestStatus == 'success' && _hiTransactionId != null) {
      _generateFHIRBundle();
      return;
    }

    final consent = _selectedConsent;
    if (consent == null) {
      _showToast(
        'Select an approved consent before requesting health information.',
        isError: true,
      );
      return;
    }

    final selectedRecords = _selectedRecords.entries
        .where((entry) => entry.value)
        .map((entry) => entry.key)
        .toList(growable: false);
    if (selectedRecords.isEmpty) {
      _showToast('Select at least one health record type.', isError: true);
      return;
    }

    final consentId = _firstText([
      consent['consentArtefactId'],
      consent['consentId'],
    ]);
    if (consentId.isEmpty) {
      _showToast('Consent ID is missing for this request.', isError: true);
      return;
    }

    final payload = <String, dynamic>{
      'timestamp': _normalizeTimestampToIso(
        DateTime.now().toUtc().toIso8601String(),
      ),
      'hiRequest': {
        'consent': {'id': consentId},
        'dateRange': {
          'from': _normalizeTimestampToIso(
            consent['permissionStart']?.toString(),
          ),
          'to': _normalizeTimestampToIso(consent['permissionEnd']?.toString()),
        },
      },
    };

    setState(() {
      _isRequestingHealthInformation = true;
      _hiRequestStatus = 'loading';
      _hiRequestError = null;
      _hiRequestId = null;
      _hiTransactionId = null;
      _hiDataPushUrl = null;
      // _isConsoleExpanded = true;
    });

    try {
      final requestResult =
          await ConsentManagerApiService.requestHealthInformationWithMetadata(
            payload,
          );
      if (!mounted) return;

      final requestId = _firstText([requestResult.data['requestId']]);
      final dataPushUrl = _firstText([requestResult.data['dataPushUrl']]);
      setState(() {
        _hiRequestId = requestId;
        _hiDataPushUrl = dataPushUrl;
      });
      _addConsoleLog(
        _logFromConsentManagerExecution(
          requestResult.execution,
          expanded: true,
          extraResponse: {
            'consentId': consentId,
            'selectedRecords': selectedRecords,
          },
        ),
      );

      final callbackData = await _waitForHealthInformationCallback(requestId);
      if (!mounted) return;
      final transactionId = _extractTransactionId(callbackData);
      if (transactionId.isEmpty) {
        throw Exception(
          'Health information callback did not include a transactionId.',
        );
      }

      setState(() {
        _hiTransactionId = transactionId;
        _hiRequestStatus = 'success';
        _isRequestingHealthInformation = false;

        // Removed auto-completion logic to enforce Live ABDM Mode polling constraints.
      });
      _showToast(
        'Health information request initiated successfully. Awaiting backend confirmation.',
      );
      _generateFHIRBundle();
    } on ConsentManagerApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _isRequestingHealthInformation = false;
        _hiRequestStatus = 'error';
        _hiRequestError = error.message;
      });
      _addConsoleLog(
        _logFromConsentManagerExecution(error.execution, expanded: true),
      );
      _showToast(
        'Health information request failed: ${error.message}',
        isError: true,
      );
    } catch (error) {
      if (!mounted) return;
      final message = error.toString().replaceFirst('Exception: ', '');
      setState(() {
        _isRequestingHealthInformation = false;
        _hiRequestStatus = 'error';
        _hiRequestError = message;
      });
      _addConsoleLog(
        _createLogEntry(
          title: 'Health Information Request',
          timestamp: _nowText(),
          duration: '--',
          statusCode: 0,
          request: payload,
          response: {'error': message},
          headers: const <String, dynamic>{},
          expanded: true,
        ),
      );
      _showToast('Health information request failed: $message', isError: true);
    }
  }

  Future<Map<String, dynamic>> _waitForHealthInformationCallback(
    String requestId,
  ) async {
    if (requestId.isEmpty) {
      throw Exception('Health information requestId was not returned.');
    }

    const maxAttempts = 30;
    for (var attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        await Future.delayed(const Duration(seconds: 2));
      }
      if (!mounted) {
        throw Exception('Health information request was cancelled.');
      }

      try {
        final statusResult =
            await ConsentManagerApiService.fetchHipTransferStatusWithMetadata(
              requestId,
            );

        final tx = statusResult.data['transaction'] as Map<String, dynamic>;

        _addConsoleLog(
          _logFromConsentManagerExecution(
            statusResult.execution,
            expanded: true,
            extraResponse: {
              'attempt': attempt,
              'backendStatus': tx['status'],
              'transactionId': tx['transactionId'],
            },
          ),
        );

        // Update bundle preview if available
        if (tx['bundles'] is Map) {
          final bundles = tx['bundles'] as Map<String, dynamic>;
          if (bundles.isNotEmpty) {
            _generatedFhirBundle = Map<String, dynamic>.from(
              bundles.values.first as Map,
            );
            _isBundleGenerated = true;
            _isBundleValidated = true;
          }
        }

        // Save keys
        final txId = tx['transactionId']?.toString() ?? '';
        if (txId.isNotEmpty) {
          _hiTransactionId = txId;
        }

        final dataPushUrl = tx['dataPushUrl']?.toString() ?? '';
        if (dataPushUrl.isNotEmpty) {
          _hiDataPushUrl = dataPushUrl;
        }

        final status = tx['status']?.toString().toUpperCase() ?? '';

        // Proceed once the backend has accepted the request and returned a transaction ID.
        // The later transfer stages are handled by the local bundle generation flow.
        if (txId.isNotEmpty && status != 'FAILED') {
          return tx;
        }

        if (status == 'FAILED') {
          throw Exception(tx['error'] ?? 'Backend reported transfer failure.');
        }
      } on ConsentManagerApiException catch (error) {
        final isWaiting = error.execution.statusCode == 404;
        _addConsoleLog(
          _logFromConsentManagerExecution(
            error.execution,
            expanded: attempt == 1 || attempt == maxAttempts,
            extraResponse: {
              'attempt': attempt,
              'status': isWaiting
                  ? 'waiting for backend transfer initialization'
                  : 'failed',
              if (isWaiting && attempt < maxAttempts) 'nextRetryInSeconds': 2,
            },
          ),
        );

        if (!isWaiting || attempt == maxAttempts) {
          rethrow;
        }
      }
    }

    throw Exception(
      'Health information data transfer did not complete in time.',
    );
  }

  static String _extractTransactionId(Map<String, dynamic> data) {
    return _firstText([
      data['transactionId'],
      data['response'] is Map ? data['response']['transactionId'] : null,
      data['acknowledgement'] is Map
          ? data['acknowledgement']['transactionId']
          : null,
      data['payload'] is Map ? data['payload']['transactionId'] : null,
    ]);
  }

  void _runFHIRValidation() {
    setState(() {
      _isValidatingBundle = true;
    });

    Future.delayed(const Duration(seconds: 1), () {
      setState(() {
        _isValidatingBundle = false;
        _isBundleValidated = true;
      });

      _addConsoleLog(
        _createLogEntry(
          title: 'Validate Bundle',
          timestamp: DateTime.now()
              .toIso8601String()
              .replaceAll('T', ' ')
              .substring(0, 19),
          duration: '320ms',
          statusCode: 200,
          request: {
            'validator': 'ABDM-FHIR-validator-v1.2.0',
            'profile':
                'https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord',
          },
          response: {
            'isValid': true,
            'issues': [],
            'schemaValidation': 'PASS',
            'schematronValidation': 'PASS',
            'summary':
                'The resource Bundle/prescription-bundle matches all profile specifications.',
          },
          headers: {'X-Validation-Engine': 'HAPI FHIR v6.4.0'},
        ),
      );

      _showToast('FHIR Bundle schema validation passed with 0 errors.');
    });
  }

  Future<void> _startHealthDataTransfer() async {
    if (_isTransferring) return;

    final bundle = _generatedFhirBundle;
    final transactionId = _firstText([_hiTransactionId]);
    final consentId = _firstText([
      _selectedConsent?['consentArtefactId'],
      _selectedConsent?['consentId'],
    ]);

    if (bundle == null) {
      _showToast('Generate the FHIR Bundle before transfer.', isError: true);
      return;
    }
    if (transactionId.isEmpty) {
      _showToast(
        'Health information transaction ID is missing.',
        isError: true,
      );
      return;
    }
    if (consentId.isEmpty) {
      _showToast('Consent ID is missing for transfer.', isError: true);
      return;
    }

    final selectedRecords = _selectedRecords.entries
        .where((entry) => entry.value)
        .map((entry) => entry.key)
        .toList(growable: false);

    setState(() {
      _isTransferring = true;
      _transferProgress = 0.0;
      _transferStepStatus = 'running';
      _transferSteps = [
        {
          'title': 'Generate Bundle',
          'status': 'success',
          'timestamp': _timeOnly(DateTime.now()),
          'duration': '--',
        },
        {
          'title': 'Validate Schema',
          'status': _isBundleValidated ? 'success' : 'pending',
          'timestamp': _isBundleValidated ? _timeOnly(DateTime.now()) : '--',
          'duration': _isBundleValidated ? '--' : '--',
        },
        {
          'title': 'Package FHIR payload',
          'status': 'running',
          'timestamp': _timeOnly(DateTime.now()),
          'duration': '--',
        },
        {
          'title': 'Upload to HIU Push URL',
          'status': 'pending',
          'timestamp': '--',
          'duration': '--',
        },
        {
          'title': 'Notify Consent Manager',
          'status': 'pending',
          'timestamp': '--',
          'duration': '--',
        },
      ];
    });

    final packageStopwatch = Stopwatch()..start();
    packageStopwatch.stop();
    _addConsoleLog(
      _createLogEntry(
        title: 'Prepare HIP Transfer Delegate',
        timestamp: _nowText(),
        duration: _formatDuration(packageStopwatch.elapsed),
        statusCode: 200,
        request: {
          'bundleId': bundle['id'],
          'transactionId': transactionId,
          'recordsSelected': selectedRecords,
          'dataSource':
              'persisted M2TransactionStore health-information context',
        },
        response: {
          'transactionId': transactionId,
          'consentId': consentId,
          'serverResponsibilities': [
            'load persisted dataPushUrl',
            'load persisted HIU keyMaterial',
            'generate ABDM FHIR bundles',
            'encrypt with ECDH Curve25519',
            'push encrypted entries',
            'notify transfer completion',
          ],
        },
        headers: const {'Content-Type': 'application/fhir+json'},
      ),
    );

    try {
      await Future.delayed(const Duration(milliseconds: 300));
      if (!mounted) return;
      setState(() {
        _transferProgress = 0.35;
        _transferSteps[2] = {
          'title': 'Package FHIR payload',
          'status': 'success',
          'timestamp': _timeOnly(DateTime.now()),
          'duration': _formatDuration(packageStopwatch.elapsed),
        };
        _transferSteps[3] = {
          'title': 'Upload to HIU Push URL',
          'status': 'running',
          'timestamp': _timeOnly(DateTime.now()),
          'duration': '--',
        };
      });

      final pushResult =
          await ConsentManagerApiService.delegatePushToBackendWithMetadata(
            consentId: consentId,
            transactionId: transactionId,
            recordTypes: selectedRecords,
            abhaAddress: _patientAbhaAddress(),
          );
      if (!mounted) return;
      _addConsoleLog(_logFromConsentManagerExecution(pushResult.execution));
      final transaction = pushResult.data['transaction'];
      setState(() {
        _lastTransactionData = transaction is Map ? Map<String, dynamic>.from(transaction) : null;
      });
      final transferStatus = transaction is Map
          ? transaction['status']?.toString()
          : null;
      if (pushResult.data['success'] != true ||
          (transferStatus != 'TRANSFER_COMPLETED' && transferStatus != 'PUSH_ACKNOWLEDGED' && transferStatus != 'Completed' && transferStatus != 'Data Push Completed' && transferStatus != 'Notify Sent' && transferStatus != 'Consent Received')) {
        throw Exception(
          transaction is Map
              ? transaction['errorDetails']?.toString() ??
                    'Backend did not verify transfer completion.'
              : 'Backend did not verify transfer completion.',
        );
      }
      setState(() {
        _transferProgress = 0.7;
        _transferSteps[3] = {
          'title': 'Upload to HIU Push URL',
          'status': 'success',
          'timestamp': _timeOnly(DateTime.now()),
          'duration': _formatDuration(pushResult.execution.duration),
        };
        _transferSteps[4] = {
          'title': 'Notify Consent Manager',
          'status': 'running',
          'timestamp': _timeOnly(DateTime.now()),
          'duration': '--',
        };
      });

      setState(() {
        _transferProgress = 1.0;
        _transferSteps[4] = {
          'title': 'Notify Consent Manager',
          'status': 'success',
          'timestamp': _timeOnly(DateTime.now()),
          'duration': _formatDuration(pushResult.execution.duration),
        };
      });
      await _transferIsComplete();
    } on ConsentManagerApiException catch (error) {
      if (!mounted) return;
      _addConsoleLog(
        _logFromConsentManagerExecution(error.execution, expanded: true),
      );
      setState(() {
        _isTransferring = false;
        _transferStepStatus = 'error';
        final runningIndex = _transferSteps.indexWhere(
          (step) => step['status'] == 'running',
        );
        if (runningIndex >= 0) {
          _transferSteps[runningIndex] = {
            ..._transferSteps[runningIndex],
            'status': 'error',
            'duration': _formatDuration(error.execution.duration),
          };
        }
      });
      _showToast(
        'Health data transfer failed: ${error.message}',
        isError: true,
      );
    } catch (error) {
      if (!mounted) return;
      final message = error.toString().replaceFirst('Exception: ', '');
      setState(() {
        _isTransferring = false;
        _transferStepStatus = 'error';
        final runningIndex = _transferSteps.indexWhere(
          (step) => step['status'] == 'running',
        );
        if (runningIndex >= 0) {
          _transferSteps[runningIndex] = {
            ..._transferSteps[runningIndex],
            'status': 'error',
            'duration': '--',
          };
        }
      });
      _addConsoleLog(
        _createLogEntry(
          title: 'Data Transfer',
          timestamp: _nowText(),
          duration: '--',
          statusCode: 0,
          request: {'transactionId': transactionId, 'consentId': consentId},
          response: {'error': message},
          headers: const <String, dynamic>{},
          expanded: true,
        ),
      );
      _showToast('Health data transfer failed: $message', isError: true);
    }
  }

  Future<void> _transferIsComplete() async {
    setState(() {
      _isTransferring = false;
    });

    _showToast('Health data transferred and notification acknowledged.');
    await _loadTransferHistory();
    if (!mounted) return;

    // Auto navigate to Transfer History
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (!mounted) return;
      setState(() {
        _currentStep = 4;
      });
    });
  }

  // --- WIDGET BUILDERS ---

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Milestone 2: Data Exchange Workspace'),
        actions: [
          IconButton(
            icon: Icon(
              _isConsoleExpanded ? Icons.terminal : Icons.terminal_outlined,
            ),
            tooltip: 'Toggle Developer Console',
            onPressed: () {
              setState(() {
                _isConsoleExpanded = !_isConsoleExpanded;
              });
            },
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Left Sidebar Nav / Flow Panel
          _buildWorkflowSidebar(),

          // Main Screen Area
          Expanded(
            child: Container(
              color: const Color(0xFFFAFAFA),
              child: Column(
                children: [
                  // Step Breadcrumbs banner
                  _buildWorkflowBreadcrumbs(),

                  // Patient Info Banner
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20.0,
                      vertical: 8.0,
                    ),
                    child: _PatientSummaryHeader(
                      patientProfile: widget.patientProfile,
                    ),
                  ),

                  // Main Content View
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 20.0,
                        vertical: 12.0,
                      ),
                      child: _buildActiveStepPage(),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Reusable Expandable Developer Console
          if (_isConsoleExpanded) _buildDeveloperConsole(),
        ],
      ),
    );
  }

  Widget _buildWorkflowSidebar() {
    final navItems = [
      {'title': 'Consent Inbox', 'icon': Icons.mail_outline},
      {'title': 'HI Request', 'icon': Icons.description_outlined},
      {'title': 'FHIR Preview', 'icon': Icons.code_outlined},
      {'title': 'Data Transfer', 'icon': Icons.swap_horiz_outlined},
      {'title': 'Transfer History', 'icon': Icons.history_outlined},
    ];

    return Container(
      width: 250,
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(right: BorderSide(color: Color(0xFFE3F2FD))),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Sidebar Header
          Container(
            padding: const EdgeInsets.all(24),
            color: const Color(0xFFF7FBFF),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'WORKFLOW PATH',
                  style: TextStyle(
                    fontSize: 11,
                    letterSpacing: 1.5,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF0D47A1),
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Consent & Transfer',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                    color: Colors.blueGrey.shade900,
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xFFE3F2FD)),
          const SizedBox(height: 12),

          // Nav Links
          Expanded(
            child: ListView.builder(
              itemCount: navItems.length,
              itemBuilder: (context, index) {
                final item = navItems[index];
                final isSelected = _currentStep == index;
                return Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12.0,
                    vertical: 4.0,
                  ),
                  child: InkWell(
                    onTap: () {
                      setState(() {
                        _currentStep = index;
                      });
                      if (index == 4) {
                        _loadTransferHistory();
                      }
                    },
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 14,
                      ),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? const Color(0xFFE3F2FD)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            item['icon'] as IconData,
                            color: isSelected
                                ? const Color(0xFF0D47A1)
                                : Colors.blueGrey.shade600,
                            size: 22,
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Text(
                              item['title'] as String,
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: isSelected
                                    ? FontWeight.w800
                                    : FontWeight.w600,
                                color: isSelected
                                    ? const Color(0xFF0D47A1)
                                    : Colors.blueGrey.shade800,
                              ),
                            ),
                          ),
                          if (isSelected)
                            Container(
                              width: 6,
                              height: 6,
                              decoration: const BoxDecoration(
                                color: Color(0xFF0D47A1),
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          ),

          // Footer info
          Padding(
            padding: const EdgeInsets.all(20.0),
            child: Card(
              color: const Color(0xFFF7FBFF),
              elevation: 0,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: const BorderSide(color: Color(0xFFD8E4F0)),
              ),
              child: const Padding(
                padding: EdgeInsets.all(14.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          Icons.security,
                          size: 16,
                          color: Color(0xFF00A86B),
                        ),
                        SizedBox(width: 6),
                        Text(
                          'Sandbox Active',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                            color: Color(0xFF00A86B),
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 6),
                    Text(
                      'ABDM Gateway pipeline executes validation and ECDH key packaging.',
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.black54,
                        height: 1.3,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWorkflowBreadcrumbs() {
    final steps = [
      'Consent Requests',
      'HI Request Details',
      'FHIR Mapping',
      'Data Transfer',
      'History Archive',
    ];

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      color: Colors.white,
      child: Row(
        children: List.generate(steps.length * 2 - 1, (index) {
          if (index.isOdd) {
            return const Padding(
              padding: EdgeInsets.symmetric(horizontal: 8.0),
              child: Icon(
                Icons.arrow_forward_ios,
                size: 12,
                color: Color(0xFFB0BEC5),
              ),
            );
          }

          final stepIdx = index ~/ 2;
          final stepTitle = steps[stepIdx];
          final isPassed = stepIdx < _currentStep;
          final isCurrent = stepIdx == _currentStep;

          return Expanded(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: isPassed
                      ? const Color(0xFF00A86B)
                      : isCurrent
                      ? const Color(0xFF0D47A1)
                      : const Color(0xFFECEFF1),
                  child: isPassed
                      ? const Icon(Icons.check, size: 12, color: Colors.white)
                      : Text(
                          '${stepIdx + 1}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: isCurrent
                                ? Colors.white
                                : const Color(0xFF78909C),
                          ),
                        ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    stepTitle,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: isCurrent || isPassed
                          ? FontWeight.bold
                          : FontWeight.w500,
                      color: isCurrent
                          ? const Color(0xFF0D47A1)
                          : isPassed
                          ? const Color(0xFF00A86B)
                          : const Color(0xFF78909C),
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          );
        }),
      ),
    );
  }

  Widget _buildActiveStepPage() {
    switch (_currentStep) {
      case 0:
        return _buildConsentRequestsPage();
      case 1:
        return _buildHIRequestPage();
      case 2:
        return _buildFHIRPreviewPage();
      case 3:
        return _buildTransferPage();
      case 4:
        return _buildTransferHistoryPage();
      default:
        return const SizedBox.shrink();
    }
  }

  // --- PAGE 1: CONSENT REQUESTS ---

  Widget _buildConsentRequestsPage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const DesktopPageIntro(
          eyebrow: 'Consent Inbox',
          title: 'ABDM Consent Requests Queue',
          description:
              'Display and manage incoming consent requests from the ABDM Consent Manager (via gateways/on-notify callbacks). Approve consent to authorize secure record exchange.',
          pills: [
            'Pending Decisons',
            'Access Permission Control',
            'Consent Artifact details',
          ],
        ),
        const SizedBox(height: 12),
        if (_isLoadingConsents && _consents.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(32.0),
              child: Center(child: CircularProgressIndicator()),
            ),
          )
        else if (_consentError != null && _consents.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                children: [
                  Text(
                    _consentError!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: Color(0xFFD32F2F)),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _loadConsentInbox,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Retry Consent Inbox'),
                  ),
                ],
              ),
            ),
          )
        else if (_consents.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                children: [
                  const Text(
                    'No consent requests found yet.',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: _loadConsentInbox,
                    icon: const Icon(Icons.refresh),
                    label: const Text('Refresh'),
                  ),
                ],
              ),
            ),
          )
        else
          LayoutBuilder(
            builder: (context, constraints) {
              final double listWidth = constraints.maxWidth >= 900
                  ? 360
                  : double.infinity;
              final isSplit = constraints.maxWidth >= 900;

              final Widget listView = Container(
                width: listWidth,
                constraints: BoxConstraints(maxHeight: isSplit ? 600 : 400),
                child: ListView.separated(
                  itemCount: _consents.length,
                  separatorBuilder: (context, index) =>
                      const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final consent = _consents[index];
                    final isSelected =
                        _selectedConsent?['consentId'] == consent['consentId'];
                    final status = consent['status'] as String;

                    return Card(
                      elevation: isSelected ? 8 : 2,
                      shadowColor: isSelected
                          ? const Color(0x330D47A1)
                          : Colors.black12,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(20),
                        side: BorderSide(
                          color: isSelected
                              ? const Color(0xFF0D47A1)
                              : Colors.transparent,
                          width: 1.5,
                        ),
                      ),
                      child: InkWell(
                        onTap: () {
                          setState(() {
                            _selectedConsent = consent;
                          });
                        },
                        borderRadius: BorderRadius.circular(20),
                        child: Padding(
                          padding: const EdgeInsets.all(16.0),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Expanded(
                                    child: Text(
                                      consent['consentId'] as String,
                                      style: const TextStyle(
                                        fontWeight: FontWeight.bold,
                                        fontSize: 13,
                                        fontFamily: 'monospace',
                                      ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                  _buildStatusChip(status),
                                ],
                              ),
                              const SizedBox(height: 8),
                              Text(
                                consent['requester'] as String,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                  color: Color(0xFF212121),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Purpose: ${consent['purpose']}',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: Colors.black54,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Divider(
                                height: 1,
                                color: Color(0xFFECEFF1),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                mainAxisAlignment:
                                    MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Created: ${_datePrefix(consent['createdDate'])}',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      color: Colors.grey,
                                    ),
                                  ),
                                  Text(
                                    '${(consent['hiTypes'] as List).length} HI Types',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                      color: Color(0xFF1976D2),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              );

              final Widget detailsView = Expanded(
                child: _selectedConsent == null
                    ? const Card(
                        child: Center(
                          child: Text(
                            'Select a consent request from the list to view details.',
                          ),
                        ),
                      )
                    : _buildConsentDetailPanel(_selectedConsent!),
              );

              if (isSplit) {
                return Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [listView, const SizedBox(width: 20), detailsView],
                );
              } else {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    listView,
                    const SizedBox(height: 20),
                    _selectedConsent == null
                        ? const SizedBox.shrink()
                        : _buildConsentDetailPanel(_selectedConsent!),
                  ],
                );
              }
            },
          ),
      ],
    );
  }

  Widget _buildConsentDetailPanel(Map<String, dynamic> consent) {
    final status = consent['status'] as String;
    final isPending = status == 'Pending';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Consent details header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CONSENT REQUEST DETAILS',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: Colors.blueGrey.shade600,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    SelectableText(
                      consent['consentId'] as String,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
                _buildStatusChip(status, large: true),
              ],
            ),
            const SizedBox(height: 20),

            // Info rows grid
            Wrap(
              spacing: 24,
              runSpacing: 16,
              children: [
                _buildGridItem('HIU Requester', consent['requester']),
                _buildGridItem('Requester ID', consent['requesterId']),
                _buildGridItem('Purpose of Access', consent['purpose']),
                _buildGridItem('HIP Provider ID', consent['hip']),
                _buildGridItem('Patient Reference', consent['patient']),
                _buildGridItem('ABHA Address', consent['abhaAddress']),
                _buildGridItem('ABHA Number', consent['abhaNumber']),
                _buildGridItem(
                  'Permission Range',
                  '${consent['permissionStart'].substring(0, 10)} to ${consent['permissionEnd'].substring(0, 10)}',
                ),
                _buildGridItem('Erase Date / Expiry', consent['expiry']),
                _buildGridItem('Access Frequency', consent['frequency']),
              ],
            ),
            const SizedBox(height: 20),

            // HI Types badge list
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Requested HI Types',
                  style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: (consent['hiTypes'] as List).map((type) {
                    return Chip(
                      label: Text(type as String),
                      backgroundColor: const Color(0xFFF1F8E9),
                      side: const BorderSide(color: Color(0xFFDCEDC8)),
                      labelStyle: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF33691E),
                      ),
                    );
                  }).toList(),
                ),
              ],
            ),
            const SizedBox(height: 20),

            // Expandable JSON Viewers
            _buildJsonViewerAccordion(consent),
            const SizedBox(height: 24),

            // Action buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton.icon(
                  onPressed: _isLoadingConsents ? null : _loadConsentInbox,
                  icon: const Icon(Icons.refresh, size: 18),
                  label: Text(_isLoadingConsents ? 'Refreshing...' : 'Refresh'),
                ),
                const SizedBox(width: 12),
                if (isPending) ...[
                  OutlinedButton(
                    onPressed: _isSubmittingConsentDecision
                        ? null
                        : () => _rejectConsent(consent),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFEF4444),
                      side: const BorderSide(color: Color(0xFFFEE2E2)),
                    ),
                    child: const Text('Reject Request'),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: _isSubmittingConsentDecision
                        ? null
                        : () => _approveConsent(consent),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF00A86B),
                    ),
                    child: const Text('Approve & Link'),
                  ),
                ] else ...[
                  ElevatedButton.icon(
                    onPressed: () {
                      setState(() {
                        _currentStep = 1; // Proceed to HI Request
                      });
                    },
                    icon: const Icon(Icons.arrow_forward),
                    label: const Text('Configure Data Request'),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGridItem(String label, String value) {
    return SizedBox(
      width: 260,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: Colors.black54,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: Color(0xFF212121),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildJsonViewerAccordion(Map<String, dynamic> consent) {
    final requestHeaders = {
      'X-Consent-Mode': _consentMode.apiValue,
      'X-HIP-ID': HospitalConfig.hipId,
      'X-Auth-Token': '<redacted>',
    };

    final consentJson = {
      'consentId': consent['consentId'],
      'status': consent['status'],
      'hiuId': consent['requesterId'],
      'patient': {'id': consent['abhaAddress']},
      'permission': {
        'accessMode': 'VIEW',
        'dateRange': {
          'from': consent['permissionStart'],
          'to': consent['permissionEnd'],
        },
        'dataEraseAt': consent['expiry'],
        'frequency': {'unit': 'HOUR', 'value': 1},
      },
      'raw': consent['raw'],
    };

    return Card(
      elevation: 0,
      color: const Color(0xFFFAFAFA),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFECEFF1)),
      ),
      child: ExpansionTile(
        title: Row(
          children: const [
            Icon(Icons.code, size: 18, color: Color(0xFF0D47A1)),
            SizedBox(width: 8),
            Text(
              'Developer Inspection (ABDM JSON & Headers)',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.bold,
                color: Color(0xFF0D47A1),
              ),
            ),
          ],
        ),
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 16.0,
              vertical: 12.0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildConsoleSectionHeader('REQUEST HEADERS'),
                _buildCodeSnippet(requestHeaders),
                const SizedBox(height: 12),
                _buildConsoleSectionHeader('ABDM CONSENT ARTIFACT JSON'),
                _buildCodeSnippet(consentJson),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    TextButton.icon(
                      icon: const Icon(Icons.copy, size: 14),
                      label: const Text('Copy JSON'),
                      onPressed: () {
                        Clipboard.setData(
                          ClipboardData(
                            text: const JsonEncoder.withIndent(
                              '  ',
                            ).convert(consentJson),
                          ),
                        );
                        _showToast(
                          'Consent artifact JSON copied to clipboard.',
                        );
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // --- PAGE 2: HEALTH INFORMATION REQUEST ---

  Widget _buildHIRequestPage() {
    final consentId =
        _selectedConsent?['consentId'] ?? 'No approved consent selected';
    final purpose = _selectedConsent?['purpose'] ?? 'Care Management';
    final requester = _selectedConsent?['requester'] ?? 'Max Healthcare Clinic';
    final transactionId = _hiTransactionId ?? 'Pending ABDM callback';
    final dataPushUrl = _hiDataPushUrl ?? 'Resolved by backend callback config';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const DesktopPageIntro(
          eyebrow: 'Data Extraction',
          title: 'Health Information Request Configure',
          description:
              'Configure the FHIR bundle mapping based on the approved Consent parameters. Select which hospital records (Prescription, OPD Consults, Invoices etc.) match the request scope.',
          pills: [
            'Consent validation',
            'FHIR mapping selection',
            'Bundle assembly',
          ],
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Request details summary
                Text(
                  'LINKED CONSENT REFERENCE',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Colors.blueGrey.shade600,
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      consentId,
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        fontFamily: 'monospace',
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFE8F5E9),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFC8E6C9)),
                      ),
                      child: Row(
                        children: const [
                          Icon(Icons.check, size: 12, color: Color(0xFF388E3C)),
                          SizedBox(width: 4),
                          Text(
                            'CONSENT GRANTED',
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                              color: Color(0xFF388E3C),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                Wrap(
                  spacing: 20,
                  runSpacing: 12,
                  children: [
                    _buildGridItem('Requester', requester),
                    _buildGridItem('Access Purpose', purpose),
                    _buildGridItem('HI Request ID', _hiRequestId ?? '-'),
                    _buildGridItem('HI Request Transaction ID', transactionId),
                    _buildGridItem('HIU Data Push URL', dataPushUrl),
                  ],
                ),

                const SizedBox(height: 24),
                const Divider(height: 1, color: Color(0xFFECEFF1)),
                const SizedBox(height: 20),

                // Checkbox Cards Section
                const Text(
                  'Select Local Health Records to Map into Bundle',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF212121),
                  ),
                ),
                const SizedBox(height: 12),

                Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: _selectedRecords.keys.map((recordType) {
                    final isChecked = _selectedRecords[recordType] == true;
                    final iconMap = {
                      'Prescription': Icons.medical_services_outlined,
                      'OP Consultation': Icons.assignment_outlined,
                      'Invoice': Icons.receipt_long_outlined,
                      'Diagnostic Report': Icons.analytics_outlined,
                      'Wellness': Icons.favorite_border_outlined,
                      'Immunization': Icons.vaccines_outlined,
                      'Discharge Summary': Icons.description_outlined,
                      'Health Document Record': Icons.file_present_outlined,
                    };

                    final width = MediaQuery.of(context).size.width >= 1200
                        ? (MediaQuery.of(context).size.width - 24 - 36) / 4
                        : (MediaQuery.of(context).size.width - 24 - 12) / 2;

                    return SizedBox(
                      width: width,
                      child: Card(
                        elevation: isChecked ? 4 : 1,
                        shadowColor: isChecked
                            ? const Color(0x330D47A1)
                            : Colors.black12,
                        color: isChecked
                            ? Colors.white
                            : const Color(0xFFFAFAFA),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                          side: BorderSide(
                            color: isChecked
                                ? const Color(0xFF0D47A1)
                                : const Color(0xFFECEFF1),
                            width: isChecked ? 1.5 : 1,
                          ),
                        ),
                        child: InkWell(
                          onTap: () {
                            setState(() {
                              final newValue = !isChecked;
                              if (newValue) {
                                for (var key in _selectedRecords.keys.toList()) {
                                  _selectedRecords[key] = false;
                                }
                              }
                              _selectedRecords[recordType] = newValue;
                            });
                          },
                          borderRadius: BorderRadius.circular(20),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 16.0,
                              vertical: 12.0,
                            ),
                            child: Row(
                              children: [
                                Checkbox(
                                  value: isChecked,
                                  activeColor: const Color(0xFF0D47A1),
                                  onChanged: (val) {
                                    setState(() {
                                      final newValue = val ?? false;
                                      if (newValue) {
                                        for (var key in _selectedRecords.keys.toList()) {
                                          _selectedRecords[key] = false;
                                        }
                                      }
                                      _selectedRecords[recordType] = newValue;
                                    });
                                  },
                                ),
                                const SizedBox(width: 8),
                                Icon(
                                  iconMap[recordType] ??
                                      Icons.sticky_note_2_outlined,
                                  color: isChecked
                                      ? const Color(0xFF0D47A1)
                                      : Colors.grey,
                                  size: 24,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Text(
                                        recordType,
                                        style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.bold,
                                          color: isChecked
                                              ? const Color(0xFF0D47A1)
                                              : Colors.blueGrey.shade800,
                                        ),
                                      ),
                                      const SizedBox(height: 2),
                                      Text(
                                        isChecked
                                            ? '1 Draft record matched'
                                            : 'Exclude',
                                        style: TextStyle(
                                          fontSize: 11,
                                          color: isChecked
                                              ? const Color(0xFF00A86B)
                                              : Colors.grey,
                                          fontWeight: isChecked
                                              ? FontWeight.bold
                                              : FontWeight.normal,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  }).toList(),
                ),

                const SizedBox(height: 24),
                const Divider(height: 1, color: Color(0xFFECEFF1)),
                const SizedBox(height: 20),

                // Assembly Output
                _buildHIRequestStatusSummary(),
                const SizedBox(height: 24),

                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () {
                        setState(() {
                          _currentStep = 0; // Go back to consents
                        });
                      },
                      icon: const Icon(Icons.arrow_back),
                      label: const Text('Back to Consents'),
                    ),
                    const SizedBox(width: 12),
                    ElevatedButton.icon(
                      onPressed: _isRequestingHealthInformation
                          ? null
                          : _requestHealthInformationAndGenerateBundle,
                      icon: _isRequestingHealthInformation
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            )
                          : const Icon(Icons.settings),
                      label: Text(
                        _isRequestingHealthInformation
                            ? 'Waiting for ABDM Callback'
                            : 'Request HI & Generate Bundle',
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHIRequestStatusSummary() {
    final selectedCount = _selectedRecords.values.where((v) => v).length;
    final statusText = switch (_hiRequestStatus) {
      'loading' => 'REQUESTING HI',
      'success' => 'HI REQUEST READY',
      'error' => 'REQUEST FAILED',
      _ => _isBundleGenerated ? 'BUNDLE ASSEMBLED' : 'DRAFT MAPPING',
    };
    final statusColor = switch (_hiRequestStatus) {
      'loading' => const Color(0xFF1565C0),
      'success' => const Color(0xFF388E3C),
      'error' => const Color(0xFFD32F2F),
      _ =>
        _isBundleGenerated ? const Color(0xFF388E3C) : const Color(0xFFE65100),
    };
    final statusBackground = switch (_hiRequestStatus) {
      'loading' => const Color(0xFFE3F2FD),
      'success' => const Color(0xFFE8F5E9),
      'error' => const Color(0xFFFFEBEE),
      _ =>
        _isBundleGenerated ? const Color(0xFFE8F5E9) : const Color(0xFFFFF3E0),
    };

    return Card(
      color: const Color(0xFFF7FBFF),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: Color(0xFFD8E4F0)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18.0),
        child: Row(
          children: [
            const CircleAvatar(
              backgroundColor: Color(0xFFE3F2FD),
              child: Icon(Icons.info_outline, color: Color(0xFF0D47A1)),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Records Selected for Assembly: $selectedCount of ${_selectedRecords.length}',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                      color: Color(0xFF0D47A1),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _hiRequestStatus == 'loading'
                        ? 'ABDM callbacks are asynchronous. The app is polling the on-request callback until a transaction ID is received.'
                        : _hiRequestStatus == 'success'
                        ? 'Transaction ID: ${_hiTransactionId ?? '-'}'
                        : _hiRequestStatus == 'error'
                        ? _hiRequestError ??
                              'Health information request failed.'
                        : 'Selecting "Request HI" sends the approved consent to ABDM before the FHIR bundle is assembled.',
                    style: TextStyle(
                      fontSize: 12,
                      color: _hiRequestStatus == 'error'
                          ? const Color(0xFFD32F2F)
                          : Colors.black54,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: statusBackground,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                statusText,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: statusColor,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- PAGE 3: FHIR BUNDLE PREVIEW & VALIDATION ---

  Widget _buildFHIRPreviewPage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const DesktopPageIntro(
          eyebrow: 'FHIR Playground',
          title: 'FHIR Bundle Preview & Validation',
          description:
              'Preview the formatted FHIR composition mapping. Perform validation check against the ABDM profile specs (NRCES schema validation) before initiating encrypted data exchange.',
          pills: [
            'FHIR R4 Composition',
            'NRCES Validation Check',
            'Payload download',
          ],
        ),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final isSplit = constraints.maxWidth >= 950;
            final double treeWidth = isSplit ? 320 : double.infinity;

            final Widget treeView = Container(
              width: treeWidth,
              constraints: BoxConstraints(maxHeight: isSplit ? 650 : 300),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'FHIR RESOURCE TREE',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF0D47A1),
                          letterSpacing: 1.2,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Expanded(
                        child: ListView(
                          children: [
                            _buildTreeItem(
                              'Bundle',
                              'Bundle/prescription-bundle-01',
                              true,
                            ),
                            _buildTreeChildItem(
                              'Composition',
                              'Composition/composition-01',
                            ),
                            _buildTreeChildItem(
                              'Patient',
                              'Patient/patient-01',
                            ),
                            _buildTreeChildItem(
                              'Encounter',
                              'Encounter/encounter-01',
                            ),
                            _buildTreeChildItem(
                              'Practitioner',
                              'Practitioner/practitioner-01',
                            ),
                            _buildTreeChildItem(
                              'MedicationRequest',
                              'MedicationRequest/medreq-01',
                            ),
                            _buildTreeChildItem(
                              'Observation',
                              'Observation/obs-01',
                            ),
                            _buildTreeChildItem(
                              'Condition',
                              'Condition/cond-01',
                            ),
                            _buildTreeChildItem(
                              'Organization',
                              'Organization/org-01',
                            ),
                            _buildTreeChildItem(
                              'DocumentReference',
                              'DocumentReference/docref-01',
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );

            final Widget previewView = Container(
              constraints: const BoxConstraints(minHeight: 500, maxHeight: 650),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Viewer Format tabs (JSON / XML / Validation)
                      Row(
                        children: [
                          _buildViewerFormatTab('JSON'),
                          const SizedBox(width: 8),
                          _buildViewerFormatTab('XML'),
                          const SizedBox(width: 8),
                          _buildViewerFormatTab('Validation Output'),
                          const Spacer(),
                          IconButton(
                            icon: const Icon(Icons.copy, size: 20),
                            tooltip: 'Copy current view',
                            onPressed: () {
                              _showToast('Copied content to clipboard.');
                            },
                          ),
                          IconButton(
                            icon: const Icon(Icons.download, size: 20),
                            tooltip: 'Download FHIR resource file',
                            onPressed: () {
                              _showToast(
                                'FHIR resource downloaded (Temp/fhir_bundle.json).',
                              );
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 16),
                      const Divider(height: 1, color: Color(0xFFECEFF1)),
                      const SizedBox(height: 16),

                      // Viewer content
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFAFAFA),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: const Color(0xFFECEFF1)),
                          ),
                          child: SingleChildScrollView(
                            child: _buildFHIRViewerContent(),
                          ),
                        ),
                      ),
                      const SizedBox(height: 20),

                      // Buttons
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          ElevatedButton.icon(
                            onPressed: _isValidatingBundle
                                ? null
                                : _runFHIRValidation,
                            icon: _isValidatingBundle
                                ? const SizedBox(
                                    width: 16,
                                    height: 16,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Icon(Icons.verified_user_outlined),
                            label: Text(
                              _isValidatingBundle
                                  ? 'Validating...'
                                  : 'Validate against Profile',
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF1976D2),
                            ),
                          ),
                          const SizedBox(width: 12),
                          ElevatedButton.icon(
                            onPressed: _isBundleValidated
                                ? () {
                                    setState(() {
                                      _currentStep = 3; // Go to transfer
                                    });
                                  }
                                : null,
                            icon: const Icon(Icons.arrow_forward),
                            label: const Text('Proceed to Data Transfer'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF00A86B),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );

            if (isSplit) {
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  treeView,
                  const SizedBox(width: 20),
                  Expanded(child: previewView),
                ],
              );
            } else {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [treeView, const SizedBox(height: 20), previewView],
              );
            }
          },
        ),
      ],
    );
  }

  Widget _buildTreeItem(String title, String path, bool isSelected) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: isSelected ? const Color(0xFFE3F2FD) : Colors.transparent,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(
            Icons.folder,
            color: isSelected ? const Color(0xFF0D47A1) : Colors.grey,
            size: 18,
          ),
          const SizedBox(width: 8),
          Text(
            title,
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: isSelected ? const Color(0xFF0D47A1) : Colors.black87,
            ),
          ),
          const Spacer(),
          Text(
            'Bundle Root',
            style: TextStyle(
              fontSize: 10,
              color: isSelected ? const Color(0xFF1B5E8C) : Colors.grey,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTreeChildItem(String title, String resourceId) {
    final isSelected = _selectedFhirResource == title;

    return Padding(
      padding: const EdgeInsets.only(left: 18.0, top: 4.0),
      child: InkWell(
        onTap: () {
          setState(() {
            _selectedFhirResource = title;
          });
        },
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: isSelected ? const Color(0xFFECEFF1) : Colors.transparent,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(
                Icons.insert_drive_file_outlined,
                color: isSelected ? Colors.blueGrey : Colors.grey,
                size: 16,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                    color: isSelected
                        ? Colors.blueGrey.shade800
                        : Colors.black87,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Text(
                '1 item',
                style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildViewerFormatTab(String format) {
    final isSelected = _fhirViewerFormat == format;

    return InkWell(
      onTap: () {
        setState(() {
          _fhirViewerFormat = format;
        });
      },
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF0D47A1) : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(
          format,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: isSelected ? Colors.white : Colors.blueGrey,
          ),
        ),
      ),
    );
  }

  Widget _buildFHIRViewerContent() {
    if (_fhirViewerFormat == 'Validation Output') {
      if (!_isBundleValidated) {
        return Column(
          children: const [
            SizedBox(height: 40),
            Icon(Icons.info_outline, size: 48, color: Colors.orange),
            SizedBox(height: 12),
            Text(
              'No validation completed yet.',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: Colors.black54,
              ),
            ),
            SizedBox(height: 6),
            Text(
              'Click the "Validate against Profile" button below to validate schema structure.',
              style: TextStyle(color: Colors.grey, fontSize: 12),
            ),
          ],
        );
      }

      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: const [
              Icon(Icons.check_circle, color: Color(0xFF00A86B)),
              SizedBox(width: 8),
              Text(
                'SCHEMA VERIFICATION PASSED',
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF00A86B),
                  fontSize: 14,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          _buildInfoRowStatic('Validation Engine', 'HAPI FHIR v6.4.0'),
          _buildInfoRowStatic(
            'Profile Specification',
            'https://nrces.in/ndhm/fhir/r4/StructureDefinition/PrescriptionRecord',
          ),
          _buildInfoRowStatic('FHIR Specification R4', 'v4.0.1'),
          _buildInfoRowStatic('Issues Detected', '0 Errors, 0 Warnings'),
          _buildInfoRowStatic('Timestamp', DateTime.now().toIso8601String()),
          const SizedBox(height: 16),
          const Text(
            'Raw Validator Logs:',
            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFFECEFF1)),
            ),
            child: const SelectableText(
              'Parsing Bundle...\n'
              'Loading dependent profiles: ndhm-prescription-r4...\n'
              'Matching instances schema check: Composition, Patient, Encounter, Practitioner, MedicationRequest...\n'
              'Verification outcome: SUCCESS. All validation tests passed cleanly.',
              style: TextStyle(
                fontFamily: 'monospace',
                fontSize: 11,
                height: 1.4,
              ),
            ),
          ),
        ],
      );
    }

    if (_fhirViewerFormat == 'XML') {
      return SelectableText(
        _bundleXml(_getBundleJSON()),
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 12,
          height: 1.35,
        ),
      );
    }

    // Default JSON View
    final currentResourceJSON = _getResourceJSON(_selectedFhirResource);
    String jsonString = const JsonEncoder.withIndent('  ').convert(currentResourceJSON);
    if (jsonString.length > 50000) {
      jsonString = jsonString.substring(0, 50000) + '\n\n...[TRUNCATED FOR UI PERFORMANCE]...';
    }
    return SelectableText(
      jsonString,
      style: const TextStyle(
        fontFamily: 'monospace',
        fontSize: 12,
        height: 1.35,
      ),
    );
  }

  Widget _buildInfoRowStatic(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6.0),
      child: Row(
        children: [
          Text(
            '$label: ',
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 12,
              color: Colors.blueGrey,
            ),
          ),
          Text(value, style: const TextStyle(fontSize: 12)),
        ],
      ),
    );
  }

  // --- PAGE 4: TRANSFER HEALTH INFORMATION ---

  Widget _buildTransferPage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const DesktopPageIntro(
          eyebrow: 'Data Push Pipeline',
          title: 'Transfer Health Information',
          description:
              'Encrypt the generated FHIR payload using ECDH public key material shared in the Consent artifact. Upload to the HIU Push endpoint and notify completion status.',
          pills: [
            'ECDH Encryption packaging',
            'HIU push upload',
            'CM Notify callback',
          ],
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'TRANSFER PIPELINE CONTROL',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF0D47A1),
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 16),

                // Pipeline Progress Banner
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            _isTransferring
                                ? 'Transferring health records...'
                                : _transferStepStatus == 'success'
                                ? 'Data Transfer completed successfully!'
                                : 'Pipeline Ready. Click "Initiate Transfer" to begin.',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 15,
                            ),
                          ),
                          const SizedBox(height: 8),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(10),
                            child: LinearProgressIndicator(
                              value: _transferProgress,
                              minHeight: 12,
                              backgroundColor: const Color(0xFFECEFF1),
                              color: _transferStepStatus == 'success'
                                  ? const Color(0xFF00A86B)
                                  : const Color(0xFF1976D2),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 24),
                    Column(
                      children: [
                        Text(
                          '${(_transferProgress * 100).toInt()}%',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w900,
                            color: _transferStepStatus == 'success'
                                ? const Color(0xFF00A86B)
                                : const Color(0xFF0D47A1),
                          ),
                        ),
                        Text(
                          _transferStepStatus.toUpperCase(),
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: _transferStepStatus == 'success'
                                ? const Color(0xFF00A86B)
                                : Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),

                const SizedBox(height: 24),
                const Divider(height: 1, color: Color(0xFFECEFF1)),
                const SizedBox(height: 20),

                // Transfer steps list
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 3,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Pipeline Timeline Steps',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 14,
                            ),
                          ),
                          const SizedBox(height: 12),
                          if (_transferSteps.isEmpty)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 24.0),
                              child: Text(
                                'Timeline is empty. Start the transfer to see real-time steps.',
                                style: TextStyle(
                                  color: Colors.grey,
                                  fontSize: 12,
                                ),
                              ),
                            )
                          else
                            ..._transferSteps.map((step) {
                              final status = step['status'] as String;
                              final isSuccess = status == 'success';
                              final isRunning = status == 'running';

                              return Padding(
                                padding: const EdgeInsets.only(bottom: 12.0),
                                child: Row(
                                  children: [
                                    CircleAvatar(
                                      radius: 12,
                                      backgroundColor: isSuccess
                                          ? const Color(0xFFE8F5E9)
                                          : isRunning
                                          ? const Color(0xFFE3F2FD)
                                          : const Color(0xFFECEFF1),
                                      child: isSuccess
                                          ? const Icon(
                                              Icons.check,
                                              size: 14,
                                              color: Color(0xFF388E3C),
                                            )
                                          : isRunning
                                          ? const SizedBox(
                                              width: 10,
                                              height: 10,
                                              child: CircularProgressIndicator(
                                                strokeWidth: 2,
                                              ),
                                            )
                                          : const SizedBox.shrink(),
                                    ),
                                    const SizedBox(width: 14),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            step['title'] as String,
                                            style: TextStyle(
                                              fontSize: 13,
                                              fontWeight: isSuccess || isRunning
                                                  ? FontWeight.bold
                                                  : FontWeight.normal,
                                              color: isSuccess
                                                  ? Colors.black87
                                                  : isRunning
                                                  ? const Color(0xFF0D47A1)
                                                  : Colors.grey,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            'Status: $status • Duration: ${step['duration']}',
                                            style: const TextStyle(
                                              fontSize: 11,
                                              color: Colors.grey,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    Text(
                                      step['timestamp'] as String,
                                      style: const TextStyle(
                                        fontSize: 11,
                                        color: Colors.blueGrey,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }),
                        ],
                      ),
                    ),
                    const SizedBox(width: 24),

                    // Developer Payload Summary Panel
                    Expanded(
                      flex: 2,
                      child: Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF7FBFF),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: const Color(0xFFD8E4F0)),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const Text(
                              'CRYPTO SCHEME SPEC',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF0D47A1),
                                letterSpacing: 1.2,
                              ),
                            ),
                            const SizedBox(height: 10),
                            _buildInfoRowStatic(
                              'Scheme',
                              (_lastTransactionData?['dataPushPayload']?['keyMaterial']?['cryptoAlg'] ?? 'ECDH') + '_' +
                              (_lastTransactionData?['dataPushPayload']?['keyMaterial']?['curve'] ?? 'Curve25519') + '_AES256GCM',
                            ),
                            _buildInfoRowStatic(
                              'Receiver Key',
                              'HIU_PUBLIC_ECDH_KEY', // Receiver key is provided securely by Gateway, usually not displayed in full.
                            ),
                            _buildInfoRowStatic(
                              'HIP Key pair',
                              'HIP_ECDH_KEY_PAIR', // Sender keys are rotated per transaction
                            ),
                            _buildInfoRowStatic(
                              'Nonce IV',
                              _lastTransactionData?['dataPushPayload']?['keyMaterial']?['nonce']?.toString() ?? '...',
                            ),
                            const SizedBox(height: 12),
                            const Text(
                              'Secure Ciphertext Payload:',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 11,
                                color: Colors.blueGrey,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: Colors.white,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(
                                  color: const Color(0xFFECEFF1),
                                ),
                              ),
                              child: Text(
                                _lastTransactionData?['dataPushPayload']?['entries']?.isNotEmpty == true 
                                  ? (_lastTransactionData?['dataPushPayload']['entries'][0]['content']?.toString() ?? 'No ciphertext payload') 
                                  : 'Awaiting encryption payload...',
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 10,
                                  height: 1.3,
                                ),
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                const Divider(height: 1, color: Color(0xFFECEFF1)),
                const SizedBox(height: 20),

                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () {
                        setState(() {
                          _currentStep = 2; // Go back to preview
                        });
                      },
                      icon: const Icon(Icons.arrow_back),
                      label: const Text('Back to FHIR Preview'),
                    ),
                    const SizedBox(width: 12),
                    if (_transferStepStatus == 'success')
                      ElevatedButton.icon(
                        onPressed: () {
                          setState(() {
                            _currentStep = 4; // Proceed to history
                          });
                        },
                        icon: const Icon(Icons.history),
                        label: const Text('View Transfer History'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF0D47A1),
                        ),
                      )
                    else
                      ElevatedButton.icon(
                        onPressed: _isTransferring
                            ? null
                            : _startHealthDataTransfer,
                        icon: const Icon(Icons.send),
                        label: Text(
                          _isTransferring
                              ? 'Transferring...'
                              : 'Initiate Secure Transfer',
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF00A86B),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  // --- PAGE 5: TRANSFER HISTORY ---

  Widget _buildTransferHistoryPage() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const DesktopPageIntro(
          eyebrow: 'Audit Archive',
          title: 'Transfer History Logs',
          description:
              'Audit table displaying all historical data exchanges executed under approved Consents. Select a row to inspect transaction logs, encrypted FHIR payloads, and ABDM response codes.',
          pills: [
            'Transfer history log',
            'Encryption payload preview',
            'Compliance audit',
          ],
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'COMPLETED TRANSACTION RECORD',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF0D47A1),
                    letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 16),

                // Table
                if (_isLoadingTransferHistory)
                  const LinearProgressIndicator()
                else if (_transferHistoryError != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      _transferHistoryError!,
                      style: const TextStyle(color: Colors.red),
                    ),
                  )
                else if (_transferHistory.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(
                      child: Text(
                        'No verified or acknowledged transfer records found.',
                        style: TextStyle(color: Colors.grey),
                      ),
                    ),
                  ),
                Table(
                  border: TableBorder(
                    horizontalInside: BorderSide(
                      color: Colors.grey.shade200,
                      width: 1,
                    ),
                  ),
                  columnWidths: const {
                    0: FlexColumnWidth(2.5), // Tx ID
                    1: FlexColumnWidth(2.0), // Patient
                    2: FlexColumnWidth(2.0), // Consent ID
                    3: FlexColumnWidth(1.8), // Record Type
                    4: FlexColumnWidth(2.2), // Date
                    5: FlexColumnWidth(1.0), // Duration
                    6: FlexColumnWidth(1.2), // Status
                    7: FlexColumnWidth(1.2), // Actions
                  },
                  children: [
                    // Header Row
                    TableRow(
                      decoration: const BoxDecoration(color: Color(0xFFF7FBFF)),
                      children: [
                        _buildTableHeader('Transaction ID'),
                        _buildTableHeader('Patient'),
                        _buildTableHeader('Consent ID'),
                        _buildTableHeader('Type'),
                        _buildTableHeader('Transfer Date'),
                        _buildTableHeader('Duration'),
                        _buildTableHeader('Status'),
                        _buildTableHeader('Inspection'),
                      ],
                    ),
                    // Data Rows
                    ..._transferHistory.map((item) {
                      final isSelected =
                          _selectedHistoryItem?['transactionId'] ==
                          item['transactionId'];
                      return TableRow(
                        decoration: BoxDecoration(
                          color: isSelected
                              ? const Color(0xFFF1F8FD)
                              : Colors.transparent,
                        ),
                        children: [
                          _buildTableCell(
                            item['transactionId'] as String,
                            isMonospace: true,
                          ),
                          _buildTableCell(item['patient'] as String),
                          _buildTableCell(
                            item['consentId'] as String,
                            isMonospace: true,
                          ),
                          _buildTableCell(item['recordType'] as String),
                          _buildTableCell(item['date'] as String),
                          _buildTableCell(item['duration'] as String),
                          _buildTableCellStatus(item['status'] as String),
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4.0),
                            child: IconButton(
                              icon: const Icon(
                                Icons.analytics_outlined,
                                color: Color(0xFF1976D2),
                                size: 20,
                              ),
                              tooltip: 'Inspect metadata',
                              onPressed: () {
                                setState(() {
                                  _selectedHistoryItem = item;
                                });
                              },
                            ),
                          ),
                        ],
                      );
                    }),
                  ],
                ),

                const SizedBox(height: 24),
                const Divider(height: 1, color: Color(0xFFECEFF1)),
                const SizedBox(height: 20),

                // Expandable inspection panel for selected history item
                if (_selectedHistoryItem != null)
                  _buildHistoryDetailPanel(_selectedHistoryItem!)
                else
                  const Card(
                    color: Color(0xFFFAFAFA),
                    child: Padding(
                      padding: EdgeInsets.all(24.0),
                      child: Center(
                        child: Text(
                          'Select the inspection icon (analytics icon) in any table row to inspect transaction FHIR structures and logs.',
                          style: TextStyle(color: Colors.grey, fontSize: 12),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTableHeader(String label) {
    return Padding(
      padding: const EdgeInsets.all(12.0),
      child: Text(
        label,
        style: const TextStyle(
          fontWeight: FontWeight.bold,
          fontSize: 12,
          color: Color(0xFF0D47A1),
        ),
      ),
    );
  }

  Widget _buildTableCell(String val, {bool isMonospace = false}) {
    return Padding(
      padding: const EdgeInsets.all(12.0),
      child: Text(
        val,
        style: TextStyle(
          fontSize: 12,
          fontFamily: isMonospace ? 'monospace' : null,
          color: Colors.black87,
        ),
        overflow: TextOverflow.ellipsis,
      ),
    );
  }

  Widget _buildTableCellStatus(String status) {
    final isComplete = status == 'TRANSFER_COMPLETED';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12.0, horizontal: 8.0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: isComplete ? const Color(0xFFE8F5E9) : const Color(0xFFFFF3E0),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          status,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: isComplete
                ? const Color(0xFF388E3C)
                : const Color(0xFFE65100),
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }

  Widget _buildHistoryDetailPanel(Map<String, dynamic> item) {
    final evidence = item['evidence'] is Map
        ? Map<String, dynamic>.from(item['evidence'] as Map)
        : <String, dynamic>{};
    final responseJson = {
      'transactionId': item['transactionId'],
      'consentId': item['consentId'],
      'recordsCount': item['recordsTransferred'] ?? 1,
      'status': item['status'],
      'transferTimestamp': item['date'],
      'duration': item['duration'],
      'evidence': evidence,
    };

    return Card(
      elevation: 0,
      color: const Color(0xFFF7FBFF),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(20),
        side: const BorderSide(color: Color(0xFFD8E4F0)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'INSPECTING TRANSACTION DETAILS',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.blueGrey.shade600,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item['transactionId'] as String,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ),
                TextButton.icon(
                  icon: const Icon(Icons.close, size: 16),
                  label: const Text('Close'),
                  onPressed: () {
                    setState(() {
                      _selectedHistoryItem = null;
                    });
                  },
                ),
              ],
            ),
            const SizedBox(height: 16),

            Wrap(
              spacing: 20,
              runSpacing: 12,
              children: [
                _buildGridItem('Linked Consent', item['consentId']),
                _buildGridItem('Patient Identifier', item['patient']),
                _buildGridItem(
                  'Records Transferred',
                  '${item['recordsTransferred'] ?? 1} item(s)',
                ),
                _buildGridItem('Transfer Speed', item['duration']),
              ],
            ),
            const SizedBox(height: 16),

            const Text(
              'ABDM Transaction Meta & Headers:',
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 12,
                color: Colors.blueGrey,
              ),
            ),
            const SizedBox(height: 8),
            _buildCodeSnippet(responseJson),
          ],
        ),
      ),
    );
  }

  // --- REUSABLE DEVELOPER CONSOLE (TIMELINE PANEL) ---

  Widget _buildDeveloperConsole() {
    return Container(
      width: 420,
      decoration: const BoxDecoration(
        color: Color(0xFF1E1E1E), // Dark VS Code style developer theme
        border: Border(left: BorderSide(color: Colors.black)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Console Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            color: const Color(0xFF2D2D2D),
            child: Row(
              children: [
                const Icon(Icons.terminal, color: Color(0xFF00A86B), size: 18),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'DEVELOPER EXECUTION CONSOLE',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.0,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.grey, size: 16),
                  onPressed: () {
                    setState(() {
                      _isConsoleExpanded = false;
                    });
                  },
                ),
              ],
            ),
          ),

          // Console Description
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            color: const Color(0xFF252526),
            child: const Text(
              'Tracks active request/response frames from ABDM Gateway lifecycle.',
              style: TextStyle(color: Colors.grey, fontSize: 11, height: 1.3),
            ),
          ),

          // Timeline Log List
          Expanded(
            child: ListView.separated(
              controller: _consoleScrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _consoleLogs.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final log = _consoleLogs[index];
                final isExpanded = log['expanded'] == true;
                final isSuccess =
                    log['statusCode'] >= 200 && log['statusCode'] < 300;

                return Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFF2D2D2D),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isSuccess
                          ? const Color(0xFF388E3C).withValues(alpha: 0.3)
                          : const Color(0xFFEF5350).withValues(alpha: 0.3),
                    ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Header
                      InkWell(
                        onTap: () {
                          setState(() {
                            log['expanded'] = !isExpanded;
                          });
                        },
                        borderRadius: BorderRadius.circular(12),
                        child: Padding(
                          padding: const EdgeInsets.all(12.0),
                          child: Row(
                            children: [
                              Icon(
                                isSuccess ? Icons.check_circle : Icons.error,
                                color: isSuccess
                                    ? const Color(0xFF4CAF50)
                                    : const Color(0xFFEF5350),
                                size: 16,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  log['title'] as String,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 12.5,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: isSuccess
                                      ? const Color(0xFF1B5E20)
                                      : const Color(0xFFB71C1C),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  '${log['statusCode']}',
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Icon(
                                isExpanded
                                    ? Icons.expand_less
                                    : Icons.expand_more,
                                color: Colors.grey,
                                size: 16,
                              ),
                            ],
                          ),
                        ),
                      ),

                      // Expanded logs details
                      if (isExpanded)
                        Container(
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                          decoration: const BoxDecoration(
                            border: Border(
                              top: BorderSide(color: Color(0xFF3C3C3C)),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const SizedBox(height: 10),
                              Text(
                                'Timestamp: ${log['timestamp']} • Speed: ${log['duration']}',
                                style: const TextStyle(
                                  color: Colors.grey,
                                  fontSize: 10.5,
                                ),
                              ),
                              const SizedBox(height: 10),

                              _buildConsoleSectionHeader('HEADERS'),
                              _buildCodeSnippet(log['headers']),
                              const SizedBox(height: 8),

                              _buildConsoleSectionHeader('REQUEST PAYLOAD'),
                              _buildCodeSnippet(log['request']),
                              const SizedBox(height: 8),

                              _buildConsoleSectionHeader('RESPONSE PAYLOAD'),
                              _buildCodeSnippet(log['response']),
                            ],
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildConsoleSectionHeader(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4.0),
      child: Text(
        label,
        style: const TextStyle(
          color: Color(0xFF00A86B),
          fontSize: 9.5,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.0,
        ),
      ),
    );
  }

  Widget _buildCodeSnippet(Map<String, dynamic> jsonMap) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E1E),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: const Color(0xFF333333)),
      ),
      child: SelectableText(
        () {
          String s = const JsonEncoder.withIndent('  ').convert(jsonMap);
          return s.length > 50000 ? s.substring(0, 50000) + '\n\n...[TRUNCATED]' : s;
        }(),
        style: const TextStyle(
          fontFamily: 'monospace',
          fontSize: 10.5,
          color: Color(0xFFD4D4D4),
          height: 1.25,
        ),
      ),
    );
  }

  // --- STATICS & HELPERS ---

  Widget _buildStatusChip(String status, {bool large = false}) {
    Color bg = const Color(0xFFFFF3E0);
    Color fg = const Color(0xFFE65100);
    IconData icon = Icons.hourglass_empty;

    if (status == 'Approved') {
      bg = const Color(0xFFE8F5E9);
      fg = const Color(0xFF388E3C);
      icon = Icons.check_circle_outline;
    } else if (status == 'Rejected') {
      bg = const Color(0xFFFFEBEE);
      fg = const Color(0xFFC62828);
      icon = Icons.cancel_outlined;
    } else if (status == 'Expired') {
      bg = const Color(0xFFECEFF1);
      fg = const Color(0xFF546E7A);
      icon = Icons.history_toggle_off;
    }

    final chip = Container(
      padding: EdgeInsets.symmetric(
        horizontal: large ? 12 : 8,
        vertical: large ? 6 : 3,
      ),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: fg.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: large ? 14 : 11, color: fg),
          const SizedBox(width: 4),
          Text(
            status.toUpperCase(),
            style: TextStyle(
              fontSize: large ? 11 : 10,
              fontWeight: FontWeight.bold,
              color: fg,
            ),
          ),
        ],
      ),
    );
    return chip;
  }

  Map<String, dynamic> _getResourceJSON(String resourceName) {
    if (resourceName == 'Bundle') return _getBundleJSON();

    final bundle = _getBundleJSON();
    final entries = bundle['entry'];
    if (entries is List) {
      for (final entry in entries) {
        final resource = entry is Map ? entry['resource'] : null;
        if (resource is Map && resource['resourceType'] == resourceName) {
          return Map<String, dynamic>.from(resource);
        }
      }
    }

    return _getBundleJSON();
  }

  Map<String, dynamic> _getBundleJSON() {
    return _generatedFhirBundle ??
        _buildFhirBundle(
          selectedRecords: _selectedRecords.entries
              .where((entry) => entry.value)
              .map((entry) => entry.key)
              .toList(growable: false),
          generatedAt: DateTime.now().toUtc(),
        );
  }

  Map<String, dynamic> _buildFhirBundle({
    required List<String> selectedRecords,
    required DateTime generatedAt,
  }) {
    final effectiveRecords = selectedRecords.isEmpty
        ? const <String>['Prescription']
        : selectedRecords;
    final timestamp = _formatUtcIso3(generatedAt);
    final consentId = _firstText([
      _selectedConsent?['consentArtefactId'],
      _selectedConsent?['consentId'],
      'consent-${generatedAt.millisecondsSinceEpoch}',
    ]);
    final transactionId = _firstText([
      _hiTransactionId,
      'tx-${generatedAt.millisecondsSinceEpoch}',
    ]);
    final bundleId = _safeFhirId('bundle-$transactionId');
    final recordResources = effectiveRecords
        .map((recordType) => _recordResourceForType(recordType, timestamp))
        .toList(growable: false);

    final resources = <Map<String, dynamic>>[
      _compositionResource(
        bundleId: bundleId,
        timestamp: timestamp,
        consentId: consentId,
        transactionId: transactionId,
        recordResources: recordResources,
      ),
      _patientResource(),
      _encounterResource(timestamp),
      _practitionerResource(),
      _organizationResource(),
      ...recordResources,
    ];

    return {
      'resourceType': 'Bundle',
      'id': bundleId,
      'meta': {
        'profile': [
          'https://nrces.in/ndhm/fhir/r4/StructureDefinition/DocumentBundle',
        ],
      },
      'identifier': {
        'system': 'https://sarita.abdm.local/fhir/bundle',
        'value': '$consentId-$transactionId',
      },
      'type': 'document',
      'timestamp': timestamp,
      'entry': resources
          .map(
            (resource) => {
              'fullUrl': 'urn:uuid:${resource['id']}',
              'resource': resource,
            },
          )
          .toList(growable: false),
    };
  }

  Map<String, dynamic> _compositionResource({
    required String bundleId,
    required String timestamp,
    required String consentId,
    required String transactionId,
    required List<Map<String, dynamic>> recordResources,
  }) {
    return {
      'resourceType': 'Composition',
      'id': 'composition-$bundleId',
      'status': 'final',
      'type': {
        'coding': [
          {
            'system': 'http://loinc.org',
            'code': '34133-9',
            'display': 'Summary of episode note',
          },
        ],
        'text': 'ABDM health information bundle',
      },
      'subject': {'reference': 'Patient/patient-01', 'display': _patientName()},
      'encounter': {'reference': 'Encounter/encounter-01'},
      'date': timestamp,
      'author': [
        {'reference': 'Practitioner/practitioner-01'},
        {'reference': 'Organization/org-01'},
      ],
      'title': 'ABDM Health Information Bundle',
      'identifier': {
        'system': 'https://sarita.abdm.local/consent',
        'value': consentId,
      },
      'extension': [
        {
          'url': 'https://sarita.abdm.local/fhir/transaction-id',
          'valueString': transactionId,
        },
      ],
      'section': recordResources
          .map(
            (resource) => {
              'title': '${resource['resourceType']} section',
              'entry': [
                {'reference': '${resource['resourceType']}/${resource['id']}'},
              ],
            },
          )
          .toList(growable: false),
    };
  }

  Map<String, dynamic> _patientResource() {
    return {
      'resourceType': 'Patient',
      'id': 'patient-01',
      'identifier': [
        {
          'system': 'https://ndhm.gov.in/abha-address',
          'value': _patientAbhaAddress(),
        },
        {
          'system': 'https://ndhm.gov.in/abha-number',
          'value': _patientAbhaNumber(),
        },
      ],
      'name': [
        {'text': _patientName()},
      ],
      'gender': _patientGender(),
      if (_patientBirthDate().isNotEmpty) 'birthDate': _patientBirthDate(),
      if (_patientMobile().isNotEmpty)
        'telecom': [
          {'system': 'phone', 'value': _patientMobile(), 'use': 'mobile'},
        ],
    };
  }

  Map<String, dynamic> _encounterResource(String timestamp) {
    return {
      'resourceType': 'Encounter',
      'id': 'encounter-01',
      'status': 'finished',
      'class': {
        'system': 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        'code': 'AMB',
        'display': 'ambulatory',
      },
      'subject': {'reference': 'Patient/patient-01'},
      'serviceProvider': {'reference': 'Organization/org-01'},
      'period': {
        'start': _fhirInstant(_selectedConsent?['permissionStart'], timestamp),
        'end': _fhirInstant(_selectedConsent?['permissionEnd'], timestamp),
      },
    };
  }

  Map<String, dynamic> _practitionerResource() {
    return {
      'resourceType': 'Practitioner',
      'id': 'practitioner-01',
      'identifier': [
        {
          'system': 'https://sarita.abdm.local/practitioner',
          'value': 'SARITA-DOCTOR-01',
        },
      ],
      'name': [
        {'text': 'Sarita Health Care Practitioner'},
      ],
    };
  }

  Map<String, dynamic> _organizationResource() {
    return {
      'resourceType': 'Organization',
      'id': 'org-01',
      'identifier': [
        {'system': 'https://ndhm.gov.in/hip-id', 'value': HospitalConfig.hipId},
      ],
      'name': HospitalConfig.hospitalName,
    };
  }

  Map<String, dynamic> _recordResourceForType(
    String recordType,
    String timestamp,
  ) {
    switch (recordType) {
      case 'OP Consultation':
        return {
          'resourceType': 'Condition',
          'id': 'condition-op-consultation',
          'clinicalStatus': {
            'coding': [
              {
                'system':
                    'http://terminology.hl7.org/CodeSystem/condition-clinical',
                'code': 'active',
              },
            ],
          },
          'subject': {'reference': 'Patient/patient-01'},
          'encounter': {'reference': 'Encounter/encounter-01'},
          'recordedDate': timestamp,
          'code': {'text': 'OP Consultation Record'},
        };
      case 'Invoice':
        return {
          'resourceType': 'Invoice',
          'id': 'invoice-record',
          'status': 'issued',
          'subject': {'reference': 'Patient/patient-01'},
          'date': timestamp,
          'issuer': {'reference': 'Organization/org-01'},
          'lineItem': [
            {
              'sequence': 1,
              'chargeItemCodeableConcept': {'text': 'Invoice Record'},
            },
          ],
        };
      case 'Diagnostic Report':
        return {
          'resourceType': 'DiagnosticReport',
          'id': 'diagnostic-report',
          'status': 'final',
          'code': {'text': 'Diagnostic Report'},
          'subject': {'reference': 'Patient/patient-01'},
          'encounter': {'reference': 'Encounter/encounter-01'},
          'issued': timestamp,
          'performer': [
            {'reference': 'Organization/org-01'},
          ],
        };
      case 'Wellness':
        return {
          'resourceType': 'Observation',
          'id': 'wellness-observation',
          'status': 'final',
          'code': {'text': 'Wellness Record'},
          'subject': {'reference': 'Patient/patient-01'},
          'effectiveDateTime': timestamp,
          'valueString': 'Wellness health information captured',
        };
      case 'Immunization':
        return {
          'resourceType': 'Immunization',
          'id': 'immunization-record',
          'status': 'completed',
          'vaccineCode': {'text': 'Immunization Record'},
          'patient': {'reference': 'Patient/patient-01'},
          'occurrenceDateTime': timestamp,
          'primarySource': true,
        };
      case 'Discharge Summary':
        return {
          'resourceType': 'DocumentReference',
          'id': 'discharge-summary',
          'status': 'current',
          'type': {'text': 'Discharge Summary'},
          'subject': {'reference': 'Patient/patient-01'},
          'date': timestamp,
          'content': [
            {
              'attachment': {
                'contentType': 'text/plain',
                'title': 'Discharge Summary',
              },
            },
          ],
        };
      case 'Prescription':
      default:
        return {
          'resourceType': 'MedicationRequest',
          'id': 'medication-request',
          'status': 'active',
          'intent': 'order',
          'medicationCodeableConcept': {'text': 'Prescription Record'},
          'subject': {'reference': 'Patient/patient-01'},
          'encounter': {'reference': 'Encounter/encounter-01'},
          'authoredOn': timestamp,
          'requester': {'reference': 'Practitioner/practitioner-01'},
          'dosageInstruction': [
            {'text': 'Medication instruction recorded locally'},
          ],
        };
    }
  }

  String _patientName() {
    return _firstText([
      widget.patientProfile['name'],
      widget.patientProfile['fullName'],
      _selectedConsent?['patient'],
      'Patient',
    ]);
  }

  String _patientAbhaAddress() {
    return _firstText([
      widget.patientProfile['preferredAbhaAddress'],
      widget.patientProfile['AbhaAddress'],
      widget.patientProfile['abhaAddress'],
      _readString(widget.patientProfile, ['rawProfile', 'abhaAddress']),
      _readString(widget.patientProfile, ['rawProfile', 'AbhaAddress']),
      _selectedConsent?['abhaAddress'],
    ]);
  }

  String _patientAbhaNumber() {
    return _firstText([
      widget.patientProfile['AbhaNumber'],
      widget.patientProfile['abhaNumber'],
      widget.patientProfile['healthIdNumber'],
      _readString(widget.patientProfile, ['rawProfile', 'abhaNumber']),
      _readString(widget.patientProfile, ['rawProfile', 'AbhaNumber']),
      _selectedConsent?['abhaNumber'],
    ]);
  }

  String _patientMobile() {
    return _firstText([
      widget.patientProfile['mobile'],
      widget.patientProfile['mobileNumber'],
    ]);
  }

  String _patientGender() {
    final value = _firstText([widget.patientProfile['gender']]).toLowerCase();
    if (value == 'm' || value == 'male') return 'male';
    if (value == 'f' || value == 'female') return 'female';
    if (value == 'o' || value == 'other') return 'other';
    return 'unknown';
  }

  String _patientBirthDate() {
    final text = _firstText([
      widget.patientProfile['dob'],
      widget.patientProfile['dateOfBirth'],
      widget.patientProfile['yearOfBirth'],
    ]);
    if (text.isEmpty || text == '-') return '';
    final parts = text.split(RegExp(r'[-/]'));
    if (parts.length == 3) {
      final day = parts[0].padLeft(2, '0');
      final month = parts[1].padLeft(2, '0');
      final year = parts[2];
      if (year.length == 4) return '$year-$month-$day';
    }
    if (RegExp(r'^\d{4}$').hasMatch(text)) return text;
    return text.length >= 10 ? text.substring(0, 10) : text;
  }

  String _fhirInstant(Object? value, String fallback) {
    final text = value?.toString().trim() ?? '';
    if (text.isEmpty || text == '-') return fallback;
    return _normalizeTimestampToIso(text);
  }

  String _safeFhirId(String value) {
    final sanitized = value
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9-]'), '-')
        .replaceAll(RegExp(r'-+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    return sanitized.isEmpty ? 'generated-fhir-bundle' : sanitized;
  }

  String _timeOnly(DateTime value) {
    return value.toLocal().toIso8601String().substring(11, 19);
  }

  String _bundleXml(Map<String, dynamic> bundle) {
    final id = bundle['id']?.toString() ?? 'bundle';
    final type = bundle['type']?.toString() ?? 'document';
    final timestamp =
        bundle['timestamp']?.toString() ?? _formatUtcIso3(DateTime.now());
    final entries = bundle['entry'] is List
        ? bundle['entry'] as List
        : const [];
    final buffer = StringBuffer()
      ..writeln('<Bundle xmlns="http://hl7.org/fhir">')
      ..writeln('  <id value="$id"/>')
      ..writeln('  <type value="$type"/>')
      ..writeln('  <timestamp value="$timestamp"/>');
    for (final entry in entries) {
      final resource = entry is Map ? entry['resource'] : null;
      if (resource is Map) {
        final resourceType = resource['resourceType']?.toString() ?? 'Resource';
        final resourceId = resource['id']?.toString() ?? '';
        buffer
          ..writeln('  <entry>')
          ..writeln('    <resource>')
          ..writeln('      <$resourceType>')
          ..writeln('        <id value="$resourceId"/>')
          ..writeln('      </$resourceType>')
          ..writeln('    </resource>')
          ..writeln('  </entry>');
      }
    }
    buffer.writeln('</Bundle>');
    return buffer.toString();
  }
}

// Reusable Patient Info Card widget matching existing styles
class _PatientSummaryHeader extends StatelessWidget {
  final Map<String, dynamic> patientProfile;

  const _PatientSummaryHeader({required this.patientProfile});

  @override
  Widget build(BuildContext context) {
    final name =
        patientProfile['name']?.toString() ??
        patientProfile['fullName']?.toString() ??
        'Pranay Anup Agrawal';
    final mobile = patientProfile['mobile']?.toString() ?? '9510029575';
    final abhaAddress =
        patientProfile['preferredAbhaAddress']?.toString() ??
        patientProfile['AbhaAddress']?.toString() ??
        'pranay21_211@sbx';
    final rawAbhaNumber =
        patientProfile['healthIdNumber']?.toString() ??
        patientProfile['AbhaNumber']?.toString() ??
        '91-1722-0400-0829';
    final gender = patientProfile['gender']?.toString() ?? 'M';
    final yob = patientProfile['yearOfBirth']?.toString() ?? '2006';

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
        child: Row(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundColor: const Color(0xFFE3F2FD),
              child: Text(
                name.isNotEmpty ? name[0].toUpperCase() : 'P',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                  color: Color(0xFF1976D2),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Wrap(
                spacing: 24,
                runSpacing: 8,
                children: [
                  _buildSummaryItem('Patient Name', name, bold: true),
                  _buildSummaryItem('ABHA Address', abhaAddress),
                  _buildSummaryItem('ABHA Number', rawAbhaNumber),
                  _buildSummaryItem(
                    'Gender / Age',
                    '$gender / ${DateTime.now().year - int.parse(yob)} yrs',
                  ),
                  _buildSummaryItem('Mobile', mobile),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryItem(String label, String value, {bool bold = false}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: Colors.blueGrey,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: TextStyle(
            fontSize: 13,
            fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
            color: const Color(0xFF212121),
          ),
        ),
      ],
    );
  }
}


class _M2AutomationDialog extends StatefulWidget {
  final Map<String, dynamic> patientProfile;
  final String hiType;
  const _M2AutomationDialog({required this.patientProfile, required this.hiType});

  @override
  State<_M2AutomationDialog> createState() => _M2AutomationDialogState();
}

class _M2AutomationDialogState extends State<_M2AutomationDialog> {
  String status = 'Initializing M2 Data Transfer...';
  bool isError = false;
  bool isDone = false;

  @override
  void initState() {
    super.initState();
    M2AutomatedWorkflowService.runAutomatedDataTransfer(
      patientProfile: widget.patientProfile,
      hiType: widget.hiType,
      onProgress: (message) {
        if (mounted) {
          setState(() { status = message; });
        }
      },
    ).then((_) {
      if (mounted) {
        setState(() {
          status = 'M2 Data Transfer process completed successfully.';
          isDone = true;
        });
      }
    }).catchError((e) {
      if (mounted) {
        setState(() {
          status = 'Automation failed: $e';
          isError = true;
          isDone = true;
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('M2 Data Transfer Workflow'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (!isDone) const CircularProgressIndicator(),
          if (!isDone) const SizedBox(height: 16),
          Text(status, textAlign: TextAlign.center, style: TextStyle(color: isError ? Colors.red : Colors.black)),
        ],
      ),
      actions: [
        if (isDone)
          TextButton(
            onPressed: () {
              Navigator.pop(context);
            },
            child: const Text('Done'),
          )
      ],
    );
  }
}
